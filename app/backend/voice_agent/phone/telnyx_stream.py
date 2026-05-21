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


async def handle_telnyx_media_stream(
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
    stream_id = ""
    provider_call_id = ""
    call_end_reason = EndReason.CALLER_HUNG_UP
    call_end_error: str | None = None
    try:
        while True:
            receive_task = asyncio.create_task(websocket.receive_text())
            provider_task = asyncio.create_task(session_manager.next_provider_event(session_id)) if session_id else None
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
                keep_open, end_reason = await _handle_provider_event(
                    websocket,
                    session_id,
                    provider_event,
                    stream_id,
                    db=db,
                    session_manager=session_manager,
                    tool_registry=tool_registry,
                    phone_manager=phone_manager,
                )
                if not keep_open:
                    call_end_reason = end_reason or call_end_reason
                    break
                continue

            message = receive_task.result()
            keep_open, session_id, phone_call_id, stream_id, provider_call_id, end_reason = await _handle_telnyx_event(
                message,
                session_id=session_id,
                phone_call_id=phone_call_id,
                stream_id=stream_id,
                provider_call_id=provider_call_id,
                db=db,
                session_manager=session_manager,
                phone_manager=phone_manager,
            )
            call_end_reason = end_reason or call_end_reason
            if not keep_open:
                break
    except WebSocketDisconnect:
        db.add_log("info", "telnyx_media_disconnected", "Telnyx media stream disconnected.", {"session_id": session_id})
    except Exception as exc:
        call_end_reason = EndReason.PROVIDER_ERROR
        call_end_error = str(exc)
        db.add_log("error", "telnyx_media_error", call_end_error, {"session_id": session_id})
    finally:
        if session_id and session_manager.get_active_session(session_id):
            await session_manager.stop_session(session_id, call_end_reason, call_end_error)
        await phone_manager.finish_phone_call(
            phone_call_id,
            status=_phone_call_status_for_end_reason(call_end_reason),
            ended_reason=call_end_reason,
            error_message=call_end_error,
        )


async def _handle_telnyx_event(
    message: str,
    *,
    session_id: str | None,
    phone_call_id: int | None,
    stream_id: str,
    provider_call_id: str,
    db: Database,
    session_manager: SessionManager,
    phone_manager: PhoneManager,
) -> tuple[bool, str | None, int | None, str, str, str | None]:
    event = json.loads(message)
    event_type = str(event.get("event") or event.get("type") or "")

    if event_type == "connected":
        db.add_log("info", "telnyx_media_connected", "Telnyx media stream connected.")
        return True, session_id, phone_call_id, stream_id, provider_call_id, None

    if event_type == "start":
        start = event.get("start") or {}
        stream_id = str(start.get("stream_id") or start.get("streamId") or event.get("stream_id") or event.get("streamId") or "")
        provider_call_id = str(
            start.get("call_control_id")
            or start.get("callControlId")
            or start.get("call_session_id")
            or start.get("callSessionId")
            or event.get("call_control_id")
            or event.get("callControlId")
            or provider_call_id
        )
        custom = _custom_parameters(start)
        from_number = str(custom.get("from") or start.get("from") or "")
        to_number = str(custom.get("to") or start.get("to") or "")
        started = await phone_manager.start_phone_session(
            phone_provider="telnyx",
            provider_call_id=provider_call_id,
            from_number=from_number,
            to_number=to_number,
        )
        session_id = str(started["session"]["id"])
        phone_call_id = int(started["phone_call_id"])
        if stream_id:
            db.update_phone_call_stream(phone_call_id, stream_id)
        db.add_log(
            "info",
            "telnyx_call_started",
            "Inbound Telnyx call connected to Listency.",
            {"session_id": session_id, "phone_call_id": phone_call_id, "call_control_id": provider_call_id},
        )
        return True, session_id, phone_call_id, stream_id, provider_call_id, None

    if event_type == "media" and session_id:
        media = event.get("media") or {}
        payload = str(media.get("payload") or "")
        if payload:
            try:
                pcm8k = mulaw_to_pcm16(base64.b64decode(payload))
                active = session_manager.get_active_session(session_id)
                target_rate = _provider_input_rate(active.provider if active else "openai")
                pcm = resample_pcm16_mono(pcm8k, 8000, target_rate)
                await session_manager.receive_audio_chunk(session_id, pcm)
            except Exception as exc:
                message_text = str(exc) or "Telnyx audio delivery failed."
                db.add_log("error", "telnyx_audio_delivery_failed", message_text, {"session_id": session_id})
                await session_manager.stop_session(session_id, EndReason.NETWORK_ERROR, message_text)
                return False, session_id, phone_call_id, stream_id, provider_call_id, EndReason.NETWORK_ERROR
        return True, session_id, phone_call_id, stream_id, provider_call_id, None

    if event_type in {"stop", "closed"}:
        if session_id:
            await session_manager.stop_session(session_id, EndReason.CALLER_HUNG_UP)
        return False, session_id, phone_call_id, stream_id, provider_call_id, EndReason.CALLER_HUNG_UP

    if event_type == "error":
        message_text = str(event.get("message") or "Telnyx media stream returned an error.")
        db.add_log("error", "telnyx_media_provider_error", message_text, {"session_id": session_id, "raw": event})
        if session_id:
            await session_manager.stop_session(session_id, EndReason.PROVIDER_ERROR, message_text)
        return False, session_id, phone_call_id, stream_id, provider_call_id, EndReason.PROVIDER_ERROR

    return True, session_id, phone_call_id, stream_id, provider_call_id, None


async def _handle_provider_event(
    websocket: WebSocket,
    session_id: str,
    event: dict[str, Any],
    stream_id: str,
    *,
    db: Database,
    session_manager: SessionManager,
    tool_registry: ToolRegistry,
    phone_manager: PhoneManager,
) -> tuple[bool, str | None]:
    event = {"session_id": session_id, **event}
    event_type = str(event.get("type") or "")
    raw_type = str(event.get("raw_type") or event_type)
    if event_type == "session.ended":
        return False, str(event.get("ended_reason") or "")

    if event_type == "provider.output_audio.delta" and stream_id:
        audio = str(event.get("audio") or "")
        sample_rate = int(event.get("sample_rate") or 24000)
        if audio:
            pcm = base64.b64decode(audio)
            pcm8k = resample_pcm16_mono(pcm, sample_rate, 8000)
            payload = base64.b64encode(pcm16_to_mulaw(pcm8k)).decode("ascii")
            await websocket.send_json({"event": "media", "media": {"payload": payload}})
        return True, None

    if event_type in {"provider.transcript.delta", "provider.transcript.done"}:
        content = str(event.get("content") or "")
        if content and event.get("is_final"):
            db.add_transcript(session_id, str(event.get("speaker") or "assistant"), content, True)
        return True, None

    if event_type == "provider.error":
        message = str(event.get("message") or "Realtime provider returned an error.")
        db.add_log("error", "provider_error", message, {"session_id": session_id, "raw_type": raw_type})
        await session_manager.stop_session(session_id, EndReason.PROVIDER_ERROR, message)
        return False, EndReason.PROVIDER_ERROR

    if event_type == "provider.disconnected":
        message = str(event.get("message") or "Realtime provider connection closed.")
        db.add_log("warning", "provider_disconnected", message, {"session_id": session_id, "raw_type": raw_type})
        reconnected = await session_manager.reconnect_provider_session(session_id, message)
        return reconnected, None if reconnected else EndReason.NETWORK_ERROR

    if event_type in {"provider.reconnecting", "provider.reconnected"}:
        db.add_log("info", str(event_type).replace(".", "_"), str(event.get("message") or event_type), {"session_id": session_id})
        return True, None

    if event_type == "provider.tool_call.done":
        await _handle_tool_call(session_id, event, db=db, session_manager=session_manager, tool_registry=tool_registry, phone_manager=phone_manager)
        return True, None

    if raw_type in {"response.output_audio.done", "response.audio.done", "serverContent.turnComplete"} and session_manager.mark_agent_hangup_ready(session_id):
        await session_manager.stop_session(session_id, EndReason.AGENT_HUNG_UP)
        return False, EndReason.AGENT_HUNG_UP

    return True, None


def _custom_parameters(start: dict[str, Any]) -> dict[str, str]:
    parameters = start.get("custom_parameters") or start.get("customParameters") or {}
    if isinstance(parameters, dict):
        return {str(key): str(value) for key, value in parameters.items()}
    if isinstance(parameters, list):
        output: dict[str, str] = {}
        for item in parameters:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name") or "")
            if name:
                output[name] = str(item.get("value") or "")
        return output
    return {}


def _phone_call_status_for_end_reason(reason: str) -> str:
    if reason in {EndReason.PROVIDER_ERROR, EndReason.NETWORK_ERROR}:
        return "failed"
    if reason == EndReason.CALLER_HUNG_UP:
        return "caller_hung_up"
    return "completed"


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
