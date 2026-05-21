# 2026-05-21 - macOS Artifact And Phone Stability View

## Summary

- Recorded the macOS alpha artifact user test as complete after the app opened
  successfully with the expected unsigned-build quarantine workaround.
- Added a Logs-level Phone Stability summary for long inbound-call testing.

## Frontend

- `useAppData` now loads recent `phone_calls` alongside sessions,
  transcripts, tool calls, and app logs for the selected time window.
- Logs now shows a Phone Stability card with:
  - long calls, counted as phone calls lasting at least 240 seconds;
  - failures;
  - longest call duration;
  - average call duration.
- Logs now has a Phone Calls tab with provider, duration, status, end reason,
  route, and error message.
- Log detail overlays can inspect a single phone call record.

## Docs

- Updated the MVP plan to mark the clean macOS artifact test record complete.
- Updated README to mention the phone stability summary and macOS alpha
  artifact opening result.

## Tests

- `pnpm --dir app/desktop run build`
- `python -m unittest discover -s tests`

## Remaining Manual Test

- Run repeated Twilio inbound calls, preferably several near the five-minute
  session limit, and confirm the Phone Stability summary shows stable durations
  and no unexpected provider failures.
