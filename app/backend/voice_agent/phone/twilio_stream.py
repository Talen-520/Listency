from __future__ import annotations

import asyncio
import base64
import json
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect

from voice_agent.core.session_manager import SessionManager
from voice_agent.core.state import EndReason
from voice_agent.phone.codecs import mulaw_to_pcm16, pcm16_to_mulaw, resample_pcm16_mono
from voice_agent.phone.manager import PhoneManager
from voice_agent.storage.database import Database
from voice_agent.tools import ToolContext, ToolRegistry


def _provider_input_rate(provider: str) -> int:
    return 16000 if provider == "gemini" else 24000


async def handle_twilio_media_stream(
    websocket: WebSocket,
    *,
    db: Database,
    session_manager: SessionManager,
    tool_registry: ToolRegistry,
    phone_manager: PhoneManager,
) -> None:
    await websocket.accept()
    session_id: str | None = None
    phone_call_id: int | None = None
    stream_sid = ""
    try:
        while True:
            receive_task = asyncio.create_task(websocket.receive_text())
            provider_task = (
                asyncio.create_task(session_manager.next_provider_event(session_id))
                if session_id
                else None
            )
            wait_set = {receive_task}
            if provider_task:
                wait_set.add(provider_task)
            done, pending = await asyncio.wait(wait_set, return_when=asyncio.FIRST_COMPLETED)
            for task in pending:
                task.cancel()

            if provider_task and provider_task in done:
                provider_event = provider_task.result()
                if provider_event is None:
                    break
                if provider_event and session_id:
                    keep_open = await _handle_provider_event(
                        websocket,
                        session_id,
                        provider_event,
                        stream_sid,
                        db=db,
                        session_manager=session_manager,
                        tool_registry=tool_registry,
                        phone_manager=phone_manager,
                    )
                    if not keep_open:
                        break
                continue

            message = receive_task.result()
            keep_open, session_id, phone_call_id, stream_sid = await _handle_twilio_event(
                websocket,
                message,
                session_id=session_id,
                phone_call_id=phone_call_id,
                stream_sid=stream_sid,
                db=db,
                session_manager=session_manager,
                phone_manager=phone_manager,
            )
            if not keep_open:
                break
    except WebSocketDisconnect:
        db.add_log("info", "twilio_media_disconnected", "Twilio media stream disconnected.", {"session_id": session_id})
    finally:
        if session_id and session_manager.get_active_session(session_id):
            await session_manager.stop_session(session_id, EndReason.CALLER_HUNG_UP)
        await phone_manager.finish_phone_call(phone_call_id, status="caller_hung_up", ended_reason=EndReason.CALLER_HUNG_UP)


async def _handle_twilio_event(
    websocket: WebSocket,
    message: str,
    *,
    session_id: str | None,
    phone_call_id: int | None,
    stream_sid: str,
    db: Database,
    session_manager: SessionManager,
    phone_manager: PhoneManager,
) -> tuple[bool, str | None, int | None, str]:
    event = json.loads(message)
    event_type = str(event.get("event") or "")
    if event_type == "connected":
        db.add_log("info", "twilio_media_connected", "Twilio media stream connected.")
        return True, session_id, phone_call_id, stream_sid

    if event_type == "start":
        start = event.get("start") or {}
        stream_sid = str(start.get("streamSid") or event.get("streamSid") or "")
        call_sid = str(start.get("callSid") or "")
        custom = start.get("customParameters") or {}
        from_number = str(custom.get("from") or "")
        to_number = str(custom.get("to") or "")
        started = await phone_manager.start_phone_session(
            phone_provider="twilio",
            provider_call_id=call_sid,
            from_number=from_number,
            to_number=to_number,
        )
        session_id = str(started["session"]["id"])
        phone_call_id = int(started["phone_call_id"])
        if stream_sid:
            db.update_phone_call_stream(phone_call_id, stream_sid)
        db.add_log(
            "info",
            "twilio_call_started",
            "Inbound Twilio call connected to Listency.",
            {"session_id": session_id, "phone_call_id": phone_call_id, "call_sid": call_sid},
        )
        return True, session_id, phone_call_id, stream_sid

    if event_type == "media" and session_id:
        media = event.get("media") or {}
        payload = str(media.get("payload") or "")
        if payload:
            mulaw = base64.b64decode(payload)
            pcm8k = mulaw_to_pcm16(mulaw)
            active = session_manager.get_active_session(session_id)
            target_rate = _provider_input_rate(active.provider if active else "openai")
            pcm = resample_pcm16_mono(pcm8k, 8000, target_rate)
            await session_manager.receive_audio_chunk(session_id, pcm)
        return True, session_id, phone_call_id, stream_sid

    if event_type == "stop":
        if session_id:
            await session_manager.stop_session(session_id, EndReason.CALLER_HUNG_UP)
        await phone_manager.finish_phone_call(phone_call_id, status="completed", ended_reason=EndReason.CALLER_HUNG_UP)
        return False, session_id, phone_call_id, stream_sid

    return True, session_id, phone_call_id, stream_sid


async def _handle_provider_event(
    websocket: WebSocket,
    session_id: str,
    event: dict[str, Any],
    stream_sid: str,
    *,
    db: Database,
    session_manager: SessionManager,
    tool_registry: ToolRegistry,
    phone_manager: PhoneManager,
) -> bool:
    event = {"session_id": session_id, **event}
    event_type = str(event.get("type") or "")
    raw_type = str(event.get("raw_type") or event_type)
    if event_type == "session.ended":
        return False

    if event_type == "provider.output_audio.delta" and stream_sid:
        audio = str(event.get("audio") or "")
        sample_rate = int(event.get("sample_rate") or 24000)
        if audio:
            pcm = base64.b64decode(audio)
            pcm8k = resample_pcm16_mono(pcm, sample_rate, 8000)
            payload = base64.b64encode(pcm16_to_mulaw(pcm8k)).decode("ascii")
            await websocket.send_json({"event": "media", "streamSid": stream_sid, "media": {"payload": payload}})
        return True

    if event_type in {"provider.transcript.delta", "provider.transcript.done"}:
        content = str(event.get("content") or "")
        if content and event.get("is_final"):
            db.add_transcript(session_id, str(event.get("speaker") or "assistant"), content, True)
        return True

    if event_type == "provider.error":
        message = str(event.get("message") or "Realtime provider returned an error.")
        db.add_log("error", "provider_error", message, {"session_id": session_id, "raw_type": raw_type})
        await session_manager.stop_session(session_id, EndReason.PROVIDER_ERROR, message)
        return False

    if event_type == "provider.tool_call.done":
        await _handle_tool_call(session_id, event, db=db, session_manager=session_manager, tool_registry=tool_registry, phone_manager=phone_manager)
        return True

    if raw_type in {"response.output_audio.done", "response.audio.done", "serverContent.turnComplete"} and session_manager.mark_agent_hangup_ready(session_id):
        await session_manager.stop_session(session_id, EndReason.AGENT_HUNG_UP)
        return False

    return True


async def _handle_tool_call(
    session_id: str,
    event: dict[str, Any],
    *,
    db: Database,
    session_manager: SessionManager,
    tool_registry: ToolRegistry,
    phone_manager: PhoneManager,
) -> None:
    tool_call_id = str(event.get("tool_call_id") or "")
    tool_name = str(event.get("tool_name") or "")
    raw_arguments = str(event.get("arguments") or "{}")
    if tool_call_id and not session_manager.mark_tool_call_handled(session_id, tool_call_id):
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
            if tool_name == "end_call":
                session_manager.request_agent_hangup(session_id)
            output = {"ok": True, "result": result}
        except Exception as exc:
            output = {"ok": False, "error": str(exc)}
            db.add_log("error", "tool_call_failed", str(exc), {"session_id": session_id, "tool_name": tool_name})

    if tool_call_id:
        await session_manager.send_tool_result(session_id, tool_call_id, output)
