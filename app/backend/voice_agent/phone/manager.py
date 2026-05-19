from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from voice_agent.config.env_store import EnvStore
from voice_agent.core.session_manager import SessionManager
from voice_agent.phone.base import PhoneConfigError, PhoneProviderAdapter
from voice_agent.phone.telnyx import TelnyxPhoneAdapter
from voice_agent.phone.twilio import TwilioPhoneAdapter
from voice_agent.storage.database import Database
from voice_agent.tunnel import PublicTunnelManager


class PhoneManager:
    def __init__(
        self,
        db: Database,
        env_store: EnvStore,
        session_manager: SessionManager,
        tunnel_manager: PublicTunnelManager,
    ) -> None:
        self.db = db
        self.env_store = env_store
        self.session_manager = session_manager
        self.tunnel_manager = tunnel_manager
        self.providers: dict[str, PhoneProviderAdapter] = {
            "twilio": TwilioPhoneAdapter(),
            "telnyx": TelnyxPhoneAdapter(),
        }

    def status(self) -> dict[str, Any]:
        env = self.env_store.read()
        provider_key = self._provider_key(env)
        tunnel = self.tunnel_manager.status(env)
        provider_ready = False
        provider_error = None
        if provider_key != "none":
            try:
                self._provider(provider_key).validate_config(env)
                provider_ready = True
            except Exception as exc:
                provider_error = str(exc)
        return {
            "provider": provider_key,
            "provider_ready": provider_ready,
            "provider_error": provider_error,
            "connection": tunnel.public_dict(),
            "configured": bool(
                provider_ready
                and tunnel.status == "running"
                and env.get("PHONE_LAST_PROVISIONED_URL")
                and env.get("PHONE_LAST_PROVISIONED_URL") == tunnel.public_base_url
            ),
            "last_provisioned_url": env.get("PHONE_LAST_PROVISIONED_URL", ""),
            "last_provisioned_at": env.get("PHONE_LAST_PROVISIONED_AT", ""),
            "transfer_target_ready": bool(env.get("PHONE_TRANSFER_TARGET", "").strip()),
        }

    async def start_connection(self) -> dict[str, Any]:
        env = self.env_store.read()
        tunnel = await self.tunnel_manager.start(env)
        return {"connection": tunnel.public_dict(), "phone": self.status()}

    async def stop_connection(self) -> dict[str, Any]:
        tunnel = await self.tunnel_manager.stop()
        return {"connection": tunnel.public_dict(), "phone": self.status()}

    async def provision(self) -> dict[str, Any]:
        env = self.env_store.read()
        provider_key = self._provider_key(env)
        if provider_key == "none":
            raise PhoneConfigError("Choose Twilio or Telnyx before connecting phone calls.")
        tunnel = self.tunnel_manager.status(env)
        if tunnel.status != "running":
            tunnel = await self.tunnel_manager.start(env)
        if tunnel.status != "running":
            raise PhoneConfigError(tunnel.message or "Phone connection is not ready.")
        result = await self._provider(provider_key).provision(env, tunnel)
        self.env_store.write(
            {
                "PHONE_LAST_PROVISIONED_URL": tunnel.public_base_url,
                "PHONE_LAST_PROVISIONED_AT": datetime.now(tz=UTC).isoformat(),
            }
        )
        self.db.add_log(
            "info",
            "phone_provisioned",
            result.message,
            {"provider": provider_key, "public_base_url": tunnel.public_base_url},
        )
        return {"result": result.public_dict(), "phone": self.status()}

    async def start_phone_session(
        self,
        *,
        phone_provider: str,
        provider_call_id: str,
        from_number: str = "",
        to_number: str = "",
    ) -> dict[str, Any]:
        env = self.env_store.read()
        realtime_provider = env.get("PHONE_REALTIME_PROVIDER") or env.get("DEFAULT_REALTIME_PROVIDER") or None
        phone_call_id = self.db.create_phone_call(
            provider=phone_provider,
            provider_call_id=provider_call_id,
            from_number=from_number,
            to_number=to_number,
        )
        try:
            session = await self.session_manager.start_phone_session(
                provider_name=realtime_provider,
                phone_provider=phone_provider,
                provider_call_id=provider_call_id,
                from_number=from_number,
                to_number=to_number,
                phone_call_id=phone_call_id,
            )
        except Exception as exc:
            self.db.update_phone_call_status(phone_call_id, "failed", ended_reason="provider_error", error_message=str(exc))
            raise
        self.db.attach_phone_session(phone_call_id, session["id"])
        self.db.update_phone_call_status(phone_call_id, "active")
        return {"phone_call_id": phone_call_id, "session": session}

    async def finish_phone_call(
        self,
        phone_call_id: int | None,
        *,
        status: str,
        ended_reason: str = "",
        error_message: str | None = None,
    ) -> None:
        if phone_call_id is None:
            return
        self.db.update_phone_call_status(phone_call_id, status, ended_reason=ended_reason, error_message=error_message)

    async def transfer_for_session(self, session_id: str | None, target: str, reason: str = "") -> dict[str, Any]:
        if not session_id:
            return {
                "status": "logged",
                "message": "Transfer intent logged. No active session was attached to a phone call.",
            }
        phone_call = self.db.get_phone_call_by_session(session_id)
        if not phone_call:
            return {
                "status": "logged",
                "message": "Transfer intent logged. This session is not a phone call.",
            }
        env = self.env_store.read()
        provider_key = str(phone_call.get("provider") or self._provider_key(env))
        provider_call_id = str(phone_call.get("provider_call_id") or "")
        transfer_target = env.get("PHONE_TRANSFER_TARGET", "").strip() or target.strip()
        result = await self._provider(provider_key).transfer_call(env, provider_call_id, transfer_target, reason)
        self.db.update_phone_call_status(int(phone_call["id"]), "transferring")
        return result

    def _provider_key(self, env: dict[str, str]) -> str:
        provider = (env.get("PHONE_PROVIDER") or "none").strip().lower()
        return provider if provider in {"none", *self.providers.keys()} else "none"

    def _provider(self, key: str) -> PhoneProviderAdapter:
        if key not in self.providers:
            raise PhoneConfigError(f"Unsupported phone provider: {key}")
        return self.providers[key]
