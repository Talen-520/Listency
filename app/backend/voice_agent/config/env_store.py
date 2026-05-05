from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Mapping

from voice_agent.config.paths import repo_root


ENV_DEFAULTS: dict[str, str] = {
    "OPENAI_API_KEY": "",
    "GEMINI_API_KEY": "",
    "OPENAI_REALTIME_MODEL": "gpt-realtime",
    "GEMINI_LIVE_MODEL": "gemini-3.1-flash-live-preview",
    "OPENAI_REALTIME_MOCK": "false",
    "DEFAULT_REALTIME_PROVIDER": "openai",
    "DEFAULT_VOICE": "",
}


def _parse_env(text: str) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        values[key] = value
    return values


def _format_value(value: str) -> str:
    if value == "":
        return ""
    if any(char.isspace() for char in value) or "#" in value:
        escaped = value.replace('"', '\\"')
        return f'"{escaped}"'
    return value


def mask_secret(value: str) -> str:
    if not value:
        return ""
    if len(value) <= 8:
        return "********"
    return f"{value[:4]}...{value[-4:]}"


@dataclass(slots=True)
class EnvStore:
    path: Path = field(default_factory=lambda: repo_root() / ".env")
    example_path: Path = field(default_factory=lambda: repo_root() / ".env.example")

    def ensure_example(self) -> None:
        if self.example_path.exists():
            return
        lines = [f"{key}={value}" for key, value in ENV_DEFAULTS.items()]
        self.example_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    def read(self) -> dict[str, str]:
        values = dict(ENV_DEFAULTS)
        if self.path.exists():
            values.update(_parse_env(self.path.read_text(encoding="utf-8")))
        return values

    def read_public(self) -> dict[str, str]:
        values = self.read()
        return {
            "OPENAI_API_KEY": mask_secret(values.get("OPENAI_API_KEY", "")),
            "GEMINI_API_KEY": mask_secret(values.get("GEMINI_API_KEY", "")),
            "OPENAI_REALTIME_MODEL": values.get("OPENAI_REALTIME_MODEL", "gpt-realtime"),
            "GEMINI_LIVE_MODEL": values.get("GEMINI_LIVE_MODEL", "gemini-3.1-flash-live-preview"),
            "OPENAI_REALTIME_MOCK": values.get("OPENAI_REALTIME_MOCK", "false"),
            "DEFAULT_REALTIME_PROVIDER": values.get("DEFAULT_REALTIME_PROVIDER", "openai"),
            "DEFAULT_VOICE": values.get("DEFAULT_VOICE", ""),
            "has_openai_key": bool(values.get("OPENAI_API_KEY")),
            "has_gemini_key": bool(values.get("GEMINI_API_KEY")),
            "env_path": str(self.path),
        }

    def write(self, updates: Mapping[str, str]) -> dict[str, str]:
        current = self.read()
        for key, value in updates.items():
            if key in ENV_DEFAULTS:
                current[key] = value.strip()

        self.path.parent.mkdir(parents=True, exist_ok=True)
        lines = [f"{key}={_format_value(current.get(key, ''))}" for key in ENV_DEFAULTS]
        self.path.write_text("\n".join(lines) + "\n", encoding="utf-8")
        self.ensure_example()
        return current
