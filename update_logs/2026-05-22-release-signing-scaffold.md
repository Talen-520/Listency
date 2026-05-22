# 2026-05-22 Release Signing Scaffold

## Goal

- Start the next release-closure layer for signed installers and draft releases.
- Keep alpha artifacts working when signing certificates are not configured yet.

## Changes

- Added `.github/workflows/release-draft.yml`.
- The release workflow builds macOS and Windows packages, runs packaged smoke
  checks, stages platform artifacts, writes per-platform signing status, creates
  checksums, and creates or updates a GitHub draft release.
- Added optional macOS signing/notarization secret checks.
- Added optional Windows `.pfx` code-signing support for staged Listency
  executables.
- Updated `README.md` with the Release Draft workflow, required signing secrets,
  and the current unsigned-alpha behavior.

## Behavior

- `workflow_dispatch` accepts a release tag and `require_signed`.
- With `require_signed=false`, missing certificates produce unsigned alpha
  artifacts and a `SIGNING_STATUS.txt` file.
- With `require_signed=true`, the workflow fails early if macOS or Windows
  signing inputs are missing.
- The draft release contains platform archives plus `SHA256SUMS-all.txt`.

## Verification

- YAML parsed locally with Ruby's YAML parser.
- `git diff --check` passed.

## Known Limits

- The workflow cannot complete real signing until Apple Developer ID,
  notarization, and Windows code-signing secrets are added to GitHub.
- macOS notarization needs a real GitHub Actions run on a macOS runner to
  confirm the exact Apple credential path.
- Windows signing needs a real GitHub Actions run on a Windows runner with a
  certificate secret to confirm signtool behavior.

## Next

- Add release signing secrets in GitHub.
- Run `Release Draft` once with `require_signed=false`, then again with
  `require_signed=true` after certificates are configured.
- Download the generated draft release assets and verify checksums on clean
  macOS and Windows machines.
