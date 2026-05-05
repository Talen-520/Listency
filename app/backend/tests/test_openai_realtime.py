from __future__ import annotations

import unittest

from voice_agent.providers.openai_realtime import OpenAIRealtimeAdapter


class OpenAIRealtimeAdapterTest(unittest.TestCase):
    def test_session_update_uses_current_audio_schema(self) -> None:
        adapter = OpenAIRealtimeAdapter()
        event = adapter._session_update(
            {"DEFAULT_VOICE": "marin"},
            {
                "instructions": "Answer briefly.",
                "tools": [
                    {
                        "type": "function",
                        "name": "business_info_lookup",
                        "description": "Look up business information.",
                        "parameters": {"type": "object", "properties": {"query": {"type": "string"}}},
                    }
                ],
            },
        )

        session = event["session"]

        self.assertEqual(event["type"], "session.update")
        self.assertEqual(session["type"], "realtime")
        self.assertEqual(session["output_modalities"], ["audio"])
        self.assertEqual(session["instructions"], "Answer briefly.")
        self.assertEqual(session["audio"]["input"]["format"], {"type": "audio/pcm", "rate": 24000})
        self.assertEqual(session["audio"]["input"]["transcription"], {"model": "gpt-4o-transcribe"})
        self.assertEqual(session["audio"]["output"]["format"], {"type": "audio/pcm", "rate": 24000})
        self.assertEqual(session["audio"]["output"]["voice"], "marin")
        self.assertEqual(session["audio"]["input"]["turn_detection"]["type"], "server_vad")
        self.assertTrue(session["audio"]["input"]["turn_detection"]["create_response"])
        self.assertEqual(session["tool_choice"], "auto")
        self.assertEqual(session["tools"][0]["name"], "business_info_lookup")

    def test_normalize_tool_call_done(self) -> None:
        adapter = OpenAIRealtimeAdapter()
        event = adapter._normalize_event(
            {
                "type": "response.function_call_arguments.done",
                "call_id": "call_123",
                "name": "business_info_lookup",
                "arguments": "{\"query\":\"hours\"}",
            }
        )

        self.assertEqual(event["type"], "provider.tool_call.done")
        self.assertEqual(event["tool_call_id"], "call_123")
        self.assertEqual(event["tool_name"], "business_info_lookup")
        self.assertEqual(event["arguments"], "{\"query\":\"hours\"}")

    def test_normalize_provider_error_keeps_code(self) -> None:
        adapter = OpenAIRealtimeAdapter()
        event = adapter._normalize_event(
            {
                "type": "error",
                "error": {
                    "type": "insufficient_quota",
                    "code": "insufficient_quota",
                    "message": "You exceeded your current quota.",
                    "param": None,
                },
            }
        )

        self.assertEqual(event["type"], "provider.error")
        self.assertEqual(event["code"], "insufficient_quota")
        self.assertEqual(event["error_type"], "insufficient_quota")
        self.assertEqual(event["message"], "You exceeded your current quota.")

    def test_list_voices_returns_supported_realtime_voices(self) -> None:
        voices = OpenAIRealtimeAdapter().list_voices({})

        self.assertIn("marin", voices)
        self.assertIn("cedar", voices)
        self.assertIn("alloy", voices)


if __name__ == "__main__":
    unittest.main()
