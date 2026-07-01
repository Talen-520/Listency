from __future__ import annotations

import asyncio
import tempfile
import unittest
from datetime import UTC, datetime
from pathlib import Path

import voice_agent.main as main
from voice_agent.analytics import build_local_analytics
from voice_agent.storage.database import Database


class LocalAnalyticsTest(unittest.TestCase):
    def test_builds_owner_facing_metrics_for_window(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
            db = Database(Path(tmp) / "test.sqlite3")
            now = datetime(2026, 7, 1, 12, 0, tzinfo=UTC)

            answered_call = db.create_phone_call("twilio", "CA-answered", "+15550000001", "+15552223333")
            failed_call = db.create_phone_call("twilio", "CA-failed", "+15550000002", "+15552223333")
            old_call = db.create_phone_call("twilio", "CA-old", "+15550000003", "+15552223333")

            db.create_follow_up_task(type="booking_request", title="Booking", summary="Needs staff review")
            db.create_follow_up_task(type="callback", title="Callback", summary="Call back", status="done")
            db.create_follow_up_task(type="provider_failure", title="Provider failed", summary="Provider error", priority="high")
            old_task = db.create_follow_up_task(type="customer_request", title="Old", summary="Old request")

            db.add_tool_call("transfer_call", {"target": "front desk"}, {"status": "logged"}, "completed", "session-1")
            db.add_tool_call("create_booking", {"customer_name": "Ana"}, {"status": "captured"}, "completed", "session-1")
            db.add_tool_call("business_info_lookup", {"query": "hours"}, None, "failed", "session-1", "lookup failed")
            db.add_tool_call("transfer_call", {"target": "old"}, {"status": "logged"}, "completed", "old-session")

            with db.open_connection() as connection:
                connection.execute(
                    """
                    UPDATE phone_calls
                    SET session_id = ?, status = ?, started_at = ?, answered_at = ?, ended_at = ?, ended_reason = ?
                    WHERE id = ?
                    """,
                    (
                        "session-1",
                        "completed",
                        "2026-07-01T11:50:00+00:00",
                        "2026-07-01T11:51:00+00:00",
                        "2026-07-01T12:00:00+00:00",
                        "agent_hung_up",
                        answered_call,
                    ),
                )
                connection.execute(
                    """
                    UPDATE phone_calls
                    SET status = ?, started_at = ?, ended_at = ?, ended_reason = ?, error_message = ?
                    WHERE id = ?
                    """,
                    (
                        "failed",
                        "2026-07-01T10:00:00+00:00",
                        "2026-07-01T10:01:00+00:00",
                        "provider_error",
                        "quota",
                        failed_call,
                    ),
                )
                connection.execute(
                    """
                    UPDATE phone_calls
                    SET status = ?, started_at = ?, ended_at = ?, ended_reason = ?
                    WHERE id = ?
                    """,
                    (
                        "completed",
                        "2026-05-01T10:00:00+00:00",
                        "2026-05-01T10:05:00+00:00",
                        "caller_hung_up",
                        old_call,
                    ),
                )
                connection.execute(
                    "UPDATE follow_up_tasks SET created_at = ?, updated_at = ? WHERE id = ?",
                    ("2026-05-01T10:00:00+00:00", "2026-05-01T10:00:00+00:00", old_task["id"]),
                )
                connection.execute(
                    "UPDATE tool_calls SET started_at = ?, ended_at = ? WHERE session_id = ?",
                    ("2026-05-01T10:00:00+00:00", "2026-05-01T10:00:00+00:00", "old-session"),
                )

            analytics = build_local_analytics(db, "24h", now=now)

            self.assertEqual(analytics["window"], "24h")
            self.assertEqual(analytics["calls"]["total"], 2)
            self.assertEqual(analytics["calls"]["answered"], 1)
            self.assertEqual(analytics["calls"]["failed_or_error"], 1)
            self.assertEqual(analytics["calls"]["average_duration_seconds"], 330)
            self.assertEqual(analytics["calls"]["by_outcome"]["agent_hung_up"], 1)
            self.assertEqual(analytics["calls"]["by_outcome"]["provider_error"], 1)
            self.assertEqual(analytics["tasks"]["total"], 3)
            self.assertEqual(analytics["tasks"]["open"], 2)
            self.assertEqual(analytics["tasks"]["completed"], 1)
            self.assertEqual(analytics["highlights"]["booking_requests"], 1)
            self.assertEqual(analytics["highlights"]["callbacks"], 1)
            self.assertEqual(analytics["highlights"]["transfer_requests"], 1)
            self.assertEqual(analytics["highlights"]["provider_failures"], 1)
            self.assertEqual(analytics["tools"]["total"], 3)
            self.assertEqual(analytics["tools"]["failed"], 1)
            self.assertEqual(analytics["tools"]["by_tool"]["transfer_call"], 1)

    def test_rejects_unknown_window(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
            db = Database(Path(tmp) / "test.sqlite3")

            with self.assertRaises(ValueError):
                build_local_analytics(db, "90d")

    def test_analytics_route_uses_current_database(self) -> None:
        original_db = main.db
        try:
            with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
                main.db = Database(Path(tmp) / "test.sqlite3")
                main.db.create_phone_call("twilio", "CA-route", "+15550000001", "+15552223333")

                response = asyncio.run(main.local_analytics("24h"))

                self.assertEqual(response["analytics"]["calls"]["total"], 1)
        finally:
            main.db = original_db


if __name__ == "__main__":
    unittest.main()
