# 2026-05-08 Log Time Filter Details

## Goal

- Add Logs page filtering for 24 hours, 7 days, and 30 days.
- Let users click any log record to inspect full details in a dismissible overlay.

## Changes

- Added backend `since` query support for sessions, transcripts, tool calls, and app logs.
- Normalized ISO timestamp filters so frontend `Z` timestamps match SQLite UTC records.
- Added a Logs filter form with time range selection and record counts.
- Reworked sessions and recent log streams into clickable shadcn table layouts.
- Removed the fixed inline Session Detail panel from the Logs page.
- Added a detail overlay for sessions, transcripts, tool calls, and app logs that closes on Escape or blank-area click.
- Moved full session detail into the session overlay, including conversation, tool calls, and app events.
- Aligned assistant and system transcript bubbles on the left, with user transcript bubbles on the right.
- Added session duration, estimated transcript text tokens, and a token cost status to the session detail overlay.
- Unified user, assistant, and system transcript bubble styling and removed speaker badge hover color behavior.

## Files

- `app/backend/voice_agent/main.py`
- `app/backend/voice_agent/storage/database.py`
- `app/backend/tests/test_database_filters.py`
- `app/desktop/src/App.tsx`
- `app/desktop/src/features/logs/log-record-dialog.tsx`
- `app/desktop/src/features/logs/logs-view.tsx`
- `app/desktop/src/features/logs/session-detail-panel.tsx`
- `app/desktop/src/features/logs/session-table.tsx`
- `app/desktop/src/features/logs/transcript-bubble.tsx`
- `app/desktop/src/hooks/use-session-detail.ts`
- `app/desktop/src/hooks/use-app-data.ts`
- `app/desktop/src/lib/api.ts`
- `app/desktop/src/lib/types.ts`

## Verification

- `.venv/bin/python -m unittest discover -s tests`
- `pnpm run build`

## Known Limits

- Session detail still loads the full selected session history, while the Logs overview is time-window filtered.

## Next Steps

- Add richer log search once sessions become dense enough to need keyword filtering.
