from __future__ import annotations

import asyncio
import os
import re
import shutil
import subprocess
import threading
import time
from dataclasses import asdict, dataclass
from urllib.parse import urlparse


PUBLIC_URL_PATTERN = re.compile(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com")


@dataclass(slots=True)
class TunnelStatus:
    mode: str
    status: str
    public_base_url: str = ""
    public_ws_url: str = ""
    message: str = ""
    provider: str = "cloudflare"

    def public_dict(self) -> dict[str, str]:
        return asdict(self)


def _normalize_base_url(value: str) -> str:
    value = value.strip().rstrip("/")
    if not value:
        return ""
    parsed = urlparse(value)
    if parsed.scheme not in {"https", "http"} or not parsed.netloc:
        return ""
    return value


def _ws_url(base_url: str) -> str:
    if base_url.startswith("https://"):
        return f"wss://{base_url.removeprefix('https://')}"
    if base_url.startswith("http://"):
        return f"ws://{base_url.removeprefix('http://')}"
    return ""


class PublicTunnelManager:
    """Manage the public URL used by phone providers.

    Automatic mode uses a cloudflared Quick Tunnel when the binary is available.
    Manual mode lets advanced users provide their own HTTPS URL.
    """

    def __init__(self, local_url: str = "http://127.0.0.1:8765") -> None:
        self.local_url = local_url
        self._process: subprocess.Popen[str] | None = None
        self._public_base_url = ""
        self._last_message = ""
        self._reader_thread: threading.Thread | None = None

    def status(self, env: dict[str, str]) -> TunnelStatus:
        mode = (env.get("PHONE_CONNECTION_MODE") or "automatic").strip().lower()
        if mode == "manual":
            public_base_url = _normalize_base_url(env.get("PHONE_PUBLIC_BASE_URL", ""))
            if not public_base_url:
                return TunnelStatus(
                    mode="manual",
                    status="not_configured",
                    message="Add a public HTTPS URL in Advanced custom URL.",
                )
            return TunnelStatus(
                mode="manual",
                status="running",
                public_base_url=public_base_url,
                public_ws_url=_ws_url(public_base_url),
                message="Using Advanced custom URL.",
                provider="manual",
            )

        if self._process and self._process.poll() is None and self._public_base_url:
            return TunnelStatus(
                mode="automatic",
                status="running",
                public_base_url=self._public_base_url,
                public_ws_url=_ws_url(self._public_base_url),
                message="Automatic secure connection is running.",
            )
        if self._process and self._process.poll() is not None:
            self._process = None
            self._public_base_url = ""
            self._reader_thread = None
            self._last_message = "Automatic secure connection stopped unexpectedly. Click Connect Phone to reconnect."
        return TunnelStatus(
            mode="automatic",
            status="stopped",
            message=self._last_message or "Automatic secure connection is stopped.",
        )

    async def start(self, env: dict[str, str]) -> TunnelStatus:
        mode = (env.get("PHONE_CONNECTION_MODE") or "automatic").strip().lower()
        if mode == "manual":
            return self.status(env)
        return await asyncio.to_thread(self._start_cloudflared, env)

    async def stop(self) -> TunnelStatus:
        return await asyncio.to_thread(self._stop_process)

    def public_host(self, env: dict[str, str]) -> str:
        status = self.status(env)
        public_base_url = status.public_base_url
        if not public_base_url:
            return ""
        return urlparse(public_base_url).netloc.lower()

    def _start_cloudflared(self, env: dict[str, str]) -> TunnelStatus:
        current = self.status(env)
        if current.status == "running":
            return current

        binary = self._find_cloudflared(env)
        if not binary:
            self._last_message = "Automatic connection needs cloudflared bundled with the app or installed on PATH."
            return TunnelStatus(mode="automatic", status="missing_connector", message=self._last_message)

        self._public_base_url = ""
        self._last_message = "Starting automatic secure connection..."
        self._process = subprocess.Popen(
            [binary, "tunnel", "--url", self.local_url, "--no-autoupdate"],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
        self._reader_thread = threading.Thread(target=self._read_cloudflared_output, daemon=True)
        self._reader_thread.start()

        deadline = time.time() + 25
        while time.time() < deadline:
            if self._process.poll() is not None:
                self._last_message = self._last_message or "Automatic connection stopped before it became ready."
                break
            if self._public_base_url:
                return TunnelStatus(
                    mode="automatic",
                    status="running",
                    public_base_url=self._public_base_url,
                    public_ws_url=_ws_url(self._public_base_url),
                    message="Automatic secure connection is running.",
                )
            time.sleep(0.2)

        return TunnelStatus(
            mode="automatic",
            status="error",
            message=self._last_message or "Automatic connection did not publish a URL in time.",
        )

    def _stop_process(self) -> TunnelStatus:
        if self._process and self._process.poll() is None:
            self._process.terminate()
            try:
                self._process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self._process.kill()
        self._process = None
        self._public_base_url = ""
        self._last_message = "Automatic secure connection stopped."
        return TunnelStatus(mode="automatic", status="stopped", message=self._last_message)

    def _read_cloudflared_output(self) -> None:
        process = self._process
        if not process or not process.stdout:
            return
        for line in process.stdout:
            clean = line.strip()
            if clean:
                self._last_message = clean
            match = PUBLIC_URL_PATTERN.search(clean)
            if match:
                self._public_base_url = match.group(0).rstrip("/")

    def _find_cloudflared(self, env: dict[str, str]) -> str:
        configured = (env.get("CLOUDFLARED_BIN") or "").strip()
        if configured:
            return configured
        bundled = os.environ.get("CLOUDFLARED_BIN", "").strip()
        if bundled:
            return bundled
        return shutil.which("cloudflared") or ""
