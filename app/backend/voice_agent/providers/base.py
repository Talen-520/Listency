from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol


class ProviderConfigError(RuntimeError):
    """Raised when a provider is missing required local configuration."""


@dataclass(frozen=True, slots=True)
class ProviderSessionHandle:
    provider: str
    provider_session_id: str
    metadata: dict[str, Any]


class RealtimeProviderAdapter(Protocol):
    name: str
    display_name: str

    def validate_config(self, env: dict[str, str]) -> None:
        ...

    def list_voices(self, env: dict[str, str]) -> list[str]:
        ...

    async def start_session(self, session_id: str, env: dict[str, str]) -> ProviderSessionHandle:
        ...

    async def close_session(self, handle: ProviderSessionHandle) -> None:
        ...
