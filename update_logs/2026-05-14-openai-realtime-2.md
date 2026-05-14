# 2026-05-14 - OpenAI Realtime 2 Defaults

## Goal

Move the OpenAI Realtime MVP defaults to `gpt-realtime-2` and make the voice-agent prompt/tool policy better aligned with Realtime 2 guidance.

## Changes

- Changed the default OpenAI Realtime model from `gpt-realtime` to `gpt-realtime-2`.
- Migrated the previous exact default value `gpt-realtime` to `gpt-realtime-2` when reading existing local `.env` files.
- Updated Settings model placeholder/default state and `.env.example`.
- Added `reasoning: {"effort": "low"}` to OpenAI Realtime session updates.
- Reworked the default agent prompt with sections for role, tone, reasoning, preambles, business lookup, bookings, transfer/escalation, unclear audio, and call ending.
- Expanded built-in tool descriptions and JSON schema descriptions so the model has clearer trigger conditions, confirmation boundaries, fallback behavior, and escalation rules.
- Updated README and local agent notes.

## Verification

- `.venv/bin/python -m unittest discover -s tests`
- `pnpm --dir app/desktop exec tsc --noEmit`
