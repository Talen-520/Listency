# 2026-05-23 One Command Development

## Goal

- Keep packaged Release assets unchanged for normal users.
- Add a one-command developer path from the repository root.

## Changes

- Added root `package.json` scripts:
  - `pnpm dev`
  - `pnpm run setup`
  - `pnpm run dev:web`
  - `pnpm run test:backend`
- Kept the existing `app/desktop/pnpm-lock.yaml` flow instead of moving the
  project to a root workspace lockfile.
- Added developer scripts that create the backend virtualenv, install backend
  requirements, install desktop dependencies when needed, and start Tauri dev.
- Added a browser-only helper that runs the backend and Vite together.
- Updated README to recommend browser-based local development by default.
- Updated development docs and Makefile entries.

## Verification

- `node --check` passed for the new developer scripts.
- `pnpm run setup -- --backend-only` passed.
- `pnpm run setup -- --desktop-only` passed after dependency install restored
  the local `app/desktop/node_modules`.
- `pnpm run setup` passed.
- `pnpm run test:backend` passed.
- `pnpm --dir app/desktop run build` passed.
- `git diff --check` passed.

## Next

- Optionally add a future `listency dev` CLI wrapper after the root `pnpm dev`
  flow feels stable.
