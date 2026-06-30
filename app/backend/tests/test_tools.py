from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from voice_agent.storage.database import Database
from voice_agent.tools import ToolContext, build_default_registry


class ToolRegistryTest(unittest.TestCase):
    def test_check_booking_capacity_returns_fixed_message(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            db = Database(Path(tmp) / "test.sqlite3")
            registry = build_default_registry()

            result = registry.call(
                "check_booking_capacity",
                {},
                ToolContext(db=db, session_id="session-1"),
            )

            calls = db.list_tool_calls()

            self.assertEqual(result, {"message": "5 rooms available"})
            self.assertEqual(calls[0]["tool_name"], "check_booking_capacity")
            self.assertEqual(calls[0]["status"], "completed")

    def test_end_call_tool_logs_local_hangup_intent(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            db = Database(Path(tmp) / "test.sqlite3")
            registry = build_default_registry()

            result = registry.call(
                "end_call",
                {"reason": "caller said goodbye", "goodbye_message": "Goodbye."},
                ToolContext(db=db, session_id="session-1"),
            )

            logs = db.list_logs()
            calls = db.list_tool_calls()

            self.assertEqual(result["status"], "ending_after_goodbye")
            self.assertEqual(logs[0]["event"], "agent_hangup_requested")
            self.assertEqual(calls[0]["tool_name"], "end_call")
            self.assertEqual(calls[0]["status"], "completed")

    def test_create_booking_creates_follow_up_task(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            db = Database(Path(tmp) / "test.sqlite3")
            registry = build_default_registry()

            result = registry.call(
                "create_booking",
                {"customer_name": "Mina", "booking_time": "Friday 7 PM", "notes": "Party of four"},
                ToolContext(db=db, session_id="session-1"),
            )

            tasks = db.list_follow_up_tasks()

            self.assertEqual(result["follow_up_task"]["type"], "booking_request")
            self.assertEqual(tasks[0]["type"], "booking_request")
            self.assertEqual(tasks[0]["status"], "new")
            self.assertEqual(tasks[0]["priority"], "high")
            self.assertEqual(tasks[0]["caller_name"], "Mina")

    def test_restaurant_booking_request_tracks_missing_fields(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            db = Database(Path(tmp) / "test.sqlite3")
            db.set_business_info_sections({"business_type": "restaurant"})
            registry = build_default_registry()

            result = registry.call(
                "create_booking",
                {"customer_name": "Jon", "party_size": "4", "requested_date": "Friday"},
                ToolContext(db=db, session_id="session-1"),
            )

            task = db.list_follow_up_tasks()[0]

            self.assertEqual(result["business_type"], "restaurant")
            self.assertIn("phone_number", result["missing_fields"])
            self.assertIn("requested_time", result["missing_fields"])
            self.assertIn("Missing details", task["summary"])
            self.assertIn("Party Size: 4", task["summary"])

    def test_business_info_lookup_prefers_structured_category(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            db = Database(Path(tmp) / "test.sqlite3")
            db.upsert_business_profile("Parking is mentioned in old free text.", "Cafe")
            db.set_business_info_sections({"pricing": "Lunch starts at $18. Private dining starts at $75 per person."})
            registry = build_default_registry()

            result = registry.call(
                "business_info_lookup",
                {"query": "pricing", "category": "pricing"},
                ToolContext(db=db, session_id="session-1"),
            )

            self.assertEqual(result["source"], "structured:pricing")
            self.assertIn("$18", result["answer"])

    def test_log_customer_request_creates_follow_up_task(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            db = Database(Path(tmp) / "test.sqlite3")
            registry = build_default_registry()

            result = registry.call(
                "log_customer_request",
                {"request": "Please call back about parking options."},
                ToolContext(db=db, session_id="session-1"),
            )
            task = db.update_follow_up_task_status(result["follow_up_task"]["id"], "done")
            deleted = db.delete_follow_up_task(task["id"])

            self.assertEqual(task["status"], "done")
            self.assertIsNotNone(task["completed_at"])
            self.assertEqual(deleted["type"], "customer_request")
            self.assertEqual(db.list_follow_up_tasks(), [])

    def test_log_customer_request_can_create_callback_task(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            db = Database(Path(tmp) / "test.sqlite3")
            registry = build_default_registry()

            result = registry.call(
                "log_customer_request",
                {"request": "Call Mina back at +15551234567 about weekend availability.", "request_type": "callback"},
                ToolContext(db=db, session_id="session-1"),
            )
            task = db.list_follow_up_tasks()[0]
            logs = db.list_logs()

            self.assertEqual(result["request_type"], "callback")
            self.assertEqual(result["follow_up_task"]["type"], "callback")
            self.assertEqual(task["title"], "Callback request")
            self.assertEqual(task["priority"], "high")
            self.assertEqual(logs[0]["event"], "callback")


if __name__ == "__main__":
    unittest.main()
