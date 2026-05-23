from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Callable

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
    session_config: dict[str, Any]
    status: str = SessionStatus.RUNNING
    timeout_task: asyncio.Task[None] | None = None
    provider_events: asyncio.Queue[dict[str, Any]] | None = None
    audio_chunks: int = 0
    audio_bytes: int = 0
    reconnect_attempts: int = 0
    last_error: str | None = None
    transcript_started: bool = False
    handled_tool_call_ids: set[str] | None = None
    agent_hangup_requested: bool = False
    agent_hangup_ready: bool = False
    phone_call_id: int | None = None
    phone_provider: str | None = None
    provider_call_id: str | None = None


class SessionManager:
    def __init__(
        self,
        db: Database,
        env_store: EnvStore,
        providers: dict[str, RealtimeProviderAdapter],
        list_tools_for_provider: Callable[[], list[dict[str, Any]]] | None = None,
        session_limit_seconds: int = SESSION_LIMIT_SECONDS,
    ) -> None:
        self.db = db
        self.env_store = env_store
        self.providers = providers
        self.list_tools_for_provider = list_tools_for_provider
        self.session_limit_seconds = session_limit_seconds
        self.background_status = BackgroundStatus.STOPPED
        self.active_sessions: dict[str, ActiveSession] = {}
        self.last_error: str | None = None

    def status(self) -> dict[str, Any]:
        active = [
            {
                "id": session.id,
                "provider": session.provider,
                "status": session.status,
                "started_at": session.started_at,
                "timeout_at": session.timeout_at,
                "audio_chunks": session.audio_chunks,
                "audio_bytes": session.audio_bytes,
                "reconnect_attempts": session.reconnect_attempts,
                "last_error": session.last_error,
                "phone_provider": session.phone_provider,
                "provider_call_id": session.provider_call_id,
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
        self.last_error = None
        return self.status()

    async def start_test_session(self, provider_name: str | None = None) -> dict[str, Any]:
        return await self._start_realtime_session(
            provider_name=provider_name,
            mode="test_call",
            system_transcript="Realtime test session started.",
        )

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
        return await self._start_realtime_session(
            provider_name=provider_name,
            mode="phone_call",
            system_transcript="Inbound phone call started.",
            phone_call_id=phone_call_id,
            phone_provider=phone_provider,
            provider_call_id=provider_call_id,
            call_context={
                "phone_provider": phone_provider,
                "provider_call_id": provider_call_id,
                "from_number": from_number,
                "to_number": to_number,
            },
        )

    async def _start_realtime_session(
        self,
        provider_name: str | None = None,
        *,
        mode: str,
        system_transcript: str,
        phone_call_id: int | None = None,
        phone_provider: str | None = None,
        provider_call_id: str | None = None,
        call_context: dict[str, str] | None = None,
    ) -> dict[str, Any]:
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

        agent = self.db.get_active_agent()
        profile = self.db.get_business_profile()
        instructions = str(agent.get("system_prompt") or "").strip()
        business_content = str(profile.get("content") or "").strip()
        if business_content:
            instructions = f"{instructions}\n\nBusiness information:\n{business_content}".strip()
        if call_context:
            instructions = (
                f"{instructions}\n\n"
                "Phone call context:\n"
                f"- Phone provider: {call_context.get('phone_provider', '')}\n"
                f"- Caller number: {call_context.get('from_number', '') or 'unknown'}\n"
                f"- Business number: {call_context.get('to_number', '') or 'unknown'}"
            ).strip()
        instructions = (
            f"{instructions}\n\n"
            "Call control:\n"
            "- If the caller says goodbye, says they are done, or asks to end the call, call the end_call tool before closing.\n"
            "- After the end_call tool returns, say exactly one brief goodbye sentence and do not ask another question.\n"
            "- If a request requires staff judgment, urgent help, or information outside the saved business profile, use transfer_call or log_customer_request instead of guessing."
        ).strip()

        async def queue_provider_event(event: dict[str, Any]) -> None:
            await provider_events.put(event)

        session_config = {
            "instructions": instructions,
            "tools": self.list_tools_for_provider() if self.list_tools_for_provider else [],
        }
        handle = await provider.start_session(
            session_id,
            env,
            session_config=session_config,
            event_callback=queue_provider_event,
        )
        self.db.create_session(
            session_id=session_id,
            provider=provider_key,
            mode=mode,
            status=SessionStatus.RUNNING,
            timeout_at=timeout_at.isoformat(),
        )
        self.db.add_transcript(session_id, "system", system_transcript, True)
        timeout_task = asyncio.create_task(self._timeout_session(session_id))
        active = ActiveSession(
            id=session_id,
            provider=provider_key,
            started_at=started_at.isoformat(),
            timeout_at=timeout_at.isoformat(),
            handle=handle,
            session_config=session_config,
            timeout_task=timeout_task,
            provider_events=provider_events,
            phone_call_id=phone_call_id,
            phone_provider=phone_provider,
            provider_call_id=provider_call_id,
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

        active.status = SessionStatus.STOPPING
        if active.timeout_task:
            active.timeout_task.cancel()
        provider = self.providers.get(active.provider)
        if provider:
            await provider.close_session(active.handle)

        if reason == EndReason.TIMEOUT_5_MINUTES:
            status = SessionStatus.TIMEOUT
        elif reason in {EndReason.PROVIDER_ERROR, EndReason.NETWORK_ERROR}:
            status = SessionStatus.ERROR
            self.background_status = BackgroundStatus.DEGRADED
            self.last_error = self._readable_end_reason(reason, error_message)
        else:
            status = SessionStatus.STOPPED
        self.db.finish_session(session_id, status, reason, error_message)
        self.db.add_transcript(session_id, "system", f"Session ended: {self._readable_end_reason(reason, error_message)}", True)
        if active.provider_events:
            await active.provider_events.put({"type": "session.ended", "ended_reason": reason, "message": self._readable_end_reason(reason, error_message)})
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
            try:
                await provider.send_audio(active.handle, pcm16_chunk)
            except Exception as exc:
                reconnected = await self.reconnect_provider_session(session_id, str(exc) or "Audio delivery failed.")
                if not reconnected:
                    raise
                active = self.active_sessions.get(session_id)
                if not active:
                    raise
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

    async def reconnect_provider_session(self, session_id: str, message: str = "", max_attempts: int = 1) -> bool:
        active = self.active_sessions.get(session_id)
        if not active:
            return False
        if active.reconnect_attempts >= max_attempts:
            await self.stop_session(
                session_id,
                EndReason.NETWORK_ERROR,
                message or "Realtime provider connection was lost.",
            )
            return False

        provider = self.providers.get(active.provider)
        if not provider:
            await self.stop_session(session_id, EndReason.PROVIDER_ERROR, f"Provider {active.provider} is unavailable.")
            return False

        active.reconnect_attempts += 1
        active.status = SessionStatus.RECONNECTING
        active.last_error = message or "Realtime provider connection was lost."
        self.background_status = BackgroundStatus.DEGRADED
        self.last_error = active.last_error
        self.db.add_log(
            "warning",
            "provider_reconnecting",
            f"{provider.display_name} connection lost. Reconnecting.",
            {"session_id": session_id, "provider": active.provider, "attempt": active.reconnect_attempts, "message": message},
        )
        self.db.add_transcript(session_id, "system", "Provider connection lost. Reconnecting.", True)
        if active.provider_events:
            await active.provider_events.put(
                {
                    "type": "provider.reconnecting",
                    "provider": active.provider,
                    "message": "Provider connection lost. Reconnecting.",
                    "attempt": active.reconnect_attempts,
                }
            )

        try:
            await provider.close_session(active.handle)
            env = self.env_store.read()

            async def queue_provider_event(event: dict[str, Any]) -> None:
                current = self.active_sessions.get(session_id)
                if current and current.provider_events:
                    await current.provider_events.put(event)

            active.handle = await provider.start_session(
                session_id,
                env,
                session_config=active.session_config,
                event_callback=queue_provider_event,
            )
        except Exception as exc:
            error = str(exc) or "Realtime provider reconnect failed."
            active.last_error = error
            self.db.add_log(
                "error",
                "provider_reconnect_failed",
                error,
                {"session_id": session_id, "provider": active.provider, "attempt": active.reconnect_attempts},
            )
            await self.stop_session(session_id, EndReason.NETWORK_ERROR, error)
            return False

        active.status = SessionStatus.RUNNING
        active.last_error = None
        if self.background_status == BackgroundStatus.DEGRADED:
            self.background_status = BackgroundStatus.STANDBY
        self.last_error = None
        self.db.add_log(
            "info",
            "provider_reconnected",
            f"{provider.display_name} connection recovered.",
            {"session_id": session_id, "provider": active.provider, "attempt": active.reconnect_attempts},
        )
        self.db.add_transcript(session_id, "system", "Provider connection recovered.", True)
        if active.provider_events:
            await active.provider_events.put(
                {
                    "type": "provider.reconnected",
                    "provider": active.provider,
                    "message": "Provider connection recovered.",
                    "attempt": active.reconnect_attempts,
                }
            )
        return True

    async def send_tool_result(self, session_id: str, tool_call_id: str, output: dict[str, Any]) -> None:
        active = self.active_sessions.get(session_id)
        if not active:
            raise KeyError(f"Session is not active: {session_id}")

        provider = self.providers.get(active.provider)
        if provider:
            await provider.send_tool_result(active.handle, tool_call_id, output)

    def mark_tool_call_handled(self, session_id: str, tool_call_id: str) -> bool:
        active = self.active_sessions.get(session_id)
        if not active:
            return False
        if active.handled_tool_call_ids is None:
            active.handled_tool_call_ids = set()
        if tool_call_id in active.handled_tool_call_ids:
            return False
        active.handled_tool_call_ids.add(tool_call_id)
        return True

    def request_agent_hangup(self, session_id: str) -> bool:
        active = self.active_sessions.get(session_id)
        if not active:
            return False
        active.agent_hangup_requested = True
        return True

    def mark_agent_hangup_ready(self, session_id: str) -> bool:
        active = self.active_sessions.get(session_id)
        if not active or not active.agent_hangup_requested or active.agent_hangup_ready:
            return False
        active.agent_hangup_ready = True
        return True

    def is_agent_hangup_ready(self, session_id: str) -> bool:
        active = self.active_sessions.get(session_id)
        return bool(active and active.agent_hangup_ready)

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

    def _readable_end_reason(self, reason: str, error_message: str | None = None) -> str:
        labels = {
            EndReason.USER_STOPPED: "user stopped the session",
            EndReason.CALLER_HUNG_UP: "caller hung up",
            EndReason.AGENT_HUNG_UP: "AI ended the call",
            EndReason.TIMEOUT_5_MINUTES: "5 minute session limit reached",
            EndReason.PROVIDER_ERROR: "provider error",
            EndReason.NETWORK_ERROR: "network connection lost",
            EndReason.BACKEND_SHUTDOWN: "backend shutdown",
        }
        label = labels.get(reason, reason.replace("_", " "))
        if error_message and reason in {EndReason.PROVIDER_ERROR, EndReason.NETWORK_ERROR}:
            return f"{label}: {error_message}"
        return label
