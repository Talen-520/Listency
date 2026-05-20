# 2026-05-20 - Twilio Real Call Alpha

## Goal

- Bring the public docs in line with the current phone-provider status after
  real Twilio inbound call testing.

## Changes

- Updated `README.md` so phone setup is described as Twilio alpha rather than
  only preview/scaffolding.
- Documented that Twilio inbound calls through the automatic tunnel path have
  been tested successfully from multiple caller numbers on a paid Twilio
  account.
- Updated the user workflow to include optional Connect Phone setup and phone
  call outcome review in Logs.
- Clarified remaining roadmap items: Twilio hardening, Telnyx media stream
  proof of concept, pipeline mode, workflow tools, and signed installers.

## Verification

- Manual Twilio inbound calls were tested successfully by the project owner
  before this documentation update.

## Known Limits

- Twilio support is still alpha and needs longer repeated-call stability tests,
  reconnect handling, and clearer provider-failure recovery.
- Telnyx media streaming is still planned.
