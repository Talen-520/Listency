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
- Reworked status metrics and provider rows as white bordered cards with
  left-side icons whose hover state turns neutral gray.
- Tuned desktop and mobile navigation selected states to use a light rounded
  gray row, closer to reference documentation sidebars.
- Split the desktop app into `app/`, `hooks/`, `features/`, shared components,
  and small `lib` helpers so `App.tsx` remains a composition layer.
- Made sidebar hover/active states more visible and mapped the runtime header
  `standby` state to `running` with a spinner indicator.
- Moved Sonner notifications to top-center with a 2-second duration so they do
  not cover Start/Stop controls.
- Renamed the dashboard runtime metric from `Background` to `Runtime` and reuse
  the same `standby` to `running` display mapping.
- Added Default Voice hover help in Settings with OpenAI Realtime and Gemini
  Live voice documentation links.
- Pointed the OpenAI voice help link to the OpenAI text-to-speech guide.
- Updated design, architecture, development, README, and agent guidance docs.

## Notes

- The app now uses `components.json` with `cssVariables: true` and neutral base
  color.
- Keep future desktop UI work inside the local shadcn-style component layer when
  practical.
