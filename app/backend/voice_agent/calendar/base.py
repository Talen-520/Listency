from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol


@dataclass(slots=True)
class AvailabilityRequest:
    requested_date: str = ""
    requested_time: str = ""
    service: str = ""
    party_size: str = ""
    limit: int = 3


@dataclass(slots=True)
class BookingRequest:
    customer_name: str
    slot_id: str
    contact: str = ""
    notes: str = ""
    idempotency_key: str = ""


@dataclass(slots=True)
class CalendarSlot:
    id: str
    label: str
    start: str = ""
    end: str = ""
    capacity: int | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "label": self.label,
            "start": self.start,
            "end": self.end,
            "capacity": self.capacity,
            "metadata": self.metadata,
        }


class CalendarAdapter(Protocol):
    name: str

    def health(self) -> dict[str, Any]:
        """Return local readiness for the calendar adapter."""

    def list_available_slots(self, request: AvailabilityRequest) -> list[CalendarSlot]:
        """Return a small set of candidate slots. These are not final confirmations."""

    def create_booking(self, request: BookingRequest) -> dict[str, Any]:
        """Create a confirmed booking when the adapter supports it."""

    def cancel_booking(self, booking_id: str) -> dict[str, Any]:
        """Reserved for a later confirmed-booking workflow."""
