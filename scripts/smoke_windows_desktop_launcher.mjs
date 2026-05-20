import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const portableDir = path.join(repoRoot, "app", "desktop", "src-tauri", "target", "release", "portable");
const appExe = path.join(portableDir, "Listency.exe");
const backendUrl = "http://127.0.0.1:8765/health";
const requestTimeoutMs = 2_000;
const healthTimeoutMs = 90_000;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function findPortableSidecar() {
  const binariesDir = path.join(portableDir, "binaries");
  assert(fs.existsSync(binariesDir), `Portable binaries directory is missing: ${binariesDir}`);
  const candidates = fs
    .readdirSync(binariesDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(binariesDir, entry.name))
    .filter((candidate) => {
      const name = path.basename(candidate).toLowerCase();
      return name.startsWith("listency-backend-") && name.endsWith(".exe");
    });
  assert(candidates.length > 0, `Portable backend sidecar is missing from ${binariesDir}`);
  return candidates[0];
}

function findPortableCloudflared() {
  const binariesDir = path.join(portableDir, "binaries");
  assert(fs.existsSync(binariesDir), `Portable binaries directory is missing: ${binariesDir}`);
  const candidates = fs
    .readdirSync(binariesDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(binariesDir, entry.name))
    .filter((candidate) => {
      const name = path.basename(candidate).toLowerCase();
      return name.startsWith("cloudflared-") && name.endsWith(".exe");
    });
  assert(candidates.length > 0, `Portable cloudflared connector is missing from ${binariesDir}`);
  return candidates[0];
}

async function fetchHealth() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(backendUrl, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForHealth(child) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < healthTimeoutMs) {
    if (child.exitCode !== null) {
      throw new Error(`Listency.exe exited before backend became healthy with code ${child.exitCode}.`);
    }

    try {
      const health = await fetchHealth();
      if (health?.ok === true) {
        return health;
      }
      lastError = new Error(`Unexpected health payload: ${JSON.stringify(health)}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(
    `Desktop launcher did not start a healthy backend in ${healthTimeoutMs}ms: ${lastError?.message ?? "unknown error"}`,
  );
}

async function assertTauriCors() {
  for (const origin of ["http://tauri.localhost", "https://tauri.localhost"]) {
    const response = await fetch(backendUrl, {
      headers: {
        Origin: origin,
      },
    });
    assert(
      response.headers.get("access-control-allow-origin") === origin,
      `Desktop backend health response does not allow the packaged Tauri origin ${origin}.`,
    );
  }
}

function taskkill(pid) {
  if (!pid) {
    return;
  }
  spawnSync("taskkill", ["/pid", String(pid), "/t", "/f"], { stdio: "ignore" });
}

function closeMainWindow(pid) {
  assert(pid, "Cannot close Listency.exe because the launcher pid is missing.");
  const result = spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      `$process = Get-Process -Id ${pid} -ErrorAction SilentlyContinue; if ($process) { $process.CloseMainWindow() | Out-Null }`,
    ],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  assert(result.status === 0, `CloseMainWindow failed: ${result.stderr || result.stdout}`);
}

async function waitForExit(child, timeoutMs = 15_000) {
  if (child.exitCode !== null) {
    return child.exitCode;
  }

  return await new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(null), timeoutMs);
    child.once("exit", (code) => {
      clearTimeout(timeout);
      resolve(code);
    });
  });
}

async function waitForBackendOffline(timeoutMs = 15_000) {
  const startedAt = Date.now();
  let lastHealth = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      lastHealth = await fetchHealth();
    } catch {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Backend still responds after Listency.exe closed: ${JSON.stringify(lastHealth)}`);
}

function collectLogFiles() {
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) {
    return [];
  }

  const roots = [
    path.join(localAppData, "com.voiceagent.local"),
    path.join(localAppData, "Listency"),
    path.join(localAppData, "listency"),
  ];
  const names = ["backend-bootstrap.log", "backend-sidecar.stdout.log", "backend-sidecar.stderr.log"];
  const files = [];

  for (const root of roots) {
    for (const name of names) {
      const candidate = path.join(root, name);
      if (fs.existsSync(candidate)) {
        files.push(candidate);
      }
    }
  }
  return files;
}

function clearLogFiles() {
  for (const file of collectLogFiles()) {
    fs.rmSync(file, { force: true });
  }
}

function printDiagnostics(error) {
  console.error(error.message);
  for (const file of collectLogFiles()) {
    console.error(`\n--- ${file} ---`);
    try {
      console.error(fs.readFileSync(file, "utf8"));
    } catch (readError) {
      console.error(`Could not read log: ${readError.message}`);
    }
  }
}

function readBootstrapLog() {
  const bootstrapLog = collectLogFiles().find((file) => path.basename(file) === "backend-bootstrap.log");
  if (!bootstrapLog || !fs.existsSync(bootstrapLog)) {
    return "";
  }
  return fs.readFileSync(bootstrapLog, "utf8");
}

function assertBundledCloudflaredWasPassedToBackend() {
  const log = readBootstrapLog();
  assert(
    log.includes("Bundled cloudflared connector found:"),
    `Desktop launcher did not pass a bundled cloudflared connector to the backend. Bootstrap log:\n${log}`,
  );
}

if (process.platform !== "win32") {
  console.log("Windows desktop launcher smoke skipped on non-Windows host.");
  process.exit(0);
}

assert(fs.existsSync(appExe), `Portable Listency.exe is missing: ${appExe}`);
const sidecar = findPortableSidecar();
const cloudflared = findPortableCloudflared();

let existingBackendHealthy = false;
try {
  const existingHealth = await fetchHealth();
  if (existingHealth?.ok === true) {
    existingBackendHealthy = true;
  }
} catch {
  // Expected: no backend should be running before Listency.exe launches.
}
assert(
  !existingBackendHealthy,
  "Port 8765 is already serving Listency health before the desktop launcher smoke starts.",
);

clearLogFiles();

const child = spawn(appExe, {
  cwd: portableDir,
  env: {
    ...process.env,
    LISTENCY_BACKEND_LOG_LEVEL: "warning",
  },
  stdio: "ignore",
});

try {
  await waitForHealth(child);
  assertBundledCloudflaredWasPassedToBackend();
  await assertTauriCors();
  closeMainWindow(child.pid);
  const exitCode = await waitForExit(child);
  assert(exitCode !== null, "Listency.exe did not exit after CloseMainWindow.");
  await waitForBackendOffline();
  console.log(`Windows desktop launcher smoke passed with ${path.relative(repoRoot, appExe)}`);
  console.log(`Portable sidecar: ${path.relative(repoRoot, sidecar)}`);
  console.log(`Portable cloudflared: ${path.relative(repoRoot, cloudflared)}`);
  console.log("Windows desktop launcher shutdown cleanup passed.");
} catch (error) {
  printDiagnostics(error);
  process.exitCode = 1;
} finally {
  if (child.exitCode === null) {
    taskkill(child.pid);
  }
}
