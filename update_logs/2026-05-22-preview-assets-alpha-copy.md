# 2026-05-22 Preview Assets And Alpha Copy

## Goal

- Commit the updated README preview image filenames.
- Keep private planning language out of public docs.

## Changes

- Updated README preview links from `assets/ui dark.png` and
  `assets/ui light.png` to `assets/dark.png` and `assets/light.png`.
- Replaced public planning wording with "alpha" wording in README and release docs.
- Confirmed detailed planning remains local-only under `.agent/`.

## Verification

- `git diff --check` passed.

## Next

- Review README rendering after push to confirm the renamed preview assets load.
