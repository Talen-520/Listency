from __future__ import annotations

import unittest

from voice_agent.providers.openai_realtime import OpenAIRealtimeAdapter


class OpenAIRealtimeAdapterTest(unittest.TestCase):
    def test_session_update_uses_current_audio_schema(self) -> None:
        adapter = OpenAIRealtimeAdapter()
        event = adapter._session_update(
            {"DEFAULT_VOICE": "marin"},
            {"instructions": "Answer briefly."},
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


if __name__ == "__main__":
    unittest.main()
