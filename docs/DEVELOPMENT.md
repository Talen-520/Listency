# Development

## Requirements

- Python 3.11+
- Node.js with Corepack enabled
- pnpm
- Rust and Cargo for Tauri
- PyInstaller when building distributable backend sidecars

## Recommended Local Development

```bash
corepack enable
pnpm run dev:web
```

`pnpm run dev:web` runs the developer setup first, then starts the browser-based
development loop. On the first run it:

- creates `app/backend/.venv` when missing;
- installs Python dependencies from `app/backend/requirements.txt`;
- installs desktop dependencies in `app/desktop`;
- starts the FastAPI backend on `127.0.0.1:8765`;
- starts the Vite frontend on `127.0.0.1:5173`.

After the first run, unchanged dependencies are skipped. Use this mode for most
React, shadcn, Tailwind, and page-level UI work because browser DevTools and
Vite HMR are faster than the full Tauri shell loop.

## Full Desktop App Verification

```bash
pnpm dev
```

`pnpm dev` uses the same setup step, then starts the Tauri development app.
Use it when you need to verify desktop behavior:

- backend autostart and shutdown;
- microphone permissions;
- app data paths;
- native window, app icon, and dock behavior;
- phone tunnel sidecar behavior;
- packaged-app parity.

## Backend Tests

```bash
pnpm run test:backend
```

## Manual Backend

```bash
cd app/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn voice_agent.main:app --host 127.0.0.1 --port 8765 --reload
```

## Manual Desktop

```bash
cd app/desktop
pnpm install
pnpm run tauri:dev
```

The Tauri shell checks `127.0.0.1:8765` and starts a local backend automatically
when no backend is already running. During development, it falls back to
`app/backend/.venv` when no bundled sidecar is present.

For a browser-only frontend without the helper script:

```bash
cd app/desktop
pnpm run dev
```

Frontend URL:

```text
http://127.0.0.1:5173/
```

## Packaging Helpers

Build sidecars:

```bash
pnpm --dir app/desktop run backend:sidecar
pnpm --dir app/desktop run cloudflared:sidecar
```

Build a local Tauri bundle with sidecars:

```bash
pnpm --dir app/desktop run tauri:build:sidecar
```

Build only the Tauri shell:

```bash
pnpm --dir app/desktop run tauri:build
```

## Smoke Checks

Packaged backend sidecar:

```bash
pnpm --dir app/desktop run backend:sidecar:smoke
```

macOS launcher:

```bash
pnpm --dir app/desktop run macos:launcher:smoke
```

Windows launcher:

```bash
pnpm --dir app/desktop run windows:launcher:smoke
```

Backend WebSocket:

```bash
cd app/backend
source .venv/bin/activate
python ../../scripts/smoke_ws.py
```

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
  src/app/        shell and navigation
  src/assets/     UI brand icon and runtime animation assets
  src/features/   page-level UI
  src/hooks/      app data, session detail, and realtime test side effects
  src/components/ shared UI components
  src/components/ui/
                  shadcn-style primitives
  src/lib/        API, types, audio, formatting, runtime helpers
  src-tauri/      native Tauri shell and generated bundle icons

docs/             public project documentation
update_logs/      commit-by-commit development notes
scripts/          helper scripts
```

Agent-facing notes are kept in the ignored `.agent/` directory.

## Commit Checklist

1. Run focused checks for the area changed.
2. Run `git diff --check`.
3. Add or update an `update_logs/YYYY-MM-DD-short-title.md` note.
4. Stage only intended files.
5. Commit and push when requested.
