# AGENTS.md

## Overview

This repository is for the `voiceAgent` project. Treat it as a product-focused
workspace where the project documents are the primary source of truth.

## Read First

Before making implementation or UI decisions, read:

- `./ARCHITECTURE.md`
- the latest 1-3 files in `./update_logs/`
- `./DESIGN.md`
- `./DEVELOPMENT.md`

If there is any conflict between default coding habits and the intended product
experience, prefer `./DESIGN.md` for UI work.

## Working Rules

- Keep implementation simple, readable, and easy to extend.
- Prefer coherent product surfaces over speculative architecture.
- Avoid generic template-looking UI.
- Reuse the colors, spacing, radii, shadows, and component patterns defined in
  `./DESIGN.md`.
- Before each commit, add an update log entry under `./update_logs/` using
  `./update_logs/TEMPLATE.md`.
- Do not record secrets, API keys, tokens, customer private data, or local
  `.env` contents in update logs.

## UI Guidance

- Design the desktop app as a focused local runtime control panel.
- Use the monochrome light/dark design system in `./DESIGN.md`.
- Prefer local shadcn-style components under `app/desktop/src/components/ui/`
  before adding one-off markup.
- Use Inter as the primary UI font.
- Keep copy concise, confident, and product-specific.

## When Details Are Missing

- Make reasonable assumptions that align with `README.md` and `DESIGN.md`.
- Prefer forward progress and consistency over inventing a new visual system.
