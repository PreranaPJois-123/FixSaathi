# FixSaathi: AI Repair Copilot

A voice-first, multimodal repair copilot for appliance field technicians. React + TypeScript frontend, FastAPI + PostgreSQL backend, and Google Gemini (Live, agents, image generation, embeddings) through the official `google-genai` SDK. The safety lock is enforced on the server.

```
FixSaathi/
  frontend/          React 19 + Vite + Tailwind 4 (design unchanged, mock services replaced by real API calls)
  backend/           FastAPI, SQLAlchemy 2, Alembic, Gemini integrations, dataset pipeline, 94 pytest tests
  data/              Raw (ApplianceDB, ODbL), processed and synthetic repair records + JSON schema
  docs/              Architecture, API mapping, Live protocol, AlloyDB notes, Cloud Run guide
  docker-compose.yml PostgreSQL + backend + frontend
```

## What is real and what is not verified

| Area | Status |
|---|---|
| Auth (Argon2, JWT access + rotating refresh tokens, roles, org scoping) | Implemented and tested |
| Sessions, chat history, uploads, steps, reports, escalations, dashboard, all in PostgreSQL | Implemented and tested (unit + browser end-to-end) |
| Server-side safety lock (REST, AI tools and live relay all go through one gate) | Implemented and tested (14 safety tests) |
| Diagnosis, guidance, part locator, step images, chat via Gemini | Implemented, tested with a fake Gemini. **Not yet run against real Gemini.** |
| Gemini Live WebSocket relay (audio 16 kHz in, 24 kHz out, 1 fps JPEG, tools, transcripts) | Implemented, tested with a fake Live session built from real SDK types. **Not yet run against real Gemini Live or a real microphone.** |
| Repair knowledge base | 292 records: 280 from ApplianceDB (washer/fridge error codes, ODbL) + 12 FixSaathi curated. Postgres full-text + optional embeddings. Citations checked by the server. Tested. |
| Similar repairs | Keyword mode tested; embeddings mode tested with fake vectors. ScaNN / pgvector **not** used (see docs/ALLOYDB.md) |
| Open Repair Alliance data | Importer tested on a fixture. **Data not imported** (download is behind a form). |
| Docker Compose | File validated with `docker compose config`. **Images not built here** (no Docker daemon in the build sandbox). |
| Cloud Run | Deployment guide only. **Not deployed.** |
| AI cost per repair | Not calculated: no verified pricing table. The dashboard says so. |

## Quick start (macOS, no Docker)

```bash
# 1. PostgreSQL 16
brew install postgresql@16 && brew services start postgresql@16
createdb fixsaathi

# 2. Backend
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
#   edit .env: set SECRET_KEY (python -c "import secrets;print(secrets.token_urlsafe(48))")
#   set DATABASE_URL=postgresql+psycopg://$USER@localhost:5432/fixsaathi
#   optional: GEMINI_API_KEY and the four model IDs
alembic upgrade head
python scripts/ingest_knowledge.py            # load the 292 processed repair records
uvicorn app.main:app --reload --port 8000      # API docs: http://localhost:8000/docs

# 3. Frontend (new terminal)
cd frontend
cp .env.example .env                            # VITE_API_BASE_URL=http://localhost:8000
npm ci && npm run dev                           # http://localhost:5173
```

Open http://localhost:5173, create an account, and start a session. To see the manager dashboard, promote yourself:

```bash
cd backend && python scripts/create_user.py --email you@example.com --role manager --org "Your Company"
```

## Quick start (Docker)

```bash
cp .env.example .env        # set SECRET_KEY, and Gemini values if you have them
docker compose up --build   # frontend http://localhost:5173, API http://localhost:8000/docs
```

## "The AI could not reply" / AI errors

Run this on the machine where the backend runs. It never prints the key:

```bash
cd backend && source .venv/bin/activate
python scripts/check_gemini.py          # free: is the key accepted, are the model IDs visible and capable?
python scripts/check_gemini.py --call   # + one tiny real text call and one embedding call
```

The chat now shows the exact category and a fix (for example `INVALID_API_KEY`, `PERMISSION_DENIED`, `MODEL_NOT_FOUND`, `BILLING_REQUIRED`, `QUOTA_EXCEEDED`, `NETWORK_ERROR`). The backend log line `gemini_call_failed` carries Google's own message. `GET /api/v1/ai/status` shows the configured models and the last call result.

## Gemini configuration

Set `GEMINI_API_KEY` and one model ID per feature in `backend/.env`. No model is substituted automatically: a missing ID returns `MODEL_NOT_CONFIGURED` for that feature, and the rest of the app keeps working. Confirm IDs your key can use at https://ai.google.dev/gemini-api/docs/models, for example in AI Studio.

| Variable | Used for |
|---|---|
| `GEMINI_AGENT_MODEL` | chat, diagnosis, repair guidance, part locator (JSON output) |
| `GEMINI_LIVE_MODEL` | live voice + camera (must support the Live API with audio output) |
| `NANO_BANANA_MODEL` | step illustrations (image output) |
| `GEMINI_EMBED_MODEL` | similar-repair search (then run `python scripts/index_knowledge.py`) |

Without a key, the backend runs in development mode. Every AI endpoint returns `AI_NOT_CONFIGURED`, and the UI shows that plainly. No fake AI replies are ever shown.

## Tests

```bash
cd backend
createdb fixsaathi_test
DATABASE_URL=postgresql+psycopg://$USER@localhost:5432/fixsaathi_test SECRET_KEY=test-secret-key-0123456789-abcdefghijk pytest -q
cd ../frontend && npm test && npm run build    # 5 vitest tests + type-check + production build
```

The tests run the Alembic migrations on a real PostgreSQL database and mock every Gemini call. No paid API calls are made.

## Safety model

- The two checkboxes are **technician statements**, stored per session and per technician, and expire after `SAFETY_CONFIRMATION_TTL_MINUTES`.
- `SafetyService.guard` is the only place that permits a power-sensitive action. It is called by step completion, step illustrations, and the live `give_step` tool.
- The model has no tool that can record confirmations. It can only ask the technician (`request_safety_confirmation`).
- The server, not the model, decides if a live step is power-sensitive: it takes the model's flag OR keywords (open, cover, wire, terminal, capacitor...).
- Every blocked attempt is stored in `safety_events` with the actor (`api`, `ai_tool`).
- The UI and reports state that FixSaathi cannot measure voltage or verify isolation.

Data licence: ApplianceDB-derived records are ODbL (attribution + share-alike). See docs/DATASET_SOURCES.md before commercial use.

More: `docs/DATASET_SOURCES.md`, `docs/DATASET_ARCHITECTURE.md`, `docs/RAG_PIPELINE.md`, `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/LIVE_PROTOCOL.md`, `docs/ALLOYDB.md`, `docs/DEPLOY_CLOUD_RUN.md`.
