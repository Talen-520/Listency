from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from voice_agent.storage.database import Database


class DatabaseFilterTest(unittest.TestCase):
    def test_lists_filter_records_by_since_timestamp(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
            db = Database(Path(tmp) / "test.sqlite3")
            db.create_session("old-session", "openai", "realtime", "stopped", "2026-05-08T00:00:00+00:00")
            db.create_session("new-session", "gemini", "realtime", "stopped", "2026-05-08T00:00:00+00:00")
            db.add_transcript("old-session", "user", "old")
            db.add_transcript("new-session", "user", "new")
            db.add_tool_call("business_info_lookup", {"query": "old"}, {"answer": "old"}, "completed", "old-session")
            db.add_tool_call("business_info_lookup", {"query": "new"}, {"answer": "new"}, "completed", "new-session")
            db.add_log("info", "old_event", "old", {"session_id": "old-session"})
            db.add_log("info", "new_event", "new", {"session_id": "new-session"})

            with db.open_connection() as connection:
                connection.execute("UPDATE sessions SET started_at = ? WHERE id = ?", ("2026-01-01T00:00:00+00:00", "old-session"))
                connection.execute("UPDATE transcripts SET created_at = ? WHERE session_id = ?", ("2026-01-01T00:00:00+00:00", "old-session"))
                connection.execute("UPDATE tool_calls SET started_at = ? WHERE session_id = ?", ("2026-01-01T00:00:00+00:00", "old-session"))
                connection.execute("UPDATE app_logs SET created_at = ? WHERE event = ?", ("2026-01-01T00:00:00+00:00", "old_event"))

            since = "2026-05-01T00:00:00+00:00"

            self.assertEqual([session["id"] for session in db.list_sessions(since=since)], ["new-session"])
            self.assertEqual([item["content"] for item in db.list_transcripts(since=since)], ["new"])
            self.assertEqual([item["session_id"] for item in db.list_tool_calls(since=since)], ["new-session"])
            self.assertEqual([item["event"] for item in db.list_logs(since=since)], ["new_event"])

            since_zulu = "2026-05-01T00:00:00Z"

            self.assertEqual([session["id"] for session in db.list_sessions(since=since_zulu)], ["new-session"])
            self.assertEqual([item["content"] for item in db.list_transcripts(since=since_zulu)], ["new"])
            self.assertEqual([item["session_id"] for item in db.list_tool_calls(since=since_zulu)], ["new-session"])
            self.assertEqual([item["event"] for item in db.list_logs(since=since_zulu)], ["new_event"])

            since_zulu_with_millis = "2026-05-01T00:00:00.000Z"

            self.assertEqual([session["id"] for session in db.list_sessions(since=since_zulu_with_millis)], ["new-session"])


if __name__ == "__main__":
    unittest.main()
