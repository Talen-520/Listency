import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const tauriDir = path.join(repoRoot, "app", "desktop", "src-tauri");
const releaseDir = path.join(tauriDir, "target", "release");
const binariesDir = path.join(tauriDir, "binaries");
const portableDir = path.join(releaseDir, "portable");
const portableBinariesDir = path.join(portableDir, "binaries");

function findMainExe() {
  const candidates = ["listency-desktop.exe", "Listency.exe"].map((name) => path.join(releaseDir, name));
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error(`No Windows desktop executable found in ${releaseDir}. Run Tauri build first.`);
  }
  return found;
}

function findSidecars() {
  if (!fs.existsSync(binariesDir)) {
    return [];
  }
  return fs
    .readdirSync(binariesDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(binariesDir, entry.name))
    .filter((candidate) => {
      const name = path.basename(candidate);
      return name.startsWith("listency-backend-") && name.endsWith(".exe");
    });
}

const mainExe = findMainExe();
const sidecars = findSidecars();
if (sidecars.length === 0) {
  throw new Error(`No Windows backend sidecar found in ${binariesDir}. Run pnpm run backend:sidecar first.`);
}

fs.rmSync(portableDir, { recursive: true, force: true });
fs.mkdirSync(portableBinariesDir, { recursive: true });
fs.copyFileSync(mainExe, path.join(portableDir, "Listency.exe"));
for (const sidecar of sidecars) {
  fs.copyFileSync(sidecar, path.join(portableBinariesDir, path.basename(sidecar)));
}

fs.writeFileSync(
  path.join(portableDir, "README.txt"),
  [
    "Listency portable Windows build",
    "",
    "Run Listency.exe from this directory.",
    "Do not move Listency.exe away from the binaries folder; the local backend sidecar lives there.",
    "",
  ].join("\r\n"),
);

console.log(`Wrote ${path.relative(repoRoot, portableDir)}`);
