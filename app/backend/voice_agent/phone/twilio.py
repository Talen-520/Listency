from __future__ import annotations

import asyncio
import base64
import json
import urllib.parse
import urllib.request
import xml.sax.saxutils
from datetime import UTC, datetime, timedelta
from typing import Any

from voice_agent.phone.base import PhoneConfigError, PhoneProvisionResult
from voice_agent.tunnel import TunnelStatus


class TwilioPhoneAdapter:
    name = "twilio"
    display_name = "Twilio"

    def validate_config(self, env: dict[str, str]) -> None:
        missing = []
        if not env.get("TWILIO_ACCOUNT_SID"):
            missing.append("Account SID")
        if not env.get("TWILIO_AUTH_TOKEN"):
            missing.append("Auth Token")
        if not env.get("TWILIO_PHONE_NUMBER") and not env.get("TWILIO_PHONE_NUMBER_SID"):
            missing.append("Phone Number")
        if missing:
            raise PhoneConfigError(f"Missing Twilio {', '.join(missing)}.")

    async def provision(self, env: dict[str, str], tunnel: TunnelStatus) -> PhoneProvisionResult:
        self.validate_config(env)
        if tunnel.status != "running" or not tunnel.public_base_url or not tunnel.public_ws_url:
            raise PhoneConfigError("Start Phone Connection before configuring Twilio.")

        return await asyncio.to_thread(self._provision_sync, env, tunnel)

    async def transfer_call(self, env: dict[str, str], provider_call_id: str, target: str, reason: str = "") -> dict[str, str]:
        self.validate_config(env)
        if not provider_call_id:
            raise PhoneConfigError("No active Twilio call id is available for transfer.")
        if not target:
            raise PhoneConfigError("Add a transfer target number in Settings.")
        twiml = f"<Response><Dial>{xml.sax.saxutils.escape(target)}</Dial></Response>"
        await asyncio.to_thread(
            self._request,
            env,
            "POST",
            f"/2010-04-01/Accounts/{env['TWILIO_ACCOUNT_SID']}/Calls/{provider_call_id}.json",
            {"Twiml": twiml},
        )
        return {"status": "transferring", "provider": self.name, "target": target, "reason": reason}

    async def hangup_call(self, env: dict[str, str], provider_call_id: str, reason: str = "") -> dict[str, str]:
        self.validate_config(env)
        if not provider_call_id:
            raise PhoneConfigError("No active Twilio call id is available to hang up.")
        await asyncio.to_thread(
            self._request,
            env,
            "POST",
            f"/2010-04-01/Accounts/{env['TWILIO_ACCOUNT_SID']}/Calls/{provider_call_id}.json",
            {"Status": "completed"},
        )
        return {"status": "completed", "provider": self.name, "reason": reason}

    async def debugger_alerts(self, env: dict[str, str], limit: int = 10, hours: int = 24) -> list[dict[str, str]]:
        self.validate_config(env)
        return await asyncio.to_thread(self._debugger_alerts_sync, env, limit, hours)

    def inbound_twiml(self, public_ws_url: str, call_sid: str = "", from_number: str = "", to_number: str = "") -> str:
        media_url = f"{public_ws_url.rstrip('/')}/phone/twilio/media"
        attrs = f' url="{xml.sax.saxutils.escape(media_url)}"'
        parameters = []
        for name, value in (("callSid", call_sid), ("from", from_number), ("to", to_number)):
            if value:
                parameters.append(
                    f'<Parameter name="{xml.sax.saxutils.escape(name)}" value="{xml.sax.saxutils.escape(value)}" />'
                )
        parameter_xml = "".join(parameters)
        return f'<?xml version="1.0" encoding="UTF-8"?><Response><Connect><Stream{attrs}>{parameter_xml}</Stream></Connect></Response>'

    def _provision_sync(self, env: dict[str, str], tunnel: TunnelStatus) -> PhoneProvisionResult:
        incoming_sid = env.get("TWILIO_PHONE_NUMBER_SID", "").strip() or self._find_incoming_number_sid(env)
        inbound_url = f"{tunnel.public_base_url.rstrip('/')}/phone/twilio/inbound"
        status_url = f"{tunnel.public_base_url.rstrip('/')}/phone/twilio/status"
        self._request(
            env,
            "POST",
            f"/2010-04-01/Accounts/{env['TWILIO_ACCOUNT_SID']}/IncomingPhoneNumbers/{incoming_sid}.json",
            {
                "VoiceUrl": inbound_url,
                "VoiceMethod": "POST",
                "StatusCallback": status_url,
                "StatusCallbackMethod": "POST",
            },
        )
        return PhoneProvisionResult(
            provider=self.name,
            status="configured",
            message="Twilio incoming calls are configured for Listency.",
            public_base_url=tunnel.public_base_url,
            inbound_url=inbound_url,
            media_url=f"{tunnel.public_ws_url.rstrip('/')}/phone/twilio/media",
        )

    def _find_incoming_number_sid(self, env: dict[str, str]) -> str:
        phone_number = env.get("TWILIO_PHONE_NUMBER", "").strip()
        if not phone_number:
            raise PhoneConfigError("Twilio phone number is required when Phone Number SID is not set.")
        query = urllib.parse.urlencode({"PhoneNumber": phone_number})
        payload = self._request(
            env,
            "GET",
            f"/2010-04-01/Accounts/{env['TWILIO_ACCOUNT_SID']}/IncomingPhoneNumbers.json?{query}",
        )
        numbers = payload.get("incoming_phone_numbers") if isinstance(payload, dict) else None
        if not numbers:
            raise PhoneConfigError("Twilio phone number was not found in this account.")
        sid = str(numbers[0].get("sid") or "")
        if not sid:
            raise PhoneConfigError("Twilio phone number response did not include a SID.")
        return sid

    def _request(self, env: dict[str, str], method: str, path: str, data: dict[str, str] | None = None) -> dict[str, Any]:
        account_sid = env["TWILIO_ACCOUNT_SID"]
        auth_token = env["TWILIO_AUTH_TOKEN"]
        url = f"https://api.twilio.com{path}"
        body = urllib.parse.urlencode(data).encode("utf-8") if data is not None else None
        request = urllib.request.Request(url, data=body, method=method)
        token = base64.b64encode(f"{account_sid}:{auth_token}".encode("utf-8")).decode("ascii")
        request.add_header("Authorization", f"Basic {token}")
        if data is not None:
            request.add_header("Content-Type", "application/x-www-form-urlencoded")
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                raw = response.read().decode("utf-8")
        except Exception as exc:
            raise PhoneConfigError(f"Twilio API request failed: {exc}") from exc
        return json.loads(raw) if raw else {}

    def _debugger_alerts_sync(self, env: dict[str, str], limit: int, hours: int) -> list[dict[str, str]]:
        page_size = max(1, min(limit, 20))
        lookback_hours = max(1, min(hours, 24 * 30))
        start_date = (datetime.now(tz=UTC) - timedelta(hours=lookback_hours)).strftime("%Y-%m-%dT%H:%M:%SZ")
        query = urllib.parse.urlencode({"StartDate": start_date, "PageSize": str(page_size)})
        payload = self._request_absolute(env, "GET", f"https://monitor.twilio.com/v1/Alerts?{query}")
        alerts = payload.get("alerts") if isinstance(payload, dict) else None
        if not isinstance(alerts, list):
            return []
        normalized = [self._normalize_debugger_alert(alert) for alert in alerts if isinstance(alert, dict)]
        return [alert for alert in normalized if alert]

    def _request_absolute(self, env: dict[str, str], method: str, url: str) -> dict[str, Any]:
        account_sid = env["TWILIO_ACCOUNT_SID"]
        auth_token = env["TWILIO_AUTH_TOKEN"]
        request = urllib.request.Request(url, method=method)
        token = base64.b64encode(f"{account_sid}:{auth_token}".encode("utf-8")).decode("ascii")
        request.add_header("Authorization", f"Basic {token}")
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                raw = response.read().decode("utf-8")
        except Exception as exc:
            raise PhoneConfigError(f"Twilio Debugger request failed: {exc}") from exc
        return json.loads(raw) if raw else {}

    def _normalize_debugger_alert(self, alert: dict[str, Any]) -> dict[str, str]:
        return {
            "sid": str(alert.get("sid") or ""),
            "date_created": str(alert.get("date_created") or alert.get("dateCreated") or ""),
            "date_generated": str(alert.get("date_generated") or alert.get("dateGenerated") or ""),
            "error_code": str(alert.get("error_code") or alert.get("errorCode") or ""),
            "log_level": str(alert.get("log_level") or alert.get("logLevel") or ""),
            "alert_text": str(alert.get("alert_text") or alert.get("alertText") or ""),
            "request_method": str(alert.get("request_method") or alert.get("requestMethod") or ""),
            "request_url": str(alert.get("request_url") or alert.get("requestUrl") or ""),
            "resource_sid": str(alert.get("resource_sid") or alert.get("resourceSid") or ""),
            "more_info": str(alert.get("more_info") or alert.get("moreInfo") or ""),
        }
