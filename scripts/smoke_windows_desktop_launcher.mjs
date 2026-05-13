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

function taskkill(pid) {
  if (!pid) {
    return;
  }
  spawnSync("taskkill", ["/pid", String(pid), "/t", "/f"], { stdio: "ignore" });
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

if (process.platform !== "win32") {
  console.log("Windows desktop launcher smoke skipped on non-Windows host.");
  process.exit(0);
}

assert(fs.existsSync(appExe), `Portable Listency.exe is missing: ${appExe}`);
const sidecar = findPortableSidecar();

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
  console.log(`Windows desktop launcher smoke passed with ${path.relative(repoRoot, appExe)}`);
  console.log(`Portable sidecar: ${path.relative(repoRoot, sidecar)}`);
} catch (error) {
  printDiagnostics(error);
  process.exitCode = 1;
} finally {
  taskkill(child.pid);
}
