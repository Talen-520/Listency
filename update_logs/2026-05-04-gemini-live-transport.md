# 2026-05-04 Gemini Live Transport

## Goal

- Connect the Gemini Live provider path for the MVP realtime Test Call.

## Changes

- Implemented Gemini Live raw WebSocket transport with local `.env` API key loading.
- Added `GEMINI_LIVE_MODEL` config support in the backend and Settings UI.
- Switched Test Call microphone capture to 16kHz PCM16 for Gemini while keeping OpenAI at 24kHz.
- Normalized Gemini Live audio, transcripts, tool calls, setup, and turn-complete events into the shared provider event shape.
- Added Gemini tool response delivery through `toolResponse.functionResponses`.
- Fixed `.gitignore` so only the repo-root `agent/` docs folder is ignored.

## Files

- `app/backend/voice_agent/providers/gemini_live.py`
- `app/backend/voice_agent/config/env_store.py`
- `app/backend/voice_agent/main.py`
- `app/desktop/src/hooks/use-realtime-test.ts`
- `app/desktop/src/hooks/use-app-data.ts`
- `app/desktop/src/features/settings/settings-view.tsx`
- `.env.example`
- `.gitignore`
- `README.md`

## Verification

- `app/backend/.venv/bin/python -m unittest discover -s tests` passed.
- `pnpm run build` passed in `app/desktop`.
- `git diff --check` passed.

## Known Limits

- Gemini Live uses the existing local Test Call path only; phone provider integration is still pending.
- Gemini Live sessions keep the project-level 5-minute cap.

## Next Steps

- Test Gemini Live with a real API key from Settings.
- Add phone provider lifecycle once local realtime providers are stable.
