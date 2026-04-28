from __future__ import annotations

import base64
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
            message = await websocket.receive()
            if message.get("type") == "websocket.disconnect":
                break
            if message.get("bytes") is not None:
                try:
                    event = session_manager.receive_audio_chunk(session_id, len(message["bytes"]))
                except KeyError:
                    await websocket.send_json({"type": "session.ended", "session_id": session_id})
                    await websocket.close(code=4000)
                    return
                await websocket.send_json(event)
                continue

            text = message.get("text")
            if text is None:
                continue

            try:
                payload = json.loads(text)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "session.error", "message": "Invalid JSON event."})
                continue

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
                    chunk_size = len(base64.b64decode(data, validate=True))
                except Exception:
                    await websocket.send_json({"type": "session.error", "message": "Invalid base64 audio chunk."})
                    continue
                try:
                    event = session_manager.receive_audio_chunk(session_id, chunk_size)
                except KeyError:
                    await websocket.send_json({"type": "session.ended", "session_id": session_id})
                    await websocket.close(code=4000)
                    return
                await websocket.send_json(event)
            else:
                await websocket.send_json({"type": "session.error", "message": f"Unsupported event: {event_type}"})
    except (WebSocketDisconnect, RuntimeError):
        db.add_log("info", "session_stream_disconnected", "Client stream disconnected.", {"session_id": session_id})


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
async def list_tool_calls(limit: int = 100) -> dict[str, Any]:
    return {"tool_calls": db.list_tool_calls(limit)}
