import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { generateUpdateManifest } from "../generate_update_manifest.mjs";

test("generates a signed manifest and copies updater assets", async () => {
  const root = await mkdtemp(join(tmpdir(), "listency-updater-test-"));
  const artifactsDir = join(root, "artifacts");
  const releaseAssetsDir = join(root, "release-assets");
  const macDir = join(artifactsDir, "macos");
  const windowsDir = join(artifactsDir, "windows");
  await Promise.all([mkdir(macDir, { recursive: true }), mkdir(windowsDir, { recursive: true })]);

  await Promise.all([
    writeFile(join(macDir, "UPDATER_TARGET.txt"), "darwin-aarch64\n"),
    writeFile(join(macDir, "UPDATER_ARTIFACT.txt"), "Listency.app.tar.gz\n"),
    writeFile(join(macDir, "Listency.app.tar.gz"), "mac-update"),
    writeFile(join(macDir, "Listency.app.tar.gz.sig"), "mac-signature\n"),
    writeFile(join(windowsDir, "UPDATER_TARGET.txt"), "windows-x86_64\n"),
    writeFile(join(windowsDir, "UPDATER_ARTIFACT.txt"), "Listency_0.5.0_x64-setup.exe\n"),
    writeFile(join(windowsDir, "Listency_0.5.0_x64-setup.exe"), "windows-update"),
    writeFile(join(windowsDir, "Listency_0.5.0_x64-setup.exe.sig"), "windows-signature\n"),
    writeFile(join(root, "notes.md"), "Release notes"),
  ]);

  const outputPath = join(releaseAssetsDir, "latest.json");
  const manifest = await generateUpdateManifest({
    artifactsDir,
    notesPath: join(root, "notes.md"),
    outputPath,
    releaseAssetsDir,
    repository: "Talen-520/Listency",
    tag: "v0.5.0",
    version: "0.5.0",
  });

  assert.deepEqual(Object.keys(manifest.platforms).sort(), ["darwin-aarch64", "windows-x86_64"]);
  assert.equal(manifest.platforms["darwin-aarch64"].signature, "mac-signature");
  assert.equal(
    manifest.platforms["windows-x86_64"].url,
    "https://github.com/Talen-520/Listency/releases/download/v0.5.0/Listency_0.5.0_x64-setup.exe",
  );
  assert.equal(JSON.parse(await readFile(outputPath, "utf8")).version, "0.5.0");
  assert.equal(await readFile(join(releaseAssetsDir, "Listency.app.tar.gz"), "utf8"), "mac-update");
  assert.equal(
    await readFile(join(releaseAssetsDir, "Listency_0.5.0_x64-setup.exe.sig"), "utf8"),
    "windows-signature\n",
  );
});

test("rejects an updater artifact without a signature", async () => {
  const root = await mkdtemp(join(tmpdir(), "listency-updater-test-"));
  const artifactsDir = join(root, "artifacts");
  const releaseAssetsDir = join(root, "release-assets");
  const macDir = join(artifactsDir, "macos");
  await mkdir(macDir, { recursive: true });
  await Promise.all([
    writeFile(join(macDir, "UPDATER_TARGET.txt"), "darwin-aarch64\n"),
    writeFile(join(macDir, "UPDATER_ARTIFACT.txt"), "Listency.app.tar.gz\n"),
    writeFile(join(macDir, "Listency.app.tar.gz"), "unsigned-update"),
  ]);

  await assert.rejects(
    generateUpdateManifest({
      artifactsDir,
      outputPath: join(releaseAssetsDir, "latest.json"),
      releaseAssetsDir,
      repository: "Talen-520/Listency",
      tag: "v0.5.0",
      version: "0.5.0",
    }),
    /Listency\.app\.tar\.gz\.sig/,
  );
});

test("rejects duplicate updater targets", async () => {
  const root = await mkdtemp(join(tmpdir(), "listency-updater-test-"));
  const artifactsDir = join(root, "artifacts");
  const releaseAssetsDir = join(root, "release-assets");
  const firstDir = join(artifactsDir, "macos-one");
  const secondDir = join(artifactsDir, "macos-two");
  await Promise.all([
    mkdir(firstDir, { recursive: true }),
    mkdir(secondDir, { recursive: true }),
  ]);

  for (const [directory, artifactName] of [
    [firstDir, "Listency-one.app.tar.gz"],
    [secondDir, "Listency-two.app.tar.gz"],
  ]) {
    await Promise.all([
      writeFile(join(directory, "UPDATER_TARGET.txt"), "darwin-aarch64\n"),
      writeFile(join(directory, "UPDATER_ARTIFACT.txt"), `${artifactName}\n`),
      writeFile(join(directory, artifactName), "update"),
      writeFile(join(directory, `${artifactName}.sig`), "signature\n"),
    ]);
  }

  await assert.rejects(
    generateUpdateManifest({
      artifactsDir,
      outputPath: join(releaseAssetsDir, "latest.json"),
      releaseAssetsDir,
      repository: "Talen-520/Listency",
      tag: "v0.5.0",
      version: "0.5.0",
    }),
    /Duplicate updater target: darwin-aarch64/,
  );
});
