# 2026-05-08 README Startup Flow

## Goal

- Align the README with the current packaged-app and auto-start backend behavior.

## Changes

- Added a packaged-app usage path for non-technical users.
- Split user-facing usage from developer requirements and setup.
- Moved sidecar packaging to the recommended distributable build path.
- Clarified that `tauri:dev` auto-starts the local backend from the backend `.venv`.
- Clarified that packaged builds prefer the bundled backend sidecar and stop it when the app closes.
- Updated the local workflow so users open Listency first instead of manually starting the backend.
- Replaced the plain How It Works text chain with a checked-in SVG engineering flow diagram so README previews do not depend on Mermaid rendering support.

## Files

- `README.md`
- `assets/how-it-works.svg`

## Verification

- Reviewed README against current Tauri backend bootstrap and desktop package scripts.
