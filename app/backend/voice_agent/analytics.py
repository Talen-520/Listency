from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from voice_agent.storage.database import Database

WINDOWS: dict[str, timedelta] = {
    "24h": timedelta(hours=24),
    "7d": timedelta(days=7),
    "30d": timedelta(days=30),
}

OUTCOME_KEYS = [
    "active",
    "agent_hung_up",
    "backend_shutdown",
    "caller_hung_up",
    "completed",
    "failed",
    "network_error",
    "provider_error",
    "timeout_5_minutes",
    "transferred",
    "transferring",
    "unknown",
]

TASK_TYPES = [
    "booking_request",
    "callback",
    "customer_request",
    "provider_failure",
    "transfer_failed",
    "unresolved_question",
]


def build_local_analytics(db: Database, window: str = "24h", *, now: datetime | None = None) -> dict[str, Any]:
    if window not in WINDOWS:
        raise ValueError(f"Unsupported analytics window: {window}")

    current = (now or datetime.now(tz=UTC)).astimezone(UTC)
    since = current - WINDOWS[window]
    since_iso = since.isoformat()

    calls = _phone_calls_since(db, since_iso)
    tasks = _follow_up_tasks_since(db, since_iso)
    tool_calls = _tool_calls_since(db, since_iso)

    call_outcomes = {key: 0 for key in OUTCOME_KEYS}
    durations = []
    answered = 0
    active = 0
    for call in calls:
        outcome = _call_outcome(call)
        call_outcomes[outcome] = call_outcomes.get(outcome, 0) + 1
        if call.get("answered_at") or call.get("session_id"):
            answered += 1
        if outcome in {"active", "transferring"}:
            active += 1
        duration = _duration_seconds(call)
        if duration is not None:
            durations.append(duration)

    task_statuses: dict[str, int] = {"new": 0, "in_progress": 0, "done": 0, "dismissed": 0}
    task_types = {key: 0 for key in TASK_TYPES}
    for task in tasks:
        status = str(task.get("status") or "unknown")
        task_statuses[status] = task_statuses.get(status, 0) + 1
        task_type = str(task.get("type") or "unknown")
        task_types[task_type] = task_types.get(task_type, 0) + 1

    tool_counts: dict[str, int] = {}
    tool_failures = 0
    for tool_call in tool_calls:
        tool_name = str(tool_call.get("tool_name") or "unknown")
        tool_counts[tool_name] = tool_counts.get(tool_name, 0) + 1
        if str(tool_call.get("status") or "") != "completed":
            tool_failures += 1

    provider_failure_outcomes = (
        call_outcomes.get("provider_error", 0)
        + call_outcomes.get("network_error", 0)
        + call_outcomes.get("failed", 0)
    )
    transfer_outcomes = call_outcomes.get("transferred", 0) + call_outcomes.get("transferring", 0)

    return {
        "window": window,
        "since": since_iso,
        "generated_at": current.isoformat(),
        "calls": {
            "total": len(calls),
            "answered": answered,
            "active": active,
            "failed_or_error": (
                provider_failure_outcomes
                + call_outcomes.get("backend_shutdown", 0)
                + call_outcomes.get("unknown", 0)
            ),
            "average_duration_seconds": round(sum(durations) / len(durations)) if durations else 0,
            "longest_duration_seconds": max(durations) if durations else 0,
            "by_outcome": call_outcomes,
        },
        "tasks": {
            "total": len(tasks),
            "open": task_statuses.get("new", 0) + task_statuses.get("in_progress", 0),
            "completed": task_statuses.get("done", 0),
            "dismissed": task_statuses.get("dismissed", 0),
            "by_status": task_statuses,
            "by_type": task_types,
        },
        "tools": {
            "total": len(tool_calls),
            "failed": tool_failures,
            "by_tool": tool_counts,
        },
        "highlights": {
            "booking_requests": task_types.get("booking_request", 0),
            "callbacks": task_types.get("callback", 0),
            "customer_requests": task_types.get("customer_request", 0),
            "unresolved_questions": task_types.get("unresolved_question", 0),
            "transfer_requests": max(tool_counts.get("transfer_call", 0), transfer_outcomes),
            "transfer_failures": task_types.get("transfer_failed", 0),
            "provider_failures": max(task_types.get("provider_failure", 0), provider_failure_outcomes),
        },
    }


def _phone_calls_since(db: Database, since: str) -> list[dict[str, Any]]:
    with db.open_connection() as connection:
        rows = connection.execute(
            """
            SELECT id, provider, provider_call_id, provider_stream_id, session_id, from_number, to_number,
                   business_hours_status, business_hours_policy, business_hours_mode, business_hours_reason,
                   status, started_at, answered_at, ended_at, ended_reason, error_message
            FROM phone_calls
            WHERE started_at >= ?
            ORDER BY started_at DESC
            """,
            (since,),
        ).fetchall()
    return [dict(row) for row in rows]


def _follow_up_tasks_since(db: Database, since: str) -> list[dict[str, Any]]:
    with db.open_connection() as connection:
        rows = connection.execute(
            """
            SELECT id, session_id, phone_call_id, status, priority, type, title, summary, caller_name, caller_phone,
                   due_at, source_event, created_at, updated_at, completed_at
            FROM follow_up_tasks
            WHERE created_at >= ?
            ORDER BY created_at DESC
            """,
            (since,),
        ).fetchall()
    return [dict(row) for row in rows]


def _tool_calls_since(db: Database, since: str) -> list[dict[str, Any]]:
    with db.open_connection() as connection:
        rows = connection.execute(
            """
            SELECT id, session_id, tool_name, input_json, output_json, status, started_at, ended_at, error_message
            FROM tool_calls
            WHERE started_at >= ?
            ORDER BY started_at DESC
            """,
            (since,),
        ).fetchall()
    return [dict(row) for row in rows]


def _call_outcome(call: dict[str, Any]) -> str:
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


def _duration_seconds(call: dict[str, Any]) -> int | None:
    started = _parse_timestamp(call.get("started_at"))
    ended = _parse_timestamp(call.get("ended_at"))
    if not started or not ended:
        return None
    return max(0, round((ended - started).total_seconds()))


def _parse_timestamp(value: Any) -> datetime | None:
    if not value:
        return None
    raw = str(value)
    normalized = f"{raw[:-1]}+00:00" if raw.endswith("Z") else raw
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)
