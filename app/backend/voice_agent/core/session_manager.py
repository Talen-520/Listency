from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from voice_agent.config.env_store import EnvStore
from voice_agent.core.state import BackgroundStatus, EndReason, SessionStatus
from voice_agent.providers.base import ProviderConfigError, ProviderSessionHandle, RealtimeProviderAdapter
from voice_agent.storage.database import Database


SESSION_LIMIT_SECONDS = 5 * 60


@dataclass(slots=True)
class ActiveSession:
    id: str
    provider: str
    started_at: str
    timeout_at: str
    handle: ProviderSessionHandle
    timeout_task: asyncio.Task[None] | None = None
    provider_events: asyncio.Queue[dict[str, Any]] | None = None
    audio_chunks: int = 0
    audio_bytes: int = 0
    transcript_started: bool = False


class SessionManager:
    def __init__(
        self,
        db: Database,
        env_store: EnvStore,
        providers: dict[str, RealtimeProviderAdapter],
        session_limit_seconds: int = SESSION_LIMIT_SECONDS,
    ) -> None:
        self.db = db
        self.env_store = env_store
        self.providers = providers
        self.session_limit_seconds = session_limit_seconds
        self.background_status = BackgroundStatus.STOPPED
        self.active_sessions: dict[str, ActiveSession] = {}
        self.last_error: str | None = None

    def status(self) -> dict[str, Any]:
        active = [
            {
                "id": session.id,
                "provider": session.provider,
                "started_at": session.started_at,
                "timeout_at": session.timeout_at,
                "audio_chunks": session.audio_chunks,
                "audio_bytes": session.audio_bytes,
            }
            for session in self.active_sessions.values()
        ]
        return {
            "background_status": self.background_status,
            "active_sessions": active,
            "last_error": self.last_error,
            "session_limit_seconds": self.session_limit_seconds,
        }

    async def start_background(self) -> dict[str, Any]:
        self.background_status = BackgroundStatus.STARTING
        self.env_store.ensure_example()
        self.db.add_log("info", "background_started", "Local background runtime entered standby.")
        self.background_status = BackgroundStatus.STANDBY
        self.last_error = None
        return self.status()

    async def stop_background(self) -> dict[str, Any]:
        self.background_status = BackgroundStatus.STOPPING
        for session_id in list(self.active_sessions):
            await self.stop_session(session_id, EndReason.BACKEND_SHUTDOWN)
        self.db.add_log("info", "background_stopped", "Local background runtime stopped.")
        self.background_status = BackgroundStatus.STOPPED
        return self.status()

    async def start_test_session(self, provider_name: str | None = None) -> dict[str, Any]:
        if self.background_status in {BackgroundStatus.STOPPED, BackgroundStatus.ERROR}:
            await self.start_background()

        env = self.env_store.read()
        provider_key = (provider_name or env.get("DEFAULT_REALTIME_PROVIDER") or "openai").strip().lower()
        if provider_key not in self.providers:
            raise ProviderConfigError(f"Unsupported provider: {provider_key}")

        provider = self.providers[provider_key]
        session_id = str(uuid.uuid4())
        started_at = datetime.now(tz=UTC)
        timeout_at = started_at + timedelta(seconds=self.session_limit_seconds)
        provider_events: asyncio.Queue[dict[str, Any]] = asyncio.Queue()

        agent = self.db.get_default_agent()
        profile = self.db.get_business_profile()
        instructions = str(agent.get("system_prompt") or "").strip()
        business_content = str(profile.get("content") or "").strip()
        if business_content:
            instructions = f"{instructions}\n\nBusiness information:\n{business_content}".strip()

        async def queue_provider_event(event: dict[str, Any]) -> None:
            await provider_events.put(event)

        handle = await provider.start_session(
            session_id,
            env,
            session_config={"instructions": instructions},
            event_callback=queue_provider_event,
        )
        self.db.create_session(
            session_id=session_id,
            provider=provider_key,
            mode="realtime",
            status=SessionStatus.RUNNING,
            timeout_at=timeout_at.isoformat(),
        )
        self.db.add_transcript(session_id, "system", "Realtime test session started.", True)
        timeout_task = asyncio.create_task(self._timeout_session(session_id))
        active = ActiveSession(
            id=session_id,
            provider=provider_key,
            started_at=started_at.isoformat(),
            timeout_at=timeout_at.isoformat(),
            handle=handle,
            timeout_task=timeout_task,
            provider_events=provider_events,
        )
        self.active_sessions[session_id] = active
        return {
            "id": active.id,
            "provider": active.provider,
            "started_at": active.started_at,
            "timeout_at": active.timeout_at,
            "provider_session": handle.metadata,
        }

    async def stop_session(
        self,
        session_id: str,
        reason: EndReason = EndReason.USER_STOPPED,
        error_message: str | None = None,
    ) -> dict[str, Any]:
        active = self.active_sessions.pop(session_id, None)
        if not active:
            return {"id": session_id, "status": SessionStatus.STOPPED, "ended_reason": reason}

        if active.timeout_task:
            active.timeout_task.cancel()
        provider = self.providers.get(active.provider)
        if provider:
            await provider.close_session(active.handle)

        if reason == EndReason.TIMEOUT_5_MINUTES:
            status = SessionStatus.TIMEOUT
        elif reason in {EndReason.PROVIDER_ERROR, EndReason.NETWORK_ERROR}:
            status = SessionStatus.ERROR
        else:
            status = SessionStatus.STOPPED
        self.db.finish_session(session_id, status, reason, error_message)
        self.db.add_transcript(session_id, "system", f"Session ended: {reason}", True)
        if active.provider_events:
            await active.provider_events.put({"type": "session.ended", "ended_reason": reason})
        return {"id": session_id, "status": status, "ended_reason": reason}

    def get_active_session(self, session_id: str) -> ActiveSession | None:
        return self.active_sessions.get(session_id)

    async def receive_audio_chunk(self, session_id: str, pcm16_chunk: bytes) -> dict[str, Any]:
        active = self.active_sessions.get(session_id)
        if not active:
            raise KeyError(f"Session is not active: {session_id}")

        chunk_size = len(pcm16_chunk)
        active.audio_chunks += 1
        active.audio_bytes += chunk_size
        provider = self.providers.get(active.provider)
        if provider:
            await provider.send_audio(active.handle, pcm16_chunk)
        event: dict[str, Any] = {
            "type": "audio.chunk_ack",
            "session_id": session_id,
            "chunk_size": chunk_size,
            "audio_chunks": active.audio_chunks,
            "audio_bytes": active.audio_bytes,
        }

        if not active.transcript_started:
            active.transcript_started = True
            content = "Microphone audio is streaming to the active provider session."
            self.db.add_transcript(session_id, "system", content, True)
            self.db.add_message(session_id, "system", content)
            event["transcript"] = {
                "speaker": "system",
                "content": content,
                "is_final": True,
            }

        return event

    async def next_provider_event(self, session_id: str) -> dict[str, Any] | None:
        active = self.active_sessions.get(session_id)
        if not active or not active.provider_events:
            return None
        return await active.provider_events.get()

    async def _timeout_session(self, session_id: str) -> None:
        try:
            await asyncio.sleep(self.session_limit_seconds)
            await self.stop_session(session_id, EndReason.TIMEOUT_5_MINUTES)
        except asyncio.CancelledError:
            return
