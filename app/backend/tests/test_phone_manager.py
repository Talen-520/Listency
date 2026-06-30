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
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
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
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
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

    async def test_transfer_failure_creates_follow_up_task(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
            manager, _env, _provider = create_manager(
                Path(tmp),
                TunnelStatus(
                    mode="automatic",
                    status="running",
                    public_base_url="https://new.trycloudflare.com",
                    public_ws_url="wss://new.trycloudflare.com",
                ),
            )
            phone_call_id = manager.db.create_phone_call("twilio", "CA123", "+15550001111", "+15552223333")
            manager.db.attach_phone_session(phone_call_id, "session-1")

            with self.assertRaises(AttributeError):
                await manager.transfer_for_session("session-1", "front desk", "caller asked for staff")

            tasks = manager.db.list_follow_up_tasks()
            self.assertEqual(tasks[0]["type"], "transfer_failed")
            self.assertEqual(tasks[0]["priority"], "high")
            self.assertEqual(tasks[0]["caller_phone"], "+15550001111")
            self.assertIn("What happened: Transfer to front desk failed", tasks[0]["summary"])
            self.assertIn("Suggested next steps:", tasks[0]["summary"])
            self.assertIn("Check the transfer target phone number", tasks[0]["summary"])

    async def test_status_summarizes_recent_phone_call_outcomes(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
            manager, _env, _provider = create_manager(
                Path(tmp),
                TunnelStatus(
                    mode="automatic",
                    status="running",
                    public_base_url="https://old.trycloudflare.com",
                    public_ws_url="wss://old.trycloudflare.com",
                ),
            )
            agent_call = manager.db.create_phone_call("twilio", "CA-agent", "+15550000001", "+15552223333")
            caller_call = manager.db.create_phone_call("twilio", "CA-caller", "+15550000002", "+15552223333")
            provider_call = manager.db.create_phone_call("twilio", "CA-provider", "+15550000003", "+15552223333")
            timeout_call = manager.db.create_phone_call("twilio", "CA-timeout", "+15550000004", "+15552223333")

            manager.db.update_phone_call_status(agent_call, "completed", ended_reason="agent_hung_up")
            manager.db.update_phone_call_status(caller_call, "caller_hung_up", ended_reason="caller_hung_up")
            manager.db.update_phone_call_status(provider_call, "failed", ended_reason="provider_error", error_message="quota")
            manager.db.update_phone_call_status(timeout_call, "completed", ended_reason="timeout_5_minutes")

            status = manager.status()
            outcomes = status["recent_call_summary"]["outcomes"]

            self.assertEqual(status["recent_call_summary"]["window_hours"], 24)
            self.assertEqual(status["recent_call_summary"]["total"], 4)
            self.assertEqual(outcomes["agent_hung_up"], 1)
            self.assertEqual(outcomes["caller_hung_up"], 1)
            self.assertEqual(outcomes["provider_error"], 1)
            self.assertEqual(outcomes["timeout_5_minutes"], 1)
            self.assertIn(status["last_call_outcome"], {"agent_hung_up", "caller_hung_up", "provider_error", "timeout_5_minutes"})


if __name__ == "__main__":
    unittest.main()
