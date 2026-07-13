use std::{
    env,
    fs::{File, OpenOptions},
    io::{Read, Write},
    net::{SocketAddr, TcpListener, TcpStream},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::Mutex,
    time::{Duration, Instant},
};

use tauri::Manager;

const DEFAULT_BACKEND_PORT: u16 = 8765;
const MAX_BACKEND_PORT: u16 = 8785;
const BACKEND_SIDECAR_NAME: &str = "listency-backend";
const CLOUDFLARED_BINARY_NAME: &str = "cloudflared";

struct BackendProcess {
    child: Mutex<Option<Child>>,
}

struct BackendEndpoint {
    port: u16,
}

struct BackendLaunch {
    child: Option<Child>,
    port: u16,
}

impl BackendProcess {
    fn terminate(&self) {
        if let Ok(mut child) = self.child.lock() {
            if let Some(mut process) = child.take() {
                terminate_process_tree(&mut process);
            }
        }
    }
}

impl Drop for BackendProcess {
    fn drop(&mut self) {
        self.terminate();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![backend_base_url])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                window.state::<BackendProcess>().terminate();
            }
        })
        .setup(|app| {
            let launch = match ensure_backend_started(app) {
                Ok(launch) => launch,
                Err(error) => {
                    eprintln!("Listency backend bootstrap failed: {error}");
                    append_bootstrap_log(app, &format!("Backend bootstrap failed: {error}"));
                    BackendLaunch {
                        child: None,
                        port: DEFAULT_BACKEND_PORT,
                    }
                }
            };
            app.manage(BackendEndpoint { port: launch.port });
            app.manage(BackendProcess {
                child: Mutex::new(launch.child),
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running Listency desktop app");

    app.run(|app_handle, event| match event {
        tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit => {
            app_handle.state::<BackendProcess>().terminate();
        }
        _ => {}
    });
}

#[tauri::command]
fn backend_base_url(endpoint: tauri::State<'_, BackendEndpoint>) -> String {
    format!("http://127.0.0.1:{}", endpoint.port)
}

fn ensure_backend_started(app: &tauri::App) -> Result<BackendLaunch, String> {
    for port in DEFAULT_BACKEND_PORT..=MAX_BACKEND_PORT {
        if is_backend_healthy(port) {
            append_bootstrap_log(
                app,
                &format!(
                    "Listency backend already healthy on port {port}; reusing existing process."
                ),
            );
            return Ok(BackendLaunch { child: None, port });
        }
    }

    let port =
        find_available_backend_port(DEFAULT_BACKEND_PORT, MAX_BACKEND_PORT).ok_or_else(|| {
            format!("No available backend port in {DEFAULT_BACKEND_PORT}-{MAX_BACKEND_PORT}.")
        })?;
    if port != DEFAULT_BACKEND_PORT {
        append_bootstrap_log(
            app,
            &format!(
                "Port {DEFAULT_BACKEND_PORT} is occupied by another service; using port {port}."
            ),
        );
    }

    if let Some(sidecar) = find_bundled_sidecar(app) {
        append_bootstrap_log(
            app,
            &format!("Starting bundled backend sidecar: {}", sidecar.display()),
        );
        let mut child = spawn_sidecar_backend(app, &sidecar, port)?;
        match wait_for_backend_start(&mut child, port, Duration::from_secs(20)) {
            BackendStartStatus::Healthy => {
                append_bootstrap_log(app, "Bundled backend sidecar is healthy.");
            }
            BackendStartStatus::Exited(code) => {
                let message = format!(
                    "Bundled backend sidecar exited before becoming healthy with code {:?}. {}",
                    code,
                    backend_log_hint(app)
                );
                append_bootstrap_log(app, &message);
                return Err(message);
            }
            BackendStartStatus::Timeout => {
                append_bootstrap_log(
                    app,
                    "Bundled backend sidecar did not become healthy within 20s; keeping it running while the UI continues polling.",
                );
            }
        }
        return Ok(BackendLaunch {
            child: Some(child),
            port,
        });
    }

    append_bootstrap_log(
        app,
        "No bundled backend sidecar found; falling back to development backend.",
    );
    spawn_dev_backend(port).map(|child| BackendLaunch {
        child: Some(child),
        port,
    })
}

fn spawn_sidecar_backend(app: &tauri::App, sidecar: &Path, port: u16) -> Result<Child, String> {
    let app_data_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|error| format!("Could not resolve app data directory: {error}"))?;
    std::fs::create_dir_all(&app_data_dir).map_err(|error| {
        format!(
            "Could not create app data directory `{}`: {error}",
            app_data_dir.display()
        )
    })?;

    let stdout =
        File::create(app_data_dir.join("backend-sidecar.stdout.log")).map_err(|error| {
            format!(
                "Could not create backend stdout log in `{}`: {error}",
                app_data_dir.display()
            )
        })?;
    let stderr =
        File::create(app_data_dir.join("backend-sidecar.stderr.log")).map_err(|error| {
            format!(
                "Could not create backend stderr log in `{}`: {error}",
                app_data_dir.display()
            )
        })?;

    let bundled_cloudflared = find_bundled_cloudflared(app);
    let mut command = Command::new(sidecar);
    command
        .current_dir(&app_data_dir)
        .env("VOICE_AGENT_ROOT", &app_data_dir)
        .env("LISTENCY_BACKEND_MODE", "sidecar")
        .env("LISTENCY_BACKEND_HOST", "127.0.0.1")
        .env("LISTENCY_BACKEND_PORT", port.to_string())
        .stdin(Stdio::null())
        .stdout(Stdio::from(stdout))
        .stderr(Stdio::from(stderr));
    if let Some(cloudflared) = &bundled_cloudflared {
        command.env("CLOUDFLARED_BIN", cloudflared.as_os_str());
        append_bootstrap_log(
            app,
            &format!(
                "Bundled cloudflared connector found: {}",
                cloudflared.display()
            ),
        );
    } else {
        append_bootstrap_log(
            app,
            "No bundled cloudflared connector found; backend will use PATH or manual public URL.",
        );
    }
    hide_windows_console(&mut command);
    isolate_unix_process_group(&mut command);

    let child = command.spawn().map_err(|error| {
        format!(
            "Could not start bundled backend sidecar `{}`: {error}",
            sidecar.display()
        )
    })?;
    append_bootstrap_log(
        app,
        &format!(
            "Bundled backend sidecar spawned with pid {} and data root {}.",
            child.id(),
            app_data_dir.display()
        ),
    );
    Ok(child)
}

fn append_bootstrap_log(app: &tauri::App, message: &str) {
    let Ok(app_data_dir) = app.path().app_local_data_dir() else {
        return;
    };
    if std::fs::create_dir_all(&app_data_dir).is_err() {
        return;
    }
    let path = app_data_dir.join("backend-bootstrap.log");
    let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) else {
        return;
    };
    let _ = writeln!(file, "{message}");
}

fn backend_log_hint(app: &tauri::App) -> String {
    match app.path().app_local_data_dir() {
        Ok(app_data_dir) => format!(
            "See {}, {}, and {}.",
            app_data_dir.join("backend-bootstrap.log").display(),
            app_data_dir.join("backend-sidecar.stdout.log").display(),
            app_data_dir.join("backend-sidecar.stderr.log").display()
        ),
        Err(_) => "Backend log directory could not be resolved.".to_string(),
    }
}

fn spawn_dev_backend(port: u16) -> Result<Child, String> {
    let backend_dir = find_backend_dir()
        .ok_or_else(|| "Could not locate app/backend next to the desktop app.".to_string())?;
    let python = find_python_command(&backend_dir);

    let mut command = Command::new(&python);
    command
        .arg("-m")
        .arg("uvicorn")
        .arg("voice_agent.main:app")
        .arg("--host")
        .arg("127.0.0.1")
        .arg("--port")
        .arg(port.to_string())
        .current_dir(&backend_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    hide_windows_console(&mut command);
    isolate_unix_process_group(&mut command);

    command.spawn().map_err(|error| {
        format!(
            "Could not start backend with `{}`: {error}",
            python.display()
        )
    })
}

fn hide_windows_console(command: &mut Command) {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = command;
    }
}

fn isolate_unix_process_group(command: &mut Command) {
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }

    #[cfg(not(unix))]
    {
        let _ = command;
    }
}

fn terminate_process_tree(process: &mut Child) {
    #[cfg(target_os = "windows")]
    {
        let pid = process.id().to_string();
        let mut command = Command::new("taskkill");
        command
            .args(["/pid", &pid, "/t", "/f"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        hide_windows_console(&mut command);

        match command.status() {
            Ok(status) if status.success() => {}
            _ => {
                let _ = process.kill();
            }
        }
        let _ = wait_for_child_exit(process, Duration::from_secs(5));
    }

    #[cfg(all(unix, not(target_os = "windows")))]
    {
        let pid = process.id();
        terminate_unix_process_group(pid, "TERM");
        if !wait_for_child_exit(process, Duration::from_secs(3)) {
            terminate_unix_process_group(pid, "KILL");
            let _ = process.kill();
            let _ = wait_for_child_exit(process, Duration::from_secs(3));
        }
    }

    #[cfg(not(any(unix, target_os = "windows")))]
    {
        let _ = process.kill();
        let _ = wait_for_child_exit(process, Duration::from_secs(5));
    }
}

#[cfg(all(unix, not(target_os = "windows")))]
fn terminate_unix_process_group(pid: u32, signal: &str) {
    let group = format!("-{pid}");
    let _ = Command::new("kill")
        .args([format!("-{signal}"), group])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
}

fn wait_for_child_exit(process: &mut Child, timeout: Duration) -> bool {
    let started_at = Instant::now();
    while started_at.elapsed() < timeout {
        match process.try_wait() {
            Ok(Some(_)) => return true,
            Ok(None) => std::thread::sleep(Duration::from_millis(100)),
            Err(_) => return true,
        }
    }
    false
}

fn is_backend_healthy(port: u16) -> bool {
    let addr: SocketAddr = match format!("127.0.0.1:{port}").parse() {
        Ok(addr) => addr,
        Err(_) => return false,
    };
    let Ok(mut stream) = TcpStream::connect_timeout(&addr, Duration::from_millis(250)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(500)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(500)));
    let request =
        format!("GET /health HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n");
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }

    let mut response = Vec::new();
    stream.take(16 * 1024).read_to_end(&mut response).is_ok()
        && is_listency_health_response(&response)
}

fn is_listency_health_response(response: &[u8]) -> bool {
    let text = String::from_utf8_lossy(response);
    let Some((headers, body)) = text.split_once("\r\n\r\n") else {
        return false;
    };
    if !(headers.starts_with("HTTP/1.1 200") || headers.starts_with("HTTP/1.0 200")) {
        return false;
    }

    serde_json::from_str::<serde_json::Value>(body)
        .ok()
        .and_then(|payload| {
            payload
                .get("service")
                .and_then(|value| value.as_str())
                .map(str::to_owned)
        })
        .is_some_and(|service| service == "listency-backend")
}

fn find_available_backend_port(start: u16, end: u16) -> Option<u16> {
    (start..=end).find(|port| TcpListener::bind(("127.0.0.1", *port)).is_ok())
}

fn find_bundled_sidecar(app: &tauri::App) -> Option<PathBuf> {
    let roots = sidecar_search_roots(app);

    for root in &roots {
        if let Some(sidecar) = find_sidecar_in_root(root) {
            return Some(sidecar);
        }
    }

    append_bootstrap_log(
        app,
        &format!(
            "No bundled backend sidecar found. Searched: {}",
            roots
                .iter()
                .map(|path| path.display().to_string())
                .collect::<Vec<_>>()
                .join("; ")
        ),
    );
    None
}

fn find_bundled_cloudflared(app: &tauri::App) -> Option<PathBuf> {
    for root in sidecar_search_roots(app) {
        if let Some(cloudflared) = find_cloudflared_in_root(&root) {
            return Some(cloudflared);
        }
    }
    None
}

fn sidecar_search_roots(app: &tauri::App) -> Vec<PathBuf> {
    let mut roots = Vec::new();

    if let Ok(resource_dir) = app.path().resource_dir() {
        roots.push(resource_dir.clone());
        roots.push(resource_dir.join("binaries"));
    }
    if let Ok(current_exe) = env::current_exe() {
        if let Some(exe_dir) = current_exe.parent() {
            roots.push(exe_dir.to_path_buf());
            roots.push(exe_dir.join("binaries"));
            roots.push(exe_dir.join("resources"));
            roots.push(exe_dir.join("resources/binaries"));
            roots.push(exe_dir.join("Resources"));
            roots.push(exe_dir.join("Resources/binaries"));
            roots.push(exe_dir.join("../resources"));
            roots.push(exe_dir.join("../resources/binaries"));
            roots.push(exe_dir.join("../Resources"));
            roots.push(exe_dir.join("../Resources/binaries"));
        }
    }

    roots
}

fn find_sidecar_in_root(root: &Path) -> Option<PathBuf> {
    let binary_name = sidecar_binary_name();
    let exact = root.join(&binary_name);
    if exact.is_file() {
        return Some(exact);
    }

    if let Ok(entries) = std::fs::read_dir(root) {
        for entry in entries.flatten() {
            let path = entry.path();
            if is_sidecar_candidate(&path) {
                return Some(path);
            }
        }
    }

    None
}

fn find_cloudflared_in_root(root: &Path) -> Option<PathBuf> {
    let binary_name = cloudflared_binary_name();
    let exact = root.join(&binary_name);
    if exact.is_file() {
        return Some(exact);
    }

    if let Ok(entries) = std::fs::read_dir(root) {
        for entry in entries.flatten() {
            let path = entry.path();
            if is_cloudflared_candidate(&path) {
                return Some(path);
            }
        }
    }

    None
}

enum BackendStartStatus {
    Healthy,
    Exited(Option<i32>),
    Timeout,
}

fn wait_for_backend_start(child: &mut Child, port: u16, timeout: Duration) -> BackendStartStatus {
    let started_at = Instant::now();
    while started_at.elapsed() < timeout {
        if is_backend_healthy(port) {
            return BackendStartStatus::Healthy;
        }
        if let Ok(Some(status)) = child.try_wait() {
            return BackendStartStatus::Exited(status.code());
        }
        std::thread::sleep(Duration::from_millis(300));
    }
    BackendStartStatus::Timeout
}

fn sidecar_binary_name() -> String {
    if cfg!(target_os = "windows") {
        format!("{BACKEND_SIDECAR_NAME}.exe")
    } else {
        BACKEND_SIDECAR_NAME.to_string()
    }
}

fn cloudflared_binary_name() -> String {
    if cfg!(target_os = "windows") {
        format!("{CLOUDFLARED_BINARY_NAME}.exe")
    } else {
        CLOUDFLARED_BINARY_NAME.to_string()
    }
}

fn is_sidecar_candidate(path: &Path) -> bool {
    if !path.is_file() {
        return false;
    }

    let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
        return false;
    };

    if cfg!(target_os = "windows") && !name.ends_with(".exe") {
        return false;
    }

    name == sidecar_binary_name()
        || name.starts_with(&format!("{BACKEND_SIDECAR_NAME}-"))
        || name.starts_with(&format!("{BACKEND_SIDECAR_NAME}."))
}

fn is_cloudflared_candidate(path: &Path) -> bool {
    if !path.is_file() {
        return false;
    }

    let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
        return false;
    };

    if cfg!(target_os = "windows") && !name.ends_with(".exe") {
        return false;
    }

    name == cloudflared_binary_name()
        || name.starts_with(&format!("{CLOUDFLARED_BINARY_NAME}-"))
        || name.starts_with(&format!("{CLOUDFLARED_BINARY_NAME}."))
}

fn find_backend_dir() -> Option<PathBuf> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let mut candidates = vec![
        manifest_dir.join("../../backend"),
        manifest_dir.join("../backend"),
    ];

    if let Ok(current_dir) = env::current_dir() {
        candidates.push(current_dir.join("app/backend"));
        candidates.push(current_dir.join("../backend"));
        candidates.push(current_dir.join("../../backend"));
    }

    if let Ok(current_exe) = env::current_exe() {
        if let Some(exe_dir) = current_exe.parent() {
            candidates.push(exe_dir.join("backend"));
            candidates.push(exe_dir.join("../Resources/backend"));
            candidates.push(exe_dir.join("../../backend"));
        }
    }

    candidates.into_iter().find(|path| is_backend_dir(path))
}

fn is_backend_dir(path: &Path) -> bool {
    path.join("voice_agent/main.py").is_file() && path.join("requirements.txt").is_file()
}

fn find_python_command(backend_dir: &Path) -> PathBuf {
    let venv_python = if cfg!(target_os = "windows") {
        backend_dir.join(".venv/Scripts/python.exe")
    } else {
        backend_dir.join(".venv/bin/python")
    };

    if venv_python.is_file() {
        return venv_python;
    }

    if cfg!(target_os = "windows") {
        PathBuf::from("python")
    } else {
        PathBuf::from("python3")
    }
}

#[cfg(test)]
mod tests {
    use std::net::TcpListener;

    use super::{find_available_backend_port, is_listency_health_response};

    #[test]
    fn health_response_requires_listency_service_marker() {
        let listency = b"HTTP/1.1 200 OK\r\ncontent-type: application/json\r\n\r\n{\"ok\":true,\"service\":\"listency-backend\",\"runtime\":{}}";
        let unrelated = b"HTTP/1.1 200 OK\r\ncontent-type: application/json\r\n\r\n{\"status\":\"ok\",\"service\":\"jobflow-backend\"}";

        assert!(is_listency_health_response(listency));
        assert!(!is_listency_health_response(unrelated));
    }

    #[test]
    fn available_port_skips_an_occupied_preferred_port() {
        let occupied = TcpListener::bind(("127.0.0.1", 0)).expect("bind occupied test port");
        let preferred = occupied.local_addr().expect("occupied address").port();
        let selected = find_available_backend_port(preferred, preferred.saturating_add(10))
            .expect("find alternate backend port");

        assert_ne!(selected, preferred);
        TcpListener::bind(("127.0.0.1", selected)).expect("selected port remains available");
    }
}
