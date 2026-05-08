# 2026-05-08 Gemini Live Setup Fix

## Goal

- Fix Gemini Live sessions that connected but did not return audio or transcripts.

## Cause

- The raw Gemini Live WebSocket expects the first client message to use the `setup` field.
- The adapter was sending an SDK-style `config` message, so the session never emitted `setupComplete`.
- Audio could also be sent before Gemini confirmed the setup was ready.

## Changes

- Changed Gemini Live WebSocket setup payload from `config` to `setup`.
- Moved `responseModalities` and `speechConfig` under `generationConfig`.
- Kept input and output transcription options at the setup level.
- Wait for `setupComplete` before streaming audio to Gemini.
- Surface audio stream setup failures to the frontend and session logs as provider errors.
- Updated Gemini adapter tests for the raw WebSocket setup payload shape.

## Files

- `app/backend/voice_agent/providers/gemini_live.py`
- `app/backend/voice_agent/main.py`
- `app/backend/tests/test_gemini_live.py`

## Verification

- `.venv/bin/python -m unittest discover -s tests`
- Gemini Live Zephyr smoke with local `.env` key: setup completed and an audio delta was received.
