from __future__ import annotations

from copy import deepcopy
from datetime import UTC, date, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


WEEKDAYS = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")

AFTER_HOURS_MODES = {
    "take_callback",
    "information_only",
    "transfer",
    "closed_message",
}

DEFAULT_BUSINESS_HOURS: dict[str, Any] = {
    "timezone": "",
    "weekly_hours": {day: [] for day in WEEKDAYS},
    "closures": [],
    "after_hours_mode": "take_callback",
    "after_hours_message": "",
    "open_hours_transfer_target": "",
    "after_hours_transfer_target": "",
}


def default_business_hours() -> dict[str, Any]:
    return deepcopy(DEFAULT_BUSINESS_HOURS)


def normalize_business_hours_config(config: dict[str, Any] | None) -> dict[str, Any]:
    source = config if isinstance(config, dict) else {}
    normalized = default_business_hours()
    timezone = str(source.get("timezone") or "").strip()
    normalized["timezone"] = timezone

    weekly_hours = source.get("weekly_hours")
    if isinstance(weekly_hours, dict):
        for day in WEEKDAYS:
            windows = weekly_hours.get(day, [])
            if not isinstance(windows, list):
                continue
            normalized["weekly_hours"][day] = [
                {"open": str(window.get("open") or "").strip(), "close": str(window.get("close") or "").strip()}
                for window in windows
                if isinstance(window, dict)
                and _parse_hhmm(str(window.get("open") or "")) is not None
                and _parse_hhmm(str(window.get("close") or "")) is not None
                and str(window.get("open") or "").strip() != str(window.get("close") or "").strip()
            ]

    closures = source.get("closures")
    if isinstance(closures, list):
        normalized["closures"] = [
            {
                "date": str(closure.get("date") or "").strip(),
                "start_date": str(closure.get("start_date") or "").strip(),
                "end_date": str(closure.get("end_date") or "").strip(),
                "reason": str(closure.get("reason") or "").strip(),
                "message": str(closure.get("message") or "").strip(),
            }
            for closure in closures
            if isinstance(closure, dict) and _closure_has_valid_date(closure)
        ]

    after_hours_mode = str(source.get("after_hours_mode") or "").strip()
    if after_hours_mode in AFTER_HOURS_MODES:
        normalized["after_hours_mode"] = after_hours_mode
    normalized["after_hours_message"] = str(source.get("after_hours_message") or "").strip()
    normalized["open_hours_transfer_target"] = str(source.get("open_hours_transfer_target") or "").strip()
    normalized["after_hours_transfer_target"] = str(source.get("after_hours_transfer_target") or "").strip()
    return normalized


def resolve_business_hours(config: dict[str, Any] | None, now: datetime | None = None) -> dict[str, Any]:
    normalized = normalize_business_hours_config(config)
    configured = bool(normalized["timezone"] and any(normalized["weekly_hours"].values()))
    if not configured:
        return {
            "configured": False,
            "status": "not_configured",
            "is_open": True,
            "timezone": normalized["timezone"],
            "local_time": None,
            "reason": "Business hours are not configured.",
            "active_policy": "open_hours",
            "after_hours_mode": normalized["after_hours_mode"],
            "message": "",
            "transfer_target": normalized["open_hours_transfer_target"],
            "next_change": None,
            "allowed_tools": _allowed_tools("open_hours"),
        }

    try:
        tz = ZoneInfo(normalized["timezone"])
    except ZoneInfoNotFoundError:
        return {
            "configured": False,
            "status": "timezone_error",
            "is_open": True,
            "timezone": normalized["timezone"],
            "local_time": None,
            "reason": f"Unknown timezone: {normalized['timezone']}",
            "active_policy": "open_hours",
            "after_hours_mode": normalized["after_hours_mode"],
            "message": "",
            "transfer_target": normalized["open_hours_transfer_target"],
            "next_change": None,
            "allowed_tools": _allowed_tools("open_hours"),
        }

    utc_now = now or datetime.now(tz=UTC)
    if utc_now.tzinfo is None:
        utc_now = utc_now.replace(tzinfo=UTC)
    local_now = utc_now.astimezone(tz)

    closure = _active_closure(normalized["closures"], local_now.date())
    if closure:
        return _closed_result(normalized, local_now, f"Closed: {closure.get('reason') or 'temporary closure'}", closure.get("message") or "")

    if _is_open_at(normalized["weekly_hours"], local_now):
        return {
            "configured": True,
            "status": "open",
            "is_open": True,
            "timezone": normalized["timezone"],
            "local_time": local_now.isoformat(),
            "reason": "Business is currently open.",
            "active_policy": "open_hours",
            "after_hours_mode": normalized["after_hours_mode"],
            "message": "",
            "transfer_target": normalized["open_hours_transfer_target"],
            "next_change": _next_change(normalized["weekly_hours"], local_now, should_open=False),
            "allowed_tools": _allowed_tools("open_hours"),
        }

    return _closed_result(normalized, local_now, "Business is currently closed.", normalized["after_hours_message"])


def _closed_result(config: dict[str, Any], local_now: datetime, reason: str, message: str) -> dict[str, Any]:
    mode = config["after_hours_mode"]
    return {
        "configured": True,
        "status": "closed",
        "is_open": False,
        "timezone": config["timezone"],
        "local_time": local_now.isoformat(),
        "reason": reason,
        "active_policy": f"after_hours_{mode}",
        "after_hours_mode": mode,
        "message": message,
        "transfer_target": config["after_hours_transfer_target"] if mode == "transfer" else "",
        "next_change": _next_change(config["weekly_hours"], local_now, should_open=True),
        "allowed_tools": _allowed_tools(mode),
    }


def _allowed_tools(policy: str) -> list[str]:
    if policy == "open_hours":
        return ["business_info_lookup", "create_booking", "transfer_call", "log_customer_request", "end_call"]
    if policy == "transfer":
        return ["business_info_lookup", "transfer_call", "log_customer_request", "end_call"]
    if policy == "information_only":
        return ["business_info_lookup", "log_customer_request", "end_call"]
    if policy == "closed_message":
        return ["business_info_lookup", "end_call"]
    return ["business_info_lookup", "log_customer_request", "end_call"]


def _parse_hhmm(value: str) -> int | None:
    try:
        parsed = time.fromisoformat(value.strip())
    except ValueError:
        return None
    return parsed.hour * 60 + parsed.minute


def _closure_has_valid_date(closure: dict[str, Any]) -> bool:
    if _parse_date(str(closure.get("date") or "")):
        return True
    return bool(_parse_date(str(closure.get("start_date") or "")) and _parse_date(str(closure.get("end_date") or "")))


def _parse_date(value: str) -> date | None:
    if not value.strip():
        return None
    try:
        return date.fromisoformat(value.strip())
    except ValueError:
        return None


def _active_closure(closures: list[dict[str, str]], local_date: date) -> dict[str, str] | None:
    for closure in closures:
        single_date = _parse_date(closure.get("date", ""))
        if single_date and single_date == local_date:
            return closure
        start_date = _parse_date(closure.get("start_date", ""))
        end_date = _parse_date(closure.get("end_date", ""))
        if start_date and end_date and start_date <= local_date <= end_date:
            return closure
    return None


def _is_open_at(weekly_hours: dict[str, list[dict[str, str]]], local_now: datetime) -> bool:
    minutes = local_now.hour * 60 + local_now.minute
    today = WEEKDAYS[local_now.weekday()]
    yesterday = WEEKDAYS[(local_now.weekday() - 1) % 7]

    for window in weekly_hours.get(today, []):
        open_minutes = _parse_hhmm(window["open"])
        close_minutes = _parse_hhmm(window["close"])
        if open_minutes is None or close_minutes is None:
            continue
        if close_minutes > open_minutes and open_minutes <= minutes < close_minutes:
            return True
        if close_minutes < open_minutes and minutes >= open_minutes:
            return True

    for window in weekly_hours.get(yesterday, []):
        open_minutes = _parse_hhmm(window["open"])
        close_minutes = _parse_hhmm(window["close"])
        if open_minutes is None or close_minutes is None:
            continue
        if close_minutes < open_minutes and minutes < close_minutes:
            return True

    return False


def _next_change(weekly_hours: dict[str, list[dict[str, str]]], local_now: datetime, *, should_open: bool) -> str | None:
    candidates: list[datetime] = []
    for day_offset in range(8):
        current_date = local_now.date() + timedelta(days=day_offset)
        day = WEEKDAYS[current_date.weekday()]
        for window in weekly_hours.get(day, []):
            open_minutes = _parse_hhmm(window["open"])
            close_minutes = _parse_hhmm(window["close"])
            if open_minutes is None or close_minutes is None:
                continue
            if should_open:
                candidate = datetime.combine(current_date, time(open_minutes // 60, open_minutes % 60), tzinfo=local_now.tzinfo)
                if candidate > local_now:
                    candidates.append(candidate)
            else:
                close_date = current_date + timedelta(days=1 if close_minutes < open_minutes else 0)
                candidate = datetime.combine(close_date, time(close_minutes // 60, close_minutes % 60), tzinfo=local_now.tzinfo)
                if candidate > local_now:
                    candidates.append(candidate)
    if not candidates:
        return None
    return min(candidates).isoformat()
