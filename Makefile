.PHONY: backend-dev backend-test backend-sidecar desktop-dev tauri-dev tauri-build-sidecar

backend-dev:
	cd app/backend && uvicorn voice_agent.main:app --host 127.0.0.1 --port 8765 --reload

backend-test:
	cd app/backend && python -m unittest discover -s tests

backend-sidecar:
	node scripts/build_backend_sidecar.mjs

desktop-dev:
	cd app/desktop && pnpm run dev

tauri-dev:
	cd app/desktop && pnpm run tauri:dev

tauri-build-sidecar:
	cd app/desktop && pnpm run tauri:build:sidecar
