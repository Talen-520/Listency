import { spawnSync } from "node:child_process";
import fs from "node:fs";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const binariesDir = path.join(repoRoot, "app", "desktop", "src-tauri", "binaries");
const version = process.env.CLOUDFLARED_VERSION || "latest";
const dryRun = process.argv.includes("--dry-run");

function output(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    env: options.env ?? process.env,
    encoding: "utf8",
  });
  if (result.error || result.status !== 0) {
    return "";
  }
  return result.stdout.trim();
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    env: options.env ?? process.env,
    stdio: options.stdio ?? "inherit",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

function hostTriple() {
  const triple = output("rustc", ["--print", "host-tuple"]);
  if (triple) {
    return triple;
  }
  const versionOutput = output("rustc", ["-Vv"]);
  const hostLine = versionOutput.split("\n").find((line) => line.startsWith("host:"));
  if (!hostLine) {
    throw new Error("Could not determine Rust host target triple.");
  }
  return hostLine.replace("host:", "").trim();
}

function releaseAssetForTriple(triple) {
  if (triple === "x86_64-apple-darwin") {
    return { asset: "cloudflared-darwin-amd64.tgz", binaryName: "cloudflared", extension: "" };
  }
  if (triple === "aarch64-apple-darwin") {
    return { asset: "cloudflared-darwin-arm64.tgz", binaryName: "cloudflared", extension: "" };
  }
  if (triple === "x86_64-pc-windows-msvc") {
    return { asset: "cloudflared-windows-amd64.exe", binaryName: "cloudflared.exe", extension: ".exe" };
  }
  if (triple === "aarch64-pc-windows-msvc") {
    return { asset: "cloudflared-windows-arm64.exe", binaryName: "cloudflared.exe", extension: ".exe" };
  }
  throw new Error(`Unsupported cloudflared target triple: ${triple}`);
}

function releaseUrl(asset) {
  const base = version === "latest"
    ? "https://github.com/cloudflare/cloudflared/releases/latest/download"
    : `https://github.com/cloudflare/cloudflared/releases/download/${version}`;
  return `${base}/${asset}`;
}

function download(url, destination, redirects = 0) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          "User-Agent": "Listency cloudflared sidecar downloader",
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        const location = response.headers.location;
        if ([301, 302, 303, 307, 308].includes(status) && location) {
          response.resume();
          if (redirects > 5) {
            reject(new Error(`Too many redirects while downloading ${url}`));
            return;
          }
          download(new URL(location, url).toString(), destination, redirects + 1).then(resolve, reject);
          return;
        }
        if (status < 200 || status >= 300) {
          response.resume();
          reject(new Error(`Download failed with HTTP ${status}: ${url}`));
          return;
        }

        const file = fs.createWriteStream(destination);
        response.pipe(file);
        file.on("finish", () => {
          file.close(resolve);
        });
        file.on("error", reject);
      },
    );
    request.on("error", reject);
  });
}

async function main() {
  const triple = hostTriple();
  const { asset, binaryName, extension } = releaseAssetForTriple(triple);
  const url = releaseUrl(asset);
  const target = path.join(binariesDir, `cloudflared-${triple}${extension}`);

  if (dryRun) {
    console.log(JSON.stringify({ triple, asset, url, target }, null, 2));
    return;
  }

  fs.mkdirSync(binariesDir, { recursive: true });
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "listency-cloudflared-"));
  const downloadPath = path.join(tempDir, asset);
  try {
    console.log(`Downloading cloudflared for ${triple}...`);
    console.log(url);
    await download(url, downloadPath);

    if (asset.endsWith(".tgz")) {
      run("tar", ["-xzf", downloadPath, "-C", tempDir]);
      const extracted = path.join(tempDir, binaryName);
      if (!fs.existsSync(extracted)) {
        throw new Error(`cloudflared archive did not contain ${binaryName}`);
      }
      fs.copyFileSync(extracted, target);
      fs.chmodSync(target, 0o755);
    } else {
      fs.copyFileSync(downloadPath, target);
    }

    if (process.platform !== "win32") {
      fs.chmodSync(target, 0o755);
    }
    console.log(`Wrote ${path.relative(repoRoot, target)}`);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
