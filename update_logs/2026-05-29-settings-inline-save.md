# 2026-05-29 Settings Inline Save

## Goal

- Make Settings easier to use by moving the save action closer to API key entry.

## Changes

- Moved the Settings save button from the bottom of the page into each API key
  input as a right-side inline action.
- Kept the local `.env` path visible under the API key section description.
- Removed the separate bottom Save section to reduce extra scrolling.
- Added a Support section with links to contact the developer on X and report
  issues on GitHub.

## Verification

- `pnpm --dir app/desktop run build` passed.
