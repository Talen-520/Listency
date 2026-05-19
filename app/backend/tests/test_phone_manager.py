from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from voice_agent.config.env_store import EnvStore
from voice_agent.phone.base import PhoneProvisionResult
from voice_agent.phone.manager import PhoneManager
from voice_agent.storage.database import Database
from voice_agent.tunnel import TunnelStatus


class FakeTunnelManager:
    def __init__(self, status: TunnelStatus) -> None:
        self._status = status

    def status(self, env: dict[str, str]) -> TunnelStatus:
        return self._status

    async def start(self, env: dict[str, str]) -> TunnelStatus:
        return self._status

    async def stop(self) -> TunnelStatus:
        return TunnelStatus(mode="automatic", status="stopped")


class FakePhoneProvider:
    def __init__(self) -> None:
        self.provision_count = 0

    def validate_config(self, env: dict[str, str]) -> None:
        return None

    async def provision(self, env: dict[str, str], tunnel: TunnelStatus) -> PhoneProvisionResult:
        self.provision_count += 1
        return PhoneProvisionResult(
            provider="twilio",
            status="configured",
            message="configured",
            public_base_url=tunnel.public_base_url,
            inbound_url=f"{tunnel.public_base_url}/phone/twilio/inbound",
            media_url=f"{tunnel.public_ws_url}/phone/twilio/media",
        )


def create_manager(root: Path, tunnel: TunnelStatus) -> tuple[PhoneManager, EnvStore, FakePhoneProvider]:
    db = Database(root / "test.sqlite3")
    env = EnvStore(root / ".env", root / ".env.example")
    env.write(
        {
            "PHONE_PROVIDER": "twilio",
            "TWILIO_ACCOUNT_SID": "AC123",
            "TWILIO_AUTH_TOKEN": "token",
            "TWILIO_PHONE_NUMBER": "+15551234567",
            "PHONE_LAST_PROVISIONED_URL": "https://old.trycloudflare.com",
        }
    )
    manager = PhoneManager(db, env, session_manager=None, tunnel_manager=FakeTunnelManager(tunnel))  # type: ignore[arg-type]
    provider = FakePhoneProvider()
    manager.providers = {"twilio": provider}  # type: ignore[dict-item]
    return manager, env, provider


class PhoneManagerTest(unittest.IsolatedAsyncioTestCase):
    async def test_status_marks_reprovision_required_when_tunnel_url_changes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            manager, _env, _provider = create_manager(
                Path(tmp),
                TunnelStatus(
                    mode="automatic",
                    status="running",
                    public_base_url="https://new.trycloudflare.com",
                    public_ws_url="wss://new.trycloudflare.com",
                ),
            )

            status = manager.status()

            self.assertFalse(status["configured"])
            self.assertTrue(status["reprovision_required"])
            self.assertIn("Tunnel URL changed", status["reprovision_reason"])

    async def test_connect_reprovisions_changed_tunnel_url(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            manager, env, provider = create_manager(
                Path(tmp),
                TunnelStatus(
                    mode="automatic",
                    status="running",
                    public_base_url="https://new.trycloudflare.com",
                    public_ws_url="wss://new.trycloudflare.com",
                ),
            )

            result = await manager.connect()

            self.assertEqual(provider.provision_count, 1)
            self.assertTrue(result["phone"]["configured"])
            self.assertFalse(result["phone"]["reprovision_required"])
            self.assertEqual(env.read()["PHONE_LAST_PROVISIONED_URL"], "https://new.trycloudflare.com")


if __name__ == "__main__":
    unittest.main()
