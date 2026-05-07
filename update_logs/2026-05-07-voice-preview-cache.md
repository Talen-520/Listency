# 2026-05-07 Voice Preview Cache

## Goal

- Add voice preview playback for OpenAI and Gemini voice settings with local caching.

## Changes

- Added a backend `VoicePreviewService` that generates previews through provider TTS APIs.
- Added `GET /voice-previews`, `POST /voice-preview`, and cached audio serving under `/voice-previews/{provider}/{voice}`.
- Cached generated preview WAV files under `data/voice_previews/`.
- Added Settings playback buttons for OpenAI and Gemini voices.
- Added cached icons inside voice select options for previews that already exist locally.
- Added frontend API helpers and app state for voice preview cache.
- Made preview-cache loading tolerant of older backend instances so startup does not show a Not Found toast before backend restart.
- Added backend tests for cache reuse, voice validation, cached voice listing, and WAV wrapping.

## Files

- `app/backend/voice_agent/core/voice_preview.py`
- `app/backend/voice_agent/main.py`
- `app/backend/tests/test_voice_preview.py`
- `app/desktop/src/features/settings/settings-view.tsx`
- `app/desktop/src/hooks/use-app-data.ts`
- `app/desktop/src/lib/api.ts`
- `app/desktop/src/lib/types.ts`
- `README.md`

## Verification

- `app/backend/.venv/bin/python -m unittest discover -s tests` passed.
- `pnpm run build` passed in `app/desktop`.
- `git diff --check` passed.

## Known Limits

- First preview playback requires the provider API key and may incur provider usage cost.
- Cached preview audio is local-only and is not committed.

## Next Steps

- Consider adding a custom preview text setting if users want localized preview phrases.
