# 2026-05-07 Listency Rename

## Goal

Sync the local repository after the GitHub project was renamed to `Listency`.

## Changes

- Updated the local Git `origin` remote to `https://github.com/Talen-520/Listency.git`.
- Renamed public-facing app branding from `voiceAgent` to `Listency`.
- Updated desktop metadata in `package.json`, Tauri config, Cargo metadata, and
  the app shell header.
- Updated backend project metadata and FastAPI title.
- Updated README public project references.

## Notes

- The Python package path remains `voice_agent` for now to avoid a large import
  and storage migration in this rename pass.
- Existing runtime data paths such as `voice_agent.sqlite3` remain unchanged for
  backward compatibility.

## Verification

- `cargo check`
- `pnpm run build`
- `.venv/bin/python -m unittest discover -s tests`
- `pnpm tauri build --no-bundle`
