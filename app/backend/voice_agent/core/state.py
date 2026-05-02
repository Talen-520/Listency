from __future__ import annotations

from enum import StrEnum


class BackgroundStatus(StrEnum):
    STOPPED = "stopped"
    STARTING = "starting"
    STANDBY = "standby"
    DEGRADED = "degraded"
    STOPPING = "stopping"
    ERROR = "error"


class SessionStatus(StrEnum):
    IDLE = "idle"
    STARTING = "starting"
    RUNNING = "running"
    RECONNECTING = "reconnecting"
    STOPPING = "stopping"
    STOPPED = "stopped"
    TIMEOUT = "timeout"
    ERROR = "error"


class EndReason(StrEnum):
    USER_STOPPED = "user_stopped"
    CALLER_HUNG_UP = "caller_hung_up"
    AGENT_HUNG_UP = "agent_hung_up"
    TIMEOUT_5_MINUTES = "timeout_5_minutes"
    PROVIDER_ERROR = "provider_error"
    NETWORK_ERROR = "network_error"
    BACKEND_SHUTDOWN = "backend_shutdown"
