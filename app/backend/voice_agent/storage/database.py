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

from voice_agent.config.paths import data_dir

DEFAULT_AGENT_SYSTEM_PROMPT = """Role
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
Before create_booking, confirm the customer's name, requested date/time, and any important notes. If the time or customer name is missing, ask one focused follow-up question. After saving, summarize the booking clearly.

Transfers And Escalation
Use transfer_call when the caller asks for a person, manager, front desk, emergency help, billing dispute, complaint escalation, or anything outside the saved information. Explain that a real phone transfer depends on the configured phone provider.

Unclear Audio
If audio is unclear, ask the caller to repeat once. If still unclear, ask a narrower clarifying question.

Call Ending
If the caller says goodbye, says they are done, or asks to end the call, use end_call. After end_call returns, say exactly one brief goodbye and do not ask another question."""


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
                  status TEXT NOT NULL,
                  started_at TEXT NOT NULL,
                  answered_at TEXT,
                  ended_at TEXT,
                  ended_reason TEXT,
                  error_message TEXT
                );
                """
            )

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

    def create_phone_call(self, provider: str, provider_call_id: str, from_number: str = "", to_number: str = "") -> int:
        with self.open_connection() as connection:
            cursor = connection.execute(
                """
                INSERT INTO phone_calls (provider, provider_call_id, from_number, to_number, status, started_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (provider, provider_call_id, from_number, to_number, "starting", utc_now()),
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

    def create_booking(self, customer_name: str, booking_time: str, notes: str = "") -> dict[str, Any]:
        with self.open_connection() as connection:
            cursor = connection.execute(
                """
                INSERT INTO bookings (customer_name, booking_time, notes, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (customer_name, booking_time, notes, utc_now()),
            )
            booking_id = cursor.lastrowid
        return {
            "id": booking_id,
            "customer_name": customer_name,
            "booking_time": booking_time,
            "notes": notes,
        }

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
