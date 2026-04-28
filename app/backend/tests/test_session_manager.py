from __future__ import annotations

import asyncio
import tempfile
import unittest
from pathlib import Path

from voice_agent.config.env_store import EnvStore
from voice_agent.core.session_manager import SessionManager
from voice_agent.providers.openai_realtime import OpenAIRealtimeAdapter
from voice_agent.storage.database import Database


class SessionManagerTest(unittest.IsolatedAsyncioTestCase):
    async def test_session_times_out(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            db = Database(root / "test.sqlite3")
            env = EnvStore(root / ".env", root / ".env.example")
            env.write({"OPENAI_API_KEY": "sk-test", "DEFAULT_REALTIME_PROVIDER": "openai"})
            manager = SessionManager(
                db=db,
                env_store=env,
                providers={"openai": OpenAIRealtimeAdapter()},
                session_limit_seconds=1,
            )

            session = await manager.start_test_session("openai")
            self.assertEqual(len(manager.active_sessions), 1)
            await asyncio.sleep(1.2)
            self.assertEqual(len(manager.active_sessions), 0)

            sessions = db.list_sessions()
            self.assertEqual(sessions[0]["id"], session["id"])
            self.assertEqual(sessions[0]["status"], "timeout")


if __name__ == "__main__":
    unittest.main()
