from __future__ import annotations

import unittest

from voice_agent.phone.twilio import TwilioPhoneAdapter


class TwilioAdapterTest(unittest.TestCase):
    def test_normalize_debugger_alert_keeps_safe_summary_fields(self) -> None:
        adapter = TwilioPhoneAdapter()

        alert = adapter._normalize_debugger_alert(
            {
                "sid": "NO123",
                "account_sid": "AC_SECRET",
                "alert_text": "HTTP retrieval failure",
                "date_created": "2026-05-19T21:00:00Z",
                "error_code": "11200",
                "log_level": "error",
                "more_info": "https://www.twilio.com/docs/api/errors/11200",
                "request_headers": "Authorization: secret",
                "request_method": "POST",
                "request_url": "https://example.trycloudflare.com/phone/twilio/inbound",
                "response_body": "secret response",
                "resource_sid": "CA123",
            }
        )

        self.assertEqual(alert["sid"], "NO123")
        self.assertEqual(alert["error_code"], "11200")
        self.assertEqual(alert["log_level"], "error")
        self.assertEqual(alert["request_method"], "POST")
        self.assertNotIn("account_sid", alert)
        self.assertNotIn("request_headers", alert)
        self.assertNotIn("response_body", alert)


if __name__ == "__main__":
    unittest.main()
