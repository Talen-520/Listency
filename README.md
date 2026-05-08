<p align="center">
  <img src="assets/Listency.png" alt="Listency" width="520" />
</p>

<h1 align="center">Listency</h1>

<p align="center">
  Local-first, open-source desktop app for building and testing AI voice agents for small businesses.
</p>

<p align="center">
  <img alt="Tests" src="https://img.shields.io/badge/tests-unittest%20passing-brightgreen" />
  <img alt="Coverage" src="https://img.shields.io/badge/coverage-not%20configured-lightgrey" />
  <img alt="Python" src="https://img.shields.io/badge/python-%3E%3D3.11-blue" />
  <img alt="Last commit" src="https://img.shields.io/github/last-commit/Talen-520/Listency?label=last%20commit" />
</p>

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

Run the native desktop shell:

```bash
cd app/desktop
pnpm run tauri:dev
```

The Tauri shell checks `127.0.0.1:8765` and starts the local FastAPI backend
automatically when no backend is already running. In packaged builds, it first
looks for a bundled `listency-backend` sidecar. During development, it falls
back to `app/backend/.venv` when no sidecar is present.

For browser-only frontend development, start the backend manually:

```bash
cd app/backend
source .venv/bin/activate
uvicorn voice_agent.main:app --host 127.0.0.1 --port 8765 --reload
```

Then run the Vite frontend:

```bash
cd app/desktop
pnpm run dev
```

The frontend dev server uses:

```text
http://127.0.0.1:5173/
```

Build the desktop app:

```bash
cd app/desktop
pnpm run tauri:build
```

Build a packaged app with a bundled backend sidecar:

```bash
cd app/backend
.venv/bin/python -m pip install pyinstaller

cd ../desktop
pnpm run tauri:build:sidecar
```

Use `tauri:build:sidecar` for distributable local apps. It creates a desktop
bundle where the user opens only Listency and does not need Python, Node, pnpm,
or Rust installed.

The sidecar build writes a target-triple-specific backend executable under
`app/desktop/src-tauri/binaries/`, which is bundled into the Tauri app resources.
When the app closes, the Tauri launcher shuts down the backend child process it
started.

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
  src-tauri/binaries/
                  generated backend sidecar target

update_logs/      commit-by-commit development notes
scripts/          local helper scripts
```

Agent-facing notes such as `AGENTS.md`, architecture notes, design notes, and
development scratch docs are kept locally in the ignored `agent/` directory and
are not part of the public repository.

## Local Data And Privacy

Listency is designed to run locally first:

- API keys are stored in a local `.env`.
- Session records are stored in local SQLite.
- Voice preview audio is cached locally.
- Source/development mode stores local data under the repository `data/` directory.
- Packaged sidecar mode stores `.env`, SQLite, and preview cache under the
  operating system's app local data directory through `VOICE_AGENT_ROOT`.
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

Build the backend sidecar for the current platform:

```bash
node scripts/build_backend_sidecar.mjs
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
