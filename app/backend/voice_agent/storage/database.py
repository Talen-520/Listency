from __future__ import annotations

import json
import sqlite3
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from voice_agent.config.paths import data_dir


def utc_now() -> str:
    return datetime.now(tz=UTC).isoformat()


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

    def init(self) -> None:
        with self.connect() as connection:
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
                """
            )

    def set_setting(self, key: str, value: str) -> None:
        now = utc_now()
        with self.connect() as connection:
            connection.execute(
                """
                INSERT INTO settings (key, value, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
                """,
                (key, value, now),
            )

    def get_setting(self, key: str, default: str = "") -> str:
        with self.connect() as connection:
            row = connection.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
        return str(row["value"]) if row else default

    def upsert_business_profile(self, content: str, name: str = "Default Business") -> dict[str, Any]:
        now = utc_now()
        with self.connect() as connection:
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
        with self.connect() as connection:
            row = connection.execute(
                "SELECT id, name, content, updated_at FROM business_profiles WHERE id = 'default'"
            ).fetchone()
        if not row:
            return {"id": "default", "name": "Default Business", "content": "", "updated_at": None}
        return dict(row)

    def upsert_default_agent(self, system_prompt: str, name: str = "Default Agent") -> dict[str, Any]:
        now = utc_now()
        with self.connect() as connection:
            connection.execute(
                """
                INSERT INTO agents (id, name, system_prompt, updated_at)
                VALUES ('default', ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET name = excluded.name, system_prompt = excluded.system_prompt, updated_at = excluded.updated_at
                """,
                (name, system_prompt, now),
            )
        return self.get_default_agent()

    def get_default_agent(self) -> dict[str, Any]:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT id, name, system_prompt, updated_at FROM agents WHERE id = 'default'"
            ).fetchone()
        if not row:
            return {
                "id": "default",
                "name": "Default Agent",
                "system_prompt": "You are a helpful local business voice agent. Keep responses concise and natural.",
                "updated_at": None,
            }
        return dict(row)

    def create_session(self, session_id: str, provider: str, mode: str, status: str, timeout_at: str) -> None:
        with self.connect() as connection:
            connection.execute(
                """
                INSERT INTO sessions (id, provider, mode, started_at, status, timeout_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (session_id, provider, mode, utc_now(), status, timeout_at),
            )

    def finish_session(
        self,
        session_id: str,
        status: str,
        ended_reason: str,
        error_message: str | None = None,
    ) -> None:
        with self.connect() as connection:
            connection.execute(
                """
                UPDATE sessions
                SET status = ?, ended_at = ?, ended_reason = ?, error_message = ?
                WHERE id = ?
                """,
                (status, utc_now(), ended_reason, error_message, session_id),
            )

    def list_sessions(self, limit: int = 50) -> list[dict[str, Any]]:
        with self.connect() as connection:
            rows = connection.execute(
                """
                SELECT id, provider, mode, started_at, ended_at, status, ended_reason, error_message, timeout_at
                FROM sessions
                ORDER BY started_at DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
        return [dict(row) for row in rows]

    def add_transcript(self, session_id: str, speaker: str, content: str, is_final: bool = True) -> None:
        with self.connect() as connection:
            connection.execute(
                """
                INSERT INTO transcripts (session_id, speaker, content, is_final, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (session_id, speaker, content, int(is_final), utc_now()),
            )

    def list_transcripts(self, session_id: str | None = None, limit: int = 100) -> list[dict[str, Any]]:
        query = "SELECT session_id, speaker, content, is_final, created_at FROM transcripts"
        params: Iterable[Any]
        if session_id:
            query += " WHERE session_id = ?"
            params = (session_id,)
        else:
            params = ()
        query += " ORDER BY created_at DESC LIMIT ?"
        with self.connect() as connection:
            rows = connection.execute(query, (*params, limit)).fetchall()
        return [dict(row) for row in rows]

    def add_message(self, session_id: str, role: str, content: str) -> None:
        with self.connect() as connection:
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
        with self.connect() as connection:
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

    def list_tool_calls(self, limit: int = 100) -> list[dict[str, Any]]:
        with self.connect() as connection:
            rows = connection.execute(
                """
                SELECT id, session_id, tool_name, input_json, output_json, status, started_at, ended_at, error_message
                FROM tool_calls
                ORDER BY started_at DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
        return [dict(row) for row in rows]

    def create_booking(self, customer_name: str, booking_time: str, notes: str = "") -> dict[str, Any]:
        with self.connect() as connection:
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
        with self.connect() as connection:
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
