from __future__ import annotations

import unittest

from voice_agent.main import _correlate_twilio_debugger_alerts, _redact_diagnostics, _safe_json_record


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

    def test_correlates_twilio_debugger_alerts_to_local_phone_calls(self) -> None:
        alerts = [
            {
                "sid": "NO123",
                "resource_sid": "CA123",
                "error_code": "11200",
                "alert_text": "HTTP retrieval failure",
            },
            {
                "sid": "NO124",
                "resource_sid": "CA999",
                "error_code": "11205",
                "alert_text": "Connection failed",
            },
        ]
        phone_calls = [
            {
                "id": 42,
                "provider": "twilio",
                "provider_call_id": "CA123",
            }
        ]

        correlated = _correlate_twilio_debugger_alerts(alerts, phone_calls)

        self.assertTrue(correlated[0]["correlated"])
        self.assertEqual(correlated[0]["listency_phone_call_id"], 42)
        self.assertFalse(correlated[1]["correlated"])
        self.assertIsNone(correlated[1]["listency_phone_call_id"])


if __name__ == "__main__":
    unittest.main()
