from __future__ import annotations

import asyncio
import tempfile
import unittest
from pathlib import Path

import voice_agent.main as main
from voice_agent.storage.database import Database


class CalendarAvailabilityRoutesTest(unittest.TestCase):
    def test_calendar_availability_round_trip(self) -> None:
        original_db = main.db
        try:
            with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
                main.db = Database(Path(tmp) / "test.sqlite3")

                empty_response = asyncio.run(main.get_calendar_availability())
                self.assertEqual(empty_response, {"availability": {"adapter": "manual", "slots": []}})

                save_response = asyncio.run(
                    main.save_calendar_availability(
                        main.CalendarAvailabilityUpdate(
                            adapter="manual",
                            slots=[
                                {
                                    "id": "slot-1",
                                    "label": "Friday 7 PM haircut",
                                    "start": "2026-07-03T19:00",
                                    "end": "2026-07-03T19:30",
                                    "capacity": 1,
                                },
                                {
                                    "id": "empty-slot",
                                    "label": "",
                                    "start": "2026-07-04T10:00",
                                    "end": "2026-07-04T10:30",
                                    "capacity": 1,
                                },
                            ],
                        )
                    )
                )

                saved = save_response["availability"]
                self.assertEqual(saved["adapter"], "manual")
                self.assertEqual(len(saved["slots"]), 1)
                self.assertEqual(saved["slots"][0]["id"], "slot-1")
                self.assertEqual(saved["slots"][0]["label"], "Friday 7 PM haircut")
                self.assertEqual(saved["slots"][0]["capacity"], 1)

                loaded_response = asyncio.run(main.get_calendar_availability())
                self.assertEqual(loaded_response["availability"], saved)
        finally:
            main.db = original_db


if __name__ == "__main__":
    unittest.main()
