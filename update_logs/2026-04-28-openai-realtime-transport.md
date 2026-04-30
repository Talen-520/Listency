# 2026-04-28 OpenAI Realtime Transport

## Goal

Connect the existing local PCM16 microphone stream to the OpenAI Realtime provider adapter, then route provider audio deltas back to the desktop app for playback.

## Changes

- Added `OPENAI_REALTIME_MODEL` and `OPENAI_REALTIME_MOCK` config support.
- Extended the provider interface with `send_audio()` and provider event callbacks.
- Implemented OpenAI Realtime WebSocket transport:
  - connect to the selected Realtime model
  - send `session.update`
  - forward PCM16 chunks as `input_audio_buffer.append`
  - normalize audio/transcript/error events from the provider
- Matched the current Realtime PCM schema with 24kHz `audio/pcm` input/output settings.
- Updated `SessionManager` to forward received PCM16 chunks to the active provider.
- Updated backend WebSocket route to multiplex frontend messages and provider events.
- Added frontend PCM16 output playback for provider audio deltas.
- Added mock-mode WebSocket smoke coverage that verifies local audio streaming without calling OpenAI.
- Added provider error persistence so OpenAI Realtime errors appear in transcripts, session error state, and App Logs.
- Added selected provider lifecycle/VAD events to App Logs for diagnosing microphone/VAD/response flow.
- Pre-warmed/resumed frontend output `AudioContext` during Test Call start to reduce silent playback failures.
- Enabled OpenAI Realtime input transcription with `gpt-4o-transcribe` so user speech can be persisted.
- Added Logs session drill-down UI for per-session conversation, tool calls, and provider/app events.
- Added `session_id` filters to transcript, tool-call, and app-log retrieval paths used by the desktop detail view.

## Verification

- `python -m unittest discover -s tests`
- `python -m compileall voice_agent tests`
- `pnpm run build`
- `python ../../scripts/smoke_ws.py` with `OPENAI_REALTIME_MOCK=true`
- Direct Realtime WebSocket probe confirmed session creation/update and text `response.create` events with the local OpenAI key.

## Notes

- Real OpenAI Realtime calls require a valid `OPENAI_API_KEY` in `.env`.
- Gemini Live remains a provider boundary for a later pass.
- Tool-call round trip from provider events is not implemented yet.
