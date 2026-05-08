# 2026-05-08 Packaged App Closure

## Goal

- Tighten the normal-user packaged app startup path.
- Verify the backend sidecar can run without Python, Node, pnpm, or Rust after packaging.

## Changes

- Frontend startup now retries the full app data load while the Tauri-started backend is still becoming healthy.
- Backend `/config` now creates default `.env` and `.env.example` files on first run.
- Added a packaged backend smoke script that launches the generated sidecar with a clean temporary `VOICE_AGENT_ROOT`.
- Added an npm script alias for the packaged backend smoke check.
- Documented the smoke check in `README.md`.

## Files

- `app/backend/voice_agent/config/env_store.py`
- `app/backend/voice_agent/main.py`
- `app/backend/tests/test_env_store.py`
- `app/desktop/src/hooks/use-app-data.ts`
- `app/desktop/src/hooks/use-realtime-test.ts`
- `app/desktop/package.json`
- `scripts/smoke_packaged_backend.mjs`
- `README.md`

## Verification

- Ran `app/backend/.venv/bin/python -m unittest discover -s tests`.
- Ran `pnpm run build` in `app/desktop`.
- Ran `pnpm run tauri:build:sidecar` in `app/desktop`.
- Ran `pnpm run backend:sidecar:smoke` in `app/desktop` against the generated sidecar.

## Known Limits

- The smoke script verifies the packaged backend sidecar and clean local data path, not a full OS-level installer.
- A live GUI double-click test was not run because an existing backend was already responding on `127.0.0.1:8765`.

## Next Steps

- Add macOS GUI app launch/quit smoke when the local port is free.
- Add Windows sidecar and installer smoke testing.
