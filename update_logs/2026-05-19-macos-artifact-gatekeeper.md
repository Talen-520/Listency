# 2026-05-19 - macOS Artifact Gatekeeper

## Goal

- Reduce confusion when testing unsigned macOS GitHub Actions artifacts.
- Make the intended macOS artifact path clearer for alpha testers.

## Changes

- Changed the macOS packaged smoke workflow to upload only the `ditto`-created `Listency-macos.zip` plus `smoke.log`.
- Removed the expanded `Listency.app/**` upload path so testers do not open the raw app bundle from the outer GitHub artifact extraction folder.
- Documented that current macOS alpha artifacts are unsigned and not notarized.
- Added the local alpha-testing quarantine removal command for Gatekeeper "damaged" warnings.

## Files

- `.github/workflows/macos-packaged-smoke.yml`
- `README.md`
- `agent/DEVELOPMENT.md`

## Verification

- `git diff --check`

## Known Limits

- This does not replace real Developer ID signing and Apple notarization.
- Non-technical macOS users still need a signed/notarized release build before the experience is truly one-click.

## Next Steps

- Add Developer ID signing and notarization secrets to the release workflow.
- Consider producing a DMG release artifact after signing is in place.
