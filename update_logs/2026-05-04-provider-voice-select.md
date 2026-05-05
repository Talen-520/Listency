# 2026-05-04 Provider Voice Select

## Goal

- Replace free-form default voice input with a provider-aware shadcn Select.

## Changes

- Added provider-specific voice option lists for OpenAI Realtime and Gemini Live.
- Updated Settings default voice control to use the shadcn Select component.
- Reset the selected voice to provider default when switching to a provider that does not support the saved voice.
- Updated backend provider `list_voices()` responses so the Voice page can show supported voices.
- Refreshed voice help links for OpenAI Realtime and Gemini Live voice docs.

## Files

- `app/desktop/src/features/settings/settings-view.tsx`
- `app/desktop/src/features/settings/voice-help.tsx`
- `app/desktop/src/lib/voices.ts`
- `app/backend/voice_agent/providers/openai_realtime.py`
- `app/backend/voice_agent/providers/gemini_live.py`
- `app/backend/tests/test_openai_realtime.py`
- `app/backend/tests/test_gemini_live.py`
- `README.md`

## Verification

- `app/backend/.venv/bin/python -m unittest discover -s tests` passed.
- `pnpm run build` passed in `app/desktop`.
- `git diff --check` passed.

## Known Limits

- Voice selection is still stored as one global `DEFAULT_VOICE`; it is not yet saved per provider.

## Next Steps

- Consider provider-specific saved voice fields if users frequently switch providers.
