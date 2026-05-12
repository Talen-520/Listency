# 2026-05-12 Booking Capacity Tool

## Goal

- Add a small booking-capacity placeholder tool for local tool-calling tests.

## Changes

- Added `check_booking_capacity`.
- The tool returns a fixed local test response.
- Added backend unit coverage for the new tool.

## Files

- `app/backend/voice_agent/tools/builtins.py`
- `app/backend/tests/test_tools.py`

## Verification

- `.venv/bin/python -m unittest discover -s tests`

## Known Limits

- This is a placeholder tool and does not query real booking inventory.

## Next Steps

- Replace with real availability logic when the booking workflow is expanded.
