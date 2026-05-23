# 2026-05-21 - Provider Reconnect And Telnyx Alpha

## Summary

- Added a conservative provider reconnect path for active Realtime sessions.
- Added degraded/error status details for provider connection failures.
- Added a Telnyx Call Control media stream proof of concept that connects
  inbound calls into the existing Realtime runtime.
- Surfaced latest phone call failure details in readiness and Settings.

## Backend

- `SessionManager` now stores per-session provider status, reconnect attempts,
  last error, phone provider, and provider call id in runtime status.
- Audio send failures attempt one provider reconnect, then retry the audio
  chunk once before ending the session as `network_error`.
- OpenAI Realtime and Gemini Live websocket closures now emit
  `provider.disconnected` instead of only surfacing opaque exceptions.
- Desktop test call and Twilio phone streams handle `provider.reconnecting` and
  `provider.reconnected` events.
- Telnyx inbound `call.initiated` webhooks answer the call with a media stream
  URL when the automatic tunnel is running.
- Added `/phone/telnyx/media` websocket handling for PCMU 8 kHz inbound media,
  provider output audio return frames, transcript capture, tool calls, and
  caller/provider/agent end reasons.

## Frontend

- Dashboard shows degraded runtime details when provider recovery fails.
- Readiness treats degraded runtime and latest failed phone call as actionable
  warnings.
- Test Call shows provider reconnecting/reconnected events and user-readable
  toast messages.
- Settings shows latest phone call failure details for the selected provider.
- Settings now uses one Phone Connection toggle button: stopped states connect
  or update webhooks, while running states stop the connection.

## Tests

- `python -m unittest discover -s tests`
- `python -m compileall voice_agent`
- `pnpm --dir app/desktop run build`

## Notes

- Twilio paid-account inbound testing remains the verified real-call path.
- Telnyx support is an alpha proof of concept. Real Telnyx inbound call testing
  is intentionally deferred for a later alpha pass.
