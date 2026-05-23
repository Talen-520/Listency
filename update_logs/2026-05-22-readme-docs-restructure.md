# 2026-05-22 README Docs Restructure

## Goal

- Make the GitHub README feel like an open-source project homepage instead of a
  full engineering notebook.
- Place Quick Start as the fourth main README section.

## Changes

- Rewrote `README.md` into a shorter landing document:
  - What Is Listency?
  - Interface Preview
  - Current Status
  - Quick Start
  - Features
  - How It Works
  - Local Data And Privacy
  - Documentation
- Moved detailed alpha testing notes to `docs/ALPHA_TESTING.md`.
- Moved developer commands and project structure to `docs/DEVELOPMENT.md`.
- Moved phone setup details to `docs/PHONE_SETUP.md`.
- Moved release, signing, notarization, and checksum details to
  `docs/RELEASE.md`.

## Behavior

- No runtime behavior changed.
- README now points readers to focused docs for deeper workflows.

## Verification

- Confirmed `## Quick Start` is the fourth top-level README section.
- Ran `git diff --check`.

## Next

- Review rendered README on GitHub after push.
- Keep future detailed workflow changes in `docs/` rather than expanding the
  root README again.
