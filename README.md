# voiceAgent

Local-first, open-source AI voice agent desktop app for small businesses.

voiceAgent is a desktop control panel for configuring and testing a real-time
AI voice agent locally. It lets users save provider API keys, add business
information, edit the system prompt, enable local tools, run a microphone test
call, and inspect transcripts, tool calls, and provider events.

The first MVP focuses on OpenAI Realtime voice-to-voice sessions. Phone
provider integration, Gemini Live, and pipeline mode are planned but are not
production-ready yet.

> Status: early MVP / alpha. This project is useful for local testing and
> development, not production phone deployment yet.

## What Works Today

- Tauri + React desktop UI with Tailwind CSS and shadcn/ui-style components.
- Python + FastAPI local backend running on `127.0.0.1`.
- Local `.env` provider key storage editable from the desktop app.
- Local SQLite session storage under `data/`.
- OpenAI Realtime microphone-to-speaker Test Call.
- Browser/Tauri audio capture converted to 24 kHz mono PCM16.
- OpenAI input transcription and assistant transcript capture.
- Local tool calling through OpenAI Realtime function calls.
- Built-in tools for business info lookup, booking capture, call transfer
  request logging, customer request logging, and AI-ended calls.
- Logs view with session detail drill-down for transcripts, tool calls, and
  provider/app events.
- Five-minute maximum duration for each active AI conversation.

## Not Yet Implemented

- Real phone provider integration for inbound calls.
- Production 24/7 phone service deployment.
- Gemini Live transport.
- Pipeline mode with separate STT, LLM, and TTS providers.
- Signed installers, auto-update, and release packaging for non-developer
  users.

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js with Corepack
- pnpm
- Rust and Cargo for Tauri

### Configure Environment

Create the local environment file:

```bash
cp .env.example .env
```

Set provider values as needed:

```bash
OPENAI_API_KEY=
GEMINI_API_KEY=
OPENAI_REALTIME_MODEL=gpt-realtime
OPENAI_REALTIME_MOCK=false
DEFAULT_REALTIME_PROVIDER=openai
DEFAULT_VOICE=
```

`.env` is intentionally local and should not be committed.

### Install Backend

```bash
cd app/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Install Desktop App

```bash
cd app/desktop
corepack enable
pnpm install
```

### Run Backend

```bash
cd app/backend
source .venv/bin/activate
uvicorn voice_agent.main:app --host 127.0.0.1 --port 8765 --reload
```

Health check:

```bash
curl http://127.0.0.1:8765/health
```

### Run Desktop UI

For frontend-only development:

```bash
cd app/desktop
pnpm run dev
```

For the native Tauri shell:

```bash
cd app/desktop
pnpm run tauri:dev
```

Build the desktop app:

```bash
cd app/desktop
pnpm run tauri:build
```

## Typical Local Workflow

1. Start the local backend.
2. Start the desktop app.
3. Add OpenAI or Gemini API keys in Settings.
4. Fill in the Business Profile and system prompt.
5. Enable tools for the test session.
6. Start a Test Call and speak through the microphone.
7. Review transcripts, tool calls, and app events in Logs.

## Local Data And Privacy

voiceAgent is designed to run locally first:

- API keys are stored in the local `.env` file.
- Session records are stored in local SQLite data.
- Business profile text and prompts are kept local unless sent to a selected
  AI provider during an active session.
- No hosted voiceAgent backend is required for the current MVP.

Provider APIs may still receive audio, text, prompts, and tool results during
active sessions. Review each provider's own data policy before using real
customer data.

## Architecture

The current MVP keeps the backend thin to reduce latency:

```text
Mic/Speaker
  <-> Tauri + React desktop app
  <-> Local FastAPI backend
  <-> Realtime provider adapter
  <-> Local tool registry
  <-> SQLite logs
```

OpenAI Realtime is the first implemented provider. The backend owns session
lifecycle, config loading, tool callbacks, and log persistence.

## Project Documentation

- `ARCHITECTURE.md`: system structure and runtime boundaries.
- `DEVELOPMENT.md`: local setup, run, test, and build commands.
- `DESIGN.md`: desktop UI design direction.
- `MVP_PLAN.md`: product roadmap and execution plan.
- `AGENTS.md`: coding-agent instructions for contributors using AI agents.
- `update_logs/`: development history written before commits.

## Roadmap

- Complete Gemini Live provider transport.
- Add real phone provider configuration and inbound call lifecycle.
- Expand booking and business workflow tools.
- Add pipeline mode provider adapters for STT, LLM, and TTS.
- Improve packaging for macOS and Windows.
- Add stronger privacy controls and log retention settings.

## Contributing

This repository is early, so focused issues and small pull requests are easiest
to review. For code changes, please keep the local-first design intact, avoid
committing secrets, and update relevant docs or `update_logs/` when behavior
changes.

## License

Apache License 2.0. See `LICENSE`.
