from __future__ import annotations

import asyncio
import json
import urllib.request
from typing import Any

from voice_agent.phone.base import PhoneConfigError, PhoneProvisionResult
from voice_agent.tunnel import TunnelStatus


class TelnyxPhoneAdapter:
    name = "telnyx"
    display_name = "Telnyx"

    def validate_config(self, env: dict[str, str]) -> None:
        missing = []
        if not env.get("TELNYX_API_KEY"):
            missing.append("API Key")
        if not env.get("TELNYX_CALL_CONTROL_APP_ID"):
            missing.append("Call Control Application ID")
        if missing:
            raise PhoneConfigError(f"Missing Telnyx {', '.join(missing)}.")

    async def provision(self, env: dict[str, str], tunnel: TunnelStatus) -> PhoneProvisionResult:
        self.validate_config(env)
        if tunnel.status != "running" or not tunnel.public_base_url:
            raise PhoneConfigError("Start Phone Connection before configuring Telnyx.")
        return await asyncio.to_thread(self._provision_sync, env, tunnel)

    async def transfer_call(self, env: dict[str, str], provider_call_id: str, target: str, reason: str = "") -> dict[str, str]:
        self.validate_config(env)
        if not provider_call_id:
            raise PhoneConfigError("No active Telnyx call_control_id is available for transfer.")
        if not target:
            raise PhoneConfigError("Add a transfer target number in Settings.")
        payload = {"to": target}
        from_number = env.get("TELNYX_PHONE_NUMBER", "").strip()
        if from_number:
            payload["from"] = from_number
        await asyncio.to_thread(
            self._request,
            env,
            "POST",
            f"/v2/calls/{provider_call_id}/actions/transfer",
            payload,
        )
        return {"status": "transferring", "provider": self.name, "target": target, "reason": reason}

    async def hangup_call(self, env: dict[str, str], provider_call_id: str, reason: str = "") -> dict[str, str]:
        self.validate_config(env)
        if not provider_call_id:
            raise PhoneConfigError("No active Telnyx call_control_id is available to hang up.")
        await asyncio.to_thread(self._request, env, "POST", f"/v2/calls/{provider_call_id}/actions/hangup", {})
        return {"status": "completed", "provider": self.name, "reason": reason}

    def _provision_sync(self, env: dict[str, str], tunnel: TunnelStatus) -> PhoneProvisionResult:
        inbound_url = f"{tunnel.public_base_url.rstrip('/')}/phone/telnyx/webhook"
        application_name = env.get("TELNYX_APPLICATION_NAME", "").strip() or "Listency"
        self._request(
            env,
            "PATCH",
            f"/v2/call_control_applications/{env['TELNYX_CALL_CONTROL_APP_ID']}",
            {
                "application_name": application_name,
                "webhook_event_url": inbound_url,
                "webhook_api_version": "2",
                "active": True,
            },
        )
        return PhoneProvisionResult(
            provider=self.name,
            status="configured",
            message="Telnyx Call Control webhooks are configured for Listency.",
            public_base_url=tunnel.public_base_url,
            inbound_url=inbound_url,
            media_url=f"{tunnel.public_ws_url.rstrip('/')}/phone/telnyx/media" if tunnel.public_ws_url else "",
        )

    def _request(self, env: dict[str, str], method: str, path: str, data: dict[str, Any] | None = None) -> dict[str, Any]:
        url = f"https://api.telnyx.com{path}"
        body = json.dumps(data or {}).encode("utf-8") if data is not None else None
        request = urllib.request.Request(url, data=body, method=method)
        request.add_header("Authorization", f"Bearer {env['TELNYX_API_KEY']}")
        request.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                raw = response.read().decode("utf-8")
        except Exception as exc:
            raise PhoneConfigError(f"Telnyx API request failed: {exc}") from exc
        return json.loads(raw) if raw else {}
