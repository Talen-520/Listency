# 2026-05-19 - Phone Call End Reason

## Goal

- Keep phone call history consistent with the underlying realtime session ending reason.
- Make Twilio test setup easier to verify before a real inbound call.

## Changes

- Updated the Twilio media stream lifecycle so `phone_calls.ended_reason` follows the actual session reason.
- Mark AI-ended phone calls as `completed` with `agent_hung_up` instead of overwriting them as `caller_hung_up`.
- Preserve `caller_hung_up` when Twilio sends the stop event first.
- Mark provider/media stream failures as `failed` with `provider_error`.
- Added Settings UI hints for unsaved phone settings and Twilio test readiness.

## Files

- `app/backend/voice_agent/phone/twilio_stream.py`
- `app/backend/tests/test_twilio_stream.py`
- `app/desktop/src/features/settings/settings-view.tsx`

## Verification

- `.venv/bin/python -m unittest tests.test_twilio_stream tests.test_log_maintenance tests.test_session_manager`
- `pnpm --dir app/desktop exec tsc --noEmit`
- `pnpm --dir app/desktop run build`
- `git diff --check`

## Known Limits

- Twilio real-call testing is still tied to the current local tunnel session and the user's Twilio trial account behavior.

## Next Steps

- Add provider reconnect and clearer degraded/error states.
- Record clean Windows and macOS artifact tests.
- Continue Telnyx media stream proof of concept.
