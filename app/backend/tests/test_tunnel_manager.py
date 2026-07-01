from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from voice_agent.tunnel.manager import PublicTunnelManager


class ExitedProcess:
    def poll(self) -> int:
        return 1


class PublicTunnelManagerTest(unittest.TestCase):
    def test_find_cloudflared_uses_process_environment_fallback(self) -> None:
        manager = PublicTunnelManager()

        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
            bundled = str(Path(tmp) / "cloudflared-x86_64-pc-windows-msvc.exe")
            with patch.dict(os.environ, {"CLOUDFLARED_BIN": bundled}, clear=False):
                self.assertEqual(manager._find_cloudflared({"CLOUDFLARED_BIN": ""}), bundled)

    def test_find_cloudflared_prefers_explicit_env_config(self) -> None:
        manager = PublicTunnelManager()

        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
            explicit = str(Path(tmp) / "manual-cloudflared.exe")
            bundled = str(Path(tmp) / "bundled-cloudflared.exe")
            with patch.dict(os.environ, {"CLOUDFLARED_BIN": bundled}, clear=False):
                self.assertEqual(manager._find_cloudflared({"CLOUDFLARED_BIN": explicit}), explicit)

    def test_status_clears_stale_public_url_when_cloudflared_exits(self) -> None:
        manager = PublicTunnelManager()
        manager._process = ExitedProcess()  # type: ignore[assignment]
        manager._public_base_url = "https://old.trycloudflare.com"
        manager._last_message = "Automatic secure connection is running."

        status = manager.status({"PHONE_CONNECTION_MODE": "automatic"})

        self.assertEqual(status.status, "stopped")
        self.assertEqual(status.public_base_url, "")
        self.assertEqual(status.public_ws_url, "")
        self.assertIn("stopped unexpectedly", status.message)
        self.assertEqual(manager.public_host({"PHONE_CONNECTION_MODE": "automatic"}), "")


if __name__ == "__main__":
    unittest.main()
