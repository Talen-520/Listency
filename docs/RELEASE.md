# Unsigned Release Workflow

Listency currently publishes unsigned macOS and Windows builds. The release
workflow builds both platforms, runs packaged smoke tests, writes checksums,
and creates or updates a GitHub draft release.

## Create A Release Draft

Open:

```text
Actions -> Release Draft -> Run workflow
```

Enter the release tag explicitly, for example:

```text
v0.3.0
```

The workflow has no default tag so an old release cannot be updated by
accident. Pushing a `v*` Git tag also starts the same workflow.

## CI Gates

Both platform jobs must pass before the draft release is created:

- backend unit tests
- Rust unit tests
- frontend production build through Tauri `beforeBuildCommand`
- packaged backend sidecar smoke test
- desktop launcher smoke test
- Windows GUI subsystem validation

## Release Assets

The draft contains platform archives with:

- macOS app ZIP and DMG
- Windows NSIS installer and portable app folder
- per-platform `SHA256SUMS.txt`
- top-level `SHA256SUMS-all.txt`
- `SIGNING_STATUS.txt` recording the unsigned status
- smoke logs

## Manual Validation

Before publishing the draft, verify on clean macOS and Windows machines:

1. Checksums match.
2. The app opens and the backend becomes online.
3. Runtime Start/Stop works.
4. Test Call can start and stop.
5. Twilio Connect Phone and an inbound call work.
6. Closing Listency stops its backend sidecar.
7. Windows does not open an empty terminal beside the app.

## macOS Gatekeeper

Unsigned macOS builds can show `"Listency" is damaged and can't be opened`.
For builds downloaded from this repository, remove the quarantine flag after
installing or extracting the app:

```bash
xattr -dr com.apple.quarantine /path/to/Listency.app
```

## Windows SmartScreen

Unsigned Windows builds can show browser, Defender, or SmartScreen warnings.
For builds downloaded from this repository, open PowerShell in the release
folder and remove the Mark-of-the-Web flag:

```powershell
Unblock-File .\Listency_0.3.0_x64-setup.exe
Get-ChildItem .\portable -Recurse | Unblock-File
```

Signing and notarization are intentionally outside the current release
pipeline. They can be added later in a separate signed-release workflow without
making the normal unsigned build path more complex.
