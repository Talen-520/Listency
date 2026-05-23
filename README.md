<p align="center">
  <img src="assets/Listency.png" alt="Listency" width="520" />
</p>

<h1 align="center">Listency</h1>

<p align="center">
Local-first desktop app for running an AI phone assistant for small businesses.
</p>

<p align="center">
  <img alt="Tests" src="https://img.shields.io/badge/tests-unittest%20passing-brightgreen" />
  <a href="https://github.com/Talen-520/Listency/actions/workflows/windows-packaged-smoke.yml">
    <img alt="Windows packaged smoke" src="https://github.com/Talen-520/Listency/actions/workflows/windows-packaged-smoke.yml/badge.svg" />
  </a>
  <a href="https://github.com/Talen-520/Listency/actions/workflows/macos-packaged-smoke.yml">
    <img alt="macOS packaged smoke" src="https://github.com/Talen-520/Listency/actions/workflows/macos-packaged-smoke.yml/badge.svg" />
  </a>
  <a href="https://github.com/Talen-520/Listency/actions/workflows/release-draft.yml">
    <img alt="Release draft" src="https://github.com/Talen-520/Listency/actions/workflows/release-draft.yml/badge.svg" />
  </a>
  <a href="https://github.com/Talen-520/Listency/releases">
    <img alt="Releases" src="https://img.shields.io/github/v/release/Talen-520/Listency?include_prereleases&label=release" />
  </a>
  <img alt="Coverage" src="https://img.shields.io/badge/coverage-not%20configured-lightgrey" />
  <img alt="Python" src="https://img.shields.io/badge/python-%3E%3D3.11-blue" />
  <img alt="Last commit" src="https://img.shields.io/github/last-commit/Talen-520/Listency?label=last%20commit" />
</p>

## Interface Preview

<details open>
  <summary><strong>Dark Theme</strong></summary>
  <br />
  <a href="assets/dark.png">
    <img src="assets/dark.png" alt="Listency dark theme dashboard" width="100%" />
  </a>
</details>

<details>
  <summary><strong>Light Theme</strong></summary>
  <br />
  <a href="assets/light.png">
    <img src="assets/light.png" alt="Listency light theme dashboard" width="100%" />
  </a>
</details>

## What Is Listency?

Listency helps small businesses run an AI phone assistant from a local desktop app.

With Listency, a shop, hotel, restaurant, salon, clinic, or service business can connect a phone number to an AI voice agent that answers customer calls, explains business information, collects booking details, handles common requests, transfers calls when needed, and saves conversation records for later review.

It is built for non-technical business owners who want a simple control panel instead of a custom backend, cloud dashboard, or call center setup.

Listency runs locally on macOS and Windows. API keys, business information, transcripts, tool calls, and logs stay on the user’s machine. When phone support is enabled, Listency creates a temporary secure tunnel so Twilio can send inbound calls to the local app.

## Key Features

- AI phone assistant for inbound customer calls
- Run voice agent on your own machine, no need to host elsewhere, stop anytime.
- Microphone test mode before connecting a real phone number
- Multilingual voice conversations, depending on the selected AI provider and model
- Local business knowledge base for hours, services, pricing, policies, FAQs, and booking rules
- Booking detail collection for hotels, restaurants, salons, clinics, and other service businesses
- Call transfer support for conversations that need a human
- AI-ended calls when the conversation is complete
- Conversation transcripts, tool call history, phone call history, and runtime logs
- Local-first storage for API keys, business data, logs, and transcripts
- Desktop app experience for macOS and Windows
- Twilio phone number connection with automatic secure tunnel setup

## Quick Start

For alpha users:

1. Download a packaged Listency build from
   [GitHub Releases](https://github.com/Talen-520/Listency/releases).
2. Open the desktop app.
3. Add OpenAI and/or Gemini API keys in Settings hit save.
4. Choose a provider, model, and voice.
5. Fill in Business Info and Agent prompt, there's template for you, ask AI to generate business info for you if you dont have one.
6. Start Runtime by click the top right corner "Start" and the button will turn to "Stop".
7. Optional: configure [Twilio](https://www.twilio.com) or [Telnyx](https://www.telnyx.com) in Settings, click "Connect Phone" to connect a number, then call the
   configured number.


For developers:

```bash
corepack enable
pnpm dev
```

The first run creates the backend virtual environment, installs Python and
desktop dependencies, then starts the Tauri development app.

See [Development](docs/DEVELOPMENT.md) for the full local workflow.

## Current Status

Listency is currently in the early stages of rapid development; commits will be frequent, so please ensure you are using the latest release version.

## Features

- Local-first desktop runtime with a lightweight FastAPI backend.
- OpenAI Realtime and Gemini Live realtime voice sessions.
- Provider-specific voices and local voice preview cache.
- Business profile, editable agent prompt, and tool toggles.
- Built-in tools for common small-business call flows.
- Five-minute maximum duration per active AI conversation.
- Twilio phone setup alpha with automatic public tunnel and webhook provisioning.
- Local transcripts, tool calls, phone calls, and app events.
- macOS and Windows packaged smoke tests in GitHub Actions.
- Manual release draft workflow with checksum and signing-readiness support.

## How It Works

<p align="center">
  <a href="assets/how-it-works.svg">
    <img src="assets/how-it-works.svg" alt="Listency architecture flow diagram" width="100%" />
  </a>
</p>

The backend intentionally stays thin: session management, local config loading,
tool callbacks, phone webhook handling, and log persistence. Provider calls
happen only when a Test Call or inbound phone call starts an AI session.

## Local Data And Privacy

- API keys and phone-provider credentials are stored in a local `.env`.
- Sessions, transcripts, tool calls, and phone records are stored in local SQLite.
- Packaged builds store local data in the operating system app data directory.
- Business profile text and prompts stay local until sent to a selected provider
  during an active session.
- Automatic phone setup exposes only `/phone/*` webhook routes through the
  public tunnel; normal local app APIs remain blocked from the tunnel host.

Provider APIs may still receive audio, text, prompts, and tool results during
active sessions. Review each provider's data policy before using real customer
data.

## Documentation

- [GitHub Releases](https://github.com/Talen-520/Listency/releases)
- [Alpha Testing](docs/ALPHA_TESTING.md)
- [Phone Setup](docs/PHONE_SETUP.md)
- [Release And Signing](docs/RELEASE.md)
- [Development](docs/DEVELOPMENT.md)
- [Update Logs](update_logs/)

Agent-facing architecture, design, and development notes are kept locally in the
ignored `.agent/` directory.

## Contributing

This repository is early, so focused issues and small pull requests are easiest
to review. Please keep the local-first design intact, avoid committing secrets
or customer data, and update `README.md`, `docs/`, or `update_logs/` when
behavior changes.

## License

Apache License 2.0. See `LICENSE`.
