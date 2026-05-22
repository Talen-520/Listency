# 2026-05-22 Release Draft Repo Context

## Goal

- Fix the first Release Draft workflow run after both platform build jobs passed
  but the draft release creation job failed.

## Issue

- The `draft-release` job downloaded artifacts but did not checkout the
  repository or provide `GH_REPO`.
- `gh release view/create` tried to infer the repository from `.git` and failed
  with `fatal: not a git repository`.

## Change

- Added `actions/checkout@v4` to the `draft-release` job.
- Added `GH_REPO: ${{ github.repository }}` to the release creation step.

## Verification

- YAML parsed locally with Ruby's YAML parser.
- `git diff --check` passed.

## Next

- Push the fix and start a new `Release Draft` workflow run. Re-running the
  failed job from the old run may still use the old workflow definition.
