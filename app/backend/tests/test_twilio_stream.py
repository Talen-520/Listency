from __future__ import annotations

import unittest

from voice_agent.core.state import EndReason
from voice_agent.phone.twilio_stream import _phone_call_status_for_end_reason


class TwilioStreamTest(unittest.TestCase):
    def test_agent_hangup_finishes_phone_call_as_completed(self) -> None:
        self.assertEqual(_phone_call_status_for_end_reason(EndReason.AGENT_HUNG_UP), "completed")

    def test_caller_hangup_keeps_caller_hung_up_status(self) -> None:
        self.assertEqual(_phone_call_status_for_end_reason(EndReason.CALLER_HUNG_UP), "caller_hung_up")

    def test_provider_error_finishes_phone_call_as_failed(self) -> None:
        self.assertEqual(_phone_call_status_for_end_reason(EndReason.PROVIDER_ERROR), "failed")


if __name__ == "__main__":
    unittest.main()
