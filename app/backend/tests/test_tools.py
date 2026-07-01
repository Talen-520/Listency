from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from voice_agent.storage.database import Database
from voice_agent.tools import ToolContext, build_default_registry


class ToolRegistryTest(unittest.TestCase):
    def test_check_availability_without_calendar_requires_staff_review(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
            db = Database(Path(tmp) / "test.sqlite3")
            registry = build_default_registry()

            result = registry.call(
                "check_availability",
                {"requested_date": "Friday", "requested_time": "7 PM"},
                ToolContext(db=db, session_id="session-1"),
            )

            calls = db.list_tool_calls()

            self.assertEqual(result["availability_status"], "not_configured")
            self.assertEqual(result["slots"], [])
            self.assertTrue(result["requires_staff_confirmation"])
            self.assertIn("Capture the booking request", result["message"])
            self.assertEqual(calls[0]["tool_name"], "check_availability")
            self.assertEqual(calls[0]["status"], "completed")

    def test_check_availability_returns_manual_candidate_slots(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
            db = Database(Path(tmp) / "test.sqlite3")
            db.set_calendar_availability(
                {
                    "slots": [
                        {
                            "id": "slot-1",
                            "label": "Friday 7 PM haircut",
                            "start": "2026-07-03T19:00:00",
                            "end": "2026-07-03T19:30:00",
                            "capacity": 1,
                        },
                        {
                            "id": "slot-2",
                            "label": "Saturday 10 AM haircut",
                            "start": "2026-07-04T10:00:00",
                            "end": "2026-07-04T10:30:00",
                            "capacity": 1,
                        },
                    ]
                }
            )
            registry = build_default_registry()

            result = registry.call(
                "check_availability",
                {"requested_date": "Friday", "requested_time": "7 PM", "service": "haircut"},
                ToolContext(db=db, session_id="session-1"),
            )

            self.assertEqual(result["availability_status"], "available")
            self.assertEqual(result["slots"][0]["id"], "slot-1")
            self.assertEqual(result["slots"][0]["capacity"], 1)
            self.assertEqual(result["confirmation_status"], "candidate_slots_only")
            self.assertTrue(result["requires_staff_confirmation"])

    def test_check_booking_capacity_is_availability_alias(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
            db = Database(Path(tmp) / "test.sqlite3")
            db.set_calendar_availability({"slots": [{"id": "slot-1", "label": "Friday 7 PM table"}]})
            registry = build_default_registry()

            result = registry.call(
                "check_booking_capacity",
                {"requested_date": "Friday", "requested_time": "7 PM", "limit": 1},
                ToolContext(db=db, session_id="session-1"),
            )

            calls = db.list_tool_calls()

            self.assertEqual(result["legacy_tool"], "check_booking_capacity")
            self.assertEqual(result["availability_status"], "available")
            self.assertEqual(result["slots"][0]["id"], "slot-1")
            self.assertEqual(calls[0]["tool_name"], "check_booking_capacity")
            self.assertEqual(calls[0]["status"], "completed")

    def test_end_call_tool_logs_local_hangup_intent(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
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
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
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
            self.assertEqual(result["confirmation_status"], "request_captured_not_confirmed")
            self.assertEqual(result["validation_status"], "needs_follow_up")
            self.assertTrue(result["requires_follow_up"])
            self.assertIn("phone_number", result["missing_fields"])

    def test_restaurant_booking_request_tracks_missing_fields(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
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
            self.assertIn("Phone number", result["missing_field_labels"])
            self.assertEqual(result["validation_status"], "needs_follow_up")
            self.assertTrue(result["requires_follow_up"])
            self.assertIn("Missing details", task["summary"])
            self.assertIn("Party Size: 4", task["summary"])
            self.assertIn("Confirmation status: request captured", task["summary"])

    def test_appointment_booking_request_can_validate_complete_details(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
            db = Database(Path(tmp) / "test.sqlite3")
            db.set_business_info_sections({"business_type": "appointment"})
            registry = build_default_registry()

            result = registry.call(
                "create_booking",
                {
                    "customer_name": "Ari",
                    "phone_number": "+15551234567",
                    "service": "Haircut",
                    "requested_date": "Saturday",
                    "requested_time": "10 AM",
                },
                ToolContext(db=db, session_id="session-1"),
            )

            task = db.list_follow_up_tasks()[0]

            self.assertEqual(result["business_type"], "appointment")
            self.assertEqual(result["validation_status"], "complete")
            self.assertFalse(result["requires_follow_up"])
            self.assertEqual(result["missing_fields"], [])
            self.assertIn("service", result["collected_fields"])
            self.assertIn("Validation: complete", task["summary"])

    def test_confirmed_slot_request_keeps_manual_calendar_staff_review_boundary(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
            db = Database(Path(tmp) / "test.sqlite3")
            db.set_business_info_sections({"business_type": "appointment"})
            db.set_calendar_availability(
                {
                    "slots": [
                        {
                            "id": "slot-saturday-10am",
                            "label": "Saturday 10 AM haircut",
                            "start": "2026-07-04T10:00",
                            "end": "2026-07-04T10:30",
                        }
                    ]
                }
            )
            registry = build_default_registry()

            result = registry.call(
                "create_booking",
                {
                    "customer_name": "Ari",
                    "phone_number": "+15551234567",
                    "service": "Haircut",
                    "requested_date": "Saturday",
                    "requested_time": "10 AM",
                    "slot_id": "slot-saturday-10am",
                    "caller_confirmed": True,
                    "idempotency_key": "session-1:slot-saturday-10am",
                },
                ToolContext(db=db, session_id="session-1"),
            )

            task = db.list_follow_up_tasks()[0]

            self.assertEqual(result["confirmation_status"], "request_captured_not_confirmed")
            self.assertEqual(result["validation_status"], "complete")
            self.assertEqual(result["slot_id"], "slot-saturday-10am")
            self.assertTrue(result["caller_confirmed"])
            self.assertEqual(result["calendar_booking"]["status"], "not_supported")
            self.assertEqual(result["calendar_booking"]["confirmation_status"], "request_capture_required")
            self.assertEqual(result["calendar_booking"]["idempotency_key"], "session-1:slot-saturday-10am")
            self.assertIn("Selected slot: slot-saturday-10am", task["summary"])
            self.assertIn("Calendar confirmation: request_capture_required", task["summary"])

    def test_hotel_booking_request_requires_room_preference(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
            db = Database(Path(tmp) / "test.sqlite3")
            db.set_business_info_sections({"business_type": "hotel"})
            registry = build_default_registry()

            result = registry.call(
                "create_booking",
                {
                    "customer_name": "Mina",
                    "phone_number": "+15550001111",
                    "check_in_date": "July 5",
                    "check_out_date": "July 7",
                    "guest_count": "2",
                },
                ToolContext(db=db, session_id="session-1"),
            )

            self.assertIn("room_count", result["missing_fields"])
            self.assertIn("Room preference or room count", result["missing_field_labels"])
            self.assertIn("Missing details for staff follow-up", result["message"])

    def test_business_info_lookup_prefers_structured_category(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
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
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
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
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
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
