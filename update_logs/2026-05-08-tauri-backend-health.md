# 2026-05-08 Tauri Backend Health

## Goal

- Make the native desktop shell start the local backend automatically.
- Add visible backend health and readiness state to the desktop UI.

## Changes

- Added a Tauri startup bootstrapper that checks `127.0.0.1:8765` and starts
  `app/backend` with local Python when the backend is not already running.
- Added lifecycle ownership for the spawned backend process so the Tauri app can
  clean up the child process on exit.
- Added frontend backend health state sourced from `GET /health`.
- Added a Dashboard readiness checklist covering backend health, runtime,
  selected provider, business profile, agent prompt, and enabled tools.
- Added a backend online/offline badge in the app shell header and sidebar.
- Disabled runtime Start/Stop buttons while the backend is offline.
- Updated README and local development/architecture docs for the new startup
  flow.

## Files

- `app/desktop/src-tauri/src/lib.rs`
- `app/desktop/src/hooks/use-app-data.ts`
- `app/desktop/src/app/app-shell.tsx`
- `app/desktop/src/features/dashboard/dashboard-view.tsx`
- `app/desktop/src/lib/types.ts`
- `README.md`
- `agent/ARCHITECTURE.md`
- `agent/DEVELOPMENT.md`

## Verification

- `cargo check` passed in `app/desktop/src-tauri`.
- `pnpm run build` passed in `app/desktop`.

## Notes

- Development fallback startup expects backend dependencies to already be installed.
- Packaged release startup is expected to use the backend sidecar added in the
  follow-up sidecar mode change.
- Browser-only Vite development still requires starting the backend manually.
