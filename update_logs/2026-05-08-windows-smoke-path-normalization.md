# 2026-05-08 Windows Smoke Path Normalization

## Goal

- Fix the Windows packaged backend smoke check after GitHub Actions reported short-path and long-path variants for the same temp directory.

## Changes

- Canonicalized smoke-test path comparisons with `realpath` before comparing.
- Stripped Windows extended path prefixes and normalized separators/casing for path equality checks.
- Used the same native realpath helper for the smoke data root passed through `VOICE_AGENT_ROOT`.

## Files

- `scripts/smoke_packaged_backend.mjs`

## Verification

- `pnpm run backend:sidecar:smoke`

## Next Steps

- Push and confirm the Windows packaged smoke workflow completes successfully.
