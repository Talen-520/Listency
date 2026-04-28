from __future__ import annotations

from voice_agent.providers.base import ProviderConfigError, ProviderSessionHandle


class GeminiLiveAdapter:
    name = "gemini"
    display_name = "Gemini Live"

    def validate_config(self, env: dict[str, str]) -> None:
        if not env.get("GEMINI_API_KEY"):
            raise ProviderConfigError("GEMINI_API_KEY is missing in .env")

    def list_voices(self, env: dict[str, str]) -> list[str]:
        configured = env.get("DEFAULT_VOICE", "").strip()
        return [configured] if configured else ["default"]

    async def start_session(self, session_id: str, env: dict[str, str]) -> ProviderSessionHandle:
        self.validate_config(env)
        return ProviderSessionHandle(
            provider=self.name,
            provider_session_id=f"gemini-local-{session_id}",
            metadata={
                "transport": "pending_live_audio_stream",
                "note": "Provider adapter boundary is ready; live audio transport is the next implementation step.",
            },
        )

    async def close_session(self, handle: ProviderSessionHandle) -> None:
        return None
