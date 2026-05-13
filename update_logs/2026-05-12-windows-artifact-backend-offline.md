# 2026-05-12 Windows Artifact Backend Offline

## Goal

- Fix Windows GitHub Actions artifacts that opened the desktop UI but left the backend offline on clean Windows machines.

## Cause

- The workflow uploaded the raw `target/release/*.exe`.
- That raw executable was not colocated with the bundled backend sidecar.
- The launcher could not find `listency-backend-*.exe`, fell back to the development Python backend path, and clean user machines stayed offline.

## Changes

- Added Tauri `externalBin` configuration for the backend sidecar.
- Changed the Windows workflow to build an NSIS bundle.
- Added a portable Windows artifact folder containing `Listency.exe` and `binaries/listency-backend-*.exe`.
- Stopped uploading the raw release executable as the user-facing Windows artifact.
- Added backend bootstrap and sidecar stdout/stderr log files under the app local data directory for future Windows diagnosis.
- Documented which Windows artifact users should run.

## Files

- `.github/workflows/windows-packaged-smoke.yml`
- `README.md`
- `app/desktop/package.json`
- `app/desktop/src-tauri/tauri.conf.json`
- `app/desktop/src-tauri/src/lib.rs`
- `scripts/package_windows_portable.mjs`

## Verification

- `node --check scripts/package_windows_portable.mjs`
- `cargo check`
- `pnpm run build`
- `.venv/bin/python -m unittest discover -s tests`

## Known Limits

- Full Windows GUI startup still needs confirmation on a real Windows machine after the next artifact is produced.

## Next Steps

- Push this fix, download the next Windows artifact, and test `portable/Listency.exe` or the NSIS installer on Windows.
