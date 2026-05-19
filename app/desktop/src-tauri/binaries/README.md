# Packaged Sidecar Binaries

This directory is the build target for packaged Listency helper binaries.

Generated binaries are intentionally ignored by git. Build the local backend
sidecar for the current platform with:

```bash
node scripts/build_backend_sidecar.mjs
```

Download the cloudflared connector for automatic phone setup with:

```bash
node scripts/download_cloudflared.mjs
```

The generated file name follows Tauri's target-triple convention:

```text
listency-backend-$TARGET_TRIPLE
listency-backend-$TARGET_TRIPLE.exe
cloudflared-$TARGET_TRIPLE
cloudflared-$TARGET_TRIPLE.exe
```

The Tauri runtime prefers a bundled backend sidecar when present and falls back
to the local backend `.venv` during development. When a bundled cloudflared
binary is present, the Tauri launcher passes its absolute path to the backend
with `CLOUDFLARED_BIN` so automatic phone setup works without a user-installed
cloudflared.
