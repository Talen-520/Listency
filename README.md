# Listency

Local-first, open-source desktop app for building and testing AI voice agents
for small businesses.

Listency runs a local desktop control panel and a thin local backend. Users
can save provider API keys, enter business information, edit an agent prompt,
enable local tools, run microphone test calls, and inspect transcripts, tool
calls, and provider events.

> Status: early MVP / alpha. The current project is intended for local
> development and testing, not production phone deployment.

## Current MVP

What works today:

- Tauri + React desktop UI with Tailwind CSS and shadcn-style components.
- Black/white light and dark themes with Inter bundled locally.
- Python + FastAPI backend on `127.0.0.1:8765`.
- Local `.env` provider key storage editable from Settings.
- Local SQLite session, transcript, tool-call, and app-event storage.
- OpenAI Realtime microphone-to-speaker Test Call.
- Gemini Live microphone-to-speaker Test Call.
- Animated Runtime provider panels for selecting OpenAI Realtime or Gemini Live.
- Provider-specific voice selection and local storage for OpenAI Realtime and Gemini Live.
- On-demand voice previews for OpenAI and Gemini voices, cached locally after first playback.
- Shared brand icon for the desktop UI, browser favicon, and Tauri app bundles.
- Provider-specific mono PCM16 input: 24 kHz for OpenAI Realtime and 16 kHz for Gemini Live.
- OpenAI Realtime and Gemini Live transcript capture and local tool calling.
- Built-in tools for business info lookup, booking capture, transfer request
  logging, customer request logging, and AI-ended calls.
- Logs view with per-session transcript, tool call, and event drill-down.
- Five-minute maximum duration for each active AI conversation.

Planned next:

- Real phone provider configuration and inbound call lifecycle.
- Pipeline mode with separate STT, LLM, and TTS providers.
- More complete booking and business workflow tools.
- Signed macOS and Windows installers.

## How It Works

```text
Mic / Speaker
  <-> Tauri + React desktop app
  <-> Local FastAPI backend
  <-> Realtime provider adapter
  <-> Local tool registry
  <-> SQLite logs
```

The backend intentionally stays thin: session management, local config loading,
tool callbacks, and log persistence. Provider calls happen only when a Test Call
or future inbound phone call starts an AI session.

## Requirements

- Python 3.11+
- Node.js with Corepack
- pnpm
- Rust and Cargo for the Tauri shell

## Quick Start

Create a local environment file:

```bash
cp .env.example .env
```

Set provider values as needed:

```bash
OPENAI_API_KEY=
GEMINI_API_KEY=
OPENAI_REALTIME_MODEL=gpt-realtime
GEMINI_LIVE_MODEL=gemini-3.1-flash-live-preview
OPENAI_REALTIME_MOCK=false
DEFAULT_REALTIME_PROVIDER=openai
OPENAI_DEFAULT_VOICE=
GEMINI_DEFAULT_VOICE=
DEFAULT_VOICE=
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

Run the backend:

```bash
cd app/backend
source .venv/bin/activate
uvicorn voice_agent.main:app --host 127.0.0.1 --port 8765 --reload
```

Run the desktop frontend during development:

```bash
cd app/desktop
pnpm run dev
```

The frontend dev server uses:

```text
http://127.0.0.1:5173/
```

Run the native Tauri shell:

```bash
cd app/desktop
pnpm run tauri:dev
```

Build the desktop app:

```bash
cd app/desktop
pnpm run tauri:build
```

## Local Workflow

1. Start the backend.
2. Start the desktop app.
3. Add provider API keys in Settings.
4. Fill in Business Profile and Agent prompt.
5. Enable the tools needed for the session.
6. Start a Test Call and speak through the microphone.
7. Review transcripts, tool calls, and app events in Logs.

## Project Structure

```text
app/backend/
  voice_agent/
    config/       local .env and path helpers
    core/         runtime and session lifecycle
    providers/    OpenAI Realtime and Gemini Live transports
    storage/      SQLite persistence
    tools/        local tool registry and built-in tools

app/desktop/
  public/         browser favicon and static frontend assets
  src/app/        shell and navigation
  src/assets/     UI brand icon source assets
  src/features/   page-level UI
  src/hooks/      app data, session detail, and realtime test side effects
  src/components/ shared UI components
  src/components/ui/
                  shadcn-style primitives
  src/lib/        API, types, audio, formatting, runtime helpers
  src-tauri/      native Tauri shell and generated bundle icons

update_logs/      commit-by-commit development notes
scripts/          local helper scripts
```

Agent-facing notes such as `AGENTS.md`, architecture notes, design notes, and
development scratch docs are kept locally in the ignored `agent/` directory and
are not part of the public repository.

## Local Data And Privacy

Listency is designed to run locally first:

- API keys are stored in local `.env`.
- Session records are stored in local SQLite under `data/`.
- Voice preview audio is cached locally under `data/voice_previews/`.
- Business profile text and prompts stay local until sent to a selected AI
  provider during an active session.
- No hosted Listency backend is required for the current MVP.

Provider APIs may still receive audio, text, prompts, and tool results during
active sessions. Review each provider's data policy before using real customer
data.

## Development Commands

Backend tests:

```bash
cd app/backend
python -m unittest discover -s tests
```

Desktop build check:

```bash
cd app/desktop
pnpm run build
```

Regenerate browser and Tauri bundle icons:

```bash
node scripts/generate_tauri_icon.mjs
```

Backend WebSocket smoke test:

```bash
cd app/backend
source .venv/bin/activate
python ../../scripts/smoke_ws.py
```

## Contributing

This repository is early, so focused issues and small pull requests are easiest
to review. Please keep the local-first design intact, avoid committing secrets
or customer data, and update `README.md` or `update_logs/` when behavior
changes.

## License

Apache License 2.0. See `LICENSE`.
