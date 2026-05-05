from __future__ import annotations

import unittest

from voice_agent.providers.base import ProviderSessionHandle
from voice_agent.providers.gemini_live import GeminiLiveAdapter


class GeminiLiveAdapterTest(unittest.TestCase):
    def test_config_message_uses_live_audio_tools_and_voice(self) -> None:
        adapter = GeminiLiveAdapter()
        event = adapter._config_message(
            {
                "GEMINI_DEFAULT_VOICE": "Kore",
                "GEMINI_LIVE_MODEL": "gemini-3.1-flash-live-preview",
            },
            {
                "instructions": "Answer briefly.",
                "tools": [
                    {
                        "type": "function",
                        "name": "business_info_lookup",
                        "description": "Look up business information.",
                        "parameters": {
                            "type": "object",
                            "properties": {"query": {"type": "string"}},
                            "required": ["query"],
                        },
                    }
                ],
            },
        )

        config = event["config"]

        self.assertEqual(config["model"], "models/gemini-3.1-flash-live-preview")
        self.assertEqual(config["responseModalities"], ["AUDIO"])
        self.assertEqual(config["systemInstruction"], {"parts": [{"text": "Answer briefly."}]})
        self.assertEqual(config["inputAudioTranscription"], {})
        self.assertEqual(config["outputAudioTranscription"], {})
        self.assertEqual(
            config["speechConfig"]["voiceConfig"]["prebuiltVoiceConfig"],
            {"voiceName": "Kore"},
        )
        self.assertEqual(config["tools"][0]["functionDeclarations"][0]["name"], "business_info_lookup")
        self.assertEqual(
            config["tools"][0]["functionDeclarations"][0]["parameters"]["properties"]["query"]["type"],
            "string",
        )

    def test_audio_chunk_message_uses_gemini_input_rate(self) -> None:
        adapter = GeminiLiveAdapter()
        event = adapter._audio_chunk_message(b"\x01\x02")

        audio = event["realtimeInput"]["audio"]

        self.assertEqual(audio["data"], "AQI=")
        self.assertEqual(audio["mimeType"], "audio/pcm;rate=16000")

    def test_normalize_audio_transcripts_and_turn_complete(self) -> None:
        adapter = GeminiLiveAdapter()
        handle = ProviderSessionHandle(
            provider="gemini",
            provider_session_id="gemini-test",
            metadata={"transcript_buffers": {"user": "", "assistant": ""}},
        )

        events = adapter._normalize_events(
            handle,
            {
                "serverContent": {
                    "modelTurn": {
                        "parts": [
                            {
                                "inlineData": {
                                    "mimeType": "audio/pcm;rate=24000",
                                    "data": "abc",
                                }
                            }
                        ]
                    },
                    "inputTranscription": {"text": "hello"},
                    "outputTranscription": {"text": "hi"},
                    "turnComplete": True,
                }
            },
        )

        self.assertIn("provider.output_audio.delta", [event["type"] for event in events])
        self.assertEqual(events[0]["sample_rate"], 24000)
        self.assertIn(
            {
                "type": "provider.transcript.done",
                "provider": "gemini",
                "raw_type": "serverContent.turnComplete",
                "speaker": "user",
                "content": "hello",
                "is_final": True,
            },
            events,
        )
        self.assertEqual(events[-1]["raw_type"], "serverContent.turnComplete")

    def test_normalize_tool_call_tracks_name_for_response(self) -> None:
        adapter = GeminiLiveAdapter()
        handle = ProviderSessionHandle(
            provider="gemini",
            provider_session_id="gemini-test",
            metadata={},
        )

        events = adapter._normalize_events(
            handle,
            {
                "toolCall": {
                    "functionCalls": [
                        {
                            "id": "call_123",
                            "name": "business_info_lookup",
                            "args": {"query": "hours"},
                        }
                    ]
                }
            },
        )

        self.assertEqual(events[0]["type"], "provider.tool_call.done")
        self.assertEqual(events[0]["tool_call_id"], "call_123")
        self.assertEqual(events[0]["tool_name"], "business_info_lookup")
        self.assertEqual(events[0]["arguments"], "{\"query\": \"hours\"}")
        self.assertEqual(handle.metadata["tool_call_names"]["call_123"], "business_info_lookup")

    def test_list_voices_returns_gemini_live_voice_names(self) -> None:
        voices = GeminiLiveAdapter().list_voices({})

        self.assertEqual(len(voices), 30)
        self.assertEqual(voices[0], "Zephyr")
        self.assertIn("Kore", voices)
        self.assertIn("Puck", voices)
        self.assertEqual(voices[-1], "Sulafat")

    def test_gemini_voice_falls_back_to_legacy_default_voice(self) -> None:
        self.assertEqual(GeminiLiveAdapter()._voice({"DEFAULT_VOICE": "Kore"}), "Kore")


if __name__ == "__main__":
    unittest.main()
