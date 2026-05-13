# 2026-05-13 Tauri CORS Fix

## Goal

- Fix packaged Windows UI showing backend offline even though the Tauri launcher logs show the bundled backend sidecar is healthy.

## Cause

- The backend was healthy on `127.0.0.1:8765`, but FastAPI CORS only allowed the development Vite origins and `tauri://localhost`.
- Packaged Tauri WebView requests can use `http://tauri.localhost` or `https://tauri.localhost`, so browser security blocked frontend fetches and surfaced them as `Failed to fetch`.

## Changes

- Added `http://tauri.localhost` and `https://tauri.localhost` to backend CORS allowed origins.
- Extended packaged backend smoke to verify both Tauri origins receive CORS headers.
- Extended Windows desktop launcher smoke to verify the launched app backend also allows both Tauri origins.

## Files

- `agent/DEVELOPMENT.md`
- `app/backend/voice_agent/main.py`
- `scripts/smoke_packaged_backend.mjs`
- `scripts/smoke_windows_desktop_launcher.mjs`

## Verification

- `node --check scripts/smoke_packaged_backend.mjs`
- `node --check scripts/smoke_windows_desktop_launcher.mjs`
- `.venv/bin/python -m unittest discover -s tests`
- `pnpm --dir app/desktop exec tsc --noEmit`
- `pnpm --dir app/desktop run windows:launcher:smoke` (skips on non-Windows)
- Windows GitHub Actions pending after push.
