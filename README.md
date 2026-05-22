<p align="center">
  <img src="assets/Listency.png" alt="Listency" width="520" />
</p>

<h1 align="center">Listency</h1>

<p align="center">
  Local-first, open-source desktop app for building and testing AI voice agents for small businesses.
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
  <img alt="Coverage" src="https://img.shields.io/badge/coverage-not%20configured-lightgrey" />
  <img alt="Python" src="https://img.shields.io/badge/python-%3E%3D3.11-blue" />
  <img alt="Last commit" src="https://img.shields.io/github/last-commit/Talen-520/Listency?label=last%20commit" />
</p>

Listency runs a local desktop control panel and a thin local backend. In
packaged builds, the desktop app starts a bundled backend sidecar automatically
and stops it when the app closes. Packaged builds also include the cloudflared
connector used by automatic phone setup. Users can save provider API keys,
enter business information, edit an agent prompt, enable local tools, run
microphone and phone-provider test calls, and inspect transcripts, tool calls,
phone call records, and provider events.

> Status: early MVP / alpha. OpenAI, Gemini, Twilio inbound calls, and a Telnyx
> Call Control media stream proof of concept are usable for local testing.
> Release draft automation exists; public one-click releases still need Apple
> and Windows signing credentials.

## Interface Preview

Click a theme below to expand the preview. The image itself opens the full-size
asset.

<details open>
  <summary><strong>Dark Theme</strong></summary>
  <br />
  <a href="assets/ui%20dark.png">
    <img src="assets/ui%20dark.png" alt="Listency dark theme dashboard" width="100%" />
  </a>
</details>

<details>
  <summary><strong>Light Theme</strong></summary>
  <br />
  <a href="assets/ui%20light.png">
    <img src="assets/ui%20light.png" alt="Listency light theme dashboard" width="100%" />
  </a>
</details>

## Current MVP

What works today:

- Tauri + React desktop UI with Tailwind CSS and shadcn-style components.
- Black/white light and dark themes with Inter bundled locally.
- Auto-started local Python + FastAPI backend on `127.0.0.1:8765`.
- macOS and Windows packaged app smoke tests for backend startup, local API
  access, and backend shutdown when the app closes.
- Local `.env` provider key storage editable from Settings.
- Local SQLite session, transcript, tool-call, and app-event storage.
- OpenAI Realtime microphone-to-speaker Test Call using `gpt-realtime-2` by default.
- Gemini Live microphone-to-speaker Test Call.
- Animated Runtime provider panels for selecting OpenAI Realtime or Gemini Live.
- Provider-specific voice selection and local storage for OpenAI Realtime and Gemini Live.
- On-demand voice previews for OpenAI and Gemini voices, cached locally after first playback.
- Shared brand icon for the desktop UI, browser favicon, and Tauri app bundles.
- Provider-specific mono PCM16 input: 24 kHz for OpenAI Realtime and 16 kHz for Gemini Live.
- OpenAI Realtime and Gemini Live transcript capture and local tool calling.
- OpenAI Realtime sessions use low-effort reasoning by default for voice latency.
- Provider disconnects surface degraded/error states and attempt one conservative
  reconnect before ending the session as a network failure.
- Built-in tools for business info lookup, booking capture, transfer request
  logging, customer request logging, and AI-ended calls.
- Logs view with 24h / 7 days / 30 days filtering, JSON export, and per-session transcript, tool call, and event detail overlays.
- Phone call records are linked into session detail so caller hangup, AI hangup,
  and provider failure outcomes are visible in Logs.
- Logs include a Phone Stability summary and Phone Calls table for repeated
  inbound-call testing.
- Settings data controls for pruning records older than 30 days or clearing local logs.
- Five-minute maximum duration for each active AI conversation.
- Phone setup alpha with Twilio/Telnyx configuration, automatic public
  connection controls, Advanced custom URL mode, a Twilio inbound media stream
  bridge, and a Telnyx Call Control media stream proof of concept connected to
  the existing Realtime runtime.
- Connect Phone starts the public tunnel and configures provider webhooks as one
  backend action, including webhook updates when the tunnel URL changes.
- Twilio Debugger panel for recent webhook/API alerts during inbound call testing.
- Twilio paid-account inbound calling has been tested successfully from multiple
  caller numbers through the automatic tunnel path.
- Phone failure details from provider setup, media stream, and Realtime provider
  errors are surfaced in Settings, Dashboard readiness, Logs, and phone records.
- Bundled cloudflared connector for packaged macOS and Windows automatic phone
  setup.
- Manual Release Draft workflow for macOS and Windows artifacts, optional
  signing/notarization, release checksums, and GitHub draft release creation.

Planned next:

- Configure Apple Developer ID / notarization credentials and Windows code
  signing credentials for public signed releases.
- Continue phone hardening with longer repeated-call tests, tunnel reconnect
  testing, and provider-specific failure recovery.
- Telnyx real-call testing is deferred; the alpha Call Control media stream PoC
  is considered complete for this MVP pass.
- Pipeline mode with separate STT, LLM, and TTS providers.
- More complete booking and business workflow tools.

## How It Works

<p align="center">
  <a href="assets/how-it-works.svg">
    <img src="assets/how-it-works.svg" alt="Listency architecture flow diagram" width="100%" />
  </a>
</p>

The backend intentionally stays thin: session management, local config loading,
tool callbacks, phone webhook handling, and log persistence. Provider calls
happen only when a Test Call or inbound phone call starts an AI session.

## One Click Start

This is the intended path for general or non-technical users.

1. Download a packaged Listency build.
2. Open the Listency desktop app.
3. Add OpenAI and/or Gemini API keys in Settings.
4. Choose a provider, model, and voice.
5. Fill in Business Info and Agent prompt.
6. Enable the tools the agent should use.
7. Start Runtime, then use Test Call to speak with the agent.
8. Optional: configure Twilio or Telnyx in Settings, choose Connect Phone, then
   call the configured number to test an inbound phone session.
9. Review transcripts, tool calls, phone outcomes, and app events in Logs.
10. Export Logs as JSON or use Settings to prune/clear local log data.

Packaged builds include the backend sidecar and the cloudflared connector, so
users do not need Python, Node, pnpm, Rust, cloudflared, or a terminal. The app
writes local configuration files for them and keeps provider keys in the local
`.env`.

> The Release Draft workflow can create GitHub draft releases with macOS and
> Windows artifacts plus checksums. Until signing secrets are configured, those
> artifacts remain alpha builds and may still trigger operating-system trust
> prompts.

### macOS Alpha Artifact

The macOS Packaged Smoke artifact is not signed or notarized. For alpha testing,
download the `listency-macos-*` artifact, open the artifact folder, then extract
`Listency-macos.zip` and open the extracted `Listency.app`.

If macOS shows `"Listency" is damaged and can't be opened`, it is Gatekeeper
blocking an unsigned downloaded app. For local alpha testing only, remove the
download quarantine flag:

```bash
xattr -dr com.apple.quarantine /path/to/Listency.app
```

This should be replaced by Developer ID signing and Apple notarization before
publishing builds for non-technical users.

### Windows Alpha Artifact

The Windows GitHub Actions artifact contains a portable folder and, when Tauri
produces it, an NSIS installer at the artifact root. For the most predictable
alpha test path, open `portable/Listency.exe` without moving it away from the
adjacent `binaries/` folder. That folder contains the bundled backend sidecar
and cloudflared connector used for local backend startup and automatic phone
setup.

Do not launch the raw `target/release/*.exe` from the artifact tree. It is not
the user-facing portable layout and can appear with the backend offline if the
sidecar binaries are not next to it.

### Artifact Verification

Alpha artifacts include `SHA256SUMS.txt`. After downloading and extracting an
artifact, verify files before testing:

macOS:

```bash
cd path/to/extracted/listency-macos-*
shasum -a 256 -c SHA256SUMS.txt
```

Windows PowerShell:

```powershell
cd path\to\extracted\listency-windows-*
Get-Content SHA256SUMS.txt
Get-FileHash .\portable\Listency.exe -Algorithm SHA256
```

The Windows packaged artifact has been manually tested on a clean Windows
machine, including backend startup, bundled cloudflared detection, Twilio
Connect Phone provisioning, and inbound call handling.

The macOS packaged artifact has been manually opened after removing the
quarantine flag expected for unsigned alpha builds.

### Signed Release Draft Workflow

Run **Actions -> Release Draft** when preparing a release candidate. The workflow
builds macOS and Windows packages, runs the existing packaged smoke checks,
stages per-platform `SHA256SUMS.txt`, creates platform zip archives, generates a
top-level `SHA256SUMS-all.txt`, and creates or updates a GitHub draft release for
the selected tag.

The workflow has two modes:

- Default mode allows unsigned alpha artifacts. Each platform archive includes
  `SIGNING_STATUS.txt` so testers can see whether signing was configured.
- `require_signed=true` fails the workflow if signing or notarization secrets are
  missing. Use this before promoting a release for non-technical users.

Required macOS repository secrets for signed public builds:

- `APPLE_CERTIFICATE`: base64-encoded Developer ID Application `.p12`.
- `APPLE_CERTIFICATE_PASSWORD`: password for the exported `.p12`.
- `APPLE_SIGNING_IDENTITY`: Developer ID Application signing identity.
- For notarization, either App Store Connect API key secrets:
  `APPLE_API_KEY`, `APPLE_API_KEY_BASE64`, `APPLE_API_ISSUER`; or Apple ID
  secrets: `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`.

Encode the Developer ID `.p12` as a single-line base64 value:

```bash
openssl base64 -A -in DeveloperIDApplication.p12 -out apple_certificate_base64.txt
```

Required Windows repository secrets for signed public builds:

- `WINDOWS_CERTIFICATE`: base64-encoded code-signing `.pfx`.
- `WINDOWS_CERTIFICATE_PASSWORD`: password for the `.pfx`.
- Optional repository variable `WINDOWS_TIMESTAMP_URL`: timestamp server URL.
  Defaults to `http://timestamp.digicert.com`.

Encode the Windows `.pfx` as a raw base64 value without PEM headers:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("ListencyCodeSigning.pfx")) |
  Set-Content windows_certificate_base64.txt
```

When Windows signing secrets are available, the workflow imports the certificate
before `tauri build`, generates a temporary Tauri signing config from the
certificate thumbprint, signs the app during packaging, then signs any remaining
staged Listency executables and verifies Authenticode status before checksums
are written.

After adding all signing secrets, run **Release Draft** with
`require_signed=true`. The expected `SIGNING_STATUS.txt` values are
`signed=true` on both platforms and `notarization_configured=true` on macOS.

## Developer Requirements

- Python 3.11+
- Node.js with Corepack enabled
- pnpm
- Rust and Cargo for the Tauri shell
- PyInstaller when building distributable sidecar bundles

## Developer Quick Start

Install backend dependencies:

```bash
cd app/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

You can seed a local `.env` manually, or just enter keys in Settings after the
app starts. The backend creates default env files when needed.

```bash
cp .env.example .env

OPENAI_API_KEY=
GEMINI_API_KEY=
OPENAI_REALTIME_MODEL=gpt-realtime-2
GEMINI_LIVE_MODEL=gemini-3.1-flash-live-preview
OPENAI_REALTIME_MOCK=false
DEFAULT_REALTIME_PROVIDER=openai
OPENAI_DEFAULT_VOICE=
GEMINI_DEFAULT_VOICE=
DEFAULT_VOICE=
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

The Tauri shell checks `127.0.0.1:8765` and starts a local backend automatically
when no backend is already running. During development, it falls back to
`app/backend/.venv` when no bundled sidecar is present. In packaged builds, it
prefers the bundled `listency-backend` sidecar and passes the bundled
cloudflared connector path to the backend when present.

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

Build a distributable local app with bundled backend and cloudflared sidecars:

```bash
cd app/backend
.venv/bin/python -m pip install pyinstaller

cd ../desktop
pnpm run tauri:build:sidecar
```

Use `tauri:build:sidecar` for local app bundles that a user can open without
installing Python, Node, pnpm, Rust, or cloudflared. The sidecar build writes
target-triple-specific backend and cloudflared binaries under
`app/desktop/src-tauri/binaries/`, which is bundled into the Tauri app
resources. When the app closes, the Tauri launcher shuts down the backend child
process it started.

Build only the Tauri shell without rebuilding the sidecar:

```bash
cd app/desktop
pnpm run tauri:build
```

macOS and Windows packaged smoke are checked in GitHub Actions on pushes and
pull requests to `main`. The workflows build the backend sidecar, run the
clean-data sidecar smoke test, download cloudflared for the runner platform,
build the Tauri app, launch the packaged desktop app, verify backend
health/CORS, close the app, verify the backend shuts down, and emit artifact
checksums.

For macOS artifact testing, use `Listency-macos.zip` from the
`listency-macos-*` workflow artifact, extract it, and open `Listency.app`.

For Windows artifact testing, use either the NSIS installer in the artifact root
or the generated `portable/Listency.exe`. Do not run raw `target/release/*.exe`
files from a local build by themselves; they do not carry the backend sidecar
next to the executable and will show the backend as offline on a clean machine.

## Local Workflow

1. Open Listency, or run `pnpm run tauri:dev` during development.
2. Let the desktop shell start or reuse the local backend.
3. Add provider API keys in Settings.
4. Fill in Business Profile and Agent prompt.
5. Enable the tools needed for the session.
6. Start Runtime.
7. Start a Test Call and speak through the microphone.
8. For phone testing, save Twilio or Telnyx credentials in Settings, choose
   Connect Phone, and call the configured provider number.
9. Review transcripts, tool calls, phone outcomes, and app events in Logs.
10. Download JSON log exports from Logs or clean old records from Settings.

## Project Structure

```text
app/backend/
  voice_agent/
    config/       local .env and path helpers
    core/         runtime and session lifecycle
    phone/        Twilio/Telnyx adapters and media stream bridges
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
- Log data can be exported as JSON from Logs and pruned or cleared from Settings.
- Voice preview audio is cached locally.
- Phone provider credentials are stored in the local `.env`. Automatic phone
  connection uses the bundled cloudflared connector and exposes only `/phone/*`
  provider webhooks; normal local app APIs remain blocked from the public tunnel
  host. Twilio and Telnyx webhooks are updated when the automatic tunnel URL
  changes.
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

Smoke test the packaged backend sidecar with a clean temporary data directory:

```bash
node scripts/smoke_packaged_backend.mjs
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
