# 2026-05-19 - Phone Call Log Detail

## Goal

- Make phone call outcomes clear in Logs instead of requiring direct SQLite inspection.

## Changes

- Added `GET /phone-calls` with optional `session_id` and `since` filters.
- Added session-specific phone call loading for the Logs detail overlay.
- Added phone call summary cards to session detail for phone end reason and call route.
- Added user-readable lifecycle labels such as `AI Hung Up`, `Caller Hung Up`, and `Provider Failure`.
- Updated session table and detail rows to use lifecycle labels instead of raw enum strings.
- Added database coverage for `phone_calls` filtering by session.

## Files

- `app/backend/voice_agent/main.py`
- `app/backend/voice_agent/storage/database.py`
- `app/backend/tests/test_log_maintenance.py`
- `app/desktop/src/lib/api.ts`
- `app/desktop/src/lib/lifecycle.ts`
- `app/desktop/src/hooks/use-session-detail.ts`
- `app/desktop/src/App.tsx`
- `app/desktop/src/features/logs/log-record-dialog.tsx`
- `app/desktop/src/features/logs/logs-view.tsx`
- `app/desktop/src/features/logs/session-detail-panel.tsx`
- `app/desktop/src/features/logs/session-table.tsx`
- `README.md`

## Verification

- `.venv/bin/python -m unittest tests.test_phone_manager tests.test_twilio_adapter tests.test_twilio_stream tests.test_log_maintenance tests.test_session_manager`
- `pnpm --dir app/desktop exec tsc --noEmit`
- `pnpm --dir app/desktop run build`
- `git diff --check`

## Known Limits

- Phone call records are currently shown in session detail only; the top-level Logs summary does not yet count phone calls separately.

## Next Steps

- Add provider reconnect and clearer degraded/error recovery states.
- Continue multiple real Twilio inbound call tests.
