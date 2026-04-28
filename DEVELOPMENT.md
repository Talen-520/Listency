# voiceAgent Development

## Current Build Target

The first build is a local-only MVP:

- Tauri + React + shadcn/ui-style components + Tailwind CSS desktop app.
- Python + FastAPI local backend.
- API keys stored in local `.env`.
- SQLite stored under local `data/`.
- OpenAI Realtime and Gemini Live provider adapter boundaries.
- 5-minute maximum AI session lifecycle.
- Local Test Call streams 16kHz mono PCM16 audio chunks over the backend WebSocket.

## Setup

Create the local environment file:

```bash
cp .env.example .env
```

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
- Realtime provider audio transport is the next implementation step after the local app/backend skeleton.
- The browser/Tauri frontend already sends provider-ready PCM16 chunks; the next backend step is forwarding these chunks to OpenAI Realtime and Gemini Live adapters.
- Background runtime can stay in standby, but each AI session is capped at 5 minutes.
