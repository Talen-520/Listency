# Phone Setup

Phone support is required for real inbound calls. Twilio is the recommended
provider for the first public release and has been tested through the automatic
tunnel path. Telnyx Call Control media streaming remains experimental and is not
recommended for production use yet.

## How Automatic Phone Setup Works

Packaged Listency builds include a cloudflared sidecar. When the user chooses
Connect Phone:

1. The local backend starts a public cloudflared tunnel.
2. Only `/phone/*` provider webhook routes are exposed through that public host.
3. The selected phone provider webhook is updated to the current tunnel URL.
4. An inbound call starts a realtime session only when the phone provider sends
   the call/media events.

Normal local app APIs remain blocked from the public tunnel host.

## Twilio Setup

Required values in Settings:

- Account SID
- Auth Token
- Twilio phone number

Then:

1. Choose Twilio as the phone provider.
2. Save Settings.
3. Choose Connect Phone.
4. Wait for tunnel and webhook readiness.
5. Call the Twilio number.

Twilio trial accounts may restrict calls to verified caller IDs. Paid accounts
can receive calls from normal caller numbers once the number and voice
capabilities are configured.

## Logs And Debugging

Use:

- Settings phone status for connection/provisioning state
- Dashboard readiness for backend/runtime/provider checks
- Logs for phone call records and linked session detail
- Twilio Debugger panel for recent Twilio webhook/API alerts

Useful outcomes to confirm during testing:

- caller hangup
- AI hangup
- provider failure
- tunnel or webhook provisioning failure
- realtime provider failure

## Telnyx Status

Telnyx support is experimental proof of concept:

- Call Control webhook route exists.
- Media stream websocket route exists.
- Runtime connection path is wired to the existing realtime session manager.

Real Telnyx inbound call validation is deferred. Telnyx may also require
account, identity, number, or use-case verification depending on region and
number type, so Twilio remains the public release path for now.
