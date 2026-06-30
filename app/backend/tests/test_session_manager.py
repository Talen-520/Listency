from __future__ import annotations

import asyncio
import tempfile
import unittest
from pathlib import Path

from voice_agent.config.env_store import EnvStore
from voice_agent.core.session_manager import SessionManager
from voice_agent.core.state import EndReason
from voice_agent.providers.base import ProviderSessionHandle
from voice_agent.providers.openai_realtime import OpenAIRealtimeAdapter
from voice_agent.storage.database import Database


class FlakyProvider:
    name = "flaky"
    display_name = "Flaky Provider"

    def __init__(self) -> None:
        self.start_count = 0
        self.send_count = 0

    def validate_config(self, env: dict[str, str]) -> None:
        return None

    def list_voices(self, env: dict[str, str]) -> list[str]:
        return []

    async def start_session(self, session_id, env, session_config=None, event_callback=None):
        self.start_count += 1
        return ProviderSessionHandle(
            provider=self.name,
            provider_session_id=f"flaky-{self.start_count}",
            metadata={"session_config": session_config or {}},
        )

    async def send_audio(self, handle, pcm16_chunk):
        self.send_count += 1
        if self.send_count == 1:
            raise RuntimeError("socket closed")

    async def send_tool_result(self, handle, tool_call_id, output):
        return None

    async def close_session(self, handle):
        return None


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
            tasks = db.list_follow_up_tasks()

            self.assertEqual(stored["status"], "error")
            self.assertEqual(stored["ended_reason"], "provider_error")
            self.assertEqual(stored["error_message"], "quota exceeded")
            self.assertEqual(tasks[0]["type"], "provider_failure")
            self.assertEqual(tasks[0]["priority"], "high")
            self.assertEqual(tasks[0]["session_id"], session["id"])

    async def test_tool_call_ids_are_deduplicated(self) -> None:
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

            self.assertTrue(manager.mark_tool_call_handled(session["id"], "call_123"))
            self.assertFalse(manager.mark_tool_call_handled(session["id"], "call_123"))

    async def test_agent_hangup_state_tracks_ready_once(self) -> None:
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

            self.assertFalse(manager.mark_agent_hangup_ready(session["id"]))
            self.assertTrue(manager.request_agent_hangup(session["id"]))
            self.assertTrue(manager.mark_agent_hangup_ready(session["id"]))
            self.assertFalse(manager.mark_agent_hangup_ready(session["id"]))
            self.assertTrue(manager.is_agent_hangup_ready(session["id"]))

    async def test_audio_send_failure_reconnects_provider_once(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            db = Database(root / "test.sqlite3")
            env = EnvStore(root / ".env", root / ".env.example")
            env.write({"DEFAULT_REALTIME_PROVIDER": "flaky"})
            provider = FlakyProvider()
            manager = SessionManager(
                db=db,
                env_store=env,
                providers={"flaky": provider},
                session_limit_seconds=30,
            )

            session = await manager.start_test_session("flaky")
            event = await manager.receive_audio_chunk(session["id"], b"\x00\x00")
            active = manager.get_active_session(session["id"])

            self.assertEqual(event["type"], "audio.chunk_ack")
            self.assertEqual(provider.start_count, 2)
            self.assertEqual(provider.send_count, 2)
            self.assertIsNotNone(active)
            assert active is not None
            self.assertEqual(active.status, "running")
            self.assertEqual(active.reconnect_attempts, 1)

            queued = []
            assert active.provider_events is not None
            while not active.provider_events.empty():
                queued.append((await active.provider_events.get())["type"])
            self.assertIn("provider.reconnecting", queued)
            self.assertIn("provider.reconnected", queued)


if __name__ == "__main__":
    unittest.main()
