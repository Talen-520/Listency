from __future__ import annotations

import tempfile
import unittest
import sqlite3
from pathlib import Path

from voice_agent.storage.database import Database


class LogMaintenanceTest(unittest.TestCase):
    def test_delete_log_data_before_removes_old_activity(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
            db = Database(Path(tmp) / "test.sqlite3")
            db.create_session("old-session", "openai", "realtime", "stopped", "2026-05-08T00:00:00+00:00")
            db.create_session("new-session", "gemini", "realtime", "stopped", "2026-05-08T00:00:00+00:00")
            db.add_message("old-session", "user", "old message")
            db.add_message("new-session", "user", "new message")
            db.add_transcript("old-session", "user", "old transcript")
            db.add_transcript("new-session", "assistant", "new transcript")
            db.add_tool_call("business_info_lookup", {"query": "old"}, {"answer": "old"}, "completed", "old-session")
            db.add_tool_call("business_info_lookup", {"query": "new"}, {"answer": "new"}, "completed", "new-session")
            db.add_log("info", "old_event", "old", {"session_id": "old-session"})
            db.add_log("info", "new_event", "new", {"session_id": "new-session"})

            with db.open_connection() as connection:
                connection.execute("UPDATE sessions SET started_at = ? WHERE id = ?", ("2026-01-01T00:00:00+00:00", "old-session"))
                connection.execute("UPDATE messages SET created_at = ? WHERE session_id = ?", ("2026-01-01T00:00:00+00:00", "old-session"))
                connection.execute("UPDATE transcripts SET created_at = ? WHERE session_id = ?", ("2026-01-01T00:00:00+00:00", "old-session"))
                connection.execute("UPDATE tool_calls SET started_at = ? WHERE session_id = ?", ("2026-01-01T00:00:00+00:00", "old-session"))
                connection.execute("UPDATE app_logs SET created_at = ? WHERE event = ?", ("2026-01-01T00:00:00+00:00", "old_event"))

            deleted = db.delete_log_data_before("2026-05-01T00:00:00+00:00")

            self.assertEqual(deleted["sessions"], 1)
            self.assertEqual(deleted["messages"], 1)
            self.assertEqual(deleted["transcripts"], 1)
            self.assertEqual(deleted["tool_calls"], 1)
            self.assertEqual(deleted["app_logs"], 1)
            exported = db.export_log_data()
            self.assertEqual([session["id"] for session in exported["sessions"]], ["new-session"])
            self.assertEqual([item["content"] for item in exported["transcripts"]], ["new transcript"])
            self.assertEqual([item["session_id"] for item in exported["tool_calls"]], ["new-session"])
            self.assertEqual([item["event"] for item in exported["app_logs"]], ["new_event"])

    def test_clear_log_data_removes_activity_tables(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
            db = Database(Path(tmp) / "test.sqlite3")
            db.create_session("session", "openai", "realtime", "stopped", "2026-05-08T00:00:00+00:00")
            db.add_message("session", "user", "message")
            db.add_transcript("session", "user", "transcript")
            db.add_tool_call("business_info_lookup", {"query": "hours"}, {"answer": "open"}, "completed", "session")
            db.add_log("info", "event", "message", {"session_id": "session"})
            phone_call_id = db.create_phone_call("twilio", "CA123", "+15550000001", "+15550000002")
            db.attach_phone_session(phone_call_id, "session")

            deleted = db.clear_log_data()

            self.assertEqual(deleted["sessions"], 1)
            self.assertEqual(deleted["messages"], 1)
            self.assertEqual(deleted["transcripts"], 1)
            self.assertEqual(deleted["tool_calls"], 1)
            self.assertEqual(deleted["app_logs"], 1)
            self.assertEqual(deleted["phone_calls"], 1)
            self.assertEqual(db.export_log_data(), {"sessions": [], "transcripts": [], "tool_calls": [], "app_logs": [], "phone_calls": []})

    def test_export_log_data_filters_by_session_and_since(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
            db = Database(Path(tmp) / "test.sqlite3")
            db.create_session("old-session", "openai", "realtime", "stopped", "2026-05-08T00:00:00+00:00")
            db.create_session("new-session", "gemini", "realtime", "stopped", "2026-05-08T00:00:00+00:00")
            db.add_transcript("old-session", "user", "old transcript")
            db.add_transcript("new-session", "assistant", "new transcript")
            db.add_tool_call("business_info_lookup", {"query": "old"}, {"answer": "old"}, "completed", "old-session")
            db.add_tool_call("business_info_lookup", {"query": "new"}, {"answer": "new"}, "completed", "new-session")
            db.add_log("info", "old_event", "old", {"session_id": "old-session"})
            db.add_log("info", "new_event", "new", {"session_id": "new-session"})

            with db.open_connection() as connection:
                connection.execute("UPDATE sessions SET started_at = ? WHERE id = ?", ("2026-01-01T00:00:00+00:00", "old-session"))
                connection.execute("UPDATE transcripts SET created_at = ? WHERE session_id = ?", ("2026-01-01T00:00:00+00:00", "old-session"))
                connection.execute("UPDATE tool_calls SET started_at = ? WHERE session_id = ?", ("2026-01-01T00:00:00+00:00", "old-session"))
                connection.execute("UPDATE app_logs SET created_at = ? WHERE event = ?", ("2026-01-01T00:00:00+00:00", "old_event"))

            exported = db.export_log_data(since="2026-05-01T00:00:00Z", session_id="new-session")

            self.assertEqual([session["id"] for session in exported["sessions"]], ["new-session"])
            self.assertEqual([item["content"] for item in exported["transcripts"]], ["new transcript"])
            self.assertEqual([item["session_id"] for item in exported["tool_calls"]], ["new-session"])
            self.assertEqual([item["event"] for item in exported["app_logs"]], ["new_event"])

    def test_list_phone_calls_filters_by_session(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
            db = Database(Path(tmp) / "test.sqlite3")
            first_call_id = db.create_phone_call("twilio", "CA111", "+15550000001", "+15550000002")
            second_call_id = db.create_phone_call("twilio", "CA222", "+15550000003", "+15550000004")
            db.attach_phone_session(first_call_id, "first-session")
            db.attach_phone_session(second_call_id, "second-session")

            phone_calls = db.list_phone_calls(session_id="second-session")

            self.assertEqual([item["provider_call_id"] for item in phone_calls], ["CA222"])

    def test_phone_call_stores_business_hours_metadata(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
            db = Database(Path(tmp) / "test.sqlite3")

            db.create_phone_call(
                "twilio",
                "CA333",
                "+15550000005",
                "+15550000006",
                business_hours={
                    "status": "closed",
                    "active_policy": "after_hours_take_callback",
                    "after_hours_mode": "take_callback",
                    "reason": "Holiday closure",
                },
            )

            phone_call = db.list_phone_calls()[0]
            exported = db.export_log_data()["phone_calls"][0]

            self.assertEqual(phone_call["business_hours_status"], "closed")
            self.assertEqual(phone_call["business_hours_policy"], "after_hours_take_callback")
            self.assertEqual(phone_call["business_hours_mode"], "take_callback")
            self.assertEqual(phone_call["business_hours_reason"], "Holiday closure")
            self.assertEqual(exported["business_hours_policy"], "after_hours_take_callback")

    def test_existing_phone_call_table_gets_business_hours_columns(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
            path = Path(tmp) / "test.sqlite3"
            with sqlite3.connect(path) as connection:
                connection.execute(
                    """
                    CREATE TABLE phone_calls (
                      id INTEGER PRIMARY KEY AUTOINCREMENT,
                      provider TEXT NOT NULL,
                      provider_call_id TEXT NOT NULL,
                      provider_stream_id TEXT,
                      session_id TEXT,
                      from_number TEXT,
                      to_number TEXT,
                      status TEXT NOT NULL,
                      started_at TEXT NOT NULL,
                      answered_at TEXT,
                      ended_at TEXT,
                      ended_reason TEXT,
                      error_message TEXT
                    )
                    """
                )

            Database(path)

            with sqlite3.connect(path) as connection:
                columns = {row[1] for row in connection.execute("PRAGMA table_info(phone_calls)").fetchall()}

            self.assertIn("business_hours_status", columns)
            self.assertIn("business_hours_policy", columns)
            self.assertIn("business_hours_mode", columns)
            self.assertIn("business_hours_reason", columns)


if __name__ == "__main__":
    unittest.main()
