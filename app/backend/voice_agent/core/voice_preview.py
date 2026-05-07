from __future__ import annotations

import asyncio
import base64
import io
import json
import re
import urllib.error
import urllib.request
import wave
from pathlib import Path
from typing import Any

from voice_agent.config.env_store import EnvStore
from voice_agent.config.paths import data_dir
from voice_agent.providers.base import ProviderConfigError, RealtimeProviderAdapter


DEFAULT_PREVIEW_TEXT = "Hello, this is your local voice assistant."
GEMINI_TTS_MODEL = "gemini-3.1-flash-tts-preview"
OPENAI_TTS_MODEL = "gpt-4o-mini-tts"


class VoicePreviewService:
    def __init__(
        self,
        env_store: EnvStore,
        providers: dict[str, RealtimeProviderAdapter],
        cache_root: Path | None = None,
    ) -> None:
        self.env_store = env_store
        self.providers = providers
        self.cache_root = cache_root or data_dir() / "voice_previews"

    def cached_voices(self) -> dict[str, list[str]]:
        return {
            provider: self._cached_provider_voices(provider)
            for provider in self.providers
        }

    async def ensure_preview(self, provider: str, voice: str, text: str | None = None) -> dict[str, Any]:
        provider = provider.strip().lower()
        voice = voice.strip()
        preview_file = self.preview_file(provider, voice)
        if preview_file.exists():
            return self._metadata(provider, voice, cached=True)

        env = self.env_store.read()
        self._validate(provider, voice, env)
        preview_file.parent.mkdir(parents=True, exist_ok=True)

        preview_text = (text or DEFAULT_PREVIEW_TEXT).strip() or DEFAULT_PREVIEW_TEXT
        if provider == "openai":
            audio = await asyncio.to_thread(self._generate_openai_preview, env, voice, preview_text)
        elif provider == "gemini":
            audio = await asyncio.to_thread(self._generate_gemini_preview, env, voice, preview_text)
        else:
            raise ProviderConfigError(f"Unsupported voice preview provider: {provider}")

        preview_file.write_bytes(audio)
        return self._metadata(provider, voice, cached=False)

    def preview_file(self, provider: str, voice: str) -> Path:
        safe_voice = self._safe_segment(voice)
        if not safe_voice:
            raise ProviderConfigError("Voice is required for preview.")
        return self.cache_root / self._safe_segment(provider) / f"{safe_voice}.wav"

    def _metadata(self, provider: str, voice: str, cached: bool) -> dict[str, Any]:
        return {
            "provider": provider,
            "voice": voice,
            "cached": cached,
            "content_type": "audio/wav",
            "audio_url": f"/voice-previews/{provider}/{self._safe_segment(voice)}",
        }

    def _validate(self, provider: str, voice: str, env: dict[str, str]) -> None:
        adapter = self.providers.get(provider)
        if not adapter:
            raise ProviderConfigError(f"Unsupported provider: {provider}")
        voices = adapter.list_voices(env)
        if voice not in voices:
            raise ProviderConfigError(f"Unsupported {provider} voice: {voice}")
        if provider == "openai" and not env.get("OPENAI_API_KEY"):
            raise ProviderConfigError("OPENAI_API_KEY is missing in .env")
        if provider == "gemini" and not env.get("GEMINI_API_KEY"):
            raise ProviderConfigError("GEMINI_API_KEY is missing in .env")

    def _generate_openai_preview(self, env: dict[str, str], voice: str, text: str) -> bytes:
        payload = {
            "model": OPENAI_TTS_MODEL,
            "voice": voice,
            "input": text,
            "response_format": "wav",
        }
        request = urllib.request.Request(
            "https://api.openai.com/v1/audio/speech",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {env['OPENAI_API_KEY']}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        return self._read_http_response(request)

    def _generate_gemini_preview(self, env: dict[str, str], voice: str, text: str) -> bytes:
        payload = {
            "contents": [{"parts": [{"text": text}]}],
            "generationConfig": {
                "responseModalities": ["AUDIO"],
                "speechConfig": {
                    "voiceConfig": {
                        "prebuiltVoiceConfig": {
                            "voiceName": voice,
                        }
                    }
                },
            },
            "model": GEMINI_TTS_MODEL,
        }
        request = urllib.request.Request(
            f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_TTS_MODEL}:generateContent",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "x-goog-api-key": env["GEMINI_API_KEY"],
                "Content-Type": "application/json",
            },
            method="POST",
        )
        response = json.loads(self._read_http_response(request).decode("utf-8"))
        inline_data = (
            response.get("candidates", [{}])[0]
            .get("content", {})
            .get("parts", [{}])[0]
            .get("inlineData", {})
        )
        raw_audio = inline_data.get("data")
        if not raw_audio:
            raise ProviderConfigError("Gemini TTS did not return audio data.")
        return self._wav_bytes(base64.b64decode(raw_audio), rate=24000)

    def _read_http_response(self, request: urllib.request.Request) -> bytes:
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                return response.read()
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            message = body
            try:
                parsed = json.loads(body)
                error = parsed.get("error")
                if isinstance(error, dict):
                    message = str(error.get("message") or body)
            except json.JSONDecodeError:
                pass
            raise ProviderConfigError(f"Voice preview request failed: {message}") from exc
        except urllib.error.URLError as exc:
            raise ProviderConfigError(f"Voice preview request failed: {exc.reason}") from exc

    def _cached_provider_voices(self, provider: str) -> list[str]:
        provider_dir = self.cache_root / self._safe_segment(provider)
        if not provider_dir.exists():
            return []
        return sorted(path.stem for path in provider_dir.glob("*.wav") if path.is_file())

    def _safe_segment(self, value: str) -> str:
        return re.sub(r"[^A-Za-z0-9_-]", "", value.strip())

    def _wav_bytes(self, pcm: bytes, rate: int = 24000) -> bytes:
        output = io.BytesIO()
        with wave.open(output, "wb") as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(rate)
            wav_file.writeframes(pcm)
        return output.getvalue()
