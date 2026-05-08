# 2026-05-08 README Sidecar Data Notes

## Goal

- Clarify README behavior for distributable sidecar builds versus source
  development mode.

## Changes

- Clarified that `pnpm run tauri:build:sidecar` is the distributable app build
  path for users who should not install Python, Node, pnpm, or Rust.
- Added `src-tauri/binaries/` to the public project structure as the generated
  backend sidecar target.
- Updated local data and privacy notes to distinguish repository `data/` in
  source mode from system app local data in packaged sidecar mode.
- Added the backend sidecar build command to the Development Commands section.

## Verification

- Documentation-only change; no runtime checks required.
