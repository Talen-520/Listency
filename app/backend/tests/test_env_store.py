from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from voice_agent.config.env_store import EnvStore


class EnvStoreTest(unittest.TestCase):
    def test_write_and_mask_public_config(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            store = EnvStore(Path(tmp) / ".env", Path(tmp) / ".env.example")
            store.write(
                {
                    "OPENAI_API_KEY": "sk-test-123456",
                    "GEMINI_API_KEY": "gemini-test-987654",
                    "OPENAI_REALTIME_MODEL": "gpt-realtime",
                    "GEMINI_LIVE_MODEL": "gemini-3.1-flash-live-preview",
                    "OPENAI_REALTIME_MOCK": "true",
                    "DEFAULT_REALTIME_PROVIDER": "gemini",
                    "OPENAI_DEFAULT_VOICE": "marin",
                    "GEMINI_DEFAULT_VOICE": "Zephyr",
                    "DEFAULT_VOICE": "default",
                }
            )

            values = store.read()
            public = store.read_public()

            self.assertEqual(values["DEFAULT_REALTIME_PROVIDER"], "gemini")
            self.assertEqual(values["OPENAI_REALTIME_MODEL"], "gpt-realtime")
            self.assertEqual(values["GEMINI_LIVE_MODEL"], "gemini-3.1-flash-live-preview")
            self.assertEqual(values["OPENAI_REALTIME_MOCK"], "true")
            self.assertEqual(values["OPENAI_DEFAULT_VOICE"], "marin")
            self.assertEqual(values["GEMINI_DEFAULT_VOICE"], "Zephyr")
            self.assertEqual(values["DEFAULT_VOICE"], "default")
            self.assertEqual(public["OPENAI_DEFAULT_VOICE"], "marin")
            self.assertEqual(public["GEMINI_DEFAULT_VOICE"], "Zephyr")
            self.assertTrue(public["has_openai_key"])
            self.assertTrue(public["has_gemini_key"])
            self.assertNotIn("sk-test-123456", public["OPENAI_API_KEY"])


if __name__ == "__main__":
    unittest.main()
