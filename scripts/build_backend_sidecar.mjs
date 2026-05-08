import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const backendDir = path.join(repoRoot, "app", "backend");
const tauriDir = path.join(repoRoot, "app", "desktop", "src-tauri");
const binariesDir = path.join(tauriDir, "binaries");
const sidecarName = "listency-backend";
const isWindows = process.platform === "win32";
const extension = isWindows ? ".exe" : "";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    env: options.env ?? process.env,
    stdio: "inherit",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

function output(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    encoding: "utf8",
  });
  if (result.error || result.status !== 0) {
    return "";
  }
  return result.stdout.trim();
}

function pythonCommand() {
  const venvPython = isWindows
    ? path.join(backendDir, ".venv", "Scripts", "python.exe")
    : path.join(backendDir, ".venv", "bin", "python");
  if (fs.existsSync(venvPython)) {
    return venvPython;
  }
  return isWindows ? "python" : "python3";
}

function hostTriple() {
  const triple = output("rustc", ["--print", "host-tuple"]);
  if (triple) {
    return triple;
  }

  const version = output("rustc", ["-Vv"]);
  const hostLine = version.split("\n").find((line) => line.startsWith("host:"));
  if (!hostLine) {
    throw new Error("Could not determine Rust host target triple.");
  }
  return hostLine.replace("host:", "").trim();
}

const python = pythonCommand();
const triple = hostTriple();
const buildRoot = path.join(repoRoot, "build", "sidecar");
const distDir = path.join(buildRoot, "dist");
const workDir = path.join(buildRoot, "work");
const specDir = path.join(buildRoot, "spec");
const sourceEntry = path.join("voice_agent", "__main__.py");
const builtBinary = path.join(distDir, `${sidecarName}${extension}`);
const targetBinary = path.join(binariesDir, `${sidecarName}-${triple}${extension}`);

fs.mkdirSync(binariesDir, { recursive: true });
fs.rmSync(buildRoot, { recursive: true, force: true });

const pyInstallerVersion = output(python, ["-m", "PyInstaller", "--version"], { cwd: backendDir });
if (!pyInstallerVersion) {
  console.error("PyInstaller is required to build the backend sidecar.");
  console.error("Install it in the backend environment with:");
  console.error("  cd app/backend && .venv/bin/python -m pip install pyinstaller");
  process.exit(1);
}

console.log(`Building ${sidecarName} sidecar for ${triple}...`);
run(
  python,
  [
    "-m",
    "PyInstaller",
    "--clean",
    "--onefile",
    "--name",
    sidecarName,
    "--distpath",
    distDir,
    "--workpath",
    workDir,
    "--specpath",
    specDir,
    sourceEntry,
  ],
  { cwd: backendDir },
);

if (!fs.existsSync(builtBinary)) {
  throw new Error(`PyInstaller did not create ${builtBinary}`);
}

fs.copyFileSync(builtBinary, targetBinary);
if (!isWindows) {
  fs.chmodSync(targetBinary, 0o755);
}

console.log(`Wrote ${path.relative(repoRoot, targetBinary)}`);
