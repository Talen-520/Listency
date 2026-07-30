import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

function required(value, label) {
  if (!value) throw new Error(`${label} is required.`);
  return value;
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`Invalid argument near ${key ?? "<end>"}.`);
    }
    options[key.slice(2)] = value;
  }
  return options;
}

function releaseAssetUrl(repository, tag, name) {
  return `https://github.com/${repository}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(name)}`;
}

export async function generateUpdateManifest({
  artifactsDir,
  notesPath,
  outputPath,
  releaseAssetsDir,
  repository,
  tag,
  version,
}) {
  required(artifactsDir, "artifactsDir");
  required(outputPath, "outputPath");
  required(releaseAssetsDir, "releaseAssetsDir");
  required(repository, "repository");
  required(tag, "tag");
  required(version, "version");

  const entries = await readdir(artifactsDir, { withFileTypes: true });
  const platforms = {};
  await mkdir(releaseAssetsDir, { recursive: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const artifactDir = join(artifactsDir, entry.name);
    let target;
    let artifactName;
    try {
      [target, artifactName] = await Promise.all([
        readFile(join(artifactDir, "UPDATER_TARGET.txt"), "utf8").then((value) => value.trim()),
        readFile(join(artifactDir, "UPDATER_ARTIFACT.txt"), "utf8").then((value) => value.trim()),
      ]);
    } catch {
      continue;
    }

    if (!target || !artifactName) {
      throw new Error(`Updater metadata is incomplete in ${artifactDir}.`);
    }
    if (platforms[target]) {
      throw new Error(`Duplicate updater target: ${target}`);
    }

    const artifactPath = resolve(artifactDir, artifactName);
    const signaturePath = `${artifactPath}.sig`;
    const signature = (await readFile(signaturePath, "utf8")).trim();
    if (!signature) {
      throw new Error(`Updater signature is empty: ${signaturePath}`);
    }

    await Promise.all([
      copyFile(artifactPath, join(releaseAssetsDir, basename(artifactPath))),
      copyFile(signaturePath, join(releaseAssetsDir, basename(signaturePath))),
    ]);
    platforms[target] = {
      signature,
      url: releaseAssetUrl(repository, tag, basename(artifactPath)),
    };
  }

  if (Object.keys(platforms).length === 0) {
    throw new Error(`No updater metadata found under ${artifactsDir}.`);
  }

  const notes = notesPath ? await readFile(notesPath, "utf8") : "";
  const manifest = {
    version,
    notes,
    pub_date: new Date().toISOString(),
    platforms,
  };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const options = parseArgs(process.argv.slice(2));
  await generateUpdateManifest({
    artifactsDir: required(options["artifacts-dir"], "--artifacts-dir"),
    notesPath: options.notes,
    outputPath: required(options.output, "--output"),
    releaseAssetsDir: required(options["release-assets-dir"], "--release-assets-dir"),
    repository: required(options.repository, "--repository"),
    tag: required(options.tag, "--tag"),
    version: required(options.version, "--version"),
  });
  console.log(`Generated updater manifest for ${options.version} at ${options.output}.`);
}
