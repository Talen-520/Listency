# 2026-05-21 - Alpha Release Closure

## Goal

- Tighten the alpha release path after clean Windows artifact testing passed.

## Changes

- Added `SHA256SUMS.txt` generation to the Windows packaged smoke workflow.
- Added `SHA256SUMS.txt` generation to the macOS packaged smoke workflow.
- Staged uploaded artifacts into clean `dist-artifacts/windows` and
  `dist-artifacts/macos` folders so testers do not need to navigate the Tauri
  build tree.
- Updated the README with alpha artifact verification steps.
- Documented the recommended Windows portable artifact path and warned against
  launching raw `target/release/*.exe` files.
- Recorded that the Windows packaged artifact was manually tested on a clean
  Windows machine, including backend startup, bundled cloudflared detection,
  Twilio Connect Phone provisioning, and inbound call handling.
- Updated the booking-capacity tool test to match the current English response.

## Verification

- Windows artifact manual test passed before this update.
- Backend tests were run locally after the code/test change.
- Workflow syntax was checked locally with YAML parsing.
- `git diff --check`

## Known Limits

- macOS clean-machine artifact testing is still pending.
- macOS Developer ID signing/notarization and Windows installer signing are not
  configured yet.
