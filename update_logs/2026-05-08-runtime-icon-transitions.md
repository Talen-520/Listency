# 2026-05-08 Runtime Icon Transitions

## Goal

- Use the newly generated SVG-to-loop transition animations in the desktop UI.

## Changes

- Renamed the four transition MP4 assets to explicit runtime state names.
- Updated the sidebar brand icon to render a static SVG while stopped.
- Added a small icon state machine for starting, running, and stopping states.
- Kept light and dark theme-specific animation assets.
- Preserved reduced-motion behavior by falling back to the static SVG.

## Files

- `app/desktop/src/app/app-shell.tsx`
- `app/desktop/src/assets/app-icon-starting-dark.mp4`
- `app/desktop/src/assets/app-icon-starting-light.mp4`
- `app/desktop/src/assets/app-icon-stopping-dark.mp4`
- `app/desktop/src/assets/app-icon-stopping-light.mp4`
- `app/desktop/src/styles.css`

## Verification

- Ran `pnpm run build` in `app/desktop`.
- Reloaded the browser dev page and confirmed Dashboard, Runtime, Providers, Start, and Stop render.

## Known Limits

- The animation preview is tied to runtime state transitions; it is not exposed as a separate debug control.

## Next Steps

- Continue alpha work on distributable packaging, release checks, and phone-provider integration.
