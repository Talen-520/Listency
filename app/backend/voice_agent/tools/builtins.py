from __future__ import annotations

from typing import Any

from voice_agent.calendar import AvailabilityRequest, ManualCalendarAdapter
from voice_agent.tools.registry import ToolContext, ToolDefinition, ToolRegistry

BOOKING_FIELD_REQUIREMENTS = {
    "hotel": ["customer_name", "phone_number", "check_in_date", "check_out_date", "guest_count", "room_count"],
    "restaurant": ["customer_name", "phone_number", "party_size", "requested_date", "requested_time"],
    "appointment": ["customer_name", "phone_number", "service", "requested_date", "requested_time"],
    "general": ["customer_name", "phone_number", "booking_time"],
}

BOOKING_FIELD_LABELS = {
    "customer_name": "Customer name",
    "phone_number": "Phone number",
    "booking_time": "Requested date/time",
    "requested_date": "Requested date",
    "requested_time": "Requested time",
    "check_in_date": "Check-in date",
    "check_out_date": "Check-out date",
    "room_count": "Room preference or room count",
    "guest_count": "Guest count",
    "party_size": "Party size",
    "service": "Service",
}


def business_info_lookup(payload: dict[str, Any], context: ToolContext) -> dict[str, Any]:
    query = str(payload.get("query", "")).strip().lower()
    category = str(payload.get("category", "")).strip().lower()
    profile = context.db.get_business_profile()
    sections = context.db.get_business_info_sections()
    content = str(profile.get("content") or "")
    if category and sections.get(category):
        return {"answer": sections[category], "matches": [sections[category]], "source": f"structured:{category}"}
    if not content and not any(sections.values()):
        return {"answer": "No business information has been saved yet.", "matches": []}

    if not query:
        structured = "\n".join(f"{key.replace('_', ' ').title()}: {value}" for key, value in sections.items() if value)
        answer = "\n\n".join(part for part in (structured, content[:1200]) if part)
        return {"answer": answer[:1800], "matches": []}

    terms = [term for term in query.split() if len(term) > 2]
    section_matches = [
        f"{key.replace('_', ' ').title()}: {value}"
        for key, value in sections.items()
        if value and any(term in f"{key} {value}".lower() for term in terms)
    ][:5]
    lines = [line.strip() for line in content.splitlines() if line.strip()]
    matches = [
        line
        for line in lines
        if any(term in line.lower() for term in terms)
    ][:5]
    all_matches = [*section_matches, *matches][:5]
    answer = "\n".join(all_matches) if all_matches else content[:1200]
    return {"answer": answer, "matches": all_matches}


def create_booking(payload: dict[str, Any], context: ToolContext) -> dict[str, Any]:
    sections = context.db.get_business_info_sections()
    business_type = _normalize_business_type(str(payload.get("business_type") or sections.get("business_type") or "general"))
    customer_name = str(payload.get("customer_name", "")).strip() or "Guest"
    booking_time = _booking_time_from_payload(payload)
    notes = str(payload.get("notes", "")).strip()
    missing_fields = _missing_booking_fields(business_type, payload)
    required_fields = BOOKING_FIELD_REQUIREMENTS[business_type]
    collected_fields = [field for field in required_fields if field not in missing_fields]
    missing_field_labels = [BOOKING_FIELD_LABELS.get(field, field.replace("_", " ").title()) for field in missing_fields]
    validation_status = "needs_follow_up" if missing_fields else "complete"
    structured_details = _booking_details_for_summary(business_type, payload)
    summary_parts = [
        f"Business type: {business_type}",
        "Confirmation status: request captured; staff must confirm final availability",
        f"Validation: {validation_status.replace('_', ' ')}",
        f"Requested time: {booking_time}",
        *structured_details,
    ]
    if notes:
        summary_parts.append(f"Notes: {notes}")
    if missing_fields:
        summary_parts.append(f"Missing details: {', '.join(missing_field_labels)}")
    booking = context.db.create_booking(customer_name, booking_time, notes)
    task = context.db.create_follow_up_task_once(
        type="booking_request",
        title=f"Booking request from {customer_name}",
        summary=". ".join(summary_parts),
        session_id=context.session_id,
        priority="high",
        caller_name=customer_name,
        caller_phone=str(payload.get("phone_number") or "").strip(),
        source_event="create_booking",
    )
    return {
        "booking": booking,
        "follow_up_task": task,
        "business_type": business_type,
        "confirmation_status": "request_captured_not_confirmed",
        "validation_status": validation_status,
        "requires_follow_up": bool(missing_fields),
        "required_fields": required_fields,
        "collected_fields": collected_fields,
        "missing_fields": missing_fields,
        "missing_field_labels": missing_field_labels,
        "message": _booking_message(missing_field_labels),
    }


def _normalize_business_type(value: str) -> str:
    normalized = value.strip().lower()
    return normalized if normalized in BOOKING_FIELD_REQUIREMENTS else "general"


def _booking_time_from_payload(payload: dict[str, Any]) -> str:
    booking_time = str(payload.get("booking_time", "")).strip()
    requested_date = str(payload.get("requested_date", "")).strip()
    requested_time = str(payload.get("requested_time", "")).strip()
    check_in = str(payload.get("check_in_date", "")).strip()
    check_out = str(payload.get("check_out_date", "")).strip()
    if booking_time:
        return booking_time
    if requested_date or requested_time:
        return " ".join(part for part in (requested_date, requested_time) if part) or "unspecified"
    if check_in or check_out:
        return f"{check_in or 'unspecified'} to {check_out or 'unspecified'}"
    return "unspecified"


def _missing_booking_fields(business_type: str, payload: dict[str, Any]) -> list[str]:
    missing = []
    for field in BOOKING_FIELD_REQUIREMENTS[business_type]:
        if not str(payload.get(field) or "").strip():
            missing.append(field)
    return missing


def _booking_message(missing_field_labels: list[str]) -> str:
    base = "Booking request saved locally for staff review. This is not a confirmed reservation."
    if not missing_field_labels:
        return base
    return f"{base} Missing details for staff follow-up: {', '.join(missing_field_labels)}."


def _booking_details_for_summary(business_type: str, payload: dict[str, Any]) -> list[str]:
    fields_by_type = {
        "hotel": ["phone_number", "check_in_date", "check_out_date", "room_count", "guest_count", "special_requests"],
        "restaurant": ["phone_number", "party_size", "requested_date", "requested_time", "special_requests"],
        "appointment": ["phone_number", "service", "requested_date", "requested_time", "urgency", "special_requests"],
        "general": ["phone_number", "party_size", "service", "special_requests"],
    }
    details = []
    for field in fields_by_type[business_type]:
        value = str(payload.get(field) or "").strip()
        if value:
            details.append(f"{field.replace('_', ' ').title()}: {value}")
    return details


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
    request_type = _normalize_customer_request_type(str(payload.get("request_type") or "customer_request"))
    title_by_type = {
        "callback": "Callback request",
        "customer_request": "Customer request",
        "unresolved_question": "Unresolved question",
    }
    context.db.add_log(
        "info",
        request_type,
        request,
        {"session_id": context.session_id, "request_type": request_type},
    )
    task = context.db.create_follow_up_task_once(
        type=request_type,
        title=title_by_type[request_type],
        summary=request,
        session_id=context.session_id,
        priority="high" if request_type == "callback" else "normal",
        source_event=f"log_customer_request:{request_type}",
    )
    message = "Callback request saved locally for staff review." if request_type == "callback" else "Customer request saved locally for staff review."
    return {"status": "logged", "request_type": request_type, "follow_up_task": task, "message": message}


def _normalize_customer_request_type(value: str) -> str:
    normalized = value.strip().lower()
    return normalized if normalized in {"callback", "customer_request", "unresolved_question"} else "customer_request"


def check_availability(payload: dict[str, Any], context: ToolContext) -> dict[str, Any]:
    adapter = ManualCalendarAdapter.from_payload(context.db.get_calendar_availability())
    limit = _int_from_payload(payload.get("limit"), default=3)
    request = AvailabilityRequest(
        requested_date=str(payload.get("requested_date") or "").strip(),
        requested_time=str(payload.get("requested_time") or "").strip(),
        service=str(payload.get("service") or "").strip(),
        party_size=str(payload.get("party_size") or "").strip(),
        limit=limit,
    )
    health = adapter.health()
    slots = [slot.to_dict() for slot in adapter.list_available_slots(request)]
    availability_status = "available" if slots else "not_configured" if not health["ready"] else "no_matching_slots"
    return {
        "adapter": adapter.name,
        "adapter_health": health,
        "availability_status": availability_status,
        "slots": slots,
        "confirmation_status": "candidate_slots_only",
        "requires_staff_confirmation": True,
        "message": _availability_message(availability_status, len(slots)),
    }


def check_booking_capacity(payload: dict[str, Any], context: ToolContext) -> dict[str, Any]:
    result = check_availability(payload, context)
    result["legacy_tool"] = "check_booking_capacity"
    return result


def _int_from_payload(value: Any, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _availability_message(status: str, slot_count: int) -> str:
    if status == "available":
        noun = "slot" if slot_count == 1 else "slots"
        return f"{slot_count} candidate {noun} found. Staff must confirm final availability before the booking is confirmed."
    if status == "no_matching_slots":
        return "No matching candidate slots were found. Capture the booking request for staff review."
    return "No calendar availability is configured. Capture the booking request for staff review."


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
                        },
                        "category": {
                            "type": "string",
                            "enum": ["location", "services", "pricing", "booking_rules", "policies", "faq", "parking_accessibility"],
                            "description": "Optional structured business category to check first when the caller asks about a known area.",
                        }
                    },
                    "required": ["query"],
                },
                handler=business_info_lookup,
            ),
            ToolDefinition(
                name="create_booking",
                description=(
                    "Capture a local booking, reservation, or appointment request for staff review. This does not confirm final availability. "
                    "If the caller asks whether a time is available, use check_availability first when that tool is enabled. "
                    "Use business_type-specific fields when available. If details are missing after one concise follow-up, still save the request and include missing details. "
                    "The tool returns validation_status, missing fields, and confirmation_status so the caller and owner know the request still needs staff review."
                ),
                input_schema={
                    "type": "object",
                    "properties": {
                        "business_type": {
                            "type": "string",
                            "enum": ["general", "hotel", "restaurant", "appointment"],
                            "description": "Type of booking request. Use hotel for room stays, restaurant for dining reservations, appointment for service appointments.",
                        },
                        "customer_name": {
                            "type": "string",
                            "description": "Customer or guest name when available.",
                        },
                        "phone_number": {
                            "type": "string",
                            "description": "Customer callback phone number when available.",
                        },
                        "booking_time": {
                            "type": "string",
                            "description": "General requested date/time in the caller's words when a more specific field does not fit.",
                        },
                        "requested_date": {
                            "type": "string",
                            "description": "Requested date for restaurant or appointment requests.",
                        },
                        "requested_time": {
                            "type": "string",
                            "description": "Requested time for restaurant or appointment requests.",
                        },
                        "check_in_date": {
                            "type": "string",
                            "description": "Hotel check-in date.",
                        },
                        "check_out_date": {
                            "type": "string",
                            "description": "Hotel check-out date.",
                        },
                        "room_count": {
                            "type": "string",
                            "description": "Requested hotel room count or room type.",
                        },
                        "guest_count": {
                            "type": "string",
                            "description": "Guest count for hotel requests.",
                        },
                        "party_size": {
                            "type": "string",
                            "description": "Party size for restaurant requests.",
                        },
                        "service": {
                            "type": "string",
                            "description": "Requested service for appointment businesses.",
                        },
                        "urgency": {
                            "type": "string",
                            "description": "Urgency for appointment or service requests.",
                        },
                        "special_requests": {
                            "type": "string",
                            "description": "Special notes, allergies, accessibility needs, room preferences, or other request details.",
                        },
                        "notes": {
                            "type": "string",
                            "description": "Optional booking details, constraints, or unresolved uncertainty.",
                        },
                    },
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
                    "Use request_type=callback for after-hours callback requests. Use request_type=unresolved_question when saved business information is missing. "
                    "Use after one reasonable clarification attempt or when business staff should review the request later."
                ),
                input_schema={
                    "type": "object",
                    "properties": {
                        "request": {
                            "type": "string",
                            "description": "Concise summary of the customer's request, including any contact details or uncertainty mentioned.",
                        },
                        "request_type": {
                            "type": "string",
                            "enum": ["customer_request", "callback", "unresolved_question"],
                            "description": "Classify the follow-up. Use callback for after-hours callback requests.",
                        },
                    },
                    "required": ["request"],
                },
                handler=log_customer_request,
            ),
            ToolDefinition(
                name="check_availability",
                description=(
                    "Check locally configured candidate availability slots for a booking, reservation, or appointment request. "
                    "This does not create or confirm a booking. If no calendar availability is configured or no slot matches, capture the request with create_booking for staff review."
                ),
                input_schema={
                    "type": "object",
                    "properties": {
                        "requested_date": {
                            "type": "string",
                            "description": "Requested date or date phrase from the caller.",
                        },
                        "requested_time": {
                            "type": "string",
                            "description": "Requested time or time phrase from the caller.",
                        },
                        "service": {
                            "type": "string",
                            "description": "Requested service, room, table, or appointment type when relevant.",
                        },
                        "party_size": {
                            "type": "string",
                            "description": "Party size, guest count, or attendee count when relevant.",
                        },
                        "limit": {
                            "type": "integer",
                            "description": "Maximum number of candidate slots to return.",
                        },
                    },
                },
                handler=check_availability,
            ),
            ToolDefinition(
                name="check_booking_capacity",
                description=(
                    "Compatibility alias for check_availability. Prefer check_availability for new booking, reservation, or appointment availability checks."
                ),
                input_schema={
                    "type": "object",
                    "properties": {
                        "requested_date": {"type": "string"},
                        "requested_time": {"type": "string"},
                        "service": {"type": "string"},
                        "party_size": {"type": "string"},
                        "limit": {"type": "integer"},
                    },
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
