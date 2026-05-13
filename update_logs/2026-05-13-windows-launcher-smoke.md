# 2026-05-13 Windows Launcher Smoke

## Goal

- Diagnose and harden the Windows artifact path where the desktop UI opens but the local backend remains offline.

## Changes

- Added lower-case Windows resource fallback paths such as `resources/` and `resources/binaries/` to the Tauri backend sidecar lookup.
- The packaged launcher now waits briefly for the sidecar to become healthy and records whether it started, exited early, or timed out.
- Backend sidecar startup now writes the spawned pid, data root, and log file hints to the bootstrap log.
- Added `pnpm run windows:launcher:smoke`, which starts the portable `Listency.exe` on Windows and verifies that the desktop launcher brings `/health` online.
- Added the launcher smoke step to the Windows packaged GitHub Actions workflow before uploading artifacts.

## Files

- `.github/workflows/windows-packaged-smoke.yml`
- `agent/DEVELOPMENT.md`
- `app/desktop/package.json`
- `app/desktop/src-tauri/src/lib.rs`
- `scripts/smoke_windows_desktop_launcher.mjs`

## Verification

- `node --check scripts/smoke_windows_desktop_launcher.mjs`
- `pnpm --dir app/desktop exec tsc --noEmit`
- `pnpm --dir app/desktop run windows:launcher:smoke` (skips on non-Windows)
- `cargo check`
- Windows launcher smoke is pending on GitHub Actions after push.
