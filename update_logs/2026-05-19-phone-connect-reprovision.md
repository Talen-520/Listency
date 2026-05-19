# 2026-05-19 - Phone Connect Reprovision

## Goal

- Keep phone provider webhooks aligned with the active public tunnel URL.
- Make Connect Phone a single backend-controlled action instead of a frontend sequence of separate start/provision calls.

## Changes

- Added `POST /phone/connect` to start or reuse the phone tunnel and provision the selected provider in one action.
- Added `reprovision_required` and `reprovision_reason` to phone status when the current tunnel URL differs from the last provisioned provider URL.
- Updated the desktop Connect Phone action to call the unified backend endpoint.
- Updated Settings notice and button text to show when provider webhooks need updating.
- Added backend unit coverage for changed tunnel URL detection and connect-time reprovision.

## Files

- `app/backend/voice_agent/phone/manager.py`
- `app/backend/voice_agent/main.py`
- `app/backend/tests/test_phone_manager.py`
- `app/desktop/src/lib/api.ts`
- `app/desktop/src/lib/types.ts`
- `app/desktop/src/hooks/use-app-data.ts`
- `app/desktop/src/features/settings/settings-view.tsx`
- `README.md`

## Verification

- `.venv/bin/python -m unittest tests.test_phone_manager tests.test_twilio_adapter tests.test_twilio_stream tests.test_log_maintenance tests.test_session_manager`
- `pnpm --dir app/desktop exec tsc --noEmit`
- `pnpm --dir app/desktop run build`
- `git diff --check`

## Known Limits

- Automatic reprovision runs when the user clicks Connect Phone. It does not silently call provider APIs from a passive status refresh.

## Next Steps

- Add clearer local lifecycle diagnostics for caller hangup, AI hangup, and provider/media failure.
- Continue real Twilio inbound call test logging across multiple calls.
