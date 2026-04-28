from __future__ import annotations

from typing import Any

from voice_agent.tools.registry import ToolContext, ToolDefinition, ToolRegistry


def business_info_lookup(payload: dict[str, Any], context: ToolContext) -> dict[str, Any]:
    query = str(payload.get("query", "")).strip().lower()
    profile = context.db.get_business_profile()
    content = str(profile.get("content") or "")
    if not content:
        return {"answer": "No business information has been saved yet.", "matches": []}

    if not query:
        return {"answer": content[:1200], "matches": []}

    terms = [term for term in query.split() if len(term) > 2]
    lines = [line.strip() for line in content.splitlines() if line.strip()]
    matches = [
        line
        for line in lines
        if any(term in line.lower() for term in terms)
    ][:5]
    answer = "\n".join(matches) if matches else content[:1200]
    return {"answer": answer, "matches": matches}


def create_booking(payload: dict[str, Any], context: ToolContext) -> dict[str, Any]:
    customer_name = str(payload.get("customer_name", "")).strip()
    booking_time = str(payload.get("booking_time", "")).strip()
    notes = str(payload.get("notes", "")).strip()
    if not customer_name:
        raise ValueError("customer_name is required")
    if not booking_time:
        raise ValueError("booking_time is required")
    booking = context.db.create_booking(customer_name, booking_time, notes)
    return {"booking": booking, "message": "Booking saved locally."}


def transfer_call(payload: dict[str, Any], context: ToolContext) -> dict[str, Any]:
    reason = str(payload.get("reason", "")).strip()
    target = str(payload.get("target", "")).strip() or "business staff"
    context.db.add_log(
        "info",
        "transfer_call_requested",
        "Transfer call placeholder triggered.",
        {"reason": reason, "target": target, "session_id": context.session_id},
    )
    return {
        "status": "logged",
        "target": target,
        "message": "Transfer intent logged. Real phone transfer is pending phone provider integration.",
    }


def log_customer_request(payload: dict[str, Any], context: ToolContext) -> dict[str, Any]:
    request = str(payload.get("request", "")).strip()
    if not request:
        raise ValueError("request is required")
    context.db.add_log(
        "info",
        "customer_request",
        request,
        {"session_id": context.session_id},
    )
    return {"status": "logged", "message": "Customer request saved locally."}


def build_default_registry() -> ToolRegistry:
    return ToolRegistry(
        [
            ToolDefinition(
                name="business_info_lookup",
                description="Look up answers from the saved business profile text.",
                input_schema={
                    "type": "object",
                    "properties": {"query": {"type": "string"}},
                    "required": ["query"],
                },
                handler=business_info_lookup,
            ),
            ToolDefinition(
                name="create_booking",
                description="Create a local booking record.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "customer_name": {"type": "string"},
                        "booking_time": {"type": "string"},
                        "notes": {"type": "string"},
                    },
                    "required": ["customer_name", "booking_time"],
                },
                handler=create_booking,
            ),
            ToolDefinition(
                name="transfer_call",
                description="Log a transfer-call intent for later phone provider integration.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "target": {"type": "string"},
                        "reason": {"type": "string"},
                    },
                },
                handler=transfer_call,
            ),
            ToolDefinition(
                name="log_customer_request",
                description="Save a customer request or unresolved question.",
                input_schema={
                    "type": "object",
                    "properties": {"request": {"type": "string"}},
                    "required": ["request"],
                },
                handler=log_customer_request,
            ),
        ]
    )
