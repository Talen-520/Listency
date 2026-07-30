import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, "../..");
const rootPackage = JSON.parse(await readFile(resolve(repoRoot, "package.json"), "utf8"));

function runVersionCheck(tag) {
  return spawnSync(
    process.execPath,
    ["scripts/sync_version.mjs", "--check", "--tag", tag],
    { cwd: repoRoot, encoding: "utf8" },
  );
}

test("accepts a release tag that matches every source version", () => {
  const result = runVersionCheck(`v${rootPackage.version}`);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, new RegExp(`match ${rootPackage.version}`));
});

test("rejects a release tag that differs from the source version", () => {
  const result = runVersionCheck("v99.99.99");

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /does not match source version/);
});
