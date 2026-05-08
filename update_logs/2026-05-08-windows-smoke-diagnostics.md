# 2026-05-08 Windows Smoke Diagnostics

## Goal

- Expose actionable diagnostics from the Windows packaged backend smoke step.

## Changes

- The Windows workflow now captures `backend:sidecar:smoke` output to `smoke.log`.
- On smoke failure, the workflow emits the log as a GitHub Actions error annotation.
- Artifact upload now runs with `if: always()` and includes `app/desktop/smoke.log`.

## Files

- `.github/workflows/windows-packaged-smoke.yml`

## Verification

- The workflow YAML should be validated by the next GitHub Actions run.

## Known Limits

- This commit is diagnostic first; it does not directly fix the underlying Windows smoke failure.

## Next Steps

- Push and read the next failure annotation through the Checks API.
