# 2026-05-22 Signing Stage Hardening

## Goal

- Move the release workflow from unsigned alpha validation toward real signing
  readiness for macOS and Windows.

## Changes

- Added macOS post-build signature verification with `codesign`.
- Added macOS notarization ticket validation with `xcrun stapler validate` when
  notarization credentials are configured.
- Moved Windows signing setup before `tauri build`.
- Imported the Windows `.pfx` into the GitHub Actions runner certificate store.
- Generated a temporary Tauri Windows signing config from the certificate
  thumbprint so Tauri can sign the app during packaging.
- Signed the generated Listency backend sidecar input before Tauri packaging so
  installer-bundled backend binaries are signed too.
- Kept staged executable signing for Listency installer/portable/backend outputs
  and added Authenticode verification before checksums are written.
- Updated README with certificate base64 encoding commands, optional timestamp
  variable, and signed-release validation expectations.

## Verification

- YAML parsed locally with Ruby's YAML parser.
- `git diff --check` passed.

## Known Limits

- A real signed run still requires Apple Developer ID credentials, Apple
  notarization credentials, and a trusted Windows code-signing `.pfx` configured
  as GitHub secrets.
- Windows signing behavior must be confirmed on GitHub's Windows runner with a
  real certificate.
- macOS notarization behavior must be confirmed on GitHub's macOS runner with
  real Apple credentials.

## Next

- Add signing secrets to GitHub.
- Run `Release Draft` with `require_signed=true`.
- Verify `SIGNING_STATUS.txt`, Gatekeeper behavior, Authenticode status, and
  checksums from the generated draft release.
