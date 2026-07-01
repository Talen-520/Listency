from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from voice_agent.config.env_store import EnvStore
from voice_agent.core.business_hours import resolve_business_hours
from voice_agent.core.remediation import phone_session_start_remediation, transfer_failure_remediation
from voice_agent.core.session_manager import SessionManager
from voice_agent.phone.base import PhoneConfigError, PhoneProviderAdapter, PhoneProvisionResult
from voice_agent.phone.telnyx import TelnyxPhoneAdapter
from voice_agent.phone.twilio import TwilioPhoneAdapter
from voice_agent.storage.database import Database
from voice_agent.tunnel import PublicTunnelManager, TunnelStatus


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
        recent_calls = self.db.list_phone_calls(limit=20)
        recent_24h_calls = self.db.list_phone_calls(
            limit=200,
            since=(datetime.now(tz=UTC) - timedelta(hours=24)).isoformat(),
        )
        last_call = next((call for call in recent_calls if provider_key == "none" or call.get("provider") == provider_key), {})
        if provider_key != "none":
            try:
                self._provider(provider_key).validate_config(env)
                provider_ready = True
            except Exception as exc:
                provider_error = str(exc)
        last_provisioned_url = env.get("PHONE_LAST_PROVISIONED_URL", "")
        reprovision_required = bool(
            provider_ready
            and tunnel.status == "running"
            and last_provisioned_url
            and tunnel.public_base_url
            and last_provisioned_url != tunnel.public_base_url
        )
        return {
            "provider": provider_key,
            "provider_ready": provider_ready,
            "provider_error": provider_error,
            "connection": tunnel.public_dict(),
            "configured": bool(
                provider_ready
                and tunnel.status == "running"
                and last_provisioned_url
                and last_provisioned_url == tunnel.public_base_url
            ),
            "last_provisioned_url": last_provisioned_url,
            "last_provisioned_at": env.get("PHONE_LAST_PROVISIONED_AT", ""),
            "reprovision_required": reprovision_required,
            "reprovision_reason": "Tunnel URL changed. Connect Phone will update provider webhooks." if reprovision_required else "",
            "transfer_target_ready": bool(env.get("PHONE_TRANSFER_TARGET", "").strip()),
            "last_call_status": str(last_call.get("status") or ""),
            "last_call_error": str(last_call.get("error_message") or ""),
            "last_call_ended_reason": str(last_call.get("ended_reason") or ""),
            "last_call_outcome": self._call_outcome(last_call) if last_call else "none",
            "recent_call_summary": self._recent_call_summary(recent_24h_calls, provider_key),
        }

    async def start_connection(self) -> dict[str, Any]:
        env = self.env_store.read()
        tunnel = await self.tunnel_manager.start(env)
        return {"connection": tunnel.public_dict(), "phone": self.status()}

    async def stop_connection(self) -> dict[str, Any]:
        tunnel = await self.tunnel_manager.stop()
        return {"connection": tunnel.public_dict(), "phone": self.status()}

    async def connect(self) -> dict[str, Any]:
        env = self.env_store.read()
        provider_key = self._provider_key(env)
        if provider_key == "none":
            raise PhoneConfigError("Choose Twilio or Telnyx before connecting phone calls.")
        tunnel = await self.tunnel_manager.start(env)
        if tunnel.status != "running":
            raise PhoneConfigError(tunnel.message or "Phone connection is not ready.")
        result = await self._provision_with_tunnel(env, provider_key, tunnel)
        return {"connection": tunnel.public_dict(), "result": result.public_dict(), "phone": self.status()}

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
        result = await self._provision_with_tunnel(env, provider_key, tunnel)
        return {"result": result.public_dict(), "phone": self.status()}

    async def _provision_with_tunnel(
        self,
        env: dict[str, str],
        provider_key: str,
        tunnel: TunnelStatus,
    ) -> PhoneProvisionResult:
        try:
            result = await self._provider(provider_key).provision(env, tunnel)
        except Exception as exc:
            self.db.add_log(
                "error",
                "phone_provision_failed",
                str(exc),
                {"provider": provider_key, "public_base_url": tunnel.public_base_url},
            )
            raise
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
        return result

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
        business_hours_status = resolve_business_hours(self.db.get_business_hours())
        phone_call_id = self.db.create_phone_call(
            provider=phone_provider,
            provider_call_id=provider_call_id,
            from_number=from_number,
            to_number=to_number,
            business_hours=business_hours_status,
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
            self.db.create_follow_up_task_once(
                type="provider_failure",
                title="Phone call failed to start",
                summary=phone_session_start_remediation(str(exc)),
                phone_call_id=phone_call_id,
                priority="high",
                caller_phone=from_number,
                source_event="phone_session_start_failed",
            )
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
        try:
            result = await self._provider(provider_key).transfer_call(env, provider_call_id, transfer_target, reason)
        except Exception as exc:
            self.db.create_follow_up_task_once(
                type="transfer_failed",
                title="Call transfer failed",
                summary=transfer_failure_remediation(
                    target=transfer_target or target,
                    reason=reason,
                    error=str(exc),
                ),
                session_id=session_id,
                phone_call_id=int(phone_call["id"]),
                priority="high",
                caller_phone=str(phone_call.get("from_number") or ""),
                source_event="transfer_call_failed",
            )
            raise
        self.db.update_phone_call_status(int(phone_call["id"]), "transferring")
        return result

    def _provider_key(self, env: dict[str, str]) -> str:
        provider = (env.get("PHONE_PROVIDER") or "none").strip().lower()
        return provider if provider in {"none", *self.providers.keys()} else "none"

    def _provider(self, key: str) -> PhoneProviderAdapter:
        if key not in self.providers:
            raise PhoneConfigError(f"Unsupported phone provider: {key}")
        return self.providers[key]

    def _recent_call_summary(self, calls: list[dict[str, Any]], provider_key: str) -> dict[str, Any]:
        provider_calls = [call for call in calls if provider_key == "none" or call.get("provider") == provider_key]
        outcomes = {
            "active": 0,
            "agent_hung_up": 0,
            "backend_shutdown": 0,
            "caller_hung_up": 0,
            "completed": 0,
            "failed": 0,
            "network_error": 0,
            "provider_error": 0,
            "timeout_5_minutes": 0,
            "transferred": 0,
            "transferring": 0,
            "unknown": 0,
        }
        for call in provider_calls:
            outcome = self._call_outcome(call)
            outcomes[outcome] = outcomes.get(outcome, 0) + 1
        return {
            "window_hours": 24,
            "total": len(provider_calls),
            "outcomes": outcomes,
        }

    def _call_outcome(self, call: dict[str, Any]) -> str:
        status = str(call.get("status") or "").strip()
        ended_reason = str(call.get("ended_reason") or "").strip()
        if status in {"active", "transferring", "transferred"}:
            return status
        if ended_reason in {
            "agent_hung_up",
            "backend_shutdown",
            "caller_hung_up",
            "network_error",
            "provider_error",
            "timeout_5_minutes",
        }:
            return ended_reason
        if status in {"completed", "failed"}:
            return status
        return "unknown"
