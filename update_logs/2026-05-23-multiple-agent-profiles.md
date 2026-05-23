# 2026-05-23 Multiple Agent Profiles

## Goal

- Let users create, delete, and switch between multiple saved voice-agent
  prompts from the Agent tab.

## Changes

- Added backend agent CRUD endpoints and active-agent selection.
- Updated session startup to use the selected active agent instead of always
  reading the default prompt.
- Added desktop state for `agents`, `activeAgentId`, and active-agent actions.
- Reworked the Agent tab into a compact select-and-editor layout: agent
  switching happens from the Agent Name select, Add Agent sits at the bottom of
  the menu, and rename/delete actions live inside a management sheet.
- Added a local shadcn-style Sheet component for lightweight side-panel
  management flows.
- Updated the management sheet with right-side slide animation, simpler
  rename/delete controls, and shorter action labels.
- Refined the agent edit sheet toward the shadcn profile-edit pattern with
  larger title copy, a single name field, and full-width bottom actions.
- Reduced the agent edit sheet typography and controls to better match the
  shadcn example, and removed icons from the sheet action buttons.
- Removed the sheet Close button; users can dismiss the panel from the backdrop,
  the close icon, or Escape.
- Added a browser-dev compatibility check so `pnpm run dev:web` does not reuse
  an older backend that is healthy but missing current API routes.
- Added a frontend fallback for older `/agent`-only backends so a missing
  `/agents` route does not make the whole dashboard appear offline.
- Updated README feature wording to mention multiple saved agent prompts.

## Verification

- `pnpm run test:backend` passed.
- `pnpm --dir app/desktop run build` passed.
