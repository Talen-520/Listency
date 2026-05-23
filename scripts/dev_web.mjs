import { spawn } from "node:child_process";
import {
  backendDir,
  desktopDir,
  ensureDevEnvironment,
  isWindows,
  venvPython,
} from "./dev_setup.mjs";

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
  spawnChild(
    "Backend",
    venvPython,
    [
      "-m",
      "uvicorn",
      "voice_agent.main:app",
      "--host",
      "127.0.0.1",
      "--port",
      "8765",
      "--reload",
    ],
    backendDir,
  );
  spawnChild("Desktop web", "pnpm", ["run", "dev"], desktopDir);

  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(signal, () => shutdown(0));
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  shutdown(1);
}
