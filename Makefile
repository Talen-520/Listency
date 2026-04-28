.PHONY: backend-dev backend-test desktop-dev tauri-dev

backend-dev:
	cd app/backend && uvicorn voice_agent.main:app --host 127.0.0.1 --port 8765 --reload

backend-test:
	cd app/backend && python -m unittest discover -s tests

desktop-dev:
	cd app/desktop && pnpm run dev

tauri-dev:
	cd app/desktop && pnpm run tauri:dev
