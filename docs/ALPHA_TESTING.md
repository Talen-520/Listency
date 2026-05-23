# Alpha Testing

This guide is for testing unsigned alpha builds from GitHub Actions or draft
release assets.

## Artifact Types

macOS artifacts usually include:

- `Listency-macos.zip`
- `Listency_0.1.0_aarch64.dmg`
- `SHA256SUMS.txt`
- `SIGNING_STATUS.txt`
- `smoke.log`

Windows artifacts usually include:

- `Listency_0.1.0_x64-setup.exe`
- `portable/Listency.exe`
- `portable/binaries/listency-backend-*.exe`
- `portable/binaries/cloudflared-*.exe`
- `SHA256SUMS.txt`
- `SIGNING_STATUS.txt`
- `smoke.log`

## macOS Alpha Builds

Unsigned macOS alpha builds may trigger Gatekeeper warnings such as `"Listency"
is damaged and can't be opened`.

For local alpha testing only, remove the downloaded quarantine flag:

```bash
xattr -dr com.apple.quarantine /path/to/Listency.app
```

Signed and notarized public releases should not require this workaround.

## Windows Alpha Builds

For the most predictable alpha path, use one of:

- `Listency_0.1.0_x64-setup.exe`
- `portable/Listency.exe`

Do not launch raw `target/release/*.exe` from a build tree by itself. It does
not carry the backend sidecar next to the executable and can show backend
offline on a clean machine.

Unsigned Windows alpha builds may show browser, Defender, or SmartScreen trust
warnings.

## Checksum Verification

macOS:

```bash
cd path/to/extracted/listency-macos-*
shasum -a 256 -c SHA256SUMS.txt
```

Windows PowerShell:

```powershell
cd path\to\extracted\listency-windows-*
Get-Content SHA256SUMS.txt
Get-FileHash .\portable\Listency.exe -Algorithm SHA256
```

## Smoke Checklist

Use this checklist after opening an alpha build:

1. App opens.
2. Backend status becomes online.
3. Start/Stop Runtime works.
4. Settings can save API keys to local `.env`.
5. Test Call can start and stop.
6. Logs show the session.
7. Connect Phone can start the tunnel when Twilio is configured.
8. Closing the app shuts down the backend sidecar.
