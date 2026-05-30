# 2026-05-30 - App language switch

## Changed
- Added a local `LanguageProvider` with English and Chinese UI strings persisted in `localStorage`.
- Added a language toggle button next to the theme toggle in the main app header.
- Localized the main shell, navigation, runtime status badges, dashboard, agent, business profile, tools, voice, test call, logs, session detail, and key settings labels/actions.

## Verification
- Ran `pnpm --dir app/desktop run build`.
