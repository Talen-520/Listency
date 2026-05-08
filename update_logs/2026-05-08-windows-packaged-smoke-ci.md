# 2026-05-08 Windows Packaged Smoke CI

## Goal

- Add GitHub Actions coverage for the Windows packaged app path before doing manual Windows testing.

## Changes

- Added a Windows workflow that installs Python, Node.js, pnpm, and Rust.
- The workflow installs backend dependencies plus PyInstaller.
- The workflow runs backend unit tests, frontend build, Windows sidecar build, packaged sidecar smoke, and Tauri build.
- Windows build artifacts are uploaded from the workflow.
- Added a README badge and short CI note.

## Files

- `.github/workflows/windows-packaged-smoke.yml`
- `README.md`

## Verification

- Local YAML syntax was reviewed by file inspection.
- Local tests/builds for the smoke script were already run in the previous packaged app closure step.

## Known Limits

- The workflow must run on GitHub's Windows runner to fully verify the Windows build.
- Installer signing is not configured.

## Next Steps

- Push the workflow and inspect the first GitHub Actions run.
- After CI is green, clone the repository on a real Windows machine for manual double-click testing.
