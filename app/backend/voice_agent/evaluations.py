from __future__ import annotations

import tempfile
import time
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from voice_agent.core.remediation import realtime_provider_remediation
from voice_agent.storage.database import Database
from voice_agent.tools import ToolContext, build_default_registry


@dataclass(frozen=True, slots=True)
class EvaluationScenario:
    id: str
    title: str
    description: str
    run: Callable[[Database], dict[str, Any]]

    def public_dict(self) -> dict[str, str]:
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
        }


def default_evaluation_scenarios() -> list[EvaluationScenario]:
    return [
        EvaluationScenario(
            id="business_info_location_lookup",
            title="Business info lookup uses structured location",
            description="Checks that location questions prefer the structured Business Info section.",
            run=_scenario_business_info_location_lookup,
        ),
        EvaluationScenario(
            id="booking_request_missing_phone",
            title="Booking request captures missing details",
            description="Checks that restaurant booking capture creates a staff-review task and reports missing phone number.",
            run=_scenario_booking_request_missing_phone,
        ),
        EvaluationScenario(
            id="availability_candidate_slot",
            title="Availability check returns candidate slots",
            description="Checks that local manual availability returns matching candidate slots without confirming the booking.",
            run=_scenario_availability_candidate_slot,
        ),
        EvaluationScenario(
            id="callback_request_task",
            title="Callback request creates follow-up task",
            description="Checks that unresolved callback requests are saved for owner review.",
            run=_scenario_callback_request_task,
        ),
        EvaluationScenario(
            id="transfer_request_logs_intent",
            title="Transfer request logs staff handoff intent",
            description="Checks that transfer requests call the transfer tool and record the target staff handoff.",
            run=_scenario_transfer_request_logs_intent,
        ),
        EvaluationScenario(
            id="abusive_caller_uses_end_call",
            title="Abusive caller guardrail ends safely",
            description="Checks that abusive or unsafe caller behavior routes to end_call instead of continuing indefinitely.",
            run=_scenario_abusive_caller_uses_end_call,
        ),
        EvaluationScenario(
            id="provider_outage_creates_owner_task",
            title="Provider outage creates owner follow-up",
            description="Checks that provider failures create an owner-readable follow-up task with remediation steps.",
            run=_scenario_provider_outage_creates_owner_task,
        ),
        EvaluationScenario(
            id="goodbye_uses_end_call",
            title="Goodbye flow requests AI hangup",
            description="Checks that the end_call tool records an AI hangup request and returns a final goodbye instruction.",
            run=_scenario_goodbye_uses_end_call,
        ),
    ]


def run_agent_evaluation(db: Database, scenario_ids: list[str] | None = None) -> dict[str, Any]:
    scenarios_by_id = {scenario.id: scenario for scenario in default_evaluation_scenarios()}
    selected_ids = scenario_ids or list(scenarios_by_id)
    unknown_ids = [scenario_id for scenario_id in selected_ids if scenario_id not in scenarios_by_id]
    if unknown_ids:
        raise ValueError(f"Unknown evaluation scenario: {', '.join(unknown_ids)}")

    started = time.perf_counter()
    scenario_results = []
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
        scratch_db = Database(Path(tmp) / "evaluation.sqlite3")
        _seed_common_business_context(scratch_db)
        for scenario_id in selected_ids:
            scenario = scenarios_by_id[scenario_id]
            scenario_results.append(_run_scenario(scratch_db, scenario))

    duration_ms = int((time.perf_counter() - started) * 1000)
    passed_count = sum(1 for result in scenario_results if result["status"] == "passed")
    failed_count = len(scenario_results) - passed_count
    run = {
        "id": f"eval_{uuid.uuid4().hex}",
        "status": "passed" if failed_count == 0 else "failed",
        "scenario_count": len(scenario_results),
        "passed_count": passed_count,
        "failed_count": failed_count,
        "duration_ms": duration_ms,
        "uses_scratch_database": True,
        "results": scenario_results,
    }
    return db.create_agent_evaluation(run)


def _run_scenario(db: Database, scenario: EvaluationScenario) -> dict[str, Any]:
    started = time.perf_counter()
    try:
        actual = scenario.run(db)
        duration_ms = int((time.perf_counter() - started) * 1000)
        return {
            "id": scenario.id,
            "title": scenario.title,
            "status": "passed",
            "duration_ms": duration_ms,
            "actual": actual,
            "errors": [],
        }
    except AssertionError as exc:
        duration_ms = int((time.perf_counter() - started) * 1000)
        return {
            "id": scenario.id,
            "title": scenario.title,
            "status": "failed",
            "duration_ms": duration_ms,
            "actual": {},
            "errors": [str(exc) or "Scenario assertion failed."],
        }
    except Exception as exc:
        duration_ms = int((time.perf_counter() - started) * 1000)
        return {
            "id": scenario.id,
            "title": scenario.title,
            "status": "failed",
            "duration_ms": duration_ms,
            "actual": {},
            "errors": [f"{type(exc).__name__}: {exc}"],
        }


def _seed_common_business_context(db: Database) -> None:
    db.upsert_business_profile(
        "Listency Demo Salon\nHours: Monday to Friday, 9 AM to 6 PM.\nPhone: +1 555 0100.",
        "Listency Demo Salon",
    )
    db.set_business_info_sections(
        {
            "business_type": "appointment",
            "location": "123 Main Street, Suite 4. Parking entrance is behind the building.",
            "services": "Haircuts, color, blowouts, and bridal styling.",
            "pricing": "Haircuts usually start at $45. Staff confirms final pricing.",
            "booking_rules": "Collect name, phone number, service, requested date, and requested time.",
            "policies": "Cancellations require 24 hours notice.",
            "faq": "Walk-ins are limited. Appointments are recommended.",
            "parking_accessibility": "Rear parking lot and step-free entrance available.",
        }
    )
    db.set_calendar_availability(
        {
            "adapter": "manual",
            "slots": [
                {
                    "id": "slot-friday-7pm",
                    "label": "Friday 7 PM haircut",
                    "start": "2026-07-03T19:00",
                    "end": "2026-07-03T19:30",
                    "capacity": 1,
                }
            ],
        }
    )


def _tool_context(db: Database, scenario_id: str) -> ToolContext:
    return ToolContext(db=db, session_id=f"eval-{scenario_id}")


def _call_tool(db: Database, scenario_id: str, tool_name: str, payload: dict[str, Any]) -> dict[str, Any]:
    return build_default_registry().call(tool_name, payload, _tool_context(db, scenario_id))


def _assert(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def _scenario_business_info_location_lookup(db: Database) -> dict[str, Any]:
    result = _call_tool(
        db,
        "business_info_location_lookup",
        "business_info_lookup",
        {"query": "Where are you located?", "category": "location"},
    )
    _assert(result.get("source") == "structured:location", "Expected lookup to use the structured location section.")
    _assert("123 Main Street" in str(result.get("answer", "")), "Expected location answer to include seeded address.")
    return {
        "source": result.get("source"),
        "answer_preview": str(result.get("answer", ""))[:160],
        "tool_calls": _recent_tool_names(db),
    }


def _scenario_booking_request_missing_phone(db: Database) -> dict[str, Any]:
    result = _call_tool(
        db,
        "booking_request_missing_phone",
        "create_booking",
        {
            "business_type": "restaurant",
            "customer_name": "Alex",
            "party_size": "2",
            "requested_date": "Friday",
            "requested_time": "7 PM",
            "special_requests": "Window seat if possible.",
        },
    )
    tasks = db.list_follow_up_tasks(limit=10)
    _assert(result.get("confirmation_status") == "request_captured_not_confirmed", "Booking must remain request-only.")
    _assert(result.get("validation_status") == "needs_follow_up", "Expected missing phone number to require follow-up.")
    _assert("phone_number" in result.get("missing_fields", []), "Expected phone_number in missing fields.")
    _assert(any(task["type"] == "booking_request" for task in tasks), "Expected booking_request follow-up task.")
    return {
        "confirmation_status": result.get("confirmation_status"),
        "validation_status": result.get("validation_status"),
        "missing_fields": result.get("missing_fields", []),
        "follow_up_task_count": len(tasks),
    }


def _scenario_availability_candidate_slot(db: Database) -> dict[str, Any]:
    result = _call_tool(
        db,
        "availability_candidate_slot",
        "check_availability",
        {"requested_date": "Friday", "requested_time": "7 PM", "service": "haircut"},
    )
    slots = result.get("slots", [])
    _assert(result.get("availability_status") == "available", "Expected matching candidate slot.")
    _assert(bool(slots), "Expected at least one candidate slot.")
    _assert(result.get("requires_staff_confirmation") is True, "Candidate slots must require staff confirmation.")
    return {
        "availability_status": result.get("availability_status"),
        "slot_count": len(slots),
        "confirmation_status": result.get("confirmation_status"),
    }


def _scenario_callback_request_task(db: Database) -> dict[str, Any]:
    result = _call_tool(
        db,
        "callback_request_task",
        "log_customer_request",
        {"request_type": "callback", "request": "Please call Jamie back about Saturday availability."},
    )
    task = result.get("follow_up_task", {})
    _assert(result.get("status") == "logged", "Expected callback request to be logged.")
    _assert(task.get("type") == "callback", "Expected callback follow-up task.")
    return {
        "request_type": result.get("request_type"),
        "task_type": task.get("type"),
        "task_status": task.get("status"),
    }


def _scenario_transfer_request_logs_intent(db: Database) -> dict[str, Any]:
    result = _call_tool(
        db,
        "transfer_request_logs_intent",
        "transfer_call",
        {
            "target": "front desk manager",
            "reason": "Caller asked for a manager about a billing dispute.",
        },
    )
    logs = db.list_logs(limit=5)
    _assert(result.get("status") == "pending_phone_transfer", "Expected transfer request to stay pending for active phone bridge.")
    _assert(result.get("target") == "front desk manager", "Expected transfer target to be preserved.")
    _assert(any(log["event"] == "transfer_call_requested" for log in logs), "Expected transfer_call_requested app log.")
    return {
        "status": result.get("status"),
        "target": result.get("target"),
        "log_events": [log["event"] for log in logs],
    }


def _scenario_abusive_caller_uses_end_call(db: Database) -> dict[str, Any]:
    result = _call_tool(
        db,
        "abusive_caller_uses_end_call",
        "end_call",
        {
            "reason": "Caller became abusive after a warning.",
            "goodbye_message": "I cannot continue this call. Goodbye.",
        },
    )
    logs = db.list_logs(limit=5)
    _assert(result.get("status") == "ending_after_goodbye", "Expected abusive caller flow to request final goodbye.")
    _assert("cannot continue" in str(result.get("goodbye_message", "")).lower(), "Expected guardrail goodbye message.")
    _assert(any(log["event"] == "agent_hangup_requested" for log in logs), "Expected agent_hangup_requested app log.")
    return {
        "status": result.get("status"),
        "goodbye_message": result.get("goodbye_message"),
        "log_events": [log["event"] for log in logs],
    }


def _scenario_provider_outage_creates_owner_task(db: Database) -> dict[str, Any]:
    summary = realtime_provider_remediation("OpenAI Realtime websocket closed during an active customer call.")
    task = db.create_follow_up_task_once(
        type="provider_failure",
        title="Realtime provider issue",
        summary=summary,
        session_id="eval-provider-outage",
        priority="high",
        source_event="session_provider_error",
    )
    _assert(task["type"] == "provider_failure", "Expected provider_failure follow-up task.")
    _assert(task["priority"] == "high", "Expected provider outage task to be high priority.")
    _assert("What happened:" in task["summary"], "Expected owner-readable failure summary.")
    _assert("Suggested next steps:" in task["summary"], "Expected owner-readable remediation steps.")
    return {
        "task_type": task["type"],
        "task_priority": task["priority"],
        "summary_preview": task["summary"][:180],
    }


def _scenario_goodbye_uses_end_call(db: Database) -> dict[str, Any]:
    result = _call_tool(
        db,
        "goodbye_uses_end_call",
        "end_call",
        {"reason": "Caller said goodbye.", "goodbye_message": "Thanks for calling. Goodbye."},
    )
    logs = db.list_logs(limit=5)
    _assert(result.get("status") == "ending_after_goodbye", "Expected end_call to request final goodbye flow.")
    _assert(any(log["event"] == "agent_hangup_requested" for log in logs), "Expected agent_hangup_requested app log.")
    return {
        "status": result.get("status"),
        "log_events": [log["event"] for log in logs],
    }


def _recent_tool_names(db: Database) -> list[str]:
    return [record["tool_name"] for record in db.list_tool_calls(limit=5)]
