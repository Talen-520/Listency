# 2026-05-03 shadcn Monochrome UI

## Goal

Refactor the desktop UI toward current shadcn/ui conventions with a black/white
theme system and Inter-first typography.

## Changes

- Added Radix-backed shadcn-style components for Select, Switch, Tabs, Table,
  ScrollArea, Separator, Alert, Tooltip, and DropdownMenu.
- Refreshed Button, Badge, Card, Input, and Textarea to use semantic theme
  tokens.
- Added a theme provider and mode toggle for light and dark themes.
- Reworked the desktop app shell into a monochrome sidebar layout with compact
  operational panels.
- Replaced hard-coded neon colors with CSS-variable-driven Tailwind tokens.
- Bundled Inter locally through `@fontsource/inter`.
- Added Sonner toast notifications for notices and runtime errors.
- Added API key hover-card helpers with provider key page links in Settings.
- Updated design, architecture, development, README, and agent guidance docs.

## Notes

- The app now uses `components.json` with `cssVariables: true` and neutral base
  color.
- Keep future desktop UI work inside the local shadcn-style component layer when
  practical.
