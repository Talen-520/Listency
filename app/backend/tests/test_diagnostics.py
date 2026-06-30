from __future__ import annotations

import unittest

from voice_agent.main import _redact_diagnostics, _safe_json_record


class DiagnosticsExportTest(unittest.TestCase):
    def test_redacts_secrets_and_phone_numbers(self) -> None:
        payload = {
            "openai_api_key": "sk-test-secret",
            "twilio_auth_token": "token-secret",
            "from_number": "+15551234567",
            "safe_status": "running",
        }

        redacted = _redact_diagnostics(payload)

        self.assertEqual(redacted["openai_api_key"], "[redacted]")
        self.assertEqual(redacted["twilio_auth_token"], "[redacted]")
        self.assertEqual(redacted["from_number"], "[redacted phone ending 67]")
        self.assertEqual(redacted["safe_status"], "running")

    def test_safe_json_record_parses_and_redacts_json_fields(self) -> None:
        record = {
            "event": "twilio_call_status",
            "metadata_json": '{"raw": {"AuthToken": "secret", "From": "+15551234567"}, "status": "failed"}',
        }

        safe = _safe_json_record(record)

        self.assertNotIn("metadata_json", safe)
        self.assertEqual(safe["metadata"]["raw"]["AuthToken"], "[redacted]")
        self.assertEqual(safe["metadata"]["raw"]["From"], "[redacted phone ending 67]")
        self.assertEqual(safe["metadata"]["status"], "failed")


if __name__ == "__main__":
    unittest.main()
