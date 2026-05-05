# 2026-05-05 Gemini Model And Voice Select

## Goal

- Replace the free-form Gemini Live model input with a shadcn Select and align Gemini voices with current Live API docs.

## Changes

- Added Gemini Live model options for the Settings UI.
- Kept `gemini-3.1-flash-live-preview` as the default Gemini Live model based on the current SDK quickstart.
- Removed other Gemini Live model choices so the selector only offers `gemini-3.1-flash-live-preview`.
- Updated Gemini voice option ordering and labels from the Vertex AI Live API language and voice guide.
- Split OpenAI and Gemini voice settings so Gemini's 30 voices are always selectable.
- Reworked Runtime settings into animated provider panels with active and inactive states.
- Updated the Gemini voice help link to the Vertex AI Live API voice documentation.

## Files

- `app/desktop/src/features/settings/settings-view.tsx`
- `app/desktop/src/features/settings/voice-help.tsx`
- `app/desktop/src/hooks/use-app-data.ts`
- `app/desktop/src/App.tsx`
- `app/desktop/src/lib/api.ts`
- `app/desktop/src/lib/models.ts`
- `app/desktop/src/lib/types.ts`
- `app/desktop/src/lib/voices.ts`
- `app/backend/voice_agent/config/env_store.py`
- `app/backend/voice_agent/main.py`
- `app/backend/voice_agent/providers/gemini_live.py`
- `app/backend/voice_agent/providers/openai_realtime.py`
- `.env.example`
- `README.md`
- `app/backend/tests/test_env_store.py`
- `app/backend/tests/test_gemini_live.py`
- `app/backend/tests/test_openai_realtime.py`

## Verification

- `app/backend/.venv/bin/python -m unittest discover -s tests` passed.
- `pnpm run build` passed in `app/desktop`.
- `git diff --check` passed.

## Known Limits

- OpenAI Realtime model remains a free-form field for now.

## Next Steps

- Consider adding provider model metadata from the backend if the model lists grow.
