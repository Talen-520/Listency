from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from voice_agent.tunnel.manager import PublicTunnelManager


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


if __name__ == "__main__":
    unittest.main()
