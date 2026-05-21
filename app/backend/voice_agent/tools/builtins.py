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
        "Transfer call requested.",
        {"reason": reason, "target": target, "session_id": context.session_id},
    )
    return {
        "status": "pending_phone_transfer",
        "target": target,
        "message": "Transfer intent logged. If this is an active phone call with a configured provider, Listency will attempt the transfer.",
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


def check_booking_capacity(payload: dict[str, Any], context: ToolContext) -> dict[str, Any]:
    return {"message": "5 rooms available"}


def end_call(payload: dict[str, Any], context: ToolContext) -> dict[str, Any]:
    reason = str(payload.get("reason", "")).strip() or "caller indicated the conversation is complete"
    goodbye = str(payload.get("goodbye_message", "")).strip() or "Thank you for calling. Goodbye."
    context.db.add_log(
        "info",
        "agent_hangup_requested",
        reason,
        {"session_id": context.session_id, "goodbye_message": goodbye},
    )
    return {
        "status": "ending_after_goodbye",
        "reason": reason,
        "goodbye_message": goodbye,
        "message": "Say a brief goodbye to the caller now. The local session will end after your goodbye audio is delivered.",
    }


def build_default_registry() -> ToolRegistry:
    return ToolRegistry(
        [
            ToolDefinition(
                name="business_info_lookup",
                description=(
                    "Look up answers from the saved business profile text. Use this before answering questions about hours, "
                    "location, services, prices, policies, amenities, availability details, or any business-specific fact. "
                    "If the result is missing or uncertain, do not invent an answer; ask a focused follow-up, log the request, or offer transfer."
                ),
                input_schema={
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Short search phrase containing the exact business detail the caller asked about.",
                        }
                    },
                    "required": ["query"],
                },
                handler=business_info_lookup,
            ),
            ToolDefinition(
                name="create_booking",
                description=(
                    "Create a local booking record only after confirming the customer's name and requested date/time. "
                    "Use notes for party size, room type, phone number, special requests, or uncertainty. If required details are missing, ask one concise follow-up before calling."
                ),
                input_schema={
                    "type": "object",
                    "properties": {
                        "customer_name": {
                            "type": "string",
                            "description": "Confirmed customer name for the booking.",
                        },
                        "booking_time": {
                            "type": "string",
                            "description": "Confirmed requested date and time in the caller's words when exact timezone/calendar handling is unavailable.",
                        },
                        "notes": {
                            "type": "string",
                            "description": "Optional booking details, constraints, or unresolved uncertainty.",
                        },
                    },
                    "required": ["customer_name", "booking_time"],
                },
                handler=create_booking,
            ),
            ToolDefinition(
                name="transfer_call",
                description=(
                    "Transfer an active phone call to business staff when phone provider support is configured; otherwise log the transfer intent. "
                    "Use when the caller asks for a human, manager, front desk, emergency help, complaint escalation, billing dispute, or a task outside the agent's tools."
                ),
                input_schema={
                    "type": "object",
                    "properties": {
                        "target": {
                            "type": "string",
                            "description": "Who the caller should be transferred to, such as front desk, manager, billing, or business staff.",
                        },
                        "reason": {
                            "type": "string",
                            "description": "Brief reason transfer is needed and any relevant caller context.",
                        },
                    },
                },
                handler=transfer_call,
            ),
            ToolDefinition(
                name="log_customer_request",
                description=(
                    "Save a customer request, callback need, or unresolved question when the agent cannot confidently complete it. "
                    "Use after one reasonable clarification attempt or when business staff should review the request later."
                ),
                input_schema={
                    "type": "object",
                    "properties": {
                        "request": {
                            "type": "string",
                            "description": "Concise summary of the customer's request, including any contact details or uncertainty mentioned.",
                        }
                    },
                    "required": ["request"],
                },
                handler=log_customer_request,
            ),
            ToolDefinition(
                name="check_booking_capacity",
                description="Return the remaining number of bookings available for testing tool calling.",
                input_schema={
                    "type": "object",
                    "properties": {},
                },
                handler=check_booking_capacity,
            ),
            ToolDefinition(
                name="end_call",
                description=(
                    "End the current call after a brief goodbye. Use when the caller says goodbye, says they are done, asks to end the call, "
                    "or the conversation is clearly complete. After this tool returns, say exactly one short goodbye and do not ask another question."
                ),
                input_schema={
                    "type": "object",
                    "properties": {
                        "reason": {
                            "type": "string",
                            "description": "Why the call should end, such as caller said goodbye or task completed.",
                        },
                        "goodbye_message": {
                            "type": "string",
                            "description": "One brief goodbye sentence to speak before the local session closes.",
                        },
                    },
                },
                handler=end_call,
            ),
        ]
    )
