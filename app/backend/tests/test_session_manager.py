from __future__ import annotations

import asyncio
import tempfile
import unittest
from pathlib import Path

from voice_agent.config.env_store import EnvStore
from voice_agent.core.session_manager import SessionManager
from voice_agent.core.state import EndReason
from voice_agent.providers.openai_realtime import OpenAIRealtimeAdapter
from voice_agent.storage.database import Database


class SessionManagerTest(unittest.IsolatedAsyncioTestCase):
    async def test_session_times_out(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            db = Database(root / "test.sqlite3")
            env = EnvStore(root / ".env", root / ".env.example")
            env.write(
                {
                    "OPENAI_API_KEY": "sk-test",
                    "OPENAI_REALTIME_MOCK": "true",
                    "DEFAULT_REALTIME_PROVIDER": "openai",
                }
            )
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

    async def test_stop_session_wakes_provider_event_waiters(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            db = Database(root / "test.sqlite3")
            env = EnvStore(root / ".env", root / ".env.example")
            env.write(
                {
                    "OPENAI_API_KEY": "sk-test",
                    "OPENAI_REALTIME_MOCK": "true",
                    "DEFAULT_REALTIME_PROVIDER": "openai",
                }
            )
            manager = SessionManager(
                db=db,
                env_store=env,
                providers={"openai": OpenAIRealtimeAdapter()},
                session_limit_seconds=30,
            )

            session = await manager.start_test_session("openai")
            active = manager.get_active_session(session["id"])
            self.assertIsNotNone(active)
            assert active is not None
            assert active.provider_events is not None

            await manager.stop_session(session["id"])
            event = await asyncio.wait_for(active.provider_events.get(), timeout=1)

            self.assertEqual(event["type"], "session.ended")
            self.assertEqual(event["ended_reason"], "user_stopped")

    async def test_provider_error_marks_session_error(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            db = Database(root / "test.sqlite3")
            env = EnvStore(root / ".env", root / ".env.example")
            env.write(
                {
                    "OPENAI_API_KEY": "sk-test",
                    "OPENAI_REALTIME_MOCK": "true",
                    "DEFAULT_REALTIME_PROVIDER": "openai",
                }
            )
            manager = SessionManager(
                db=db,
                env_store=env,
                providers={"openai": OpenAIRealtimeAdapter()},
                session_limit_seconds=30,
            )

            session = await manager.start_test_session("openai")
            await manager.stop_session(session["id"], EndReason.PROVIDER_ERROR, "quota exceeded")

            stored = db.list_sessions()[0]

            self.assertEqual(stored["status"], "error")
            self.assertEqual(stored["ended_reason"], "provider_error")
            self.assertEqual(stored["error_message"], "quota exceeded")


if __name__ == "__main__":
    unittest.main()
