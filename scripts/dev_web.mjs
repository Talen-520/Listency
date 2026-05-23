import { spawn } from "node:child_process";
import net from "node:net";
import {
  backendDir,
  desktopDir,
  ensureDevEnvironment,
  isWindows,
  venvPython,
} from "./dev_setup.mjs";

const backendHealthUrl = "http://127.0.0.1:8765/health";
const backendAgentsUrl = "http://127.0.0.1:8765/agents";
const backendHost = "127.0.0.1";
const backendPort = 8765;

async function isEndpointOk(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 500);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function isBackendHealthy() {
  return isEndpointOk(backendHealthUrl);
}

async function isBackendCompatible() {
  return (await isBackendHealthy()) && (await isEndpointOk(backendAgentsUrl));
}

function isBackendPortOpen() {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: backendHost, port: backendPort });
    const done = (open) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(500);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

async function waitForBackendHealthy(timeoutMs = 8000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await isBackendCompatible()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

async function ensureBackendStarted() {
  if (await isBackendCompatible()) {
    console.log(`Backend is already healthy at ${backendHealthUrl}; reusing it.`);
    return;
  }

  if (await isBackendPortOpen()) {
    if (await isBackendHealthy()) {
      throw new Error(
        [
          `Port ${backendPort} is running an older backend that is healthy but missing ${backendAgentsUrl}.`,
          "Stop that stale backend process, then run `pnpm run dev:web` again so the current backend code starts.",
          `macOS/Linux: lsof -ti tcp:${backendPort} | xargs kill`,
          `Windows: netstat -ano | findstr :${backendPort}`,
        ].join("\n"),
      );
    }

    throw new Error(
      [
        `Port ${backendPort} is already in use, but ${backendHealthUrl} is not responding.`,
        "Stop the stale backend process, then run `pnpm run dev:web` again.",
        `macOS/Linux: lsof -ti tcp:${backendPort} | xargs kill`,
        `Windows: netstat -ano | findstr :${backendPort}`,
      ].join("\n"),
    );
  }

  spawnChild(
    "Backend",
    venvPython,
    [
      "-m",
      "uvicorn",
      "voice_agent.main:app",
      "--host",
      backendHost,
      "--port",
      String(backendPort),
      "--reload",
    ],
    backendDir,
  );

  if (!(await waitForBackendHealthy())) {
    throw new Error(`Backend did not become healthy and compatible at ${backendHealthUrl}.`);
  }
}

function spawnChild(name, command, args, cwd) {
  console.log(`> ${[command, ...args].join(" ")}`);
  const child = spawn(command, args, {
    cwd,
    stdio: "inherit",
    shell: false,
    windowsHide: true,
  });
  child.on("error", (error) => {
    console.error(`${name} failed to start: ${error.message}`);
    shutdown(1);
  });
  child.on("exit", (code, signal) => {
    if (shuttingDown) {
      return;
    }
    const reason = signal ? `signal ${signal}` : `code ${code ?? 0}`;
    console.error(`${name} exited with ${reason}.`);
    shutdown(code ?? 1);
  });
  children.push(child);
  return child;
}

function killChild(child) {
  if (child.killed) {
    return;
  }
  if (isWindows) {
    spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return;
  }
  child.kill("SIGTERM");
}

function shutdown(code = 0) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  for (const child of children) {
    killChild(child);
  }
  setTimeout(() => process.exit(code), 300);
}

const children = [];
let shuttingDown = false;

try {
  ensureDevEnvironment();
  await ensureBackendStarted();
  spawnChild("Desktop web", "pnpm", ["run", "dev"], desktopDir);

  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(signal, () => shutdown(0));
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  shutdown(1);
}
