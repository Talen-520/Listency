# 2026-05-14 macOS Packaged Smoke

## Goal

- Complete the macOS packaged app closure to match the Windows packaged startup/shutdown path.

## Changes

- Added `pnpm run macos:launcher:smoke`.
- The macOS launcher smoke starts `Listency.app`, verifies backend health, verifies packaged Tauri CORS, quits the app, and verifies the backend health endpoint goes offline.
- Added `.github/workflows/macos-packaged-smoke.yml`.
- The macOS workflow builds the backend sidecar, runs backend tests, builds the frontend, builds the Tauri `.app`, runs packaged launcher smoke, and uploads `Listency-macos.zip`.
- Updated the Tauri run loop to clean up the backend on `RunEvent::ExitRequested` / `RunEvent::Exit`, because the default Tauri `run()` path can exit before Rust `Drop` cleanup is useful for the managed sidecar.
- On Unix platforms, backend processes are now started in their own process group and terminated as a group so PyInstaller child processes do not keep listening after the app closes.
- Updated packaged sidecar smoke cleanup to use Unix process groups, preventing direct sidecar smoke from leaving transient PyInstaller child processes behind.
- Updated README with macOS workflow badge and macOS artifact testing notes.

## Files

- `.github/workflows/macos-packaged-smoke.yml`
- `README.md`
- `app/desktop/package.json`
- `app/desktop/src-tauri/src/lib.rs`
- `scripts/smoke_packaged_backend.mjs`
- `scripts/smoke_macos_desktop_launcher.mjs`

## Verification

- `node --check scripts/smoke_macos_desktop_launcher.mjs`
- `pnpm --dir app/desktop exec tsc --noEmit`
- `cargo check`
- `.venv/bin/python -m unittest discover -s tests`
- `pnpm --dir app/desktop run backend:sidecar`
- `pnpm --dir app/desktop run backend:sidecar:smoke`
- `pnpm --dir app/desktop exec tauri build --bundles app`
- `pnpm --dir app/desktop run macos:launcher:smoke`
- `curl -s http://127.0.0.1:8765/health` exits non-zero after smoke cleanup.
- `lsof -nP -iTCP:8765 -sTCP:LISTEN` returns no listener after smoke cleanup.
- macOS GitHub Actions pending after push.
