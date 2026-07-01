from __future__ import annotations

import asyncio
import tempfile
import unittest
from pathlib import Path

import voice_agent.main as main
from voice_agent.evaluations import default_evaluation_scenarios, run_agent_evaluation
from voice_agent.storage.database import Database


class AgentEvaluationTest(unittest.TestCase):
    def test_default_evaluation_run_is_saved_without_polluting_owner_records(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
            db = Database(Path(tmp) / "test.sqlite3")

            run = run_agent_evaluation(db)

            self.assertEqual(run["status"], "passed")
            self.assertEqual(run["scenario_count"], len(default_evaluation_scenarios()))
            self.assertEqual(run["failed_count"], 0)
            self.assertTrue(run["uses_scratch_database"])
            self.assertEqual(len(run["results"]), len(default_evaluation_scenarios()))
            self.assertEqual(db.list_follow_up_tasks(), [])
            self.assertEqual(db.list_tool_calls(), [])

            listed = db.list_agent_evaluations()
            self.assertEqual(len(listed), 1)
            self.assertEqual(listed[0]["id"], run["id"])
            self.assertNotIn("results", listed[0])

            loaded = db.get_agent_evaluation(run["id"])
            self.assertIsNotNone(loaded)
            self.assertEqual(loaded["results"][0]["status"], "passed")

    def test_unknown_scenario_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
            db = Database(Path(tmp) / "test.sqlite3")

            with self.assertRaises(ValueError):
                run_agent_evaluation(db, ["missing_scenario"])

    def test_evaluation_routes_call_runner(self) -> None:
        original_db = main.db
        try:
            with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
                main.db = Database(Path(tmp) / "test.sqlite3")

                scenarios = asyncio.run(main.list_evaluation_scenarios())
                self.assertGreaterEqual(len(scenarios["scenarios"]), 1)

                response = asyncio.run(main.run_evaluations(main.AgentEvaluationRunRequest(scenario_ids=[])))
                self.assertEqual(response["run"]["status"], "passed")

                runs = asyncio.run(main.list_evaluation_runs())
                self.assertEqual(len(runs["runs"]), 1)

                detail = asyncio.run(main.get_evaluation_run(response["run"]["id"]))
                self.assertEqual(detail["run"]["id"], response["run"]["id"])
                self.assertEqual(detail["run"]["status"], "passed")
        finally:
            main.db = original_db


if __name__ == "__main__":
    unittest.main()
