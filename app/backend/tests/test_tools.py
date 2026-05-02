from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from voice_agent.storage.database import Database
from voice_agent.tools import ToolContext, build_default_registry


class ToolRegistryTest(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
