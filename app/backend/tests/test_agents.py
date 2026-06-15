from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from voice_agent.storage.database import DEFAULT_AGENT_SYSTEM_PROMPT, LEGACY_DEFAULT_AGENT_SYSTEM_PROMPT, Database


class AgentsDatabaseTest(unittest.TestCase):
    def test_list_agents_returns_default_when_empty(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            db = Database(Path(tmp) / "test.sqlite3")

            agents = db.list_agents()

            self.assertEqual(len(agents), 1)
            self.assertEqual(agents[0]["id"], "default")
            self.assertEqual(db.get_active_agent()["system_prompt"], DEFAULT_AGENT_SYSTEM_PROMPT)

    def test_create_select_and_delete_agent_updates_active_agent(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            db = Database(Path(tmp) / "test.sqlite3")

            default_agent = db.upsert_default_agent("Default prompt", "Default")
            sales_agent = db.create_agent("Sales prompt", "Sales")
            support_agent = db.create_agent("Support prompt", "Support")

            db.set_active_agent(sales_agent["id"])
            self.assertEqual(db.get_active_agent()["name"], "Sales")

            deleted = db.delete_agent(sales_agent["id"])

            self.assertEqual(deleted["id"], sales_agent["id"])
            self.assertNotEqual(db.get_active_agent_id(), sales_agent["id"])
            self.assertEqual({agent["id"] for agent in db.list_agents()}, {default_agent["id"], support_agent["id"]})

    def test_delete_last_agent_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            db = Database(Path(tmp) / "test.sqlite3")
            db.upsert_default_agent("Default prompt", "Default")

            with self.assertRaises(ValueError):
                db.delete_agent("default")

    def test_create_agent_preserves_initial_default_agent(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            db = Database(Path(tmp) / "test.sqlite3")

            created = db.create_agent("Sales prompt", "Sales")

            agents = db.list_agents()
            self.assertEqual({agent["id"] for agent in agents}, {"default", created["id"]})

    def test_legacy_default_prompt_migrates_to_current_template(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "test.sqlite3"
            db = Database(db_path)
            db.upsert_default_agent(LEGACY_DEFAULT_AGENT_SYSTEM_PROMPT, "Default Agent")

            migrated = Database(db_path)

            self.assertEqual(migrated.get_agent("default")["system_prompt"], DEFAULT_AGENT_SYSTEM_PROMPT)

    def test_custom_default_prompt_is_not_migrated(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "test.sqlite3"
            db = Database(db_path)
            db.upsert_default_agent("Custom prompt", "Default Agent")

            migrated = Database(db_path)

            self.assertEqual(migrated.get_agent("default")["system_prompt"], "Custom prompt")


if __name__ == "__main__":
    unittest.main()
