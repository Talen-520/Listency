from __future__ import annotations

import asyncio
import base64
import json
import urllib.parse
from typing import Any

from fastapi import FastAPI, HTTPException, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

from voice_agent.config.env_store import EnvStore
from voice_agent.core.business_hours import WEEKDAYS, default_business_hours, resolve_business_hours
from voice_agent.core.session_manager import SessionManager
from voice_agent.core.state import EndReason
from voice_agent.core.voice_preview import DEFAULT_PREVIEW_TEXT, VoicePreviewService
from voice_agent.phone import PhoneManager
from voice_agent.phone.base import PhoneConfigError
from voice_agent.phone.telnyx import TelnyxPhoneAdapter
from voice_agent.phone.telnyx_stream import handle_telnyx_media_stream
from voice_agent.phone.twilio import TwilioPhoneAdapter
from voice_agent.phone.twilio_stream import handle_twilio_media_stream
from voice_agent.providers import GeminiLiveAdapter, OpenAIRealtimeAdapter
from voice_agent.providers.base import ProviderConfigError
from voice_agent.storage.database import Database, normalize_timestamp_filter, utc_now
from voice_agent.tunnel import PublicTunnelManager
from voice_agent.tools import ToolContext, build_default_registry


class EnvUpdate(BaseModel):
    openai_api_key: str = ""
    gemini_api_key: str = ""
    openai_realtime_model: str = "gpt-realtime-2"
    gemini_live_model: str = "gemini-3.1-flash-live-preview"
    openai_realtime_mock: str = "false"
    default_realtime_provider: str = "openai"
    openai_default_voice: str = ""
    gemini_default_voice: str = ""
    default_voice: str = ""
    phone_provider: str = Field(default="none", pattern="^(none|twilio|telnyx)$")
    phone_connection_mode: str = Field(default="automatic", pattern="^(automatic|manual)$")
    phone_public_base_url: str = ""
    phone_realtime_provider: str = Field(default="", pattern="^(|openai|gemini)$")
    phone_transfer_target: str = ""
    cloudflared_bin: str = ""
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_phone_number: str = ""
    twilio_phone_number_sid: str = ""
    telnyx_api_key: str = ""
    telnyx_call_control_app_id: str = ""
    telnyx_application_name: str = "Listency"
    telnyx_phone_number: str = ""


class BusinessProfileUpdate(BaseModel):
    name: str = "Default Business"
    content: str = ""


class BusinessHoursUpdate(BaseModel):
    timezone: str = ""
    weekly_hours: dict[str, list[dict[str, str]]] = Field(default_factory=lambda: {day: [] for day in WEEKDAYS})
    closures: list[dict[str, str]] = Field(default_factory=list)
    after_hours_mode: str = Field(default="take_callback", pattern="^(take_callback|information_only|transfer|closed_message)$")
    after_hours_message: str = ""
    open_hours_transfer_target: str = ""
    after_hours_transfer_target: str = ""


class BusinessInfoSectionsUpdate(BaseModel):
    business_type: str = Field(default="general", pattern="^(general|hotel|restaurant|appointment)$")
    location: str = ""
    services: str = ""
    pricing: str = ""
    booking_rules: str = ""
    policies: str = ""
    faq: str = ""
    parking_accessibility: str = ""


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


class VoicePreviewRequest(BaseModel):
    provider: str = Field(pattern="^(openai|gemini)$")
    voice: str = Field(min_length=1, max_length=80)
    text: str = DEFAULT_PREVIEW_TEXT


class LogPruneRequest(BaseModel):
    retention_days: int = Field(default=30, ge=1, le=3650)


class FollowUpTaskStatusUpdate(BaseModel):
    status: str = Field(pattern="^(new|in_progress|done|dismissed)$")


db = Database()
env_store = EnvStore()
tool_registry = build_default_registry()


def enabled_tools_for_provider() -> list[dict[str, Any]]:
    tools = []
    for tool in tool_registry.list_tools():
        if not tool["enabled"]:
            continue
        tools.append(
            {
                "type": "function",
                "name": tool["name"],
                "description": tool["description"],
                "parameters": tool["input_schema"],
            }
        )
    return tools


session_manager = SessionManager(
    db=db,
    env_store=env_store,
    list_tools_for_provider=enabled_tools_for_provider,
    providers={
        "openai": OpenAIRealtimeAdapter(),
        "gemini": GeminiLiveAdapter(),
    },
)
voice_preview_service = VoicePreviewService(env_store, session_manager.providers)
public_tunnel_manager = PublicTunnelManager()
phone_manager = PhoneManager(db, env_store, session_manager, public_tunnel_manager)

app = FastAPI(title="Listency Local Backend", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "tauri://localhost",
        "http://tauri.localhost",
        "https://tauri.localhost",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _is_public_tunnel_host(host: str) -> bool:
    env = env_store.read()
    public_host = public_tunnel_manager.public_host(env)
    if not public_host:
        return False
    return host.split(":", 1)[0].lower() == public_host.split(":", 1)[0].lower()


def _parse_form_body(body: bytes) -> dict[str, str]:
    parsed = urllib.parse.parse_qs(body.decode("utf-8"), keep_blank_values=True)
    return {key: values[-1] if values else "" for key, values in parsed.items()}


def _telnyx_number(value: Any) -> str:
    if isinstance(value, dict):
        return str(value.get("phone_number") or value.get("number") or "")
    return str(value or "")


def _redact_diagnostics(value: Any, key: str = "") -> Any:
    normalized_key = key.lower()
    if isinstance(value, dict):
        return {item_key: _redact_diagnostics(item_value, item_key) for item_key, item_value in value.items()}
    if isinstance(value, list):
        return [_redact_diagnostics(item, key) for item in value]
    if value is None:
        return None
    if any(secret_key in normalized_key for secret_key in ("api_key", "auth", "token", "secret", "password", "authorization")):
        return "[redacted]" if str(value) else ""
    if normalized_key in {"from", "to", "caller", "called"} or any(
        phone_key in normalized_key for phone_key in ("phone", "from_number", "to_number")
    ):
        raw = str(value)
        if not raw:
            return ""
        if raw.startswith("[redacted phone"):
            return raw
        digits = "".join(char for char in raw if char.isdigit())
        if len(digits) >= 4:
            return f"[redacted phone ending {digits[-2:]}]"
        return "[redacted phone]"
    return value


def _safe_json_record(record: dict[str, Any]) -> dict[str, Any]:
    safe = dict(record)
    for item_key, item_value in list(safe.items()):
        if not item_key.endswith("_json"):
            continue
        target_key = item_key.removesuffix("_json")
        if isinstance(item_value, str) and item_value:
            try:
                safe[target_key] = _redact_diagnostics(json.loads(item_value))
            except json.JSONDecodeError:
                safe[target_key] = "[unparseable json]"
        else:
            safe[target_key] = None
        safe.pop(item_key, None)
    return _redact_diagnostics(safe)


@app.middleware("http")
async def restrict_public_tunnel_surface(request: Request, call_next):
    host = request.headers.get("host", "")
    if _is_public_tunnel_host(host) and not request.url.path.startswith("/phone/"):
        return JSONResponse({"detail": "This public phone connection only accepts phone provider webhooks."}, status_code=404)
    return await call_next(request)


@app.on_event("shutdown")
async def shutdown_phone_connection() -> None:
    await public_tunnel_manager.stop()


@app.get("/health")
async def health() -> dict[str, Any]:
    return {"ok": True, "runtime": session_manager.status()}


@app.get("/config")
async def get_config() -> dict[str, Any]:
    env_store.ensure_files()
    return env_store.read_public()


@app.put("/config")
async def save_config(update: EnvUpdate) -> dict[str, Any]:
    updates = {
        "OPENAI_REALTIME_MODEL": update.openai_realtime_model,
        "GEMINI_LIVE_MODEL": update.gemini_live_model,
        "OPENAI_REALTIME_MOCK": update.openai_realtime_mock,
        "DEFAULT_REALTIME_PROVIDER": update.default_realtime_provider,
        "OPENAI_DEFAULT_VOICE": update.openai_default_voice,
        "GEMINI_DEFAULT_VOICE": update.gemini_default_voice,
        "DEFAULT_VOICE": update.default_voice,
        "PHONE_PROVIDER": update.phone_provider,
        "PHONE_CONNECTION_MODE": update.phone_connection_mode,
        "PHONE_PUBLIC_BASE_URL": update.phone_public_base_url,
        "PHONE_REALTIME_PROVIDER": update.phone_realtime_provider,
        "PHONE_TRANSFER_TARGET": update.phone_transfer_target,
        "CLOUDFLARED_BIN": update.cloudflared_bin,
        "TWILIO_PHONE_NUMBER": update.twilio_phone_number,
        "TELNYX_CALL_CONTROL_APP_ID": update.telnyx_call_control_app_id,
        "TELNYX_APPLICATION_NAME": update.telnyx_application_name,
        "TELNYX_PHONE_NUMBER": update.telnyx_phone_number,
    }
    if update.openai_api_key:
        updates["OPENAI_API_KEY"] = update.openai_api_key
    if update.gemini_api_key:
        updates["GEMINI_API_KEY"] = update.gemini_api_key
    if update.twilio_account_sid:
        updates["TWILIO_ACCOUNT_SID"] = update.twilio_account_sid
    if update.twilio_auth_token:
        updates["TWILIO_AUTH_TOKEN"] = update.twilio_auth_token
    if update.twilio_phone_number_sid:
        updates["TWILIO_PHONE_NUMBER_SID"] = update.twilio_phone_number_sid
    if update.telnyx_api_key:
        updates["TELNYX_API_KEY"] = update.telnyx_api_key
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


@app.get("/phone/status")
async def phone_status() -> dict[str, Any]:
    return phone_manager.status()


@app.post("/phone/connection/start")
async def start_phone_connection() -> dict[str, Any]:
    return await phone_manager.start_connection()


@app.post("/phone/connection/stop")
async def stop_phone_connection() -> dict[str, Any]:
    return await phone_manager.stop_connection()


@app.post("/phone/connect")
async def connect_phone() -> dict[str, Any]:
    try:
        return await phone_manager.connect()
    except PhoneConfigError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/phone/provision")
async def provision_phone() -> dict[str, Any]:
    try:
        return await phone_manager.provision()
    except PhoneConfigError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/phone/twilio/debugger")
async def twilio_debugger(limit: int = 10, hours: int = 24) -> dict[str, Any]:
    try:
        alerts = await TwilioPhoneAdapter().debugger_alerts(env_store.read(), limit=limit, hours=hours)
    except PhoneConfigError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"alerts": alerts}


@app.post("/phone/twilio/inbound")
async def twilio_inbound(request: Request) -> Response:
    form = _parse_form_body(await request.body())
    env = env_store.read()
    tunnel = public_tunnel_manager.status(env)
    if tunnel.status != "running" or not tunnel.public_ws_url:
        return Response(
            '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Listency phone connection is not ready.</Say><Hangup /></Response>',
            media_type="application/xml",
            status_code=200,
        )
    twiml = TwilioPhoneAdapter().inbound_twiml(
        tunnel.public_ws_url,
        call_sid=form.get("CallSid", ""),
        from_number=form.get("From", ""),
        to_number=form.get("To", ""),
    )
    db.add_log("info", "twilio_inbound_webhook", "Twilio inbound call webhook received.", {"call_sid": form.get("CallSid")})
    return Response(twiml, media_type="application/xml")


@app.post("/phone/twilio/status")
async def twilio_status(request: Request) -> dict[str, Any]:
    form = _parse_form_body(await request.body())
    db.add_log(
        "info",
        "twilio_call_status",
        str(form.get("CallStatus") or "Twilio call status update."),
        {"call_sid": form.get("CallSid"), "raw": form},
    )
    return {"ok": True}


@app.websocket("/phone/twilio/media")
async def twilio_media(websocket: WebSocket) -> None:
    await handle_twilio_media_stream(
        websocket,
        db=db,
        session_manager=session_manager,
        tool_registry=tool_registry,
        phone_manager=phone_manager,
    )


@app.post("/phone/telnyx/webhook")
async def telnyx_webhook(request: Request) -> dict[str, Any]:
    payload = await request.json()
    data = payload.get("data") if isinstance(payload, dict) else {}
    data = data if isinstance(data, dict) else {}
    event_type = str(data.get("event_type") or "telnyx_webhook")
    event_payload = data.get("payload") if isinstance(data.get("payload"), dict) else {}
    db.add_log("info", "telnyx_webhook", event_type, {"raw": payload})

    if event_type == "call.initiated" and str(event_payload.get("direction") or "").lower() == "incoming":
        env = env_store.read()
        tunnel = public_tunnel_manager.status(env)
        media_url = TelnyxPhoneAdapter().media_url(tunnel)
        call_control_id = str(event_payload.get("call_control_id") or "")
        from_number = _telnyx_number(event_payload.get("from"))
        to_number = _telnyx_number(event_payload.get("to"))
        try:
            await TelnyxPhoneAdapter().answer_call_with_stream(
                env,
                call_control_id,
                media_url,
                from_number=from_number,
                to_number=to_number,
            )
        except PhoneConfigError as exc:
            phone_call_id = db.create_phone_call("telnyx", call_control_id, from_number, to_number)
            db.update_phone_call_status(phone_call_id, "failed", ended_reason=EndReason.PROVIDER_ERROR, error_message=str(exc))
            db.add_log(
                "error",
                "telnyx_answer_failed",
                str(exc),
                {"call_control_id": call_control_id, "from": from_number, "to": to_number},
            )
        else:
            db.add_log(
                "info",
                "telnyx_answered_with_stream",
                "Telnyx inbound call answered with Listency media stream.",
                {"call_control_id": call_control_id, "media_url": media_url},
            )
    return {"ok": True}


@app.websocket("/phone/telnyx/media")
async def telnyx_media(websocket: WebSocket) -> None:
    await handle_telnyx_media_stream(
        websocket,
        db=db,
        session_manager=session_manager,
        tool_registry=tool_registry,
        phone_manager=phone_manager,
    )


@app.get("/voice-previews")
async def list_voice_previews() -> dict[str, Any]:
    return {"cached": voice_preview_service.cached_voices()}


@app.post("/voice-preview")
async def create_voice_preview(request: VoicePreviewRequest) -> dict[str, Any]:
    try:
        return await voice_preview_service.ensure_preview(request.provider, request.voice, request.text)
    except ProviderConfigError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/voice-previews/{provider}/{voice}")
async def get_voice_preview(provider: str, voice: str) -> FileResponse:
    try:
        preview_file = voice_preview_service.preview_file(provider, voice)
    except ProviderConfigError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not preview_file.exists():
        raise HTTPException(status_code=404, detail="Voice preview is not cached.")
    return FileResponse(preview_file, media_type="audio/wav", filename=f"{voice}.wav")


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
async def list_sessions(limit: int = 50, since: str | None = None) -> dict[str, Any]:
    return {"sessions": db.list_sessions(limit, since)}


@app.get("/transcripts")
async def list_transcripts(session_id: str | None = None, limit: int = 100, since: str | None = None) -> dict[str, Any]:
    return {"transcripts": db.list_transcripts(session_id, limit, since)}


@app.websocket("/sessions/{session_id}/stream")
async def session_stream(websocket: WebSocket, session_id: str) -> None:
    if _is_public_tunnel_host(websocket.headers.get("host", "")):
        await websocket.close(code=4403)
        return
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
    if event.get("type") == "provider.disconnected":
        message = str(event.get("message") or "Realtime provider connection closed.")
        db.add_log(
            "warning",
            "provider_disconnected",
            message,
            {
                "session_id": session_id,
                "provider": event.get("provider"),
                "raw_type": event.get("raw_type"),
            },
        )
        await session_manager.reconnect_provider_session(session_id, message)
        return
    if event.get("type") in {"provider.reconnecting", "provider.reconnected"}:
        await websocket.send_json(event)
        return
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
    if event.get("type") == "provider.tool_call.done":
        await _handle_provider_tool_call(websocket, session_id, event)
        return
    if event.get("type") in {"provider.transcript.delta", "provider.transcript.done"}:
        content = str(event.get("content") or "")
        if content and event.get("is_final"):
            db.add_transcript(session_id, str(event.get("speaker") or "assistant"), content, True)
    if _is_agent_hangup_audio_done(event) and session_manager.mark_agent_hangup_ready(session_id):
        await websocket.send_json({"type": "session.agent_hangup_ready", "session_id": session_id})
        asyncio.create_task(_fallback_agent_hangup(session_id))
    await websocket.send_json(event)


async def _handle_provider_tool_call(websocket: WebSocket, session_id: str, event: dict[str, Any]) -> None:
    tool_call_id = str(event.get("tool_call_id") or "")
    tool_name = str(event.get("tool_name") or "")
    raw_arguments = str(event.get("arguments") or "{}")
    if tool_call_id and not session_manager.mark_tool_call_handled(session_id, tool_call_id):
        await websocket.send_json(
            {
                "type": "tool.call_ignored",
                "session_id": session_id,
                "tool_call_id": tool_call_id,
                "tool_name": tool_name,
                "reason": "duplicate",
            }
        )
        return
    try:
        payload = json.loads(raw_arguments)
        if not isinstance(payload, dict):
            raise ValueError("Tool arguments must be a JSON object.")
    except Exception as exc:
        payload = {"_raw_arguments": raw_arguments}
        output = {"ok": False, "error": f"Invalid tool arguments: {exc}"}
        db.add_tool_call(tool_name or "unknown_tool", payload, output, "failed", session_id, output["error"])
    else:
        try:
            result = tool_registry.call(tool_name, payload, ToolContext(db=db, session_id=session_id, phone_manager=phone_manager))
            if tool_name == "transfer_call":
                target = str(payload.get("target") or "")
                reason = str(payload.get("reason") or "")
                result = await phone_manager.transfer_for_session(session_id, target, reason)
            output = {"ok": True, "result": result}
            if tool_name == "end_call":
                session_manager.request_agent_hangup(session_id)
            db.add_log(
                "info",
                "tool_call_completed",
                f"{tool_name} completed.",
                {"session_id": session_id, "tool_name": tool_name, "tool_call_id": tool_call_id},
            )
        except Exception as exc:
            output = {"ok": False, "error": str(exc)}
            db.add_log(
                "error",
                "tool_call_failed",
                str(exc),
                {"session_id": session_id, "tool_name": tool_name, "tool_call_id": tool_call_id},
            )

    await websocket.send_json(
        {
            "type": "tool.call",
            "session_id": session_id,
            "tool_call_id": tool_call_id,
            "tool_name": tool_name,
            "arguments": payload,
            "output": output,
        }
    )

    if not tool_call_id:
        return
    try:
        await session_manager.send_tool_result(session_id, tool_call_id, output)
    except KeyError:
        await websocket.send_json({"type": "session.ended", "session_id": session_id})
    except Exception as exc:
        await websocket.send_json({"type": "session.error", "message": f"Tool result delivery failed: {exc}"})


def _is_agent_hangup_audio_done(event: dict[str, Any]) -> bool:
    raw_type = str(event.get("raw_type") or "")
    return raw_type in {"response.output_audio.done", "response.audio.done", "serverContent.turnComplete"}


async def _fallback_agent_hangup(session_id: str) -> None:
    await asyncio.sleep(10)
    if session_manager.is_agent_hangup_ready(session_id):
        await session_manager.stop_session(session_id, EndReason.AGENT_HUNG_UP)


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
        "response.audio.done",
        "response.output_audio.done",
        "response.output_audio_transcript.done",
        "response.output_text.done",
        "response.function_call_arguments.done",
        "conversation.item.created",
        "conversation.item.done",
        "setupComplete",
        "serverContent.turnComplete",
        "serverContent.generationComplete",
        "toolCall",
        "goAway",
        "websocket.closed",
        "provider.reconnecting",
        "provider.reconnected",
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
        except Exception as exc:
            await _handle_audio_stream_error(websocket, session_id, exc)
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
    elif event_type == "session.agent_hangup_complete":
        await session_manager.stop_session(session_id, EndReason.AGENT_HUNG_UP)
        await websocket.send_json({"type": "session.ended", "session_id": session_id, "ended_reason": EndReason.AGENT_HUNG_UP})
        await websocket.close(code=4000)
        return False
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
        except Exception as exc:
            await _handle_audio_stream_error(websocket, session_id, exc)
            return False
        await websocket.send_json(event)
    else:
        await websocket.send_json({"type": "session.error", "message": f"Unsupported event: {event_type}"})
    return True


async def _handle_audio_stream_error(websocket: WebSocket, session_id: str, exc: Exception) -> None:
    message = str(exc) or "Audio stream delivery failed."
    db.add_log("error", "audio_stream_failed", message, {"session_id": session_id})
    await session_manager.stop_session(session_id, EndReason.NETWORK_ERROR, message)
    await websocket.send_json(
        {
            "type": "provider.error",
            "session_id": session_id,
            "provider": None,
            "message": message,
        }
    )
    await websocket.send_json({"type": "session.ended", "session_id": session_id, "ended_reason": EndReason.NETWORK_ERROR, "message": message})
    await websocket.close(code=4000)


@app.get("/business-profile")
async def get_business_profile() -> dict[str, Any]:
    return db.get_business_profile()


@app.put("/business-profile")
async def save_business_profile(update: BusinessProfileUpdate) -> dict[str, Any]:
    return db.upsert_business_profile(update.content, update.name)


@app.get("/business-hours")
async def get_business_hours() -> dict[str, Any]:
    config = db.get_business_hours()
    return {"config": config, "status": resolve_business_hours(config)}


@app.put("/business-hours")
async def save_business_hours(update: BusinessHoursUpdate) -> dict[str, Any]:
    config = db.set_business_hours(update.model_dump())
    return {"config": config, "status": resolve_business_hours(config)}


@app.post("/business-hours/reset")
async def reset_business_hours() -> dict[str, Any]:
    config = db.set_business_hours(default_business_hours())
    return {"config": config, "status": resolve_business_hours(config)}


@app.get("/business-info-sections")
async def get_business_info_sections() -> dict[str, Any]:
    return {"sections": db.get_business_info_sections()}


@app.put("/business-info-sections")
async def save_business_info_sections(update: BusinessInfoSectionsUpdate) -> dict[str, Any]:
    return {"sections": db.set_business_info_sections(update.model_dump())}


@app.get("/follow-up-tasks")
async def list_follow_up_tasks(limit: int = 100, status: str | None = None) -> dict[str, Any]:
    if status and status not in {"new", "in_progress", "done", "dismissed"}:
        raise HTTPException(status_code=400, detail="Unsupported task status.")
    return {"tasks": db.list_follow_up_tasks(limit, status)}


@app.patch("/follow-up-tasks/{task_id}/status")
async def update_follow_up_task_status(task_id: int, update: FollowUpTaskStatusUpdate) -> dict[str, Any]:
    try:
        return db.update_follow_up_task_status(task_id, update.status)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.delete("/follow-up-tasks/{task_id}")
async def delete_follow_up_task(task_id: int) -> dict[str, Any]:
    try:
        return {"deleted": db.delete_follow_up_task(task_id)}
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/agent")
async def get_agent() -> dict[str, Any]:
    return db.get_active_agent()


@app.put("/agent")
async def save_agent(update: AgentUpdate) -> dict[str, Any]:
    return db.upsert_active_agent(update.system_prompt, update.name)


@app.get("/agents")
async def list_agents() -> dict[str, Any]:
    return {"agents": db.list_agents(), "active_agent_id": db.get_active_agent_id()}


@app.post("/agents")
async def create_agent(update: AgentUpdate) -> dict[str, Any]:
    agent = db.create_agent(update.system_prompt, update.name)
    db.set_active_agent(agent["id"])
    return agent


@app.put("/agents/{agent_id}")
async def save_agent_by_id(agent_id: str, update: AgentUpdate) -> dict[str, Any]:
    agent = db.upsert_agent(agent_id, update.system_prompt, update.name)
    if db.get_active_agent_id() == agent_id:
        db.set_active_agent(agent_id)
    return agent


@app.delete("/agents/{agent_id}")
async def delete_agent(agent_id: str) -> dict[str, Any]:
    try:
        deleted = db.delete_agent(agent_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"deleted": deleted, "active_agent_id": db.get_active_agent_id()}


@app.post("/agents/{agent_id}/select")
async def select_agent(agent_id: str) -> dict[str, Any]:
    try:
        agent = db.set_active_agent(agent_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return agent


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
            ToolContext(db=db, session_id=request.session_id, phone_manager=phone_manager),
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/tool-calls")
async def list_tool_calls(limit: int = 100, session_id: str | None = None, since: str | None = None) -> dict[str, Any]:
    return {"tool_calls": db.list_tool_calls(limit, session_id, since)}


@app.get("/app-logs")
async def list_app_logs(limit: int = 100, session_id: str | None = None, since: str | None = None) -> dict[str, Any]:
    return {"logs": db.list_logs(limit, session_id, since)}


@app.get("/phone-calls")
async def list_phone_calls(limit: int = 100, session_id: str | None = None, since: str | None = None) -> dict[str, Any]:
    return {"phone_calls": db.list_phone_calls(limit, since, session_id)}


@app.get("/logs/export")
async def export_logs(since: str | None = None, session_id: str | None = None) -> dict[str, Any]:
    return {
        "generated_at": utc_now(),
        "since": normalize_timestamp_filter(since),
        "session_id": session_id,
        **db.export_log_data(since=since, session_id=session_id),
    }


@app.get("/diagnostics/export")
async def export_diagnostics() -> dict[str, Any]:
    env_public = env_store.read_public()
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
                "voice_count": len(adapter.list_voices(env)),
            }
        )

    business_hours = db.get_business_hours()
    business_hours_status = resolve_business_hours(business_hours)
    return {
        "generated_at": utc_now(),
        "app": {
            "name": "Listency",
            "backend_version": app.version,
        },
        "config": {
            "env_path": env_public.get("env_path", ""),
            "default_realtime_provider": env_public.get("DEFAULT_REALTIME_PROVIDER", ""),
            "openai_realtime_model": env_public.get("OPENAI_REALTIME_MODEL", ""),
            "gemini_live_model": env_public.get("GEMINI_LIVE_MODEL", ""),
            "openai_mock": env_public.get("OPENAI_REALTIME_MOCK", ""),
            "has_openai_key": env_public.get("has_openai_key", False),
            "has_gemini_key": env_public.get("has_gemini_key", False),
            "phone_provider": env_public.get("PHONE_PROVIDER", "none"),
            "phone_connection_mode": env_public.get("PHONE_CONNECTION_MODE", "automatic"),
            "phone_realtime_provider": env_public.get("PHONE_REALTIME_PROVIDER", ""),
            "phone_transfer_target_configured": bool(env.get("PHONE_TRANSFER_TARGET")),
            "has_twilio_auth_token": env_public.get("has_twilio_auth_token", False),
            "twilio_account_sid_configured": bool(env.get("TWILIO_ACCOUNT_SID")),
            "twilio_phone_number_configured": bool(env.get("TWILIO_PHONE_NUMBER") or env.get("TWILIO_PHONE_NUMBER_SID")),
            "has_telnyx_api_key": env_public.get("has_telnyx_api_key", False),
        },
        "runtime": _redact_diagnostics(session_manager.status()),
        "phone": _redact_diagnostics(phone_manager.status()),
        "providers": providers,
        "business_hours": {
            "configured": business_hours_status.get("configured", False),
            "status": business_hours_status,
        },
        "recent": {
            "sessions": [_safe_json_record(record) for record in db.list_sessions(limit=20)],
            "phone_calls": [_safe_json_record(record) for record in db.list_phone_calls(limit=20)],
            "tool_calls": [_safe_json_record(record) for record in db.list_tool_calls(limit=20)],
            "follow_up_tasks": [_safe_json_record(record) for record in db.list_follow_up_tasks(limit=20)],
            "app_logs": [_safe_json_record(record) for record in db.list_logs(limit=50)],
        },
    }


@app.post("/logs/prune")
async def prune_logs(request: LogPruneRequest) -> dict[str, Any]:
    protected_session_ids = list(session_manager.active_sessions.keys())
    result = db.prune_log_data(request.retention_days, protected_session_ids)
    db.add_log("info", "logs_pruned", "Old log records were pruned.", result)
    return result


@app.post("/logs/clear")
async def clear_logs() -> dict[str, Any]:
    if session_manager.active_sessions:
        raise HTTPException(status_code=409, detail="Stop active sessions before clearing logs.")
    result = {"deleted": db.clear_log_data()}
    return result
