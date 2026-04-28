from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from voice_agent.storage.database import Database


@dataclass(slots=True)
class ToolContext:
    db: Database
    session_id: str | None = None


ToolHandler = Callable[[dict[str, Any], ToolContext], dict[str, Any]]


@dataclass(slots=True)
class ToolDefinition:
    name: str
    description: str
    input_schema: dict[str, Any]
    handler: ToolHandler
    enabled: bool = True

    def public_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": self.input_schema,
            "enabled": self.enabled,
        }


class ToolRegistry:
    def __init__(self, tools: list[ToolDefinition] | None = None) -> None:
        self._tools = {tool.name: tool for tool in tools or []}

    def list_tools(self) -> list[dict[str, Any]]:
        return [tool.public_dict() for tool in self._tools.values()]

    def get(self, name: str) -> ToolDefinition:
        if name not in self._tools:
            raise KeyError(f"Unknown tool: {name}")
        return self._tools[name]

    def set_enabled(self, name: str, enabled: bool) -> dict[str, Any]:
        tool = self.get(name)
        tool.enabled = enabled
        return tool.public_dict()

    def call(self, name: str, payload: dict[str, Any], context: ToolContext) -> dict[str, Any]:
        tool = self.get(name)
        if not tool.enabled:
            raise RuntimeError(f"Tool is disabled: {name}")
        try:
            result = tool.handler(payload, context)
            context.db.add_tool_call(name, payload, result, "completed", context.session_id)
            return result
        except Exception as exc:
            context.db.add_tool_call(name, payload, None, "failed", context.session_id, str(exc))
            raise
