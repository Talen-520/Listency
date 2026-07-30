import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const rootPackagePath = resolve(repoRoot, "package.json");
const desktopPackagePath = resolve(repoRoot, "app/desktop/package.json");
const tauriConfigPath = resolve(repoRoot, "app/desktop/src-tauri/tauri.conf.json");
const cargoManifestPath = resolve(repoRoot, "app/desktop/src-tauri/Cargo.toml");
const backendProjectPath = resolve(repoRoot, "app/backend/pyproject.toml");
const backendPackagePath = resolve(repoRoot, "app/backend/voice_agent/__init__.py");

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const setIndex = args.indexOf("--set");
const tagIndex = args.indexOf("--tag");
const requestedVersion = setIndex >= 0 ? args[setIndex + 1] : undefined;
const releaseTag = tagIndex >= 0 ? args[tagIndex + 1] : undefined;
const semverPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

if (setIndex >= 0 && !requestedVersion) {
  throw new Error("--set requires a semantic version.");
}
if (tagIndex >= 0 && !releaseTag) {
  throw new Error("--tag requires a release tag.");
}
if (requestedVersion && !semverPattern.test(requestedVersion)) {
  throw new Error(`Invalid semantic version: ${requestedVersion}`);
}

const rootPackage = JSON.parse(await readFile(rootPackagePath, "utf8"));
const version = requestedVersion ?? rootPackage.version;
if (!semverPattern.test(version)) {
  throw new Error(`Root package version is not valid SemVer: ${version}`);
}

if (releaseTag) {
  const normalizedTag = releaseTag.startsWith("v") ? releaseTag.slice(1) : releaseTag;
  if (normalizedTag !== version) {
    throw new Error(`Release tag ${releaseTag} does not match source version ${version}.`);
  }
}

const expectedJsonFiles = [
  [rootPackagePath, "root package"],
  [desktopPackagePath, "desktop package"],
  [tauriConfigPath, "Tauri config"],
];
const mismatches = [];

for (const [path, label] of expectedJsonFiles) {
  const source = await readFile(path, "utf8");
  const data = JSON.parse(source);
  if (data.version !== version) {
    mismatches.push(`${label}: ${data.version ?? "<missing>"}`);
  }
  if (!checkOnly && data.version !== version) {
    data.version = version;
    await writeFile(path, `${JSON.stringify(data, null, 2)}\n`);
  }
}

const cargoSource = await readFile(cargoManifestPath, "utf8");
const packageSection = cargoSource.match(/^\[package\]\r?\n([\s\S]*?)(?=\r?\n\[)/m);
const cargoVersion = packageSection?.[1].match(/^version\s*=\s*"([^"]+)"/m)?.[1];
if (cargoVersion !== version) {
  mismatches.push(`Cargo package: ${cargoVersion ?? "<missing>"}`);
}
if (!checkOnly && cargoVersion !== version) {
  if (!packageSection || !cargoVersion) {
    throw new Error("Could not locate [package] version in Cargo.toml.");
  }
  const updatedPackageSection = packageSection[0].replace(
    /^version\s*=\s*"[^"]+"/m,
    `version = "${version}"`,
  );
  await writeFile(cargoManifestPath, cargoSource.replace(packageSection[0], updatedPackageSection));
}

const backendProjectSource = await readFile(backendProjectPath, "utf8");
const projectSection = backendProjectSource.match(/^\[project\]\r?\n([\s\S]*?)(?=\r?\n\[)/m);
const backendProjectVersion = projectSection?.[1].match(/^version\s*=\s*"([^"]+)"/m)?.[1];
if (backendProjectVersion !== version) {
  mismatches.push(`backend project: ${backendProjectVersion ?? "<missing>"}`);
}
if (!checkOnly && backendProjectVersion !== version) {
  if (!projectSection || !backendProjectVersion) {
    throw new Error("Could not locate [project] version in app/backend/pyproject.toml.");
  }
  const updatedProjectSection = projectSection[0].replace(
    /^version\s*=\s*"[^"]+"/m,
    `version = "${version}"`,
  );
  await writeFile(
    backendProjectPath,
    backendProjectSource.replace(projectSection[0], updatedProjectSection),
  );
}

const backendPackageSource = await readFile(backendPackagePath, "utf8");
const backendPackageVersion = backendPackageSource.match(
  /^__version__\s*=\s*"([^"]+)"/m,
)?.[1];
if (backendPackageVersion !== version) {
  mismatches.push(`backend package: ${backendPackageVersion ?? "<missing>"}`);
}
if (!checkOnly && backendPackageVersion !== version) {
  if (!backendPackageVersion) {
    throw new Error("Could not locate __version__ in app/backend/voice_agent/__init__.py.");
  }
  await writeFile(
    backendPackagePath,
    backendPackageSource.replace(
      /^__version__\s*=\s*"[^"]+"/m,
      `__version__ = "${version}"`,
    ),
  );
}

if (checkOnly && mismatches.length > 0) {
  throw new Error(`Version mismatch; expected ${version}:\n- ${mismatches.join("\n- ")}`);
}

if (requestedVersion && rootPackage.version !== version) {
  rootPackage.version = version;
  await writeFile(rootPackagePath, `${JSON.stringify(rootPackage, null, 2)}\n`);
}

console.log(
  checkOnly
    ? `All application versions match ${version}${releaseTag ? ` and ${releaseTag}` : ""}.`
    : `Synchronized application version ${version}.`,
);
