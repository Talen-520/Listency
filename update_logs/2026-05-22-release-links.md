# 2026-05-22 Release Links

## Goal

- Make the README Quick Start point directly to GitHub Releases.
- Clarify that current GitHub releases should be pre-release alpha builds.

## Changes

- Added a Releases badge to `README.md`.
- Updated Quick Start to link to `https://github.com/Talen-520/Listency/releases`.
- Added the releases link to the README documentation list.
- Updated alpha testing docs to prefer GitHub Releases for normal alpha testing.
- Updated release docs to recommend publishing unsigned alpha builds as
  pre-releases rather than stable releases.

## Verification

- `git diff --check` passed.

## Next

- Publish or update `v0.1.0-alpha.1` as a GitHub pre-release after verifying the
  latest draft release assets.
