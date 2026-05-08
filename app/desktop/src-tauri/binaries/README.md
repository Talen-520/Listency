# Backend Sidecar Binaries

This directory is the build target for packaged Listency backend sidecars.

Generated binaries are intentionally ignored by git. Build one for the current
platform with:

```bash
node scripts/build_backend_sidecar.mjs
```

The generated file name follows Tauri's target-triple convention:

```text
listency-backend-$TARGET_TRIPLE
listency-backend-$TARGET_TRIPLE.exe
```

The Tauri runtime prefers a bundled sidecar when present and falls back to the
local backend `.venv` during development.
