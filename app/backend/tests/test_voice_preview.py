from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from voice_agent.config.env_store import EnvStore
from voice_agent.core.voice_preview import VoicePreviewService
from voice_agent.providers.openai_realtime import OpenAIRealtimeAdapter


class VoicePreviewServiceTest(unittest.IsolatedAsyncioTestCase):
    async def test_ensure_preview_uses_existing_cache_without_api_key(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            cache_root = root / "previews"
            preview_file = cache_root / "openai" / "alloy.wav"
            preview_file.parent.mkdir(parents=True)
            preview_file.write_bytes(b"cached")
            service = VoicePreviewService(
                EnvStore(root / ".env", root / ".env.example"),
                {"openai": OpenAIRealtimeAdapter()},
                cache_root,
            )

            result = await service.ensure_preview("openai", "alloy")

            self.assertTrue(result["cached"])
            self.assertEqual(result["audio_url"], "/voice-previews/openai/alloy")

    async def test_rejects_unsupported_voice_before_remote_call(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            env = EnvStore(root / ".env", root / ".env.example")
            env.write({"OPENAI_API_KEY": "sk-test"})
            service = VoicePreviewService(env, {"openai": OpenAIRealtimeAdapter()}, root / "previews")

            with self.assertRaisesRegex(Exception, "Unsupported openai voice"):
                await service.ensure_preview("openai", "not-a-voice")

    def test_cached_voices_lists_wav_stems(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            cache_root = root / "previews"
            (cache_root / "openai").mkdir(parents=True)
            (cache_root / "openai" / "alloy.wav").write_bytes(b"")
            (cache_root / "openai" / "sage.wav").write_bytes(b"")
            service = VoicePreviewService(
                EnvStore(root / ".env", root / ".env.example"),
                {"openai": OpenAIRealtimeAdapter()},
                cache_root,
            )

            self.assertEqual(service.cached_voices()["openai"], ["alloy", "sage"])

    def test_wav_bytes_wraps_pcm_data(self) -> None:
        service = VoicePreviewService(EnvStore(), {}, Path("/tmp/unused"))

        audio = service._wav_bytes(b"\x00\x00\x01\x00")

        self.assertTrue(audio.startswith(b"RIFF"))
        self.assertIn(b"WAVE", audio[:16])


if __name__ == "__main__":
    unittest.main()
