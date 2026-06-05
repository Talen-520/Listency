# Release And Signing

Listency has an unsigned public release workflow and a signing-ready path for
future signed builds.

## Release Draft Workflow

Run:

```text
Actions -> Release Draft
```

Inputs:

- `tag`: release tag, for example `v0.1.0`
- `require_signed`: whether to fail if signing or notarization inputs are
  missing

Known working unsigned path:

```text
tag: v0.1.0
require_signed: false
```

The workflow builds macOS and Windows artifacts, runs packaged smoke checks,
creates per-platform checksums, creates platform zip archives, generates
`SHA256SUMS-all.txt`, and creates or updates a GitHub draft release.

The current public release path intentionally stays unsigned. Signed and
notarized builds can later be produced through the same workflow with
`require_signed=true`.

## macOS Signing

Public macOS distribution should use Developer ID signing and Apple
notarization.

Required repository secrets:

- `APPLE_CERTIFICATE`: base64-encoded Developer ID Application `.p12`
- `APPLE_CERTIFICATE_PASSWORD`: password for the exported `.p12`
- `APPLE_SIGNING_IDENTITY`: Developer ID Application signing identity
- `APPLE_API_KEY`: App Store Connect API key ID
- `APPLE_API_KEY_BASE64`: base64-encoded `AuthKey_*.p8`
- `APPLE_API_ISSUER`: App Store Connect issuer ID

Encode the `.p12`:

```bash
openssl base64 -A -in DeveloperIDApplication.p12 -out apple_certificate_base64.txt
```

Encode the `.p8`:

```bash
openssl base64 -A -in AuthKey_XXXX.p8 -out apple_api_key_base64.txt
```

The workflow verifies the built app with `codesign` and validates the
notarization ticket with `xcrun stapler validate` when notarization credentials
are configured.

## Windows Signing

Windows public installers should use an Authenticode/code-signing certificate.

Required repository secrets:

- `WINDOWS_CERTIFICATE`: base64-encoded code-signing `.pfx`
- `WINDOWS_CERTIFICATE_PASSWORD`: password for the `.pfx`

Optional repository variable:

- `WINDOWS_TIMESTAMP_URL`: timestamp server URL, defaulting to
  `http://timestamp.digicert.com`

Encode the `.pfx`:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("ListencyCodeSigning.pfx")) |
  Set-Content windows_certificate_base64.txt
```

The workflow imports the certificate before `tauri build`, generates a temporary
Tauri Windows signing config from the certificate thumbprint, signs sidecar
inputs, signs any remaining staged Listency executables, verifies Authenticode
status, then writes checksums.

## Signed Candidate Validation

After adding signing secrets, run:

```text
Actions -> Release Draft
require_signed: true
```

Expected platform status:

```text
macOS: signed=true, notarization_configured=true
Windows: signed=true
```

Manual checks:

macOS:

```bash
spctl -a -vv /Applications/Listency.app
stapler validate /Applications/Listency.app
```

Windows PowerShell:

```powershell
Get-AuthenticodeSignature .\Listency.exe
```

Also verify:

- checksums match
- app opens on clean macOS and Windows machines
- backend starts online
- Runtime Start/Stop works
- Test Call works
- Twilio Connect Phone and inbound call flow still work

## Unsigned macOS Release Note

If macOS shows `"Listency" is damaged and can't be opened`, Gatekeeper is
blocking the unsigned downloaded app. For builds downloaded from this
repository, remove the download quarantine flag after extracting or installing
the app:

```bash
xattr -dr com.apple.quarantine /path/to/Listency.app
```

This prompt is expected for unsigned builds.

## Unsigned Windows Release Note

Unsigned Windows builds may show browser, Defender, or SmartScreen trust
warnings. For builds downloaded from this repository, open PowerShell in the
extracted release folder and remove the Mark-of-the-Web flag:

```powershell
Unblock-File .\Listency_0.1.0_x64-setup.exe
Get-ChildItem .\portable -Recurse | Unblock-File
```

These warnings are expected for unsigned builds.
