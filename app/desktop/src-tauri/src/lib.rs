use std::{
    env,
    fs::{File, OpenOptions},
    io::{Read, Write},
    net::{SocketAddr, TcpStream},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::Mutex,
    time::Duration,
};

use tauri::Manager;

const BACKEND_PORT: u16 = 8765;
const BACKEND_SIDECAR_NAME: &str = "listency-backend";

struct BackendProcess {
    child: Mutex<Option<Child>>,
}

impl Drop for BackendProcess {
    fn drop(&mut self) {
        if let Ok(mut child) = self.child.lock() {
            if let Some(process) = child.as_mut() {
                let _ = process.kill();
                let _ = process.wait();
            }
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let child = match ensure_backend_started(app) {
                Ok(child) => child,
                Err(error) => {
                    eprintln!("Listency backend bootstrap failed: {error}");
                    append_bootstrap_log(app, &format!("Backend bootstrap failed: {error}"));
                    None
                }
            };
            app.manage(BackendProcess {
                child: Mutex::new(child),
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Listency desktop app");
}

fn ensure_backend_started(app: &tauri::App) -> Result<Option<Child>, String> {
    if is_backend_healthy() {
        append_bootstrap_log(app, "Backend already healthy; reusing existing process.");
        return Ok(None);
    }

    if let Some(sidecar) = find_bundled_sidecar(app) {
        append_bootstrap_log(
            app,
            &format!("Starting bundled backend sidecar: {}", sidecar.display()),
        );
        return spawn_sidecar_backend(app, &sidecar).map(Some);
    }

    append_bootstrap_log(app, "No bundled backend sidecar found; falling back to development backend.");
    spawn_dev_backend().map(Some)
}

fn spawn_sidecar_backend(app: &tauri::App, sidecar: &Path) -> Result<Child, String> {
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

    let stdout = File::create(app_data_dir.join("backend-sidecar.stdout.log")).map_err(|error| {
        format!(
            "Could not create backend stdout log in `{}`: {error}",
            app_data_dir.display()
        )
    })?;
    let stderr = File::create(app_data_dir.join("backend-sidecar.stderr.log")).map_err(|error| {
        format!(
            "Could not create backend stderr log in `{}`: {error}",
            app_data_dir.display()
        )
    })?;

    let mut command = Command::new(sidecar);
    command
        .current_dir(&app_data_dir)
        .env("VOICE_AGENT_ROOT", &app_data_dir)
        .env("LISTENCY_BACKEND_MODE", "sidecar")
        .stdin(Stdio::null())
        .stdout(Stdio::from(stdout))
        .stderr(Stdio::from(stderr));
    hide_windows_console(&mut command);

    command.spawn().map_err(|error| {
        format!(
            "Could not start bundled backend sidecar `{}`: {error}",
            sidecar.display()
        )
    })
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

fn spawn_dev_backend() -> Result<Child, String> {
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
        .arg("8765")
        .current_dir(&backend_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    hide_windows_console(&mut command);

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

fn is_backend_healthy() -> bool {
    let addr: SocketAddr = match format!("127.0.0.1:{BACKEND_PORT}").parse() {
        Ok(addr) => addr,
        Err(_) => return false,
    };
    let Ok(mut stream) = TcpStream::connect_timeout(&addr, Duration::from_millis(250)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(500)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(500)));
    if stream
        .write_all(b"GET /health HTTP/1.1\r\nHost: 127.0.0.1:8765\r\nConnection: close\r\n\r\n")
        .is_err()
    {
        return false;
    }

    let mut response = [0_u8; 64];
    match stream.read(&mut response) {
        Ok(size) => {
            let head = String::from_utf8_lossy(&response[..size]);
            head.starts_with("HTTP/1.1 200") || head.starts_with("HTTP/1.0 200")
        }
        Err(_) => false,
    }
}

fn find_bundled_sidecar(app: &tauri::App) -> Option<PathBuf> {
    let mut roots = Vec::new();

    if let Ok(resource_dir) = app.path().resource_dir() {
        roots.push(resource_dir.clone());
        roots.push(resource_dir.join("binaries"));
    }

    if let Ok(current_exe) = env::current_exe() {
        if let Some(exe_dir) = current_exe.parent() {
            roots.push(exe_dir.to_path_buf());
            roots.push(exe_dir.join("binaries"));
            roots.push(exe_dir.join("../Resources"));
            roots.push(exe_dir.join("../Resources/binaries"));
        }
    }

    let binary_name = sidecar_binary_name();
    for root in roots {
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
    }

    None
}

fn sidecar_binary_name() -> String {
    if cfg!(target_os = "windows") {
        format!("{BACKEND_SIDECAR_NAME}.exe")
    } else {
        BACKEND_SIDECAR_NAME.to_string()
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
