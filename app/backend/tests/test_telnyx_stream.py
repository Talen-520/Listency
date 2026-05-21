from __future__ import annotations

import unittest

from voice_agent.core.state import EndReason
from voice_agent.phone.telnyx_stream import _custom_parameters, _phone_call_status_for_end_reason


class TelnyxStreamTest(unittest.TestCase):
    def test_custom_parameters_accepts_list_shape(self) -> None:
        self.assertEqual(
            _custom_parameters({"custom_parameters": [{"name": "from", "value": "+15550000001"}]}),
            {"from": "+15550000001"},
        )

    def test_network_error_finishes_phone_call_as_failed(self) -> None:
        self.assertEqual(_phone_call_status_for_end_reason(EndReason.NETWORK_ERROR), "failed")


if __name__ == "__main__":
    unittest.main()
