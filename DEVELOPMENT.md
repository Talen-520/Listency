# voiceAgent Development

## Current Build Target

The first build is a local-only MVP:

- Tauri + React + shadcn/ui-style components + Tailwind CSS desktop app.
- Python + FastAPI local backend.
- API keys stored in local `.env`.
- SQLite stored under local `data/`.
- OpenAI Realtime and Gemini Live provider adapter boundaries.
- 5-minute maximum AI session lifecycle.
- Local Test Call streams 24kHz mono PCM16 audio chunks over the backend WebSocket.
- OpenAI Realtime WebSocket transport forwards PCM16 to `input_audio_buffer.append` and returns PCM16 output audio deltas to the desktop app.
- OpenAI Realtime input transcription is enabled for user-side transcript capture in session logs.
- OpenAI Realtime function calling routes enabled local tools through the backend tool registry.
- `end_call` lets the AI end a Test Call after its goodbye audio is delivered.

## Setup

Create the local environment file:

```bash
cp .env.example .env
```

Useful Realtime settings:

```bash
OPENAI_API_KEY=
OPENAI_REALTIME_MODEL=gpt-realtime
OPENAI_REALTIME_MOCK=false
DEFAULT_REALTIME_PROVIDER=openai
DEFAULT_VOICE=
```

Set `OPENAI_REALTIME_MOCK=true` only for local smoke tests that should not call the remote OpenAI API.

Install backend dependencies:

```bash
cd app/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Install desktop dependencies:

```bash
cd app/desktop
corepack enable
pnpm install
```

Rust is required for the native Tauri shell:

```bash
rustc --version
cargo --version
```

## Run Backend

```bash
cd app/backend
source .venv/bin/activate
uvicorn voice_agent.main:app --host 127.0.0.1 --port 8765 --reload
```

Health check:

```bash
curl http://127.0.0.1:8765/health
```

Smoke test the local WebSocket stream while the backend is running:

```bash
cd app/backend
source .venv/bin/activate
python ../../scripts/smoke_ws.py
```

## Run Desktop

During frontend-only development:

```bash
cd app/desktop
pnpm run dev
```

For the Tauri shell:

```bash
cd app/desktop
pnpm run tauri:dev
```

## Build Desktop App

```bash
cd app/desktop
pnpm run tauri:build
```

The current MVP build target is the macOS `.app` bundle:

```text
app/desktop/src-tauri/target/release/bundle/macos/voiceAgent.app
```

## Test Backend

```bash
cd app/backend
python -m unittest discover -s tests
```

## Notes

- This project is designed for local running only.
- `.env` must never be committed.
- The default Tauri bundle target is `.app`; DMG packaging is intentionally not the default MVP target.
- OpenAI Realtime audio transport is implemented; Gemini Live transport is still reserved for the next provider pass.
- The browser/Tauri frontend sends provider-ready PCM16 chunks and can play PCM16 output audio returned by provider adapters.
- Logs supports session detail drill-down for transcripts, tool calls, and provider/app events.
- Tool calls are persisted to SQLite and can be inspected per session.
- AI-ended calls use `agent_hung_up` as the session ended reason.
- Background runtime can stay in standby, but each AI session is capped at 5 minutes.
