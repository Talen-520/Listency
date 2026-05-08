# 2026-05-08 Windows Smoke Path Normalization

## Goal

- Fix the Windows packaged backend smoke check after GitHub Actions reported short-path and long-path variants for the same temp directory.

## Changes

- Canonicalized smoke-test path comparisons with `realpath` before comparing.
- Stripped Windows extended path prefixes and normalized separators/casing for path equality checks.
- Used the same native realpath helper for the smoke data root passed through `VOICE_AGENT_ROOT`.
- Added per-request and whole-smoke timeouts so packaged smoke cannot hang indefinitely.
- Added platform-aware child-process cleanup, including Windows `taskkill /T /F`.
- Added workflow concurrency cancellation and a step-level smoke timeout to cancel stale Windows smoke runs.

## Files

- `.github/workflows/windows-packaged-smoke.yml`
- `scripts/smoke_packaged_backend.mjs`

## Verification

- `pnpm run backend:sidecar:smoke`

## Next Steps

- Push and confirm the Windows packaged smoke workflow completes successfully.
