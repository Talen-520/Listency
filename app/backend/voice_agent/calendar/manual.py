from __future__ import annotations

from typing import Any

from voice_agent.calendar.base import AvailabilityRequest, BookingRequest, CalendarSlot


class ManualCalendarAdapter:
    name = "manual"

    def __init__(self, slots: list[CalendarSlot] | None = None) -> None:
        self._slots = slots or []

    @classmethod
    def from_payload(cls, payload: Any) -> "ManualCalendarAdapter":
        if isinstance(payload, dict):
            raw_slots = payload.get("slots", [])
        else:
            raw_slots = payload
        if not isinstance(raw_slots, list):
            raw_slots = []

        slots: list[CalendarSlot] = []
        for index, item in enumerate(raw_slots):
            if not isinstance(item, dict):
                continue
            label = str(item.get("label") or item.get("start") or "").strip()
            if not label:
                continue
            capacity = item.get("capacity")
            slots.append(
                CalendarSlot(
                    id=str(item.get("id") or f"manual-{index + 1}"),
                    label=label,
                    start=str(item.get("start") or ""),
                    end=str(item.get("end") or ""),
                    capacity=int(capacity) if isinstance(capacity, (int, float)) else None,
                    metadata=item.get("metadata") if isinstance(item.get("metadata"), dict) else {},
                )
            )
        return cls(slots)

    def health(self) -> dict[str, Any]:
        return {
            "adapter": self.name,
            "ready": bool(self._slots),
            "status": "ready" if self._slots else "not_configured",
            "slot_count": len(self._slots),
        }

    def list_available_slots(self, request: AvailabilityRequest) -> list[CalendarSlot]:
        limit = max(1, min(int(request.limit or 3), 10))
        terms = [
            request.requested_date.strip().lower(),
            request.requested_time.strip().lower(),
            request.service.strip().lower(),
        ]
        terms = [term for term in terms if term]
        if not terms:
            return self._slots[:limit]

        matches = []
        for slot in self._slots:
            haystack = " ".join(
                [
                    slot.label,
                    slot.start,
                    slot.end,
                    " ".join(str(value) for value in slot.metadata.values()),
                ]
            ).lower()
            if all(term in haystack for term in terms):
                matches.append(slot)
        return matches[:limit]

    def create_booking(self, request: BookingRequest) -> dict[str, Any]:
        return {
            "adapter": self.name,
            "status": "not_supported",
            "confirmation_status": "request_capture_required",
            "message": "Manual availability can suggest candidate slots, but staff must confirm the booking.",
            "slot_id": request.slot_id,
            "idempotency_key": request.idempotency_key,
        }

    def cancel_booking(self, booking_id: str) -> dict[str, Any]:
        return {
            "adapter": self.name,
            "booking_id": booking_id,
            "status": "not_supported",
            "message": "Manual availability does not own confirmed bookings, so there is nothing to cancel.",
        }
