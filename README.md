<p align="center">
  <img src="assets/Listency.png" alt="Listency" width="520" />
</p>

<h1 align="center">Listency</h1>

<p align="center">
Local-first desktop app for running an AI phone assistant for small businesses.
</p>

<p align="center">
  <a href="README.md">English</a> · <a href="readme_cn.md">简体中文</a> · <a href="readme_ja.md">日本語</a>
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
  <a href="https://github.com/Talen-520/Listency/actions/workflows/coverage.yml">
    <img alt="Coverage" src="https://github.com/Talen-520/Listency/actions/workflows/coverage.yml/badge.svg" />
  </a>
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

For users:

1. Download a packaged Listency build from
   [GitHub Releases](https://github.com/Talen-520/Listency/releases).
2. Open the desktop app.
3. Add OpenAI and/or Gemini API keys in Settings hit save.
4. Choose a provider, model, and voice.
5. Fill in Business Info, then choose or edit an Agent prompt. You can save multiple agents for different call flows.
6. Start Runtime by click the top right corner "Start" and the button will turn to "Stop".
7. Connect a phone provider for real inbound calls. Twilio is the recommended
   path for the first public release: add your Twilio Account SID, Auth Token,
   and phone number in Settings, click "Connect Phone", then call the configured
   number.

Telnyx remains experimental and is not recommended for production use in the
first public release.

### Unsigned Release Trust Prompts

Current public builds are unsigned by design. Only use the following commands
for builds downloaded from this repository.

If macOS shows `"Listency" is damaged and can't be opened`, remove the
download quarantine flag after extracting or installing the app:

```bash
xattr -dr com.apple.quarantine /path/to/Listency.app
```

If Windows blocks the downloaded installer or portable app, open PowerShell in
the extracted release folder and remove the Mark-of-the-Web flag:

```powershell
Unblock-File .\Listency_0.1.0_x64-setup.exe
Get-ChildItem .\portable -Recurse | Unblock-File
```

These prompts are expected for unsigned builds.

For developers:

```bash
corepack enable
pnpm run dev:web
```

The first run creates the backend virtual environment, installs Python and
desktop dependencies, then starts the FastAPI backend and Vite frontend.
Open `http://127.0.0.1:5173/` for local UI development.

See [Development](docs/DEVELOPMENT.md) for the full local workflow.

## Current Status

Listency is in its first public unsigned release stage. The recommended phone
path is Twilio; Telnyx remains experimental and may be removed or redesigned in
a later release.

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
- [Unsigned Build Testing](docs/ALPHA_TESTING.md)
- [Phone Setup](docs/PHONE_SETUP.md)
- [Release And Signing](docs/RELEASE.md)
- [Development](docs/DEVELOPMENT.md)

Agent-facing architecture, design, and development notes are kept locally in the
ignored `.agent/` directory.

## Contributing

This repository is early, so focused issues and small pull requests are easiest
to review. Please keep the local-first design intact, avoid committing secrets
or customer data, and update `README.md` or `docs/` when behavior changes.

## License

Apache License 2.0. See `LICENSE`.
