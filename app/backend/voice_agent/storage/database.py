from __future__ import annotations

import json
import sqlite3
import uuid
from collections.abc import Iterable, Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from voice_agent.core.business_hours import default_business_hours, normalize_business_hours_config
from voice_agent.config.paths import data_dir

LEGACY_DEFAULT_AGENT_SYSTEM_PROMPT = """Role
You are Listency, a realtime voice agent for a local business. Help callers with concise, natural speech.

Tone
Sound calm, warm, and professional. Keep most replies to one or two short spoken sentences.

Reasoning
Think before answering, but do not narrate your reasoning. Use the saved business profile and tools before guessing.

Preambles
If a tool call may take a moment, say a short preamble such as "Let me check that for you." Do not use a preamble for simple greetings, confirmations, or goodbyes.

Business Information
Use business_info_lookup for specific questions about hours, location, services, policies, prices, availability details, or anything that should come from the saved business profile. If the lookup is missing or unclear, say what you can verify and offer to take a message or transfer.

Bookings
If the caller asks whether a time is available, use check_availability first when enabled. Before create_booking, confirm the customer's name, requested date/time, and any important notes. If the time or customer name is missing, ask one focused follow-up question. After saving, summarize the booking clearly.

Transfers And Escalation
Use transfer_call when the caller asks for a person, manager, front desk, emergency help, billing dispute, complaint escalation, or anything outside the saved information. Explain that a real phone transfer depends on the configured phone provider.

Unclear Audio
If audio is unclear, ask the caller to repeat once. If still unclear, ask a narrower clarifying question.

Call Ending
If the caller says goodbye, says they are done, or asks to end the call, use end_call. After end_call returns, say exactly one brief goodbye and do not ask another question."""

DEFAULT_AGENT_SYSTEM_PROMPT = """System Guardrails
You are Listency, a realtime phone assistant for a local business. Speak naturally, briefly, and professionally. Do not read section titles aloud.

You can answer business questions, collect booking requests, log customer requests, transfer calls, and end calls. You cannot make unsupported promises, invent business facts, guarantee availability, provide legal/medical/financial advice, or act outside the enabled tools.

Use the caller's language when possible. Keep most replies to one or two short spoken sentences. Ask only one focused question at a time.

Use business_info_lookup before answering questions about hours, location, services, prices, policies, amenities, availability details, or any business-specific fact. If the saved information is missing or unclear, say what you can verify and offer to log the request or transfer the caller.

Use check_availability when the caller asks whether a booking, reservation, or appointment time is available. Candidate slots are not final confirmations. Use create_booking only after confirming the customer's name and requested date/time. A booking tool call saves a local request; it does not guarantee final availability unless a future calendar adapter explicitly confirms it.

Use transfer_call when the caller asks for a person, manager, front desk, emergency help, complaint escalation, billing dispute, or anything outside the saved information or enabled tools.

Use log_customer_request when the caller has a request you cannot confidently complete after one reasonable clarification attempt.

Use end_call when the caller says goodbye, asks to end the call, becomes abusive, repeatedly goes off-topic, or the conversation is complete. After end_call returns, say exactly one brief goodbye and do not ask another question.

Default Agent Template
Business type: local service business.
Tone: warm, calm, concise, and helpful.
Primary goal: answer common questions from the saved Business Info, collect booking or callback requests, and route complex issues to staff.
Greeting: Thank the caller for calling the business, then ask how you can help.
Booking flow: if the caller asks about availability, check candidate slots first. Then collect customer name, requested date/time, party size or service type, contact details if offered, and any special notes. Do not guarantee final confirmation unless a calendar adapter explicitly confirms it.
FAQ flow: answer from Business Info first. If the answer is not available, offer to log the question for staff follow-up.
Transfer flow: if the caller asks for a human or the issue is urgent, sensitive, or outside scope, use transfer_call.
Closing: when the task is complete, ask if there is anything else. If the caller is done, use end_call and say a short goodbye."""


def utc_now() -> str:
    return datetime.now(tz=UTC).isoformat()


def normalize_timestamp_filter(value: str | None) -> str | None:
    if not value:
        return value
    normalized = f"{value[:-1]}+00:00" if value.endswith("Z") else value
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return normalized
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC).isoformat()


@dataclass(slots=True)
class Database:
    path: Path | None = None

    def __post_init__(self) -> None:
        if self.path is None:
            self.path = data_dir() / "voice_agent.sqlite3"
        self.init()

    def connect(self) -> sqlite3.Connection:
        assert self.path is not None
        self.path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(self.path)
        connection.row_factory = sqlite3.Row
        return connection

    @contextmanager
    def open_connection(self) -> Iterator[sqlite3.Connection]:
        connection = self.connect()
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    def init(self) -> None:
        with self.open_connection() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS settings (
                  key TEXT PRIMARY KEY,
                  value TEXT NOT NULL,
                  updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS agents (
                  id TEXT PRIMARY KEY,
                  name TEXT NOT NULL,
                  system_prompt TEXT NOT NULL,
                  updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS business_profiles (
                  id TEXT PRIMARY KEY,
                  name TEXT NOT NULL,
                  content TEXT NOT NULL,
                  updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS sessions (
                  id TEXT PRIMARY KEY,
                  provider TEXT NOT NULL,
                  mode TEXT NOT NULL,
                  started_at TEXT NOT NULL,
                  ended_at TEXT,
                  status TEXT NOT NULL,
                  ended_reason TEXT,
                  error_message TEXT,
                  timeout_at TEXT
                );

                CREATE TABLE IF NOT EXISTS messages (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  session_id TEXT NOT NULL,
                  role TEXT NOT NULL,
                  content TEXT NOT NULL,
                  created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS transcripts (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  session_id TEXT NOT NULL,
                  speaker TEXT NOT NULL,
                  content TEXT NOT NULL,
                  is_final INTEGER NOT NULL DEFAULT 1,
                  created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS tool_calls (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  session_id TEXT,
                  tool_name TEXT NOT NULL,
                  input_json TEXT NOT NULL,
                  output_json TEXT,
                  status TEXT NOT NULL,
                  started_at TEXT NOT NULL,
                  ended_at TEXT,
                  error_message TEXT
                );

                CREATE TABLE IF NOT EXISTS bookings (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  customer_name TEXT NOT NULL,
                  booking_time TEXT NOT NULL,
                  notes TEXT,
                  idempotency_key TEXT,
                  created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS app_logs (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  level TEXT NOT NULL,
                  event TEXT NOT NULL,
                  message TEXT NOT NULL,
                  metadata_json TEXT,
                  created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS phone_calls (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  provider TEXT NOT NULL,
                  provider_call_id TEXT NOT NULL,
                  provider_stream_id TEXT,
                  session_id TEXT,
                  from_number TEXT,
                  to_number TEXT,
                  business_hours_status TEXT,
                  business_hours_policy TEXT,
                  business_hours_mode TEXT,
                  business_hours_reason TEXT,
                  status TEXT NOT NULL,
                  started_at TEXT NOT NULL,
                  answered_at TEXT,
                  ended_at TEXT,
                  ended_reason TEXT,
                  error_message TEXT
                );

                CREATE TABLE IF NOT EXISTS follow_up_tasks (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  session_id TEXT,
                  phone_call_id INTEGER,
                  status TEXT NOT NULL,
                  priority TEXT NOT NULL,
                  type TEXT NOT NULL,
                  title TEXT NOT NULL,
                  summary TEXT NOT NULL,
                  caller_name TEXT,
                  caller_phone TEXT,
                  due_at TEXT,
                  source_event TEXT,
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL,
                  completed_at TEXT
                );

                CREATE TABLE IF NOT EXISTS agent_evaluations (
                  id TEXT PRIMARY KEY,
                  status TEXT NOT NULL,
                  scenario_count INTEGER NOT NULL,
                  passed_count INTEGER NOT NULL,
                  failed_count INTEGER NOT NULL,
                  duration_ms INTEGER NOT NULL,
                  results_json TEXT NOT NULL,
                  created_at TEXT NOT NULL
                );
                """
            )
            self._ensure_columns(
                connection,
                "phone_calls",
                {
                    "business_hours_status": "TEXT",
                    "business_hours_policy": "TEXT",
                    "business_hours_mode": "TEXT",
                    "business_hours_reason": "TEXT",
                },
            )
            self._ensure_columns(connection, "bookings", {"idempotency_key": "TEXT"})
            row = connection.execute("SELECT system_prompt FROM agents WHERE id = 'default'").fetchone()
            if row and row["system_prompt"] == LEGACY_DEFAULT_AGENT_SYSTEM_PROMPT:
                connection.execute(
                    "UPDATE agents SET system_prompt = ?, updated_at = ? WHERE id = 'default'",
                    (DEFAULT_AGENT_SYSTEM_PROMPT, utc_now()),
                )

    def _ensure_columns(self, connection: sqlite3.Connection, table: str, columns: dict[str, str]) -> None:
        existing = {row["name"] for row in connection.execute(f"PRAGMA table_info({table})").fetchall()}
        for name, definition in columns.items():
            if name not in existing:
                connection.execute(f"ALTER TABLE {table} ADD COLUMN {name} {definition}")

    def set_setting(self, key: str, value: str) -> None:
        now = utc_now()
        with self.open_connection() as connection:
            connection.execute(
                """
                INSERT INTO settings (key, value, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
                """,
                (key, value, now),
            )

    def get_setting(self, key: str, default: str = "") -> str:
        with self.open_connection() as connection:
            row = connection.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
        return str(row["value"]) if row else default

    def get_business_hours(self) -> dict[str, Any]:
        raw_value = self.get_setting("business_hours", "")
        if not raw_value:
            return default_business_hours()
        try:
            payload = json.loads(raw_value)
        except json.JSONDecodeError:
            return default_business_hours()
        return normalize_business_hours_config(payload if isinstance(payload, dict) else {})

    def set_business_hours(self, config: dict[str, Any]) -> dict[str, Any]:
        normalized = normalize_business_hours_config(config)
        self.set_setting("business_hours", json.dumps(normalized, ensure_ascii=False))
        return normalized

    def get_business_info_sections(self) -> dict[str, str]:
        raw_value = self.get_setting("business_info_sections", "")
        defaults = {
            "business_type": "general",
            "location": "",
            "services": "",
            "pricing": "",
            "booking_rules": "",
            "policies": "",
            "faq": "",
            "parking_accessibility": "",
        }
        if not raw_value:
            return defaults
        try:
            payload = json.loads(raw_value)
        except json.JSONDecodeError:
            return defaults
        if not isinstance(payload, dict):
            return defaults
        return {key: str(payload.get(key) or "") for key in defaults}

    def set_business_info_sections(self, sections: dict[str, Any]) -> dict[str, str]:
        normalized = {key: str(value or "") for key, value in self.get_business_info_sections().items()}
        for key in normalized:
            if key in sections:
                normalized[key] = str(sections.get(key) or "")
        self.set_setting("business_info_sections", json.dumps(normalized, ensure_ascii=False))
        return normalized

    def get_calendar_availability(self) -> dict[str, Any]:
        raw_value = self.get_setting("calendar_availability", "")
        empty = {"adapter": "manual", "slots": []}
        if not raw_value:
            return empty
        try:
            payload = json.loads(raw_value)
        except json.JSONDecodeError:
            return empty
        if isinstance(payload, list):
            return {"adapter": "manual", "slots": payload}
        if not isinstance(payload, dict):
            return empty
        raw_slots = payload.get("slots", [])
        return {
            "adapter": str(payload.get("adapter") or "manual"),
            "slots": raw_slots if isinstance(raw_slots, list) else [],
        }

    def set_calendar_availability(self, payload: dict[str, Any]) -> dict[str, Any]:
        slots: list[dict[str, Any]] = []
        for index, raw_slot in enumerate(payload.get("slots", [])):
            if not isinstance(raw_slot, dict):
                continue
            label = str(raw_slot.get("label") or "").strip()
            if not label:
                continue
            capacity = raw_slot.get("capacity")
            normalized_capacity: int | None = None
            if isinstance(capacity, (int, float)) and capacity >= 0:
                normalized_capacity = int(capacity)
            slots.append(
                {
                    "id": str(raw_slot.get("id") or f"manual-{index + 1}"),
                    "label": label,
                    "start": str(raw_slot.get("start") or ""),
                    "end": str(raw_slot.get("end") or ""),
                    "capacity": normalized_capacity,
                    "metadata": raw_slot.get("metadata") if isinstance(raw_slot.get("metadata"), dict) else {},
                }
            )
        normalized = {
            "adapter": str(payload.get("adapter") or "manual"),
            "slots": slots,
        }
        self.set_setting("calendar_availability", json.dumps(normalized, ensure_ascii=False))
        return normalized

    def upsert_business_profile(self, content: str, name: str = "Default Business") -> dict[str, Any]:
        now = utc_now()
        with self.open_connection() as connection:
            connection.execute(
                """
                INSERT INTO business_profiles (id, name, content, updated_at)
                VALUES ('default', ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET name = excluded.name, content = excluded.content, updated_at = excluded.updated_at
                """,
                (name, content, now),
            )
        return self.get_business_profile()

    def get_business_profile(self) -> dict[str, Any]:
        with self.open_connection() as connection:
            row = connection.execute(
                "SELECT id, name, content, updated_at FROM business_profiles WHERE id = 'default'"
            ).fetchone()
        if not row:
            return {"id": "default", "name": "Default Business", "content": "", "updated_at": None}
        return dict(row)

    def upsert_default_agent(self, system_prompt: str, name: str = "Default Agent") -> dict[str, Any]:
        return self.upsert_agent("default", system_prompt, name)

    def upsert_active_agent(self, system_prompt: str, name: str = "Default Agent") -> dict[str, Any]:
        active_agent_id = self.get_active_agent_id()
        return self.upsert_agent(active_agent_id, system_prompt, name)

    def upsert_agent(self, agent_id: str, system_prompt: str, name: str = "Default Agent") -> dict[str, Any]:
        agent_id = agent_id.strip() or "default"
        name = name.strip() or "Untitled Agent"
        now = utc_now()
        with self.open_connection() as connection:
            connection.execute(
                """
                INSERT INTO agents (id, name, system_prompt, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET name = excluded.name, system_prompt = excluded.system_prompt, updated_at = excluded.updated_at
                """,
                (agent_id, name, system_prompt, now),
            )
        return self.get_agent(agent_id) or self.get_default_agent()

    def create_agent(self, system_prompt: str, name: str = "New Agent") -> dict[str, Any]:
        if self._stored_agent_count() == 0:
            self.upsert_default_agent(DEFAULT_AGENT_SYSTEM_PROMPT, "Default Agent")
        agent_id = f"agent_{uuid.uuid4().hex}"
        return self.upsert_agent(agent_id, system_prompt or DEFAULT_AGENT_SYSTEM_PROMPT, name)

    def get_default_agent(self) -> dict[str, Any]:
        return self.get_agent("default") or {
            "id": "default",
            "name": "Default Agent",
            "system_prompt": DEFAULT_AGENT_SYSTEM_PROMPT,
            "updated_at": None,
        }

    def get_agent(self, agent_id: str) -> dict[str, Any] | None:
        with self.open_connection() as connection:
            row = connection.execute(
                "SELECT id, name, system_prompt, updated_at FROM agents WHERE id = ?",
                (agent_id,),
            ).fetchone()
        return dict(row) if row else None

    def list_agents(self) -> list[dict[str, Any]]:
        with self.open_connection() as connection:
            rows = connection.execute(
                """
                SELECT id, name, system_prompt, updated_at
                FROM agents
                ORDER BY CASE WHEN id = 'default' THEN 0 ELSE 1 END, updated_at DESC, name COLLATE NOCASE
                """
            ).fetchall()
        if not rows:
            return [self.get_default_agent()]
        return [dict(row) for row in rows]

    def _stored_agent_count(self) -> int:
        with self.open_connection() as connection:
            row = connection.execute("SELECT COUNT(*) AS count FROM agents").fetchone()
        return int(row["count"]) if row else 0

    def get_active_agent_id(self) -> str:
        active_agent_id = self.get_setting("active_agent_id", "default").strip() or "default"
        if self.get_agent(active_agent_id):
            return active_agent_id
        agents = self.list_agents()
        return str(agents[0]["id"]) if agents else "default"

    def get_active_agent(self) -> dict[str, Any]:
        agent = self.get_agent(self.get_active_agent_id())
        return agent or self.get_default_agent()

    def set_active_agent(self, agent_id: str) -> dict[str, Any]:
        agent = self.get_agent(agent_id)
        if not agent and agent_id == "default":
            agent = self.upsert_default_agent(DEFAULT_AGENT_SYSTEM_PROMPT, "Default Agent")
        if not agent:
            raise KeyError(f"Agent not found: {agent_id}")
        self.set_setting("active_agent_id", agent_id)
        return agent

    def delete_agent(self, agent_id: str) -> dict[str, Any]:
        agent = self.get_agent(agent_id)
        if not agent:
            raise KeyError(f"Agent not found: {agent_id}")

        agents = self.list_agents()
        if len(agents) <= 1:
            raise ValueError("At least one agent is required.")

        active_agent_id = self.get_active_agent_id()
        with self.open_connection() as connection:
            connection.execute("DELETE FROM agents WHERE id = ?", (agent_id,))

        if active_agent_id == agent_id:
            remaining = self.list_agents()
            self.set_setting("active_agent_id", str(remaining[0]["id"]))
        return agent

    def create_session(self, session_id: str, provider: str, mode: str, status: str, timeout_at: str) -> None:
        with self.open_connection() as connection:
            connection.execute(
                """
                INSERT INTO sessions (id, provider, mode, started_at, status, timeout_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (session_id, provider, mode, utc_now(), status, timeout_at),
            )

    def create_phone_call(
        self,
        provider: str,
        provider_call_id: str,
        from_number: str = "",
        to_number: str = "",
        business_hours: dict[str, Any] | None = None,
    ) -> int:
        business_hours = business_hours or {}
        with self.open_connection() as connection:
            cursor = connection.execute(
                """
                INSERT INTO phone_calls (
                  provider, provider_call_id, from_number, to_number,
                  business_hours_status, business_hours_policy, business_hours_mode, business_hours_reason,
                  status, started_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    provider,
                    provider_call_id,
                    from_number,
                    to_number,
                    str(business_hours.get("status") or ""),
                    str(business_hours.get("active_policy") or ""),
                    str(business_hours.get("after_hours_mode") or ""),
                    str(business_hours.get("reason") or ""),
                    "starting",
                    utc_now(),
                ),
            )
            return int(cursor.lastrowid)

    def attach_phone_session(self, phone_call_id: int, session_id: str) -> None:
        with self.open_connection() as connection:
            connection.execute(
                """
                UPDATE phone_calls
                SET session_id = ?, answered_at = ?
                WHERE id = ?
                """,
                (session_id, utc_now(), phone_call_id),
            )

    def update_phone_call_stream(self, phone_call_id: int, provider_stream_id: str) -> None:
        with self.open_connection() as connection:
            connection.execute(
                """
                UPDATE phone_calls
                SET provider_stream_id = ?
                WHERE id = ?
                """,
                (provider_stream_id, phone_call_id),
            )

    def update_phone_call_status(
        self,
        phone_call_id: int,
        status: str,
        *,
        ended_reason: str = "",
        error_message: str | None = None,
    ) -> None:
        ended_at = utc_now() if status in {"completed", "failed", "transferred", "caller_hung_up"} else None
        with self.open_connection() as connection:
            connection.execute(
                """
                UPDATE phone_calls
                SET status = ?,
                    ended_at = COALESCE(?, ended_at),
                    ended_reason = COALESCE(NULLIF(?, ''), ended_reason),
                    error_message = COALESCE(?, error_message)
                WHERE id = ?
                """,
                (status, ended_at, ended_reason, error_message, phone_call_id),
            )

    def get_phone_call_by_session(self, session_id: str) -> dict[str, Any] | None:
        with self.open_connection() as connection:
            row = connection.execute(
                """
                SELECT id, provider, provider_call_id, provider_stream_id, session_id, from_number, to_number,
                       business_hours_status, business_hours_policy, business_hours_mode, business_hours_reason,
                       status, started_at, answered_at, ended_at, ended_reason, error_message
                FROM phone_calls
                WHERE session_id = ?
                ORDER BY id DESC
                LIMIT 1
                """,
                (session_id,),
            ).fetchone()
        return dict(row) if row else None

    def list_phone_calls(
        self,
        limit: int = 100,
        since: str | None = None,
        session_id: str | None = None,
    ) -> list[dict[str, Any]]:
        since = normalize_timestamp_filter(since)
        query = """
                SELECT id, provider, provider_call_id, provider_stream_id, session_id, from_number, to_number,
                       business_hours_status, business_hours_policy, business_hours_mode, business_hours_reason,
                       status, started_at, answered_at, ended_at, ended_reason, error_message
                FROM phone_calls
                """
        filters = []
        params: list[Any] = []
        if since:
            filters.append("started_at >= ?")
            params.append(since)
        if session_id:
            filters.append("session_id = ?")
            params.append(session_id)
        if filters:
            query += f" WHERE {' AND '.join(filters)}"
        query += " ORDER BY started_at DESC LIMIT ?"
        with self.open_connection() as connection:
            rows = connection.execute(query, (*params, limit)).fetchall()
        return [dict(row) for row in rows]

    def finish_session(
        self,
        session_id: str,
        status: str,
        ended_reason: str,
        error_message: str | None = None,
    ) -> None:
        with self.open_connection() as connection:
            connection.execute(
                """
                UPDATE sessions
                SET status = ?, ended_at = ?, ended_reason = ?, error_message = ?
                WHERE id = ?
                """,
                (status, utc_now(), ended_reason, error_message, session_id),
            )

    def list_sessions(self, limit: int = 50, since: str | None = None) -> list[dict[str, Any]]:
        since = normalize_timestamp_filter(since)
        query = """
                SELECT id, provider, mode, started_at, ended_at, status, ended_reason, error_message, timeout_at
                FROM sessions
                """
        params: Iterable[Any]
        if since:
            query += " WHERE started_at >= ?"
            params = (since,)
        else:
            params = ()
        query += " ORDER BY started_at DESC LIMIT ?"
        with self.open_connection() as connection:
            rows = connection.execute(query, (*params, limit)).fetchall()
        return [dict(row) for row in rows]

    def add_transcript(self, session_id: str, speaker: str, content: str, is_final: bool = True) -> None:
        with self.open_connection() as connection:
            connection.execute(
                """
                INSERT INTO transcripts (session_id, speaker, content, is_final, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (session_id, speaker, content, int(is_final), utc_now()),
            )

    def list_transcripts(self, session_id: str | None = None, limit: int = 100, since: str | None = None) -> list[dict[str, Any]]:
        since = normalize_timestamp_filter(since)
        query = "SELECT session_id, speaker, content, is_final, created_at FROM transcripts"
        conditions = []
        params: list[Any] = []
        if session_id:
            conditions.append("session_id = ?")
            params.append(session_id)
        if since:
            conditions.append("created_at >= ?")
            params.append(since)
        if conditions:
            query += " WHERE " + " AND ".join(conditions)
        query += " ORDER BY created_at DESC LIMIT ?"
        with self.open_connection() as connection:
            rows = connection.execute(query, (*params, limit)).fetchall()
        return [dict(row) for row in rows]

    def add_message(self, session_id: str, role: str, content: str) -> None:
        with self.open_connection() as connection:
            connection.execute(
                """
                INSERT INTO messages (session_id, role, content, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (session_id, role, content, utc_now()),
            )

    def add_tool_call(
        self,
        tool_name: str,
        input_data: dict[str, Any],
        output_data: dict[str, Any] | None,
        status: str,
        session_id: str | None = None,
        error_message: str | None = None,
    ) -> None:
        now = utc_now()
        with self.open_connection() as connection:
            connection.execute(
                """
                INSERT INTO tool_calls (
                  session_id, tool_name, input_json, output_json, status, started_at, ended_at, error_message
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    session_id,
                    tool_name,
                    json.dumps(input_data, ensure_ascii=False),
                    json.dumps(output_data, ensure_ascii=False) if output_data is not None else None,
                    status,
                    now,
                    now,
                    error_message,
                ),
            )

    def list_tool_calls(self, limit: int = 100, session_id: str | None = None, since: str | None = None) -> list[dict[str, Any]]:
        since = normalize_timestamp_filter(since)
        query = """
                SELECT id, session_id, tool_name, input_json, output_json, status, started_at, ended_at, error_message
                FROM tool_calls
                """
        conditions = []
        params: list[Any] = []
        if session_id:
            conditions.append("session_id = ?")
            params.append(session_id)
        if since:
            conditions.append("started_at >= ?")
            params.append(since)
        if conditions:
            query += " WHERE " + " AND ".join(conditions)
        query += " ORDER BY started_at DESC LIMIT ?"
        with self.open_connection() as connection:
            rows = connection.execute(query, (*params, limit)).fetchall()
        return [dict(row) for row in rows]

    def create_booking(self, customer_name: str, booking_time: str, notes: str = "", idempotency_key: str = "") -> dict[str, Any]:
        idempotency_key = idempotency_key.strip()
        with self.open_connection() as connection:
            if idempotency_key:
                existing = connection.execute(
                    """
                    SELECT id, customer_name, booking_time, notes, idempotency_key
                    FROM bookings
                    WHERE idempotency_key = ?
                    ORDER BY id ASC
                    LIMIT 1
                    """,
                    (idempotency_key,),
                ).fetchone()
                if existing:
                    return {
                        "id": existing["id"],
                        "customer_name": existing["customer_name"],
                        "booking_time": existing["booking_time"],
                        "notes": existing["notes"] or "",
                        "idempotency_key": existing["idempotency_key"] or "",
                        "deduplicated": True,
                    }
            cursor = connection.execute(
                """
                INSERT INTO bookings (customer_name, booking_time, notes, idempotency_key, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (customer_name, booking_time, notes, idempotency_key or None, utc_now()),
            )
            booking_id = cursor.lastrowid
        return {
            "id": booking_id,
            "customer_name": customer_name,
            "booking_time": booking_time,
            "notes": notes,
            "idempotency_key": idempotency_key,
            "deduplicated": False,
        }

    def create_follow_up_task(
        self,
        *,
        type: str,
        title: str,
        summary: str,
        session_id: str | None = None,
        phone_call_id: int | None = None,
        status: str = "new",
        priority: str = "normal",
        caller_name: str = "",
        caller_phone: str = "",
        due_at: str | None = None,
        source_event: str = "",
    ) -> dict[str, Any]:
        now = utc_now()
        if session_id and phone_call_id is None:
            phone_call = self.get_phone_call_by_session(session_id)
            phone_call_id = int(phone_call["id"]) if phone_call else None
            caller_phone = caller_phone or str(phone_call.get("from_number") or "") if phone_call else caller_phone
        with self.open_connection() as connection:
            cursor = connection.execute(
                """
                INSERT INTO follow_up_tasks (
                  session_id, phone_call_id, status, priority, type, title, summary, caller_name, caller_phone,
                  due_at, source_event, created_at, updated_at, completed_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    session_id,
                    phone_call_id,
                    status,
                    priority,
                    type,
                    title,
                    summary,
                    caller_name,
                    caller_phone,
                    due_at,
                    source_event,
                    now,
                    now,
                    now if status == "done" else None,
                ),
            )
            task_id = int(cursor.lastrowid)
        task = self.get_follow_up_task(task_id)
        assert task is not None
        return task

    def create_follow_up_task_once(
        self,
        *,
        type: str,
        title: str,
        summary: str,
        session_id: str | None = None,
        phone_call_id: int | None = None,
        status: str = "new",
        priority: str = "normal",
        caller_name: str = "",
        caller_phone: str = "",
        due_at: str | None = None,
        source_event: str = "",
    ) -> dict[str, Any]:
        with self.open_connection() as connection:
            row = connection.execute(
                """
                SELECT id
                FROM follow_up_tasks
                WHERE type = ?
                  AND COALESCE(session_id, '') = COALESCE(?, '')
                  AND COALESCE(phone_call_id, 0) = COALESCE(?, 0)
                  AND COALESCE(source_event, '') = COALESCE(?, '')
                ORDER BY id DESC
                LIMIT 1
                """,
                (type, session_id, phone_call_id, source_event),
            ).fetchone()
        if row:
            task = self.get_follow_up_task(int(row["id"]))
            assert task is not None
            return task
        return self.create_follow_up_task(
            type=type,
            title=title,
            summary=summary,
            session_id=session_id,
            phone_call_id=phone_call_id,
            status=status,
            priority=priority,
            caller_name=caller_name,
            caller_phone=caller_phone,
            due_at=due_at,
            source_event=source_event,
        )

    def get_follow_up_task(self, task_id: int) -> dict[str, Any] | None:
        with self.open_connection() as connection:
            row = connection.execute(
                """
                SELECT id, session_id, phone_call_id, status, priority, type, title, summary, caller_name, caller_phone,
                       due_at, source_event, created_at, updated_at, completed_at
                FROM follow_up_tasks
                WHERE id = ?
                """,
                (task_id,),
            ).fetchone()
        return dict(row) if row else None

    def list_follow_up_tasks(self, limit: int = 100, status: str | None = None) -> list[dict[str, Any]]:
        query = """
                SELECT id, session_id, phone_call_id, status, priority, type, title, summary, caller_name, caller_phone,
                       due_at, source_event, created_at, updated_at, completed_at
                FROM follow_up_tasks
                """
        params: list[Any] = []
        if status:
            query += " WHERE status = ?"
            params.append(status)
        query += " ORDER BY CASE status WHEN 'new' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END, created_at DESC LIMIT ?"
        with self.open_connection() as connection:
            rows = connection.execute(query, (*params, limit)).fetchall()
        return [dict(row) for row in rows]

    def update_follow_up_task_status(self, task_id: int, status: str) -> dict[str, Any]:
        now = utc_now()
        with self.open_connection() as connection:
            connection.execute(
                """
                UPDATE follow_up_tasks
                SET status = ?, updated_at = ?, completed_at = CASE WHEN ? = 'done' THEN ? ELSE completed_at END
                WHERE id = ?
                """,
                (status, now, status, now, task_id),
            )
        task = self.get_follow_up_task(task_id)
        if not task:
            raise KeyError(f"Follow-up task not found: {task_id}")
        return task

    def delete_follow_up_task(self, task_id: int) -> dict[str, Any]:
        task = self.get_follow_up_task(task_id)
        if not task:
            raise KeyError(f"Follow-up task not found: {task_id}")
        with self.open_connection() as connection:
            connection.execute("DELETE FROM follow_up_tasks WHERE id = ?", (task_id,))
        return task

    def create_agent_evaluation(self, run: dict[str, Any]) -> dict[str, Any]:
        now = utc_now()
        run_id = str(run.get("id") or f"eval_{uuid.uuid4().hex}")
        with self.open_connection() as connection:
            connection.execute(
                """
                INSERT INTO agent_evaluations (
                  id, status, scenario_count, passed_count, failed_count, duration_ms, results_json, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    run_id,
                    str(run.get("status") or "failed"),
                    int(run.get("scenario_count") or 0),
                    int(run.get("passed_count") or 0),
                    int(run.get("failed_count") or 0),
                    int(run.get("duration_ms") or 0),
                    json.dumps(
                        {
                            "uses_scratch_database": bool(run.get("uses_scratch_database")),
                            "results": run.get("results", []),
                        },
                        ensure_ascii=False,
                    ),
                    now,
                ),
            )
        evaluation = self.get_agent_evaluation(run_id)
        assert evaluation is not None
        return evaluation

    def get_agent_evaluation(self, run_id: str) -> dict[str, Any] | None:
        with self.open_connection() as connection:
            row = connection.execute(
                """
                SELECT id, status, scenario_count, passed_count, failed_count, duration_ms, results_json, created_at
                FROM agent_evaluations
                WHERE id = ?
                """,
                (run_id,),
            ).fetchone()
        return self._agent_evaluation_from_row(row, include_results=True) if row else None

    def list_agent_evaluations(self, limit: int = 20) -> list[dict[str, Any]]:
        with self.open_connection() as connection:
            rows = connection.execute(
                """
                SELECT id, status, scenario_count, passed_count, failed_count, duration_ms, results_json, created_at
                FROM agent_evaluations
                ORDER BY created_at DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
        return [self._agent_evaluation_from_row(row, include_results=False) for row in rows]

    def _agent_evaluation_from_row(self, row: sqlite3.Row, *, include_results: bool) -> dict[str, Any]:
        try:
            results_payload = json.loads(str(row["results_json"] or "{}"))
        except json.JSONDecodeError:
            results_payload = {}
        evaluation = {
            "id": row["id"],
            "status": row["status"],
            "scenario_count": row["scenario_count"],
            "passed_count": row["passed_count"],
            "failed_count": row["failed_count"],
            "duration_ms": row["duration_ms"],
            "uses_scratch_database": bool(results_payload.get("uses_scratch_database")),
            "created_at": row["created_at"],
        }
        if include_results:
            evaluation["results"] = results_payload.get("results", [])
        return evaluation

    def add_log(self, level: str, event: str, message: str, metadata: dict[str, Any] | None = None) -> None:
        with self.open_connection() as connection:
            connection.execute(
                """
                INSERT INTO app_logs (level, event, message, metadata_json, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    level,
                    event,
                    message,
                    json.dumps(metadata, ensure_ascii=False) if metadata else None,
                    utc_now(),
                ),
            )

    def list_logs(self, limit: int = 100, session_id: str | None = None, since: str | None = None) -> list[dict[str, Any]]:
        since = normalize_timestamp_filter(since)
        query = """
                SELECT id, level, event, message, metadata_json, created_at
                FROM app_logs
                """
        conditions = []
        params: list[Any] = []
        if session_id:
            conditions.append("metadata_json LIKE ?")
            params.append(f'%"session_id": "{session_id}"%')
        if since:
            conditions.append("created_at >= ?")
            params.append(since)
        if conditions:
            query += " WHERE " + " AND ".join(conditions)
        query += " ORDER BY created_at DESC LIMIT ?"
        with self.open_connection() as connection:
            rows = connection.execute(query, (*params, limit)).fetchall()
        return [dict(row) for row in rows]

    def export_log_data(self, since: str | None = None, session_id: str | None = None) -> dict[str, list[dict[str, Any]]]:
        since = normalize_timestamp_filter(since)
        return {
            "sessions": self._list_export_rows(
                """
                SELECT id, provider, mode, started_at, ended_at, status, ended_reason, error_message, timeout_at
                FROM sessions
                """,
                timestamp_column="started_at",
                since=since,
                session_id=session_id,
                session_column="id",
                order_column="started_at",
            ),
            "transcripts": self._list_export_rows(
                "SELECT session_id, speaker, content, is_final, created_at FROM transcripts",
                timestamp_column="created_at",
                since=since,
                session_id=session_id,
                session_column="session_id",
                order_column="created_at",
            ),
            "tool_calls": self._list_export_rows(
                """
                SELECT id, session_id, tool_name, input_json, output_json, status, started_at, ended_at, error_message
                FROM tool_calls
                """,
                timestamp_column="started_at",
                since=since,
                session_id=session_id,
                session_column="session_id",
                order_column="started_at",
            ),
            "app_logs": self._list_export_rows(
                "SELECT id, level, event, message, metadata_json, created_at FROM app_logs",
                timestamp_column="created_at",
                since=since,
                session_id=session_id,
                session_column=None,
                order_column="created_at",
            ),
            "phone_calls": self._list_export_rows(
                """
                SELECT id, provider, provider_call_id, provider_stream_id, session_id, from_number, to_number,
                       business_hours_status, business_hours_policy, business_hours_mode, business_hours_reason,
                       status, started_at, answered_at, ended_at, ended_reason, error_message
                FROM phone_calls
                """,
                timestamp_column="started_at",
                since=since,
                session_id=session_id,
                session_column="session_id",
                order_column="started_at",
            ),
        }

    def prune_log_data(self, retention_days: int = 30, protected_session_ids: Iterable[str] = ()) -> dict[str, Any]:
        cutoff = (datetime.now(tz=UTC) - timedelta(days=retention_days)).isoformat()
        deleted = self.delete_log_data_before(cutoff, protected_session_ids)
        return {"retention_days": retention_days, "cutoff": cutoff, "deleted": deleted}

    def delete_log_data_before(self, cutoff: str, protected_session_ids: Iterable[str] = ()) -> dict[str, int]:
        cutoff = normalize_timestamp_filter(cutoff) or cutoff
        protected = tuple(protected_session_ids)
        with self.open_connection() as connection:
            old_session_query = "SELECT id FROM sessions WHERE started_at < ?"
            old_session_params: list[Any] = [cutoff]
            if protected:
                old_session_query += f" AND id NOT IN ({','.join('?' for _ in protected)})"
                old_session_params.extend(protected)
            old_session_ids = [str(row["id"]) for row in connection.execute(old_session_query, old_session_params).fetchall()]

            deleted = {
                "sessions": 0,
                "messages": 0,
                "transcripts": 0,
                "tool_calls": 0,
                "app_logs": 0,
                "phone_calls": 0,
            }

            for table, timestamp_column in (("messages", "created_at"), ("transcripts", "created_at")):
                deleted[table] += self._delete_by_session_ids(connection, table, old_session_ids)
                deleted[table] += self._delete_older_than(connection, table, timestamp_column, cutoff, protected)

            deleted["tool_calls"] += self._delete_by_session_ids(connection, "tool_calls", old_session_ids)
            deleted["tool_calls"] += self._delete_older_than(connection, "tool_calls", "started_at", cutoff, protected)
            deleted["phone_calls"] += self._delete_by_session_ids(connection, "phone_calls", old_session_ids)
            deleted["phone_calls"] += self._delete_older_than(connection, "phone_calls", "started_at", cutoff, protected)

            app_log_query = "DELETE FROM app_logs WHERE created_at < ?"
            app_log_params: list[Any] = [cutoff]
            app_log_guard = self._protected_app_log_condition(protected)
            if app_log_guard:
                app_log_query += f" AND {app_log_guard[0]}"
                app_log_params.extend(app_log_guard[1])
            deleted["app_logs"] += connection.execute(app_log_query, app_log_params).rowcount

            deleted["sessions"] += self._delete_sessions_by_ids(connection, old_session_ids)
        return deleted

    def clear_log_data(self, protected_session_ids: Iterable[str] = ()) -> dict[str, int]:
        protected = tuple(protected_session_ids)
        deleted = {
            "sessions": 0,
            "messages": 0,
            "transcripts": 0,
            "tool_calls": 0,
            "app_logs": 0,
            "phone_calls": 0,
        }
        with self.open_connection() as connection:
            if not protected:
                for table in ("messages", "transcripts", "tool_calls", "phone_calls", "app_logs", "sessions"):
                    deleted[table] = connection.execute(f"DELETE FROM {table}").rowcount
                return deleted

            placeholders = ",".join("?" for _ in protected)
            for table in ("messages", "transcripts"):
                deleted[table] = connection.execute(
                    f"DELETE FROM {table} WHERE session_id NOT IN ({placeholders})",
                    protected,
                ).rowcount
            deleted["tool_calls"] = connection.execute(
                f"DELETE FROM tool_calls WHERE session_id IS NULL OR session_id NOT IN ({placeholders})",
                protected,
            ).rowcount
            deleted["phone_calls"] = connection.execute(
                f"DELETE FROM phone_calls WHERE session_id IS NULL OR session_id NOT IN ({placeholders})",
                protected,
            ).rowcount

            app_log_guard = self._protected_app_log_condition(protected)
            app_log_query = "DELETE FROM app_logs"
            app_log_params: list[Any] = []
            if app_log_guard:
                app_log_query += f" WHERE {app_log_guard[0]}"
                app_log_params.extend(app_log_guard[1])
            deleted["app_logs"] = connection.execute(app_log_query, app_log_params).rowcount

            deleted["sessions"] = connection.execute(
                f"DELETE FROM sessions WHERE id NOT IN ({placeholders})",
                protected,
            ).rowcount
        return deleted

    def _list_export_rows(
        self,
        select_sql: str,
        *,
        timestamp_column: str,
        since: str | None,
        session_id: str | None,
        session_column: str | None,
        order_column: str,
    ) -> list[dict[str, Any]]:
        conditions = []
        params: list[Any] = []
        if session_id:
            if session_column:
                conditions.append(f"{session_column} = ?")
                params.append(session_id)
            else:
                conditions.append("metadata_json LIKE ?")
                params.append(f'%"session_id"%"{session_id}"%')
        if since:
            conditions.append(f"{timestamp_column} >= ?")
            params.append(since)
        query = select_sql
        if conditions:
            query += " WHERE " + " AND ".join(conditions)
        query += f" ORDER BY {order_column} DESC"
        with self.open_connection() as connection:
            rows = connection.execute(query, params).fetchall()
        return [dict(row) for row in rows]

    def _delete_by_session_ids(self, connection: sqlite3.Connection, table: str, session_ids: list[str]) -> int:
        if not session_ids:
            return 0
        placeholders = ",".join("?" for _ in session_ids)
        return connection.execute(f"DELETE FROM {table} WHERE session_id IN ({placeholders})", session_ids).rowcount

    def _delete_sessions_by_ids(self, connection: sqlite3.Connection, session_ids: list[str]) -> int:
        if not session_ids:
            return 0
        placeholders = ",".join("?" for _ in session_ids)
        return connection.execute(f"DELETE FROM sessions WHERE id IN ({placeholders})", session_ids).rowcount

    def _delete_older_than(
        self,
        connection: sqlite3.Connection,
        table: str,
        timestamp_column: str,
        cutoff: str,
        protected_session_ids: tuple[str, ...],
    ) -> int:
        query = f"DELETE FROM {table} WHERE {timestamp_column} < ?"
        params: list[Any] = [cutoff]
        if protected_session_ids:
            placeholders = ",".join("?" for _ in protected_session_ids)
            query += f" AND (session_id IS NULL OR session_id NOT IN ({placeholders}))"
            params.extend(protected_session_ids)
        return connection.execute(query, params).rowcount

    def _protected_app_log_condition(self, protected_session_ids: tuple[str, ...]) -> tuple[str, list[str]] | None:
        if not protected_session_ids:
            return None
        checks = " OR ".join("metadata_json LIKE ?" for _ in protected_session_ids)
        params = [f'%"session_id"%"{session_id}"%' for session_id in protected_session_ids]
        return f"(metadata_json IS NULL OR NOT ({checks}))", params
