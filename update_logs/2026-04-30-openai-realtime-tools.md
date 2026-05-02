# 2026-04-30 OpenAI Realtime Tools

## Goal

Let the Realtime model call enabled local tools, starting with business profile lookup, and return tool results back into the live voice conversation.

## Changes

- Registered enabled local tools in OpenAI Realtime `session.tools`.
- Added provider `send_tool_result()` support.
- Normalized OpenAI function-call events into `provider.tool_call.done`.
- Routed tool calls through the backend `tool_registry`.
- Sent tool outputs back to OpenAI as `function_call_output` items followed by `response.create`.
- Added per-session tool-call deduplication to avoid duplicate side effects.
- Surfaced live `tool.call` events in the Test Call event list.
- Added `end_call` so the AI can end the session after saying goodbye.
- Added `agent_hung_up` session end reason and frontend playback-aware hangup completion.
- Updated architecture and development docs.

## Notes

- Tool calls must remain backend-mediated; the provider never executes arbitrary code directly.
- `business_info_lookup` uses the saved Business Profile text.
- `create_booking`, `transfer_call`, and `log_customer_request` remain local placeholder tools until phone/PMS integrations exist.
- `end_call` currently ends the local Test Call session; future phone adapters should map the same intent to provider-side hangup.
