from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Protocol

from voice_agent.tunnel import TunnelStatus


class PhoneConfigError(RuntimeError):
    """Raised when a phone provider cannot be configured safely."""


@dataclass(slots=True)
class PhoneProvisionResult:
    provider: str
    status: str
    message: str
    public_base_url: str = ""
    inbound_url: str = ""
    media_url: str = ""

    def public_dict(self) -> dict[str, str]:
        return asdict(self)


class PhoneProviderAdapter(Protocol):
    name: str
    display_name: str

    def validate_config(self, env: dict[str, str]) -> None:
        ...

    async def provision(self, env: dict[str, str], tunnel: TunnelStatus) -> PhoneProvisionResult:
        ...

    async def transfer_call(self, env: dict[str, str], provider_call_id: str, target: str, reason: str = "") -> dict[str, str]:
        ...

    async def hangup_call(self, env: dict[str, str], provider_call_id: str, reason: str = "") -> dict[str, str]:
        ...
