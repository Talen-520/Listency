# 2026-05-14 - Log Cleanup And Export

## Goal

Keep 24/7 local usage from growing SQLite log data without bound and let users download their log records.

## Changes

- Added backend log maintenance APIs:
  - `GET /logs/export`
  - `POST /logs/prune`
  - `POST /logs/clear`
- Added SQLite cleanup helpers for sessions, messages, transcripts, tool calls, and app logs.
- Added Logs page `Download JSON` action for the current 24h / 7 days / 30 days filter.
- Added Settings data controls:
  - `Clean 30+ Days`
  - `Clear Logs`
- Guarded full log clearing while an active session is running.
- Updated README and local agent development notes.

## Verification

- `.venv/bin/python -m unittest discover -s tests`
- `pnpm --dir app/desktop exec tsc --noEmit`
