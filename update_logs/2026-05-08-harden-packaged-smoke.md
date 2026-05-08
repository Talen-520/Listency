# 2026-05-08 Harden Packaged Smoke

## Goal

- Continue fixing the Windows Packaged Smoke workflow after the first sidecar smoke failure.

## Changes

- Made the packaged smoke script compare filesystem paths with platform-aware normalization.
- Added early sidecar-exit detection while waiting for `/health`.
- Improved failure output by printing captured sidecar stderr when the smoke does not pass.

## Files

- `scripts/smoke_packaged_backend.mjs`

## Verification

- Ran `pnpm run backend:sidecar:smoke` in `app/desktop` on macOS.

## Known Limits

- The Windows workflow needs another GitHub Actions run to confirm whether the sidecar smoke failure was path-related or a deeper Windows runtime issue.

## Next Steps

- Push the smoke script hardening and inspect the next Windows Packaged Smoke run.
