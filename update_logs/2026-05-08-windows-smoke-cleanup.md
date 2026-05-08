# 2026-05-08 Windows Smoke Cleanup

## Goal

- Continue hardening packaged backend smoke for Windows CI.

## Changes

- Made temporary smoke root cleanup best-effort with short retries.
- Cleanup failures now warn instead of failing an otherwise successful packaged backend smoke.

## Files

- `scripts/smoke_packaged_backend.mjs`

## Verification

- Ran `pnpm run backend:sidecar:smoke` in `app/desktop` on macOS.

## Known Limits

- The Windows workflow needs another GitHub Actions run to determine whether the previous failure was cleanup-related.

## Next Steps

- Push the cleanup hardening and inspect the next Windows Packaged Smoke run.
