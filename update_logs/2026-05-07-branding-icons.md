# 2026-05-07 Branding Icons

## Goal

Replace placeholder app branding with the project icon across the desktop UI,
browser tab, and Tauri bundle assets.

## Changes

- Replaced the sidebar/header Bot placeholder with `app-icon.svg` rendered as a
  CSS mask so the UI icon follows light and dark theme foreground colors.
- Removed the UI icon border and background because the source icon is
  transparent.
- Added a browser favicon through `app/desktop/public/favicon.svg` and
  `index.html`.
- Generated a fixed system icon source with a light rounded background for
  Dock/taskbar readability.
- Generated Tauri bundle icons for macOS and Windows and configured
  `bundle.icon` in `tauri.conf.json`.
- Reworked `scripts/generate_tauri_icon.mjs` so browser favicon and Tauri icons
  are reproducible from the SVG source.

## Files

- `app/desktop/src/assets/app-icon.svg`
- `app/desktop/public/favicon.svg`
- `app/desktop/src/app/app-shell.tsx`
- `app/desktop/index.html`
- `app/desktop/src-tauri/icons/app-icon-source.svg`
- `app/desktop/src-tauri/icons/icon.png`
- `app/desktop/src-tauri/icons/icon.icns`
- `app/desktop/src-tauri/icons/icon.ico`
- `app/desktop/src-tauri/tauri.conf.json`
- `scripts/generate_tauri_icon.mjs`
- `README.md`

## Verification

- `node scripts/generate_tauri_icon.mjs`
- `pnpm run build`
- `pnpm tauri build --no-bundle`
- `git diff --check`
