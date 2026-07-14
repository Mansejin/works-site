# AGENTS.md

## Cursor Cloud specific instructions

This repo (`works-site`) is a monorepo for `works.mansejin.com`. Three components are relevant for local development:

| Service | Path | Port | Run command (dev) |
|---------|------|------|-------------------|
| Static frontend | repo root | 8080 | `python3 -m http.server 8080` (serve repo root) |
| `works-api` (FastAPI backend) | `api/` | 8788 | `api/.venv/bin/python api/server.py` (set `WORKS_RELOAD=1` for hot reload) |
| `conti-collab` (Yjs WebSocket) | `api/conti-collab/` | 8789 | `node api/conti-collab/server.js` |

There is also a helper `dddit/script/start-local.sh` that launches only the static server in a tmux session.

### Non-obvious notes

- **Dependencies are installed by the update script**: Python deps into the venv at `api/.venv`, Node deps into `api/conti-collab/node_modules`. The frontend is plain static HTML/JS with no build step (the one bundled asset `dddit/conti/vendor/collab-lib.js` is pre-committed; regenerate only via `npm run build:vendor` in `api/conti-collab`).
- **Frontend backend hosts are hardcoded by hostname, not env vars.** On `localhost`/`127.0.0.1` the frontend auto-targets `http://localhost:8788` (works-api) and `ws://localhost:8789` (collab). See `dddit/js/conti-api.js` and `dddit/script/js/works-api.js`. So local end-to-end testing requires the backend on `:8788` (and collab on `:8789` for real-time editing) — no config needed.
- **CORS** default (`api/app/config.py`) already allows `http://localhost:8080` and `http://127.0.0.1:8080`, so serve the frontend on port 8080.
- **No database.** All state is flat JSON files under `api/data/` (e.g. `data/conti/<project>.json`, `data/hub.json`); this directory is gitignored. Yjs collab docs persist as `.bin` files under `data/conti/.yjs/`.
- **`.env` is optional for startup.** `api/server.py` starts and serves `/health` and `/api/dddit/config` with no keys. External-API features (Gemini, Google Sheets, YouTube, Google Ads) only fail when invoked without their keys. Copy `api/.env.example` → `api/.env` and fill only the keys for features you exercise.
- **The `/dddit/conti/` page opens the real-time collab flow** (prompts for an editor name and connects to the `:8789` WebSocket). The `/dddit/script/` page is the AI storyboard writer. Data typed in the live collab view is synced via Yjs, not immediately written to the REST JSON store, so a hard refresh can reload pre-sync backend state.
- **Lint/build:** there is no formal lint step. The only automated CI check is `node dddit/scripts/check-brand-portals.mjs` (see `.github/workflows/check-brand-portals.yml`), which validates brand portal pages.
