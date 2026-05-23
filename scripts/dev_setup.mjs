import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);

export const repoRoot = path.resolve(scriptDir, "..");
export const backendDir = path.join(repoRoot, "app", "backend");
export const desktopDir = path.join(repoRoot, "app", "desktop");
export const isWindows = process.platform === "win32";
export const venvPython = path.join(
  backendDir,
  ".venv",
  isWindows ? "Scripts/python.exe" : "bin/python",
);

const backendRequirements = path.join(backendDir, "requirements.txt");
const backendStamp = path.join(backendDir, ".venv", ".listency-requirements.stamp");
const desktopPackageJson = path.join(desktopDir, "package.json");
const desktopLockfile = path.join(desktopDir, "pnpm-lock.yaml");
const desktopModules = path.join(desktopDir, "node_modules");
const desktopModulesMeta = path.join(desktopModules, ".modules.yaml");
const desktopStamp = path.join(desktopDir, "node_modules", ".listency-deps.stamp");

export function runCommand(command, args, options = {}) {
  const cwd = options.cwd ?? repoRoot;
  const env = { ...process.env, ...options.env };
  console.log(`> ${[command, ...args].join(" ")}`);
  const result = spawnSync(command, args, {
    cwd,
    env,
    stdio: options.stdio ?? "inherit",
    shell: false,
  });

  if (result.error) {
    if (result.error.code === "ENOENT" && command === "pnpm") {
      throw new Error("pnpm was not found. Run `corepack enable`, then try again.");
    }
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited with code ${result.status}`);
  }
  return result;
}

function tryCommand(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });
  if (result.error || result.status !== 0) {
    return null;
  }
  return `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
}

function parsePythonVersion(output) {
  const match = output.match(/Python\s+(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return null;
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function supportsPython311(command, args) {
  const output = tryCommand(command, [...args, "--version"]);
  if (!output) {
    return false;
  }
  const version = parsePythonVersion(output);
  if (!version) {
    return false;
  }
  return version.major > 3 || (version.major === 3 && version.minor >= 11);
}

function findPythonCommand() {
  const candidates = [];
  if (process.env.PYTHON) {
    candidates.push({ command: process.env.PYTHON, args: [] });
  }
  if (isWindows) {
    candidates.push({ command: "py", args: ["-3.11"] });
    candidates.push({ command: "py", args: ["-3"] });
    candidates.push({ command: "python", args: [] });
  } else {
    candidates.push({ command: "python3", args: [] });
    candidates.push({ command: "python", args: [] });
  }

  for (const candidate of candidates) {
    if (supportsPython311(candidate.command, candidate.args)) {
      return candidate;
    }
  }

  throw new Error("Python 3.11+ is required. Install Python, then try `pnpm dev` again.");
}

function sourceFilesAreFresh(stampPath, sourcePaths) {
  if (!existsSync(stampPath)) {
    return false;
  }
  const stampTime = statSync(stampPath).mtimeMs;
  return sourcePaths.every((sourcePath) => {
    if (!existsSync(sourcePath)) {
      return true;
    }
    return statSync(sourcePath).mtimeMs <= stampTime;
  });
}

function touchStamp(stampPath) {
  mkdirSync(path.dirname(stampPath), { recursive: true });
  writeFileSync(stampPath, `${new Date().toISOString()}\n`, "utf8");
}

function ensureBackendVenv() {
  if (existsSync(venvPython)) {
    console.log("Backend virtualenv is ready.");
    return;
  }

  console.log("Creating backend virtualenv.");
  const python = findPythonCommand();
  runCommand(python.command, [...python.args, "-m", "venv", ".venv"], { cwd: backendDir });
}

function ensureBackendRequirements() {
  if (sourceFilesAreFresh(backendStamp, [backendRequirements])) {
    console.log("Backend requirements are up to date.");
    return;
  }

  console.log("Installing backend requirements.");
  runCommand(venvPython, ["-m", "pip", "install", "-r", "requirements.txt"], {
    cwd: backendDir,
    env: { PIP_DISABLE_PIP_VERSION_CHECK: "1" },
  });
  touchStamp(backendStamp);
}

function ensureDesktopDependencies() {
  if (
    existsSync(desktopModules) &&
    sourceFilesAreFresh(desktopStamp, [desktopPackageJson, desktopLockfile])
  ) {
    console.log("Desktop dependencies are up to date.");
    return;
  }
  if (
    existsSync(desktopModulesMeta) &&
    sourceFilesAreFresh(desktopModulesMeta, [desktopPackageJson, desktopLockfile])
  ) {
    console.log("Desktop dependencies are already installed.");
    touchStamp(desktopStamp);
    return;
  }

  console.log("Installing desktop dependencies.");
  runCommand("pnpm", ["--dir", "app/desktop", "install"], {
    cwd: repoRoot,
  });
  touchStamp(desktopStamp);
}

export function ensureDevEnvironment(options = {}) {
  const backend = options.backend ?? true;
  const desktop = options.desktop ?? true;

  if (backend) {
    ensureBackendVenv();
    ensureBackendRequirements();
  }
  if (desktop) {
    ensureDesktopDependencies();
  }
}

function parseArgs(argv) {
  return {
    backend: !argv.includes("--desktop-only"),
    desktop: !argv.includes("--backend-only"),
  };
}

if (path.resolve(process.argv[1] ?? "") === scriptPath) {
  try {
    ensureDevEnvironment(parseArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
