from __future__ import annotations

import asyncio
from dataclasses import dataclass
from collections.abc import Awaitable, Callable
from typing import Any, Protocol


class ProviderConfigError(RuntimeError):
    """Raised when a provider is missing required local configuration."""


ProviderEventCallback = Callable[[dict[str, Any]], Awaitable[None]]


@dataclass(slots=True)
class ProviderSessionHandle:
    provider: str
    provider_session_id: str
    metadata: dict[str, Any]
    connection: Any | None = None
    listener_task: asyncio.Task[None] | None = None


class RealtimeProviderAdapter(Protocol):
    name: str
    display_name: str

    def validate_config(self, env: dict[str, str]) -> None:
        ...

    def list_voices(self, env: dict[str, str]) -> list[str]:
        ...

    async def start_session(
        self,
        session_id: str,
        env: dict[str, str],
        session_config: dict[str, Any] | None = None,
        event_callback: ProviderEventCallback | None = None,
    ) -> ProviderSessionHandle:
        ...

    async def send_audio(self, handle: ProviderSessionHandle, pcm16_chunk: bytes) -> None:
        ...

    async def close_session(self, handle: ProviderSessionHandle) -> None:
        ...
