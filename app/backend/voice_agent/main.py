from __future__ import annotations

import base64
import asyncio
import json
from typing import Any

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from voice_agent.config.env_store import EnvStore
from voice_agent.core.session_manager import SessionManager
from voice_agent.core.state import EndReason
from voice_agent.providers import GeminiLiveAdapter, OpenAIRealtimeAdapter
from voice_agent.providers.base import ProviderConfigError
from voice_agent.storage.database import Database
from voice_agent.tools import ToolContext, build_default_registry


class EnvUpdate(BaseModel):
    openai_api_key: str = ""
    gemini_api_key: str = ""
    openai_realtime_model: str = "gpt-realtime"
    openai_realtime_mock: str = "false"
    default_realtime_provider: str = "openai"
    default_voice: str = ""


class BusinessProfileUpdate(BaseModel):
    name: str = "Default Business"
    content: str = ""


class AgentUpdate(BaseModel):
    name: str = "Default Agent"
    system_prompt: str = ""


class StartSessionRequest(BaseModel):
    provider: str | None = Field(default=None, pattern="^(openai|gemini)?$")


class ToolEnabledUpdate(BaseModel):
    enabled: bool


class ToolCallRequest(BaseModel):
    payload: dict[str, Any] = Field(default_factory=dict)
    session_id: str | None = None


db = Database()
env_store = EnvStore()
tool_registry = build_default_registry()
session_manager = SessionManager(
    db=db,
    env_store=env_store,
    providers={
        "openai": OpenAIRealtimeAdapter(),
        "gemini": GeminiLiveAdapter(),
    },
)

app = FastAPI(title="voiceAgent Local Backend", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "tauri://localhost",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, Any]:
    return {"ok": True, "runtime": session_manager.status()}


@app.get("/config")
async def get_config() -> dict[str, Any]:
    env_store.ensure_example()
    return env_store.read_public()


@app.put("/config")
async def save_config(update: EnvUpdate) -> dict[str, Any]:
    updates = {
        "OPENAI_REALTIME_MODEL": update.openai_realtime_model,
        "OPENAI_REALTIME_MOCK": update.openai_realtime_mock,
        "DEFAULT_REALTIME_PROVIDER": update.default_realtime_provider,
        "DEFAULT_VOICE": update.default_voice,
    }
    if update.openai_api_key:
        updates["OPENAI_API_KEY"] = update.openai_api_key
    if update.gemini_api_key:
        updates["GEMINI_API_KEY"] = update.gemini_api_key
    env_store.write(updates)
    return env_store.read_public()


@app.get("/providers")
async def list_providers() -> dict[str, Any]:
    env = env_store.read()
    providers = []
    for key, adapter in session_manager.providers.items():
        try:
            adapter.validate_config(env)
            ready = True
            error = None
        except ProviderConfigError as exc:
            ready = False
            error = str(exc)
        providers.append(
            {
                "name": key,
                "display_name": adapter.display_name,
                "ready": ready,
                "error": error,
                "voices": adapter.list_voices(env),
            }
        )
    return {"providers": providers}


@app.get("/runtime/status")
async def runtime_status() -> dict[str, Any]:
    return session_manager.status()


@app.post("/runtime/start")
async def start_runtime() -> dict[str, Any]:
    return await session_manager.start_background()


@app.post("/runtime/stop")
async def stop_runtime() -> dict[str, Any]:
    return await session_manager.stop_background()


@app.post("/sessions/test")
async def start_test_session(request: StartSessionRequest) -> dict[str, Any]:
    try:
        return await session_manager.start_test_session(request.provider)
    except ProviderConfigError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/sessions/{session_id}/stop")
async def stop_session(session_id: str) -> dict[str, Any]:
    return await session_manager.stop_session(session_id, EndReason.USER_STOPPED)


@app.get("/sessions")
async def list_sessions(limit: int = 50) -> dict[str, Any]:
    return {"sessions": db.list_sessions(limit)}


@app.get("/transcripts")
async def list_transcripts(session_id: str | None = None, limit: int = 100) -> dict[str, Any]:
    return {"transcripts": db.list_transcripts(session_id, limit)}


@app.websocket("/sessions/{session_id}/stream")
async def session_stream(websocket: WebSocket, session_id: str) -> None:
    await websocket.accept()
    if not session_manager.get_active_session(session_id):
        await websocket.send_json({"type": "session.error", "message": "Session is not active."})
        await websocket.close(code=4404)
        return

    await websocket.send_json({"type": "session.ready", "session_id": session_id})
    try:
        while True:
            receive_task = asyncio.create_task(websocket.receive())
            provider_task = asyncio.create_task(session_manager.next_provider_event(session_id))
            done, pending = await asyncio.wait(
                {receive_task, provider_task},
                return_when=asyncio.FIRST_COMPLETED,
            )
            for task in pending:
                task.cancel()

            if provider_task in done:
                provider_event = provider_task.result()
                if provider_event:
                    await _handle_provider_event(websocket, session_id, provider_event)
                    if provider_event.get("type") == "session.ended":
                        await websocket.close(code=4000)
                        return
                    continue
                await websocket.send_json({"type": "session.ended", "session_id": session_id})
                await websocket.close(code=4000)
                return

            message = receive_task.result()
            should_continue = await _handle_client_stream_message(websocket, session_id, message)
            if not should_continue:
                break
    except (WebSocketDisconnect, RuntimeError):
        db.add_log("info", "session_stream_disconnected", "Client stream disconnected.", {"session_id": session_id})


async def _handle_provider_event(websocket: WebSocket, session_id: str, event: dict[str, Any]) -> None:
    event = {"session_id": session_id, **event}
    _log_provider_event(session_id, event)
    if event.get("type") == "provider.error":
        message = str(event.get("message") or "Realtime provider returned an error.")
        db.add_log(
            "error",
            "provider_error",
            message,
            {
                "session_id": session_id,
                "provider": event.get("provider"),
                "raw_type": event.get("raw_type"),
                "code": event.get("code"),
                "error_type": event.get("error_type"),
            },
        )
        db.add_transcript(session_id, "system", f"Provider error: {message}", True)
        await session_manager.stop_session(session_id, EndReason.PROVIDER_ERROR, message)
    if event.get("type") in {"provider.transcript.delta", "provider.transcript.done"}:
        content = str(event.get("content") or "")
        if content and event.get("is_final"):
            db.add_transcript(session_id, str(event.get("speaker") or "assistant"), content, True)
    await websocket.send_json(event)


def _log_provider_event(session_id: str, event: dict[str, Any]) -> None:
    raw_type = str(event.get("raw_type") or event.get("type") or "")
    tracked_events = {
        "session.created",
        "session.updated",
        "input_audio_buffer.speech_started",
        "input_audio_buffer.speech_stopped",
        "input_audio_buffer.committed",
        "response.created",
        "response.done",
        "response.output_audio.done",
        "response.output_audio_transcript.done",
        "response.output_text.done",
        "rate_limits.updated",
    }
    if raw_type not in tracked_events:
        return
    db.add_log(
        "debug",
        "provider_event",
        raw_type,
        {
            "session_id": session_id,
            "provider": event.get("provider"),
            "raw_type": raw_type,
        },
    )


async def _handle_client_stream_message(websocket: WebSocket, session_id: str, message: dict[str, Any]) -> bool:
    if message.get("type") == "websocket.disconnect":
        return False
    if message.get("bytes") is not None:
        try:
            event = await session_manager.receive_audio_chunk(session_id, message["bytes"])
        except KeyError:
            await websocket.send_json({"type": "session.ended", "session_id": session_id})
            await websocket.close(code=4000)
            return False
        await websocket.send_json(event)
        return True

    text = message.get("text")
    if text is None:
        return True

    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        await websocket.send_json({"type": "session.error", "message": "Invalid JSON event."})
        return True

    event_type = payload.get("type")
    if event_type == "ping":
        await websocket.send_json({"type": "pong", "session_id": session_id})
    elif event_type == "audio.start":
        await websocket.send_json({"type": "audio.input_started", "session_id": session_id})
    elif event_type == "audio.stop":
        await websocket.send_json({"type": "audio.input_stopped", "session_id": session_id})
    elif event_type == "audio.chunk":
        data = str(payload.get("data", ""))
        try:
            chunk = base64.b64decode(data, validate=True)
        except Exception:
            await websocket.send_json({"type": "session.error", "message": "Invalid base64 audio chunk."})
            return True
        try:
            event = await session_manager.receive_audio_chunk(session_id, chunk)
        except KeyError:
            await websocket.send_json({"type": "session.ended", "session_id": session_id})
            await websocket.close(code=4000)
            return False
        await websocket.send_json(event)
    else:
        await websocket.send_json({"type": "session.error", "message": f"Unsupported event: {event_type}"})
    return True


@app.get("/business-profile")
async def get_business_profile() -> dict[str, Any]:
    return db.get_business_profile()


@app.put("/business-profile")
async def save_business_profile(update: BusinessProfileUpdate) -> dict[str, Any]:
    return db.upsert_business_profile(update.content, update.name)


@app.get("/agent")
async def get_agent() -> dict[str, Any]:
    return db.get_default_agent()


@app.put("/agent")
async def save_agent(update: AgentUpdate) -> dict[str, Any]:
    return db.upsert_default_agent(update.system_prompt, update.name)


@app.get("/tools")
async def list_tools() -> dict[str, Any]:
    return {"tools": tool_registry.list_tools()}


@app.put("/tools/{tool_name}/enabled")
async def set_tool_enabled(tool_name: str, update: ToolEnabledUpdate) -> dict[str, Any]:
    try:
        return tool_registry.set_enabled(tool_name, update.enabled)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/tools/{tool_name}/call")
async def call_tool(tool_name: str, request: ToolCallRequest) -> dict[str, Any]:
    try:
        return tool_registry.call(
            tool_name,
            request.payload,
            ToolContext(db=db, session_id=request.session_id),
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/tool-calls")
async def list_tool_calls(limit: int = 100, session_id: str | None = None) -> dict[str, Any]:
    return {"tool_calls": db.list_tool_calls(limit, session_id)}


@app.get("/app-logs")
async def list_app_logs(limit: int = 100, session_id: str | None = None) -> dict[str, Any]:
    return {"logs": db.list_logs(limit, session_id)}
