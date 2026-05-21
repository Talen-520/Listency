from __future__ import annotations

import asyncio
import unittest

from voice_agent.phone.telnyx import TelnyxPhoneAdapter
from voice_agent.tunnel import TunnelStatus


class TelnyxPhoneAdapterTest(unittest.TestCase):
    def test_provision_returns_call_control_webhook_and_media_urls(self) -> None:
        adapter = TelnyxPhoneAdapter()
        calls = []

        def fake_request(env, method, path, data=None):
            calls.append((method, path, data))
            return {}

        adapter._request = fake_request  # type: ignore[method-assign]
        result = asyncio.run(
            adapter.provision(
                {"TELNYX_API_KEY": "key", "TELNYX_CALL_CONTROL_APP_ID": "app_123", "TELNYX_APPLICATION_NAME": "Listency"},
                TunnelStatus(
                    mode="automatic",
                    status="running",
                    public_base_url="https://example.trycloudflare.com",
                    public_ws_url="wss://example.trycloudflare.com",
                ),
            )
        )

        self.assertEqual(result.inbound_url, "https://example.trycloudflare.com/phone/telnyx/webhook")
        self.assertEqual(result.media_url, "wss://example.trycloudflare.com/phone/telnyx/media")
        self.assertEqual(calls[0][0], "PATCH")
        self.assertEqual(calls[0][1], "/v2/call_control_applications/app_123")

    def test_answer_call_with_stream_enables_bidirectional_pcmu_media(self) -> None:
        adapter = TelnyxPhoneAdapter()
        calls = []

        def fake_request(env, method, path, data=None):
            calls.append((method, path, data))
            return {"data": {"result": "ok"}}

        adapter._request = fake_request  # type: ignore[method-assign]
        result = asyncio.run(
            adapter.answer_call_with_stream(
                {"TELNYX_API_KEY": "key", "TELNYX_CALL_CONTROL_APP_ID": "app_123"},
                "call_control_123",
                "wss://example.trycloudflare.com/phone/telnyx/media",
                from_number="+15550000001",
                to_number="+15550000002",
            )
        )

        self.assertEqual(result["data"]["result"], "ok")
        self.assertEqual(calls[0][0], "POST")
        self.assertEqual(calls[0][1], "/v2/calls/call_control_123/actions/answer")
        payload = calls[0][2]
        self.assertEqual(payload["stream_url"], "wss://example.trycloudflare.com/phone/telnyx/media")
        self.assertEqual(payload["stream_track"], "inbound_track")
        self.assertEqual(payload["stream_codec"], "PCMU")
        self.assertEqual(payload["stream_bidirectional_mode"], "rtp")
        self.assertEqual(payload["stream_bidirectional_codec"], "PCMU")


if __name__ == "__main__":
    unittest.main()
