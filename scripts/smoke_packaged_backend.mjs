import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const binariesDir = path.join(repoRoot, "app", "desktop", "src-tauri", "binaries");
const isWindows = process.platform === "win32";
const extension = isWindows ? ".exe" : "";
const requestTimeoutMs = 5_000;
const healthTimeoutMs = 45_000;
const smokeTimeoutMs = 90_000;

function output(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.error || result.status !== 0) {
    return "";
  }
  return result.stdout.trim();
}

function hostTriple() {
  const triple = output("rustc", ["--print", "host-tuple"]);
  if (triple) {
    return triple;
  }
  const version = output("rustc", ["-Vv"]);
  const hostLine = version.split("\n").find((line) => line.startsWith("host:"));
  return hostLine?.replace("host:", "").trim() ?? "";
}

function findSidecar() {
  const triple = hostTriple();
  const exact = path.join(binariesDir, `listency-backend-${triple}${extension}`);
  if (triple && fs.existsSync(exact)) {
    return exact;
  }

  const candidates = fs
    .readdirSync(binariesDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(binariesDir, entry.name))
    .filter((candidate) => {
      const name = path.basename(candidate);
      return name.startsWith("listency-backend-") && (!isWindows || name.endsWith(".exe"));
    });

  if (candidates.length === 0) {
    throw new Error("No packaged backend sidecar found. Run `pnpm run backend:sidecar` from app/desktop first.");
  }
  return candidates[0];
}

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (!address || typeof address === "string") {
          reject(new Error("Could not allocate a smoke-test port."));
          return;
        }
        resolve(address.port);
      });
    });
  });
}

async function request(baseUrl, pathName, init) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(`${baseUrl}${pathName}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    if (!response.ok) {
      throw new Error(`${pathName} failed with HTTP ${response.status}: ${await response.text()}`);
    }
    return response.json();
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`${pathName} timed out after ${requestTimeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForHealth(baseUrl, child, stderrBuffer) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < healthTimeoutMs) {
    if (child.exitCode !== null) {
      const stderr = stderrBuffer().trim();
      throw new Error(
        `Backend sidecar exited before becoming healthy with code ${child.exitCode}.${stderr ? `\n${stderr}` : ""}`,
      );
    }
    try {
      return await request(baseUrl, "/health");
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  throw new Error(`Backend did not become healthy in ${healthTimeoutMs}ms: ${lastError?.message ?? "unknown error"}`);
}

function realPath(value) {
  return fs.realpathSync.native?.(value) ?? fs.realpathSync(value);
}

function stripExtendedWindowsPrefix(value) {
  return value.startsWith("\\\\?\\") ? value.slice(4) : value;
}

function comparablePath(value) {
  const pathValue = String(value);
  let resolved = path.resolve(pathValue);
  try {
    resolved = realPath(pathValue);
  } catch {
    try {
      resolved = path.join(realPath(path.dirname(pathValue)), path.basename(pathValue));
    } catch {
      // Fall back to the resolved string for paths that do not exist yet.
    }
  }
  const comparable = stripExtendedWindowsPrefix(resolved);
  return isWindows ? comparable.replaceAll("/", "\\").toLowerCase() : comparable;
}

function samePath(left, right) {
  return comparablePath(left) === comparablePath(right);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function terminateChild(child) {
  if (child.exitCode !== null) {
    return;
  }
  if (isWindows && child.pid) {
    spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
    return;
  }
  child.kill();
}

function forceKillChild(child) {
  if (child.exitCode !== null) {
    return;
  }
  if (isWindows && child.pid) {
    spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
    return;
  }
  child.kill("SIGKILL");
}

async function waitForExit(child, timeoutMs = 5_000) {
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

async function stopChild(child) {
  if (child.exitCode !== null) {
    return child.exitCode;
  }
  terminateChild(child);
  const exitCode = await waitForExit(child);
  if (exitCode !== null) {
    return exitCode;
  }
  forceKillChild(child);
  const forcedExitCode = await waitForExit(child, 2_000);
  if (forcedExitCode === null) {
    console.warn("Backend sidecar did not exit within the smoke cleanup timeout.");
  }
  return forcedExitCode;
}

async function removeSmokeRoot(rootPath) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      fs.rmSync(rootPath, { recursive: true, force: true });
      return;
    } catch (error) {
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
      if (attempt === 4) {
        console.warn(`Could not remove smoke data root ${rootPath}: ${error.message}`);
      }
    }
  }
}

const sidecar = findSidecar();
const root = fs.mkdtempSync(path.join(os.tmpdir(), "listency-packaged-smoke-"));
const resolvedRoot = realPath(root);
const port = await freePort();
const baseUrl = `http://127.0.0.1:${port}`;
const child = spawn(sidecar, {
  cwd: resolvedRoot,
  env: {
    ...process.env,
    LISTENCY_BACKEND_LOG_LEVEL: "warning",
    LISTENCY_BACKEND_MODE: "sidecar",
    LISTENCY_BACKEND_PORT: String(port),
    VOICE_AGENT_ROOT: resolvedRoot,
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let stderr = "";
let stdout = "";
child.stderr.on("data", (chunk) => {
  stderr += chunk.toString();
});
child.stdout.on("data", (chunk) => {
  stdout += chunk.toString();
});

const smokeTimeout = setTimeout(() => {
  console.error(`Packaged backend smoke timed out after ${smokeTimeoutMs}ms.`);
  if (stdout.trim()) {
    console.error(stdout.trim());
  }
  if (stderr.trim()) {
    console.error(stderr.trim());
  }
  terminateChild(child);
  process.exit(1);
}, smokeTimeoutMs);

let passed = false;
try {
  const health = await waitForHealth(baseUrl, child, () => stderr);
  assert(health.ok === true, "Health endpoint did not return ok=true.");

  const config = await request(baseUrl, "/config");
  const expectedEnvPath = path.join(resolvedRoot, ".env");
  assert(
    samePath(config.env_path, expectedEnvPath),
    `Config endpoint did not use the smoke VOICE_AGENT_ROOT. Expected ${expectedEnvPath}, got ${config.env_path}.`,
  );
  assert(fs.existsSync(path.join(resolvedRoot, ".env")), "Backend did not create a default .env file.");
  assert(fs.existsSync(path.join(resolvedRoot, ".env.example")), "Backend did not create a default .env.example file.");
  assert(fs.existsSync(path.join(resolvedRoot, "data", "voice_agent.sqlite3")), "Backend did not create the SQLite database.");

  const providers = await request(baseUrl, "/providers");
  assert(providers.providers?.length >= 2, "Expected OpenAI and Gemini providers.");

  const tools = await request(baseUrl, "/tools");
  assert(tools.tools?.length >= 1, "Expected built-in tools.");

  const started = await request(baseUrl, "/runtime/start", { method: "POST" });
  assert(started.background_status === "standby", "Runtime did not enter standby.");

  const stopped = await request(baseUrl, "/runtime/stop", { method: "POST" });
  assert(stopped.background_status === "stopped", "Runtime did not stop.");

  console.log(`Packaged backend smoke passed using ${path.relative(repoRoot, sidecar)}`);
  console.log(`Smoke data root: ${resolvedRoot}`);
  passed = true;
} finally {
  clearTimeout(smokeTimeout);
  if (child.exitCode === null) {
    await stopChild(child);
  }
  if (!process.env.LISTENCY_KEEP_SMOKE_ROOT) {
    await removeSmokeRoot(resolvedRoot);
  }
  if (!passed) {
    if (stdout.trim()) {
      console.error(stdout.trim());
    }
    if (stderr.trim()) {
      console.error(stderr.trim());
    }
  }
}
