# Unsigned App And Signed Updater Workflow

Listency publishes unsigned macOS and Windows applications. Automatic update
packages are signed separately with a Tauri updater key so an installed app can
verify that a downloaded update was produced by this project.

The updater signature does not remove macOS Gatekeeper or Windows SmartScreen
warnings. Those require Apple Developer ID/notarization or Windows code signing,
which remain intentionally outside the current release.

## Updater Key

Generate the updater key once and keep the private key for the lifetime of the
application:

```bash
pnpm --dir app/desktop exec tauri signer generate -w ~/.tauri/listency-updater.key
```

The public key belongs in `app/desktop/src-tauri/tauri.conf.json`. Add the full
private-key file contents to the repository Actions secret:

```text
TAURI_SIGNING_PRIVATE_KEY
```

The current key is passwordless, so no password secret is required. Never
commit the private key. Back it up securely: replacing or losing it prevents
already-installed Listency apps from accepting future updates.

## Version And Tag

The root `package.json` version is authoritative. Update all application version
files together:

```bash
pnpm run version:sync -- --set 0.5.1
pnpm run version:check
```

Release tags must exactly match the source version:

```text
source version 0.5.1 -> release tag v0.5.1
```

The release workflow fails before packaging if the versions or tag differ.

## Create A Release

Open:

```text
Actions -> Release Draft -> Run workflow
```

Enter the matching release tag explicitly. Pushing a matching `v*` Git tag also
starts the workflow.

Both platform jobs run:

- version and release-script tests
- backend unit tests
- Rust unit tests
- frontend production build
- packaged backend sidecar smoke
- desktop launcher smoke
- Windows GUI-subsystem validation on Windows

## Release Assets

The draft includes:

- macOS app ZIP and DMG
- Windows NSIS installer and portable app archive
- signed macOS `.app.tar.gz` updater package and `.sig`
- signed Windows NSIS updater package and `.sig`
- `latest.json` for the Tauri static update endpoint
- per-platform and top-level SHA-256 checksums
- `SIGNING_STATUS.txt` and smoke logs

The packaged app reads:

```text
https://github.com/Talen-520/Listency/releases/latest/download/latest.json
```

After validation, publish the draft as the repository's latest normal release.
Drafts and prereleases are not returned by GitHub's `/releases/latest/` route
and therefore are not offered to normal installed apps.

## Automatic Update Validation

`v0.5.0` is the first updater-capable Listency version. Users on `v0.4.x` or
earlier must install it manually once.

For every release after `v0.5.0`, validate on clean macOS and Windows machines:

1. Install the previous updater-capable version.
2. Publish the new release as Latest.
3. Start the old app and open `Settings -> Application Updates`.
4. Confirm the new version, notes, and download progress appear.
5. Start a Test Call and confirm installation is blocked.
6. End the call, choose `Install and Restart`, and confirm the app restarts on
   the new version.
7. Confirm API keys, business data, agents, SQLite logs, and phone configuration
   remain intact.
8. Confirm the backend starts online and exits when Listency closes.

The workflow validates both platform updater packages and signatures before it
creates the draft. A true old-app-to-new-app installation test still requires
two published updater-capable versions and a clean machine for each OS.

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
Unblock-File .\Listency_*_x64-setup.exe
Get-ChildItem .\portable -Recurse | Unblock-File
```
