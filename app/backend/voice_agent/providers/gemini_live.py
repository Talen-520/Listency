from __future__ import annotations

import asyncio
import base64
import json
from typing import Any
from urllib.parse import quote

import websockets

from voice_agent.providers.base import ProviderConfigError, ProviderEventCallback, ProviderSessionHandle


GEMINI_LIVE_BASE_URL = (
    "wss://generativelanguage.googleapis.com/ws/"
    "google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent"
)
DEFAULT_GEMINI_LIVE_MODEL = "gemini-3.1-flash-live-preview"
GEMINI_INPUT_SAMPLE_RATE = 16000
GEMINI_OUTPUT_SAMPLE_RATE = 24000
GEMINI_LIVE_VOICES = [
    "Zephyr",
    "Puck",
    "Charon",
    "Kore",
    "Fenrir",
    "Leda",
    "Orus",
    "Aoede",
    "Callirrhoe",
    "Autonoe",
    "Enceladus",
    "Iapetus",
    "Umbriel",
    "Algieba",
    "Despina",
    "Erinome",
    "Algenib",
    "Rasalgethi",
    "Laomedeia",
    "Achernar",
    "Alnilam",
    "Schedar",
    "Gacrux",
    "Pulcherrima",
    "Achird",
    "Zubenelgenubi",
    "Vindemiatrix",
    "Sadachbia",
    "Sadaltager",
    "Sulafat",
]


class GeminiLiveAdapter:
    name = "gemini"
    display_name = "Gemini Live"

    def validate_config(self, env: dict[str, str]) -> None:
        if not env.get("GEMINI_API_KEY"):
            raise ProviderConfigError("GEMINI_API_KEY is missing in .env")

    def list_voices(self, env: dict[str, str]) -> list[str]:
        return list(GEMINI_LIVE_VOICES)

    async def start_session(
        self,
        session_id: str,
        env: dict[str, str],
        session_config: dict[str, Any] | None = None,
        event_callback: ProviderEventCallback | None = None,
    ) -> ProviderSessionHandle:
        self.validate_config(env)

        model = env.get("GEMINI_LIVE_MODEL", DEFAULT_GEMINI_LIVE_MODEL).strip() or DEFAULT_GEMINI_LIVE_MODEL
        url = f"{GEMINI_LIVE_BASE_URL}?key={quote(env['GEMINI_API_KEY'], safe='')}"
        connection = await websockets.connect(url, max_size=None)

        handle = ProviderSessionHandle(
            provider=self.name,
            provider_session_id=f"gemini-{session_id}",
            metadata={
                "transport": "websocket",
                "model": model,
                "input_audio_format": f"audio/pcm;rate={GEMINI_INPUT_SAMPLE_RATE}",
                "output_audio_format": f"audio/pcm;rate={GEMINI_OUTPUT_SAMPLE_RATE}",
                "tool_call_names": {},
                "transcript_buffers": {"user": "", "assistant": ""},
            },
            connection=connection,
        )
        handle.listener_task = asyncio.create_task(self._listen(handle, event_callback))
        await connection.send(json.dumps(self._config_message(env, session_config)))
        return handle

    async def send_audio(self, handle: ProviderSessionHandle, pcm16_chunk: bytes) -> None:
        if handle.connection is None:
            return
        await handle.connection.send(json.dumps(self._audio_chunk_message(pcm16_chunk)))

    async def send_tool_result(self, handle: ProviderSessionHandle, tool_call_id: str, output: dict[str, Any]) -> None:
        if handle.connection is None:
            return

        tool_call_names = handle.metadata.get("tool_call_names")
        tool_name = ""
        if isinstance(tool_call_names, dict):
            tool_name = str(tool_call_names.get(tool_call_id) or "")
        await handle.connection.send(
            json.dumps(
                {
                    "toolResponse": {
                        "functionResponses": [
                            {
                                "id": tool_call_id,
                                "name": tool_name,
                                "response": output,
                            }
                        ]
                    }
                },
                ensure_ascii=False,
            )
        )

    async def close_session(self, handle: ProviderSessionHandle) -> None:
        if handle.listener_task:
            handle.listener_task.cancel()
        if handle.connection is not None:
            await handle.connection.close()

    def _config_message(self, env: dict[str, str], session_config: dict[str, Any] | None) -> dict[str, Any]:
        model = env.get("GEMINI_LIVE_MODEL", DEFAULT_GEMINI_LIVE_MODEL).strip() or DEFAULT_GEMINI_LIVE_MODEL
        instructions = str((session_config or {}).get("instructions") or "").strip()
        voice = env.get("DEFAULT_VOICE", "").strip()

        config: dict[str, Any] = {
            "model": self._model_resource(model),
            "responseModalities": ["AUDIO"],
            "inputAudioTranscription": {},
            "outputAudioTranscription": {},
        }
        if instructions:
            config["systemInstruction"] = {"parts": [{"text": instructions}]}
        if voice and voice.lower() != "default":
            config["speechConfig"] = {
                "voiceConfig": {
                    "prebuiltVoiceConfig": {
                        "voiceName": voice,
                    }
                }
            }

        tools = self._gemini_tools(list((session_config or {}).get("tools") or []))
        if tools:
            config["tools"] = tools

        return {"config": config}

    def _audio_chunk_message(self, pcm16_chunk: bytes) -> dict[str, Any]:
        return {
            "realtimeInput": {
                "audio": {
                    "data": base64.b64encode(pcm16_chunk).decode("ascii"),
                    "mimeType": f"audio/pcm;rate={GEMINI_INPUT_SAMPLE_RATE}",
                }
            }
        }

    def _gemini_tools(self, tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
        declarations = []
        for tool in tools:
            name = str(tool.get("name") or "").strip()
            if not name:
                continue
            declaration: dict[str, Any] = {
                "name": name,
                "description": str(tool.get("description") or ""),
            }
            parameters = tool.get("parameters")
            if isinstance(parameters, dict) and parameters:
                declaration["parameters"] = self._sanitize_schema(parameters)
            declarations.append(declaration)
        return [{"functionDeclarations": declarations}] if declarations else []

    def _sanitize_schema(self, schema: dict[str, Any]) -> dict[str, Any]:
        allowed_keys = {"type", "properties", "required", "description", "items", "enum", "nullable"}
        output: dict[str, Any] = {}
        for key, value in schema.items():
            if key not in allowed_keys:
                continue
            if key == "properties" and isinstance(value, dict):
                output[key] = {
                    property_name: self._sanitize_schema(property_schema)
                    for property_name, property_schema in value.items()
                    if isinstance(property_schema, dict)
                }
            elif isinstance(value, dict):
                output[key] = self._sanitize_schema(value)
            elif isinstance(value, list):
                output[key] = [self._sanitize_schema(item) if isinstance(item, dict) else item for item in value]
            else:
                output[key] = value
        return output

    def _model_resource(self, model: str) -> str:
        return model if model.startswith("models/") else f"models/{model}"

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
                    if isinstance(raw_message, bytes):
                        raw_message = raw_message.decode("utf-8")
                    provider_event = json.loads(raw_message)
                except (UnicodeDecodeError, json.JSONDecodeError):
                    provider_event = {"rawMessage": str(raw_message)}
                events = self._normalize_events(handle, provider_event)
                if event_callback:
                    for event in events:
                        await event_callback(event)
        except asyncio.CancelledError:
            return
        except Exception as exc:
            if event_callback:
                await event_callback({"type": "provider.error", "provider": self.name, "message": str(exc)})

    def _normalize_events(self, handle: ProviderSessionHandle, event: dict[str, Any]) -> list[dict[str, Any]]:
        events: list[dict[str, Any]] = []

        if "error" in event:
            error = event.get("error")
            message = error.get("message") if isinstance(error, dict) else str(error)
            events.append(
                {
                    "type": "provider.error",
                    "provider": self.name,
                    "raw_type": "error",
                    "message": message,
                    "code": error.get("code") if isinstance(error, dict) else None,
                    "error_type": error.get("status") if isinstance(error, dict) else None,
                }
            )

        if "setupComplete" in event:
            events.append({"type": "provider.setup_complete", "provider": self.name, "raw_type": "setupComplete"})

        server_content = event.get("serverContent")
        if isinstance(server_content, dict):
            events.extend(self._normalize_server_content(handle, server_content))

        tool_call = event.get("toolCall")
        if isinstance(tool_call, dict):
            events.extend(self._normalize_tool_call(handle, tool_call))

        go_away = event.get("goAway")
        if isinstance(go_away, dict):
            events.append(
                {
                    "type": "provider.go_away",
                    "provider": self.name,
                    "raw_type": "goAway",
                    "time_left": go_away.get("timeLeft"),
                }
            )

        if not events:
            events.append({"type": "provider.event", "provider": self.name, "raw_type": "provider.event"})
        return events

    def _normalize_server_content(self, handle: ProviderSessionHandle, server_content: dict[str, Any]) -> list[dict[str, Any]]:
        events: list[dict[str, Any]] = []

        model_turn = server_content.get("modelTurn")
        if isinstance(model_turn, dict):
            parts = model_turn.get("parts")
            if isinstance(parts, list):
                for part in parts:
                    if not isinstance(part, dict):
                        continue
                    inline_data = part.get("inlineData")
                    if isinstance(inline_data, dict) and inline_data.get("data"):
                        events.append(
                            {
                                "type": "provider.output_audio.delta",
                                "provider": self.name,
                                "raw_type": "serverContent.modelTurn.inlineData",
                                "audio": inline_data.get("data", ""),
                                "format": "pcm16",
                                "sample_rate": GEMINI_OUTPUT_SAMPLE_RATE,
                            }
                        )
                    text = str(part.get("text") or "")
                    if text:
                        self._append_transcript(handle, "assistant", text)
                        events.append(self._transcript_delta("assistant", text, "serverContent.modelTurn.text"))

        input_text = self._transcription_text(server_content.get("inputTranscription"))
        if input_text:
            self._append_transcript(handle, "user", input_text)
            events.append(self._transcript_delta("user", input_text, "serverContent.inputTranscription"))

        output_text = self._transcription_text(server_content.get("outputTranscription"))
        if output_text:
            self._append_transcript(handle, "assistant", output_text)
            events.append(self._transcript_delta("assistant", output_text, "serverContent.outputTranscription"))

        if server_content.get("interrupted"):
            events.append({"type": "provider.interrupted", "provider": self.name, "raw_type": "serverContent.interrupted"})

        if server_content.get("generationComplete"):
            events.append(
                {
                    "type": "provider.generation_complete",
                    "provider": self.name,
                    "raw_type": "serverContent.generationComplete",
                }
            )

        if server_content.get("turnComplete"):
            events.extend(self._flush_transcripts(handle))
            events.append({"type": "provider.turn_complete", "provider": self.name, "raw_type": "serverContent.turnComplete"})

        return events

    def _normalize_tool_call(self, handle: ProviderSessionHandle, tool_call: dict[str, Any]) -> list[dict[str, Any]]:
        function_calls = tool_call.get("functionCalls")
        if not isinstance(function_calls, list):
            return []

        events: list[dict[str, Any]] = []
        tool_call_names = handle.metadata.setdefault("tool_call_names", {})
        for index, function_call in enumerate(function_calls):
            if not isinstance(function_call, dict):
                continue
            name = str(function_call.get("name") or "")
            tool_call_id = str(function_call.get("id") or f"gemini_{name}_{index}")
            if isinstance(tool_call_names, dict):
                tool_call_names[tool_call_id] = name
            args = function_call.get("args") or {}
            if not isinstance(args, dict):
                args = {"_raw_arguments": args}
            events.append(
                {
                    "type": "provider.tool_call.done",
                    "provider": self.name,
                    "raw_type": "toolCall",
                    "tool_call_id": tool_call_id,
                    "tool_name": name,
                    "arguments": json.dumps(args, ensure_ascii=False),
                }
            )
        return events

    def _transcription_text(self, payload: Any) -> str:
        if not isinstance(payload, dict):
            return ""
        return str(payload.get("text") or "")

    def _append_transcript(self, handle: ProviderSessionHandle, speaker: str, content: str) -> None:
        buffers = handle.metadata.setdefault("transcript_buffers", {"user": "", "assistant": ""})
        if isinstance(buffers, dict):
            buffers[speaker] = str(buffers.get(speaker) or "") + content

    def _flush_transcripts(self, handle: ProviderSessionHandle) -> list[dict[str, Any]]:
        buffers = handle.metadata.setdefault("transcript_buffers", {"user": "", "assistant": ""})
        if not isinstance(buffers, dict):
            return []

        events: list[dict[str, Any]] = []
        for speaker in ("user", "assistant"):
            content = str(buffers.get(speaker) or "").strip()
            if not content:
                continue
            events.append(
                {
                    "type": "provider.transcript.done",
                    "provider": self.name,
                    "raw_type": "serverContent.turnComplete",
                    "speaker": speaker,
                    "content": content,
                    "is_final": True,
                }
            )
            buffers[speaker] = ""
        return events

    def _transcript_delta(self, speaker: str, content: str, raw_type: str) -> dict[str, Any]:
        return {
            "type": "provider.transcript.delta",
            "provider": self.name,
            "raw_type": raw_type,
            "speaker": speaker,
            "content": content,
            "is_final": False,
        }
