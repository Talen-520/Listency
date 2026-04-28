# 2026-04-28 Initial MVP Scaffold

## Goal

- Build the first executable local-only MVP scaffold for `voiceAgent`.
- Establish Tauri/React desktop UI, Python FastAPI backend, local `.env` config, SQLite storage, provider adapter boundaries, and a local Test Call audio stream.

## Changes

- Added Tauri + React + Vite + Tailwind + shadcn-style frontend.
- Added Python FastAPI backend.
- Added local `.env` read/write flow through backend API.
- Added SQLite schema and persistence helpers.
- Added runtime/session manager with 5-minute session timeout.
- Added OpenAI Realtime and Gemini Live provider adapter boundaries.
- Added tool registry and built-in tools.
- Added frontend Test Call UI with microphone capture.
- Added PCM16 local audio streaming over backend WebSocket.
- Added Tauri macOS `.app` build target.
- Added development docs and smoke test script.

## Files

- `app/desktop/src/App.tsx`
- `app/desktop/src/lib/api.ts`
- `app/desktop/src/lib/types.ts`
- `app/desktop/src-tauri/tauri.conf.json`
- `app/backend/voice_agent/main.py`
- `app/backend/voice_agent/core/session_manager.py`
- `app/backend/voice_agent/storage/database.py`
- `app/backend/voice_agent/providers/`
- `app/backend/voice_agent/tools/`
- `scripts/smoke_ws.py`
- `scripts/generate_tauri_icon.mjs`
- `DEVELOPMENT.md`
- `MVP_PLAN.md`

## Verification

- Backend unit tests passed: `python -m unittest discover -s tests`.
- Backend compile check passed: `python -m compileall voice_agent tests`.
- WebSocket smoke test passed: `python ../../scripts/smoke_ws.py`.
- Frontend build passed: `pnpm run build`.
- Tauri Rust check passed: `cargo check`.
- Tauri macOS app build passed: `pnpm run tauri:build`.

## Known Limits

- Provider adapters do not yet connect to real OpenAI Realtime or Gemini Live remote audio transport.
- Test Call currently streams local PCM16 audio to backend and records local/system transcript events only.
- Provider output audio playback is not implemented yet.
- Phone provider integration is not implemented yet.
- DMG packaging is intentionally not the default MVP target; `.app` bundle is the current target.

## Next Steps

- Implement OpenAI Realtime transport in backend adapter.
- Forward frontend PCM16 chunks as `input_audio_buffer.append`.
- Handle provider audio delta events and stream them back to frontend for playback.
- Add function calling bridge from provider events to local tool registry.
- Add Gemini Live transport after OpenAI Realtime path is stable.
