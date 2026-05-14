import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const appBundle = path.join(
  repoRoot,
  "app",
  "desktop",
  "src-tauri",
  "target",
  "release",
  "bundle",
  "macos",
  "Listency.app",
);
const backendUrl = "http://127.0.0.1:8765/health";
const requestTimeoutMs = 2_000;
const healthTimeoutMs = 90_000;
const bundleIdentifier = "com.voiceagent.local";
const appName = "Listency";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function findBundledSidecar() {
  const macosDir = path.join(appBundle, "Contents", "MacOS");
  const resourcesBinariesDir = path.join(appBundle, "Contents", "Resources", "binaries");
  const candidates = [];

  for (const candidate of [path.join(macosDir, "listency-backend"), resourcesBinariesDir]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      candidates.push(candidate);
    }
  }

  if (fs.existsSync(resourcesBinariesDir)) {
    for (const entry of fs.readdirSync(resourcesBinariesDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.startsWith("listency-backend-")) {
        candidates.push(path.join(resourcesBinariesDir, entry.name));
      }
    }
  }

  assert(candidates.length > 0, `Bundled backend sidecar is missing from ${appBundle}`);
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
      throw new Error(`open -W exited before backend became healthy with code ${child.exitCode}.`);
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

  throw new Error(`macOS launcher did not start a healthy backend in ${healthTimeoutMs}ms: ${lastError?.message ?? "unknown error"}`);
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

function runOsaScript(script) {
  return spawnSync("osascript", ["-e", script], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function quitMacApp() {
  const byIdentifier = runOsaScript(`tell application id "${bundleIdentifier}" to quit`);
  if (byIdentifier.status === 0) {
    return;
  }

  const byName = runOsaScript(`tell application "${appName}" to quit`);
  assert(byName.status === 0, `Could not quit ${appName}: ${byIdentifier.stderr || byName.stderr || byName.stdout}`);
}

function forceQuitMacApp() {
  runOsaScript(`tell application id "${bundleIdentifier}" to quit`);
  runOsaScript(`tell application "${appName}" to quit`);
  spawnSync("pkill", ["-x", "listency-desktop"], { stdio: "ignore" });
}

async function waitForExit(child, timeoutMs = 20_000) {
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

async function waitForBackendOffline(timeoutMs = 20_000) {
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

  throw new Error(`Backend still responds after ${appName}.app closed: ${JSON.stringify(lastHealth)}`);
}

function collectLogFiles() {
  const roots = [
    path.join(os.homedir(), "Library", "Application Support", bundleIdentifier),
    path.join(os.homedir(), "Library", "Application Support", appName),
    path.join(os.homedir(), "Library", "Logs", appName),
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

if (process.platform !== "darwin") {
  console.log("macOS desktop launcher smoke skipped on non-macOS host.");
  process.exit(0);
}

assert(fs.existsSync(appBundle), `Listency.app is missing: ${appBundle}`);
const sidecar = findBundledSidecar();

let existingBackendHealthy = false;
try {
  const existingHealth = await fetchHealth();
  if (existingHealth?.ok === true) {
    existingBackendHealthy = true;
  }
} catch {
  // Expected: no backend should be running before Listency.app launches.
}
assert(!existingBackendHealthy, "Port 8765 is already serving Listency health before the macOS launcher smoke starts.");

const child = spawn("open", ["-n", "-W", appBundle], {
  cwd: path.dirname(appBundle),
  stdio: "ignore",
});

try {
  await waitForHealth(child);
  await assertTauriCors();
  quitMacApp();
  const exitCode = await waitForExit(child);
  assert(exitCode !== null, "open -W did not exit after asking Listency.app to quit.");
  await waitForBackendOffline();
  console.log(`macOS desktop launcher smoke passed with ${path.relative(repoRoot, appBundle)}`);
  console.log(`Bundled sidecar: ${path.relative(repoRoot, sidecar)}`);
  console.log("macOS desktop launcher shutdown cleanup passed.");
} catch (error) {
  printDiagnostics(error);
  process.exitCode = 1;
} finally {
  if (child.exitCode === null) {
    child.kill();
    forceQuitMacApp();
  }
}
