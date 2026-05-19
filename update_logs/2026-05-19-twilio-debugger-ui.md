# 2026-05-19 - Twilio Debugger UI

## Goal

- Make real Twilio inbound call failures easier to diagnose from Listency without opening Twilio Console first.

## Changes

- Added a backend endpoint for recent Twilio Monitor Alert summaries:
  - `GET /phone/twilio/debugger`
- Added Twilio adapter support for fetching recent Debugger alerts from Twilio Monitor.
- Returned only safe summary fields to the desktop UI, excluding account SID, request headers, response headers, and response bodies.
- Added a Twilio Debugger panel in Settings with a refresh action, level badge, error code, timestamp, request URL, and Twilio error reference link.
- Added unit coverage for Twilio Debugger alert normalization.
- Updated README and local MVP notes.

## Files

- `app/backend/voice_agent/phone/twilio.py`
- `app/backend/voice_agent/main.py`
- `app/backend/tests/test_twilio_adapter.py`
- `app/desktop/src/lib/api.ts`
- `app/desktop/src/lib/types.ts`
- `app/desktop/src/hooks/use-app-data.ts`
- `app/desktop/src/App.tsx`
- `app/desktop/src/features/settings/settings-view.tsx`
- `README.md`

## Verification

- `.venv/bin/python -m unittest tests.test_twilio_adapter tests.test_twilio_stream tests.test_log_maintenance tests.test_session_manager`
- `pnpm --dir app/desktop exec tsc --noEmit`
- `pnpm --dir app/desktop run build`
- `git diff --check`

## Known Limits

- The panel requires valid Twilio credentials and network access.
- It fetches recent Monitor Alerts for the account, not only alerts tied to one specific Listency call SID.

## Next Steps

- Add automatic reprovision warning/recovery when the tunnel URL changes.
- Add more local phone lifecycle diagnostics for caller hangup, AI hangup, and provider failure.
