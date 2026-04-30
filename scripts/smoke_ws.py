from __future__ import annotations

import asyncio
import json
import urllib.request
from pathlib import Path

import websockets


ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT / ".env"
API_BASE = "http://127.0.0.1:8765"
WS_BASE = "ws://127.0.0.1:8765"


def post_json(path: str, payload: dict[str, object]) -> dict[str, object]:
    request = urllib.request.Request(
        f"{API_BASE}{path}",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=5) as response:
        return json.loads(response.read().decode("utf-8"))


async def main() -> None:
    original_env = ENV_PATH.read_text(encoding="utf-8") if ENV_PATH.exists() else None
    try:
        ENV_PATH.write_text(
            "\n".join(
                [
                    "OPENAI_API_KEY=sk-local-smoke-test",
                    "GEMINI_API_KEY=",
                    "OPENAI_REALTIME_MODEL=gpt-realtime",
                    "OPENAI_REALTIME_MOCK=true",
                    "DEFAULT_REALTIME_PROVIDER=openai",
                    "DEFAULT_VOICE=",
                    "",
                ]
            ),
            encoding="utf-8",
        )

        session = post_json("/sessions/test", {"provider": "openai"})
        session_id = str(session["id"])
        async with websockets.connect(f"{WS_BASE}/sessions/{session_id}/stream") as websocket:
            ready = json.loads(await websocket.recv())
            assert ready["type"] == "session.ready", ready
            await websocket.send(json.dumps({"type": "audio.start"}))
            started = json.loads(await websocket.recv())
            assert started["type"] == "audio.input_started", started
            await websocket.send(b"fake-audio-chunk")
            ack = json.loads(await websocket.recv())
            assert ack["type"] == "audio.chunk_ack", ack
            assert ack["audio_chunks"] == 1, ack
            assert "transcript" in ack, ack

        post_json(f"/sessions/{session_id}/stop", {})
        print(json.dumps({"ok": True, "session_id": session_id, "audio_chunks": ack["audio_chunks"]}))
    finally:
        if original_env is None:
            ENV_PATH.unlink(missing_ok=True)
        else:
            ENV_PATH.write_text(original_env, encoding="utf-8")


if __name__ == "__main__":
    asyncio.run(main())
