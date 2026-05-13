# 2026-05-13 Windows Backend Shutdown

## Goal

- Fix packaged Windows app shutdown leaving the backend sidecar visible in Task Manager after the UI closes.

## Cause

- The Rust launcher only called `Child::kill()` on the sidecar process.
- Windows PyInstaller onefile sidecars can leave a child process running after the parent pid is killed.
- The launcher smoke used `taskkill /T`, which cleaned up the process tree from the test harness and did not verify app-driven shutdown.

## Changes

- Added explicit backend termination on Tauri window close.
- Changed Windows backend termination to use `taskkill /pid <pid> /T /F`, with `Child::kill()` as a fallback.
- Updated `BackendProcess` to take and terminate the managed child only once.
- Extended Windows desktop launcher smoke to close the main window and verify that `/health` goes offline.

## Files

- `agent/DEVELOPMENT.md`
- `app/desktop/src-tauri/src/lib.rs`
- `scripts/smoke_windows_desktop_launcher.mjs`

## Verification

- `cargo check`
- `node --check scripts/smoke_windows_desktop_launcher.mjs`
- `pnpm --dir app/desktop exec tsc --noEmit`
- `pnpm --dir app/desktop run windows:launcher:smoke` (skips on non-Windows)
- Windows GitHub Actions pending after push.
