from __future__ import annotations

import asyncio
import base64
import json
from typing import Any

import websockets

from voice_agent.providers.base import ProviderConfigError, ProviderEventCallback, ProviderSessionHandle


OPENAI_REALTIME_BASE_URL = "wss://api.openai.com/v1/realtime"
OPENAI_REALTIME_VOICES = [
    "alloy",
    "ash",
    "ballad",
    "coral",
    "echo",
    "sage",
    "shimmer",
    "verse",
    "marin",
    "cedar",
]


class OpenAIRealtimeAdapter:
    name = "openai"
    display_name = "OpenAI Realtime"

    def validate_config(self, env: dict[str, str]) -> None:
        if env.get("OPENAI_REALTIME_MOCK", "").lower() in {"1", "true", "yes"}:
            return
        if not env.get("OPENAI_API_KEY"):
            raise ProviderConfigError("OPENAI_API_KEY is missing in .env")

    def list_voices(self, env: dict[str, str]) -> list[str]:
        return list(OPENAI_REALTIME_VOICES)

    async def start_session(
        self,
        session_id: str,
        env: dict[str, str],
        session_config: dict[str, Any] | None = None,
        event_callback: ProviderEventCallback | None = None,
    ) -> ProviderSessionHandle:
        self.validate_config(env)

        if env.get("OPENAI_REALTIME_MOCK", "").lower() in {"1", "true", "yes"}:
            return ProviderSessionHandle(
                provider=self.name,
                provider_session_id=f"openai-mock-{session_id}",
                metadata={
                    "transport": "mock",
                    "note": "OPENAI_REALTIME_MOCK is enabled; no remote OpenAI connection was created.",
                },
            )

        model = env.get("OPENAI_REALTIME_MODEL", "gpt-realtime-2").strip() or "gpt-realtime-2"
        url = f"{OPENAI_REALTIME_BASE_URL}?model={model}"
        connection = await websockets.connect(
            url,
            additional_headers={"Authorization": f"Bearer {env['OPENAI_API_KEY']}"},
            max_size=None,
        )

        handle = ProviderSessionHandle(
            provider=self.name,
            provider_session_id=f"openai-{session_id}",
            metadata={
                "transport": "websocket",
                "model": model,
                "input_audio_format": "audio/pcm;rate=24000",
                "output_audio_format": "audio/pcm;rate=24000",
            },
            connection=connection,
        )
        handle.listener_task = asyncio.create_task(self._listen(handle, event_callback))
        await connection.send(json.dumps(self._session_update(env, session_config)))
        return handle

    async def send_audio(self, handle: ProviderSessionHandle, pcm16_chunk: bytes) -> None:
        if handle.connection is None:
            return
        await handle.connection.send(
            json.dumps(
                {
                    "type": "input_audio_buffer.append",
                    "audio": base64.b64encode(pcm16_chunk).decode("ascii"),
                }
            )
        )

    async def send_tool_result(self, handle: ProviderSessionHandle, tool_call_id: str, output: dict[str, Any]) -> None:
        if handle.connection is None:
            return
        await handle.connection.send(
            json.dumps(
                {
                    "type": "conversation.item.create",
                    "item": {
                        "type": "function_call_output",
                        "call_id": tool_call_id,
                        "output": json.dumps(output, ensure_ascii=False),
                    },
                }
            )
        )
        await handle.connection.send(json.dumps({"type": "response.create"}))

    async def close_session(self, handle: ProviderSessionHandle) -> None:
        if handle.listener_task:
            handle.listener_task.cancel()
        if handle.connection is not None:
            await handle.connection.close()

    def _session_update(self, env: dict[str, str], session_config: dict[str, Any] | None) -> dict[str, Any]:
        instructions = str((session_config or {}).get("instructions") or "").strip()
        voice = self._voice(env)
        output: dict[str, Any] = {
            "format": {
                "type": "audio/pcm",
                "rate": 24000,
            },
        }
        if voice:
            output["voice"] = voice
        session: dict[str, Any] = {
            "type": "realtime",
            "output_modalities": ["audio"],
            "tool_choice": "auto",
            "reasoning": {
                "effort": "low",
            },
            "audio": {
                "input": {
                    "format": {
                        "type": "audio/pcm",
                        "rate": 24000,
                    },
                    "transcription": {
                        "model": "gpt-4o-transcribe",
                    },
                    "turn_detection": {
                        "type": "server_vad",
                        "threshold": 0.5,
                        "prefix_padding_ms": 300,
                        "silence_duration_ms": 500,
                        "create_response": True,
                        "interrupt_response": True,
                    },
                },
                "output": output,
            },
        }
        tools = list((session_config or {}).get("tools") or [])
        if tools:
            session["tools"] = tools
        if instructions:
            session["instructions"] = instructions
        return {"type": "session.update", "session": session}

    def _voice(self, env: dict[str, str]) -> str:
        return env.get("OPENAI_DEFAULT_VOICE", "").strip() or env.get("DEFAULT_VOICE", "").strip()

    async def _listen(
        self,
        handle: ProviderSessionHandle,
        event_callback: ProviderEventCallback | None,
    ) -> None:
        if handle.connection is None:
            return
        try:
            async for raw_message in handle.connection:
                try:
                    provider_event = json.loads(raw_message)
                except json.JSONDecodeError:
                    provider_event = {"type": "provider.raw", "message": str(raw_message)}
                event = self._normalize_event(provider_event)
                if event_callback:
                    await event_callback(event)
        except asyncio.CancelledError:
            return
        except Exception as exc:
            if event_callback:
                await event_callback({"type": "provider.error", "provider": self.name, "message": str(exc)})

    def _normalize_event(self, event: dict[str, Any]) -> dict[str, Any]:
        event_type = str(event.get("type", "provider.event"))
        normalized: dict[str, Any] = {
            "type": f"provider.{event_type}",
            "provider": self.name,
            "raw_type": event_type,
        }

        if event_type in {"response.output_audio.delta", "response.audio.delta"}:
            normalized.update(
                {
                    "type": "provider.output_audio.delta",
                    "audio": event.get("delta", ""),
                    "format": "pcm16",
                    "sample_rate": 24000,
                }
            )
        elif event_type in {
            "response.output_audio_transcript.delta",
            "response.audio_transcript.delta",
            "response.output_text.delta",
            "response.text.delta",
        }:
            normalized.update(
                {
                    "type": "provider.transcript.delta",
                    "speaker": "assistant",
                    "content": event.get("delta", ""),
                    "is_final": False,
                }
            )
        elif event_type in {
            "response.output_audio_transcript.done",
            "response.audio_transcript.done",
            "response.output_text.done",
            "response.text.done",
        }:
            normalized.update(
                {
                    "type": "provider.transcript.done",
                    "speaker": "assistant",
                    "content": event.get("transcript") or event.get("text") or "",
                    "is_final": True,
                }
            )
        elif event_type in {
            "conversation.item.input_audio_transcription.delta",
            "input_audio_transcription.delta",
        }:
            normalized.update(
                {
                    "type": "provider.transcript.delta",
                    "speaker": "user",
                    "content": event.get("delta", ""),
                    "is_final": False,
                }
            )
        elif event_type in {
            "conversation.item.input_audio_transcription.completed",
            "conversation.item.input_audio_transcription.done",
            "input_audio_transcription.completed",
            "input_audio_transcription.done",
        }:
            normalized.update(
                {
                    "type": "provider.transcript.done",
                    "speaker": "user",
                    "content": event.get("transcript") or "",
                    "is_final": True,
                }
            )
        elif event_type == "response.function_call_arguments.done":
            normalized.update(
                {
                    "type": "provider.tool_call.done",
                    "tool_call_id": event.get("call_id", ""),
                    "tool_name": event.get("name", ""),
                    "arguments": event.get("arguments", "{}"),
                }
            )
        elif event_type == "conversation.item.done":
            item = event.get("item") or {}
            if isinstance(item, dict) and item.get("type") == "function_call":
                normalized.update(
                    {
                        "type": "provider.tool_call.done",
                        "tool_call_id": item.get("call_id", ""),
                        "tool_name": item.get("name", ""),
                        "arguments": item.get("arguments", "{}"),
                    }
                )
        elif event_type == "error":
            error = event.get("error") or {}
            normalized.update(
                {
                    "type": "provider.error",
                    "message": error.get("message") if isinstance(error, dict) else str(error),
                    "code": error.get("code") if isinstance(error, dict) else None,
                    "error_type": error.get("type") if isinstance(error, dict) else None,
                    "param": error.get("param") if isinstance(error, dict) else None,
                }
            )
        return normalized
