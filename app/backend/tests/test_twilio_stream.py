from __future__ import annotations

import base64
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from typing import Any

from voice_agent.core.state import EndReason
from voice_agent.config.env_store import EnvStore
from voice_agent.phone.manager import PhoneManager
from voice_agent.phone.twilio_stream import _phone_call_status_for_end_reason, handle_twilio_media_stream
from voice_agent.storage.database import Database
from voice_agent.tools import ToolRegistry
from voice_agent.tunnel import TunnelStatus


class FakeTunnelManager:
    def status(self, env: dict[str, str]) -> TunnelStatus:
        return TunnelStatus(
            mode="automatic",
            status="running",
            public_base_url="https://example.trycloudflare.com",
            public_ws_url="wss://example.trycloudflare.com",
        )

    async def start(self, env: dict[str, str]) -> TunnelStatus:
        return self.status(env)

    async def stop(self) -> TunnelStatus:
        return TunnelStatus(mode="automatic", status="stopped")


class FakeTwilioWebSocket:
    def __init__(self, messages: list[dict[str, Any]]) -> None:
        self.accepted = False
        self.messages = [json.dumps(message) for message in messages]
        self.sent: list[dict[str, Any]] = []

    async def accept(self) -> None:
        self.accepted = True

    async def receive_text(self) -> str:
        if self.messages:
            return self.messages.pop(0)
        # Keep the receive side open so provider events can win the wait race.
        import asyncio

        await asyncio.Future()
        raise AssertionError("unreachable")

    async def send_json(self, payload: dict[str, Any]) -> None:
        self.sent.append(payload)


class FakeSessionManager:
    def __init__(self, provider_events_by_call: dict[str, list[dict[str, Any]]] | None = None) -> None:
        self.provider_events_by_call = provider_events_by_call or {}
        self.sessions: dict[str, SimpleNamespace] = {}
        self.provider_events_by_session: dict[str, list[dict[str, Any]]] = {}
        self.audio_chunks: dict[str, int] = {}
        self.stopped: list[tuple[str, str, str | None]] = []

    async def start_phone_session(
        self,
        provider_name: str | None = None,
        *,
        phone_provider: str,
        provider_call_id: str,
        from_number: str = "",
        to_number: str = "",
        phone_call_id: int | None = None,
    ) -> dict[str, Any]:
        session_id = f"session-{provider_call_id}"
        self.sessions[session_id] = SimpleNamespace(provider="openai")
        self.provider_events_by_session[session_id] = list(self.provider_events_by_call.get(provider_call_id, []))
        return {"id": session_id, "provider": provider_name or "openai", "provider_session": {}}

    async def next_provider_event(self, session_id: str) -> dict[str, Any] | None:
        events = self.provider_events_by_session.setdefault(session_id, [])
        if events:
            return events.pop(0)
        import asyncio

        await asyncio.Future()
        return None

    def get_active_session(self, session_id: str) -> SimpleNamespace | None:
        return self.sessions.get(session_id)

    async def receive_audio_chunk(self, session_id: str, pcm16_chunk: bytes) -> dict[str, Any]:
        self.audio_chunks[session_id] = self.audio_chunks.get(session_id, 0) + 1
        return {"audio_chunks": self.audio_chunks[session_id], "chunk_size": len(pcm16_chunk)}

    async def stop_session(
        self,
        session_id: str,
        reason: EndReason = EndReason.USER_STOPPED,
        error_message: str | None = None,
    ) -> dict[str, Any]:
        self.sessions.pop(session_id, None)
        self.stopped.append((session_id, str(reason), error_message))
        return {"id": session_id, "ended_reason": reason}

    def mark_agent_hangup_ready(self, session_id: str) -> bool:
        return True


class TwilioStreamTest(unittest.TestCase):
    def test_agent_hangup_finishes_phone_call_as_completed(self) -> None:
        self.assertEqual(_phone_call_status_for_end_reason(EndReason.AGENT_HUNG_UP), "completed")

    def test_caller_hangup_keeps_caller_hung_up_status(self) -> None:
        self.assertEqual(_phone_call_status_for_end_reason(EndReason.CALLER_HUNG_UP), "caller_hung_up")

    def test_provider_error_finishes_phone_call_as_failed(self) -> None:
        self.assertEqual(_phone_call_status_for_end_reason(EndReason.PROVIDER_ERROR), "failed")


class TwilioStreamLifecycleTest(unittest.IsolatedAsyncioTestCase):
    async def test_repeated_inbound_calls_update_phone_logs_and_outcome_summary(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
            root = Path(tmp)
            db = Database(root / "test.sqlite3")
            env_store = EnvStore(root / ".env", root / ".env.example")
            env_store.write(
                {
                    "PHONE_PROVIDER": "twilio",
                    "TWILIO_ACCOUNT_SID": "AC123",
                    "TWILIO_AUTH_TOKEN": "token",
                    "TWILIO_PHONE_NUMBER": "+15552223333",
                }
            )
            session_manager = FakeSessionManager(
                {
                    "CA-agent": [{"raw_type": "response.output_audio.done"}],
                    "CA-provider": [{"type": "provider.error", "message": "quota exceeded"}],
                }
            )
            phone_manager = PhoneManager(db, env_store, session_manager, FakeTunnelManager())  # type: ignore[arg-type]

            await self._run_call(
                db=db,
                session_manager=session_manager,
                phone_manager=phone_manager,
                call_sid="CA-caller",
                stream_sid="MZ-caller",
                messages=["media", "stop"],
            )
            await self._run_call(
                db=db,
                session_manager=session_manager,
                phone_manager=phone_manager,
                call_sid="CA-agent",
                stream_sid="MZ-agent",
                messages=[],
            )
            await self._run_call(
                db=db,
                session_manager=session_manager,
                phone_manager=phone_manager,
                call_sid="CA-provider",
                stream_sid="MZ-provider",
                messages=[],
            )

            calls = {call["provider_call_id"]: call for call in db.list_phone_calls(limit=10)}

            self.assertEqual(calls["CA-caller"]["status"], "caller_hung_up")
            self.assertEqual(calls["CA-caller"]["ended_reason"], EndReason.CALLER_HUNG_UP)
            self.assertEqual(calls["CA-caller"]["provider_stream_id"], "MZ-caller")
            self.assertEqual(calls["CA-agent"]["status"], "completed")
            self.assertEqual(calls["CA-agent"]["ended_reason"], EndReason.AGENT_HUNG_UP)
            self.assertEqual(calls["CA-provider"]["status"], "failed")
            self.assertEqual(calls["CA-provider"]["ended_reason"], EndReason.PROVIDER_ERROR)
            self.assertEqual(session_manager.audio_chunks["session-CA-caller"], 1)

            summary = phone_manager.status()["recent_call_summary"]
            self.assertEqual(summary["total"], 3)
            self.assertEqual(summary["outcomes"]["caller_hung_up"], 1)
            self.assertEqual(summary["outcomes"]["agent_hung_up"], 1)
            self.assertEqual(summary["outcomes"]["provider_error"], 1)

    async def _run_call(
        self,
        *,
        db: Database,
        session_manager: FakeSessionManager,
        phone_manager: PhoneManager,
        call_sid: str,
        stream_sid: str,
        messages: list[str],
    ) -> None:
        twilio_messages = [
            {"event": "connected"},
            {
                "event": "start",
                "start": {
                    "streamSid": stream_sid,
                    "callSid": call_sid,
                    "customParameters": {"from": "+15550001111", "to": "+15552223333"},
                },
            },
        ]
        for message in messages:
            if message == "media":
                twilio_messages.append(
                    {
                        "event": "media",
                        "media": {"payload": base64.b64encode(b"\xff" * 12).decode("ascii")},
                    }
                )
            elif message == "stop":
                twilio_messages.append({"event": "stop"})

        websocket = FakeTwilioWebSocket(twilio_messages)
        await handle_twilio_media_stream(
            websocket,
            db=db,
            session_manager=session_manager,  # type: ignore[arg-type]
            tool_registry=ToolRegistry(),
            phone_manager=phone_manager,
        )
        self.assertTrue(websocket.accepted)


if __name__ == "__main__":
    unittest.main()
