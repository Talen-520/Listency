from __future__ import annotations

import tempfile
import unittest
from datetime import UTC, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from voice_agent.config.env_store import EnvStore
from voice_agent.core.business_hours import resolve_business_hours
from voice_agent.core.session_manager import SessionManager
from voice_agent.providers.base import ProviderSessionHandle
from voice_agent.storage.database import Database


class CapturingProvider:
    name = "capture"
    display_name = "Capture Provider"

    def __init__(self) -> None:
        self.session_configs: list[dict] = []

    def validate_config(self, env):
        return None

    def list_voices(self, env):
        return []

    async def start_session(self, session_id, env, session_config=None, event_callback=None):
        self.session_configs.append(session_config or {})
        return ProviderSessionHandle(provider=self.name, provider_session_id=session_id, metadata={})

    async def send_audio(self, handle, pcm16_chunk):
        return None

    async def send_tool_result(self, handle, tool_call_id, output):
        return None

    async def close_session(self, handle):
        return None


def schedule_config(**overrides):
    config = {
        "timezone": "America/New_York",
        "weekly_hours": {
            "monday": [{"open": "09:00", "close": "17:00"}],
            "tuesday": [],
            "wednesday": [],
            "thursday": [],
            "friday": [],
            "saturday": [],
            "sunday": [],
        },
        "closures": [],
        "after_hours_mode": "take_callback",
        "after_hours_message": "",
        "open_hours_transfer_target": "",
        "after_hours_transfer_target": "",
    }
    config.update(overrides)
    return config


class BusinessHoursTest(unittest.TestCase):
    def test_unconfigured_schedule_keeps_normal_flow(self) -> None:
        status = resolve_business_hours({})

        self.assertFalse(status["configured"])
        self.assertTrue(status["is_open"])
        self.assertEqual(status["status"], "not_configured")

    def test_open_during_regular_window(self) -> None:
        status = resolve_business_hours(schedule_config(), datetime(2026, 6, 29, 14, 0, tzinfo=UTC))

        self.assertTrue(status["configured"])
        self.assertTrue(status["is_open"])
        self.assertEqual(status["status"], "open")
        self.assertEqual(status["active_policy"], "open_hours")
        self.assertIn("create_booking", status["allowed_tools"])

    def test_closed_after_regular_window_uses_after_hours_policy(self) -> None:
        status = resolve_business_hours(
            schedule_config(after_hours_mode="information_only"),
            datetime(2026, 6, 29, 23, 0, tzinfo=UTC),
        )

        self.assertFalse(status["is_open"])
        self.assertEqual(status["status"], "closed")
        self.assertEqual(status["active_policy"], "after_hours_information_only")
        self.assertNotIn("create_booking", status["allowed_tools"])
        self.assertIn("business_info_lookup", status["allowed_tools"])

    def test_overnight_window_remains_open_after_midnight(self) -> None:
        config = schedule_config(
            weekly_hours={
                "monday": [{"open": "20:00", "close": "02:00"}],
                "tuesday": [],
                "wednesday": [],
                "thursday": [],
                "friday": [],
                "saturday": [],
                "sunday": [],
            }
        )
        status = resolve_business_hours(config, datetime(2026, 6, 30, 5, 0, tzinfo=UTC))

        self.assertTrue(status["is_open"])
        self.assertEqual(status["status"], "open")

    def test_closure_override_forces_closed(self) -> None:
        status = resolve_business_hours(
            schedule_config(closures=[{"date": "2026-06-29", "reason": "Holiday", "message": "We are closed today."}]),
            datetime(2026, 6, 29, 14, 0, tzinfo=UTC),
        )

        self.assertFalse(status["is_open"])
        self.assertIn("Holiday", status["reason"])
        self.assertEqual(status["message"], "We are closed today.")


class BusinessHoursSessionManagerTest(unittest.IsolatedAsyncioTestCase):
    async def test_session_config_includes_business_hours_and_filters_closed_tools(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
            root = Path(tmp)
            db = Database(root / "test.sqlite3")
            today = datetime.now(tz=ZoneInfo("America/New_York")).date().isoformat()
            db.set_business_hours(
                schedule_config(
                    after_hours_mode="information_only",
                    closures=[{"date": today, "reason": "Closed for testing"}],
                )
            )
            env = EnvStore(root / ".env", root / ".env.example")
            env.write({"DEFAULT_REALTIME_PROVIDER": "capture"})
            provider = CapturingProvider()
            manager = SessionManager(
                db=db,
                env_store=env,
                providers={"capture": provider},
                list_tools_for_provider=lambda: [
                    {"name": "business_info_lookup"},
                    {"name": "create_booking"},
                    {"name": "log_customer_request"},
                    {"name": "end_call"},
                ],
                session_limit_seconds=30,
            )

            session = await manager.start_test_session("capture")
            await manager.stop_session(session["id"])

            config = provider.session_configs[0]
            tool_names = [tool["name"] for tool in config["tools"]]
            logs = db.list_logs(session_id=session["id"])

            self.assertEqual(config["business_hours"]["status"], "closed")
            self.assertIn("Business hours context", config["instructions"])
            self.assertNotIn("create_booking", tool_names)
            self.assertIn("business_info_lookup", tool_names)
            self.assertTrue(any(log["event"] == "business_hours_resolved" for log in logs))

    async def test_after_hours_callback_policy_instructs_callback_task_type(self) -> None:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
            root = Path(tmp)
            db = Database(root / "test.sqlite3")
            today = datetime.now(tz=ZoneInfo("America/New_York")).date().isoformat()
            db.set_business_hours(
                schedule_config(
                    after_hours_mode="take_callback",
                    closures=[{"date": today, "reason": "Closed for testing"}],
                )
            )
            env = EnvStore(root / ".env", root / ".env.example")
            env.write({"DEFAULT_REALTIME_PROVIDER": "capture"})
            provider = CapturingProvider()
            manager = SessionManager(
                db=db,
                env_store=env,
                providers={"capture": provider},
                list_tools_for_provider=lambda: [
                    {"name": "business_info_lookup"},
                    {"name": "create_booking"},
                    {"name": "log_customer_request"},
                    {"name": "end_call"},
                ],
                session_limit_seconds=30,
            )

            session = await manager.start_test_session("capture")
            await manager.stop_session(session["id"])

            config = provider.session_configs[0]
            tool_names = [tool["name"] for tool in config["tools"]]

            self.assertEqual(config["business_hours"]["active_policy"], "after_hours_take_callback")
            self.assertIn('request_type "callback"', config["instructions"])
            self.assertIn("log_customer_request", tool_names)
            self.assertNotIn("create_booking", tool_names)


if __name__ == "__main__":
    unittest.main()
