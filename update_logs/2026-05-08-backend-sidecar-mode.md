# 2026-05-08 Backend Sidecar Mode

## Goal

- Move toward a one-click desktop app that does not require non-technical users
  to install Python or backend dependencies manually.

## Changes

- Upgraded the Tauri backend launcher to dual-mode startup:
  - Prefer a bundled `listency-backend` sidecar from app resources.
  - Fall back to the local backend `.venv` for development when no sidecar is present.
- Sidecar mode sets `VOICE_AGENT_ROOT` to the system app local data directory so
  `.env`, SQLite, and preview cache can live outside the project repo.
- Added `voice_agent.__main__` as the PyInstaller backend entrypoint.
- Added `scripts/build_backend_sidecar.mjs` to build target-triple sidecar
  binaries with PyInstaller.
- Added `app/desktop/src-tauri/binaries/` as the generated sidecar target and
  bundled resource directory.
- Added package and Makefile commands for sidecar builds.
- Updated README and local development/architecture docs.

## Files

- `app/backend/voice_agent/__main__.py`
- `app/desktop/src-tauri/src/lib.rs`
- `app/desktop/src-tauri/tauri.conf.json`
- `app/desktop/src-tauri/binaries/README.md`
- `app/desktop/package.json`
- `scripts/build_backend_sidecar.mjs`
- `Makefile`
- `.gitignore`
- `README.md`
- `agent/ARCHITECTURE.md`
- `agent/DEVELOPMENT.md`

## Verification

- `cargo check` passed in `app/desktop/src-tauri`.
- `pnpm run build` passed in `app/desktop`.
- `pnpm tauri build --no-bundle` passed in `app/desktop`.
- `.venv/bin/python -m unittest discover -s tests` passed in `app/backend`.
- `node scripts/build_backend_sidecar.mjs` exits with a clear PyInstaller
  install message when the build dependency is missing.

## Notes

- Generated backend sidecar binaries are ignored by git.
- PyInstaller is a build-time dependency, not a runtime dependency for users.
