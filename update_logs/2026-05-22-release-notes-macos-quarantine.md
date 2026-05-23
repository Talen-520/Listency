# 2026-05-22 Release Notes macOS Quarantine

## Goal

- Add the macOS unsigned-alpha Gatekeeper workaround to generated release notes.

## Changes

- Updated the `Release Draft` workflow's generated `RELEASE_NOTES.md` content.
- Added a macOS unsigned alpha note and `xattr` command to `docs/RELEASE.md`.

## Verification

- `git diff --check` passed.

## Next

- Re-run `Release Draft` so the draft release notes include the new macOS note,
  or manually paste the same note into the existing draft release.
