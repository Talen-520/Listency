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
  const response = await fetch(`${baseUrl}${pathName}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(`${pathName} failed with HTTP ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

async function waitForHealth(baseUrl, child, stderrBuffer) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < 15_000) {
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
  throw new Error(`Backend did not become healthy in time: ${lastError?.message ?? "unknown error"}`);
}

function comparablePath(value) {
  const resolved = path.resolve(String(value));
  return isWindows ? resolved.toLowerCase() : resolved;
}

function samePath(left, right) {
  return comparablePath(left) === comparablePath(right);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function waitForExit(child) {
  if (child.exitCode !== null) {
    return child.exitCode;
  }
  return await new Promise((resolve) => {
    child.once("exit", (code) => resolve(code));
  });
}

const sidecar = findSidecar();
const root = fs.mkdtempSync(path.join(os.tmpdir(), "listency-packaged-smoke-"));
const resolvedRoot = fs.realpathSync(root);
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
child.stderr.on("data", (chunk) => {
  stderr += chunk.toString();
});

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
  if (child.exitCode === null) {
    child.kill();
  }
  await waitForExit(child);
  if (!process.env.LISTENCY_KEEP_SMOKE_ROOT) {
    fs.rmSync(resolvedRoot, { recursive: true, force: true });
  }
  if (!passed && stderr.trim()) {
    console.error(stderr.trim());
  }
}
