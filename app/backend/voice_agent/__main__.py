from __future__ import annotations

import os

import uvicorn

from voice_agent.main import app


def main() -> None:
    host = os.environ.get("LISTENCY_BACKEND_HOST", "127.0.0.1")
    port = int(os.environ.get("LISTENCY_BACKEND_PORT", "8765"))
    log_level = os.environ.get("LISTENCY_BACKEND_LOG_LEVEL", "warning")
    uvicorn.run(app, host=host, port=port, log_level=log_level)


if __name__ == "__main__":
    main()
