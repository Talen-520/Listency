# 2026-05-08 Close SQLite Connections

## Goal

- Fix the first Windows CI failure in backend tests.

## Changes

- Added a Database connection context manager that commits or rolls back and then closes the SQLite connection.
- Replaced internal database operations so temporary test databases do not keep open file handles.

## Files

- `app/backend/voice_agent/storage/database.py`

## Verification

- Ran `app/backend/.venv/bin/python -m unittest discover -s tests`.

## Known Limits

- The Windows workflow needs a second GitHub Actions run to verify the CI fix on Windows.

## Next Steps

- Push the fix and inspect the next Windows Packaged Smoke run.
