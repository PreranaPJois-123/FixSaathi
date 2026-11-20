# FixSaathi: AI Repair Copilot

FixSaathi is a repair copilot for appliance field technicians. The technician picks the appliance, describes the fault by text or voice, and adds a photo. FixSaathi gives a ranked diagnosis grounded in repair records, then guided steps. The **server** locks every step that needs the power off until the technician records both safety statements. When the job is done, the service report is written automatically.

- **Live:** https://fixsaathi.onrender.com (health check: `/health`)
- **Stack:** React 19 + TypeScript (Vite, Tailwind 4) · FastAPI + SQLAlchemy 2 + Alembic · PostgreSQL · Google Gemini through the official `google-genai` SDK, called from the server only

```
frontend/   React app (served by the backend in production)
backend/    FastAPI app, Gemini integration, safety gate, demo scenarios, dataset pipeline, 132 tests
data/       377 repair records: ApplianceDB (ODbL), manufacturer documentation (summarised, with links), FixSaathi guidance
docs/       FEATURE_AUDIT, TECHNICAL_REPORT, DEMO_SCRIPT, SUBMISSION_CHECKLIST, architecture, API, safety, datasets
Dockerfile  One image: builds the site, then serves the site and API from FastAPI
```

Start with **docs/FEATURE_AUDIT.md** for what is verified and what is not.

## How the AI works

FixSaathi does **not** use a trained or fine-tuned model. It calls Google Gemini through its API and grounds every answer in a curated repair knowledge base of **377 records** (retrieval-augmented generation):

1. The appliance comes from the session, or is detected from the technician's words (`fridge not cooling` is a refrigerator, not an AC).
2. Brand, model and error codes are extracted (`CH 38`, `CH38` and the alias `F4` all match LG's record).
3. PostgreSQL full-text search ranks records **within that appliance only**, preferring the same brand and manufacturer-documented sources.
4. Gemini gets those records as tagged evidence. The server deletes any citation that wasn't retrieved, and marks a fault as unverified when no record supports it.
5. The safety gate is server code: power steps stay locked until both statements are recorded, and microwave steps that would open the cabinet are replaced with a hand-over to authorised service.

| Appliance | Records |
|---|---|
| Washing machine | 253 |
| Refrigerator | 41 |
| Split AC | 28 |
| Ceiling fan | 19 |
| Water purifier | 18 |
| Microwave oven | 16 |
| MCB / electrical, rooftop solar | 1 each |

See `docs/DATASET_QUALITY_REPORT.md`, `docs/SOURCE_ATTRIBUTION.md` and `docs/RAG_PIPELINE.md`. To rebuild the data: `python scripts/process_datasets.py`, then `python scripts/dataset_quality_report.py`.

## Deploy on Render (current setup)

The deployment is one Docker web service built from this repo's `Dockerfile`, plus a PostgreSQL database on Neon. Every push to `main` deploys automatically. Each start runs the migrations, loads the repair records if they're missing, then starts the server.

Environment variables on the Render service:

| Variable | Value | Notes |
|---|---|---|
| `DATABASE_URL` | Neon connection string | `postgres://` and `postgresql://` are both accepted |
| `SECRET_KEY` | 48+ random characters | Signs login tokens. Never commit it. |
| `GEMINI_API_KEY` | your Google AI Studio key | **Required for live AI.** Server only, never sent to the browser. |
| `GEMINI_AGENT_MODEL` | `gemini-3.6-flash` | chat, vision, diagnosis, steps |
| `GEMINI_AGENT_FALLBACK_MODELS` | `gemini-3.5-flash,gemini-3.1-flash-lite,gemini-2.5-flash` | used only when the main model is rate-limited |
| `GEMINI_THINKING_LEVEL` | `low` | faster replies |
| `GEMINI_EMBED_MODEL` | `gemini-embedding-001` | |
| `NANO_BANANA_MODEL` | `gemini-3.1-flash-image` | step pictures |
| `GEMINI_LIVE_MODEL` | a Live-capable model your key can use | Without one, voice uses browser speech |
| `STORAGE_PROVIDER` | `database` | **Photos survive restarts** (stored in PostgreSQL) |
| `VECTOR_SEARCH_MODE` | `keyword` | full-text retrieval (no embedding index is built) |
| `APP_ENV` | `production` | |
| `CORS_ORIGINS` | `https://fixsaathi.onrender.com` | the site is served from the same address anyway |

**Uptime monitoring (free).** Render's free plan sleeps after 15 minutes idle. In UptimeRobot, add a monitor:
- Type: **HTTP(s)**
- URL: `https://fixsaathi.onrender.com/health`
- Interval: **5 minutes**

`/health` returns 200 only when the database answers, and 503 (`"status": "unhealthy"`) when it doesn't. It accepts GET and HEAD and is never cached. A missing AI key is reported (`ai.configured: false`) but doesn't make the app unhealthy, because demo mode still works.

## Run locally

You need **PostgreSQL 16**, **Python 3.12** and **Node 22** (or just Docker). A Gemini key is optional: without it, AI features answer `AI_NOT_CONFIGURED` and the labelled demo scenarios still work.

### Option A: Docker (one command)

```bash
python3 backend/scripts/setup_env.py --compose   # writes .env with a new SECRET_KEY
# open .env and paste your key after GEMINI_API_KEY= (optional)
docker compose up --build                       # site: http://localhost:5173   API: http://localhost:8000/docs
```

### Option B: manual (macOS / Linux)

```bash
# 1. Database (macOS: brew install postgresql@16 && brew services start postgresql@16)
createdb fixsaathi

# 2. Backend
cd backend
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python scripts/setup_env.py --database-url "postgresql+psycopg://$USER@localhost:5432/fixsaathi"
#    then paste your Gemini key into backend/.env (optional)
python scripts/check_gemini.py --call             # optional: checks the key and models; never prints the key
alembic upgrade head && python scripts/ingest_knowledge.py
uvicorn app.main:app --reload --port 8000         # API docs: http://localhost:8000/docs

# 3. Frontend (new terminal)
cd frontend && cp .env.example .env && npm ci && npm run dev    # http://localhost:5173
```

### Option B on Windows (PowerShell)

```powershell
# Install PostgreSQL 16 from postgresql.org, then create the database "fixsaathi" (pgAdmin, or: createdb -U postgres fixsaathi)
cd backend
py -3.12 -m venv .venv; .venv\Scripts\Activate.ps1
pip install -r requirements.txt
python scripts\setup_env.py --database-url "postgresql+psycopg://postgres:YOUR_PASSWORD@localhost:5432/fixsaathi"
alembic upgrade head; python scripts\ingest_knowledge.py
uvicorn app.main:app --reload --port 8000
# new terminal
cd frontend; copy .env.example .env; npm ci; npm run dev
```

### Option C: one process, like production

```bash
cd frontend && npm ci && VITE_API_BASE_URL="" npm run build && cd ../backend
FRONTEND_DIST=../frontend/dist uvicorn app.main:app --port 8000   # site and API both on http://localhost:8000
```

To make yourself a manager (for the dashboard): `python scripts/create_user.py --email you@example.com --role manager --org "Your Company"`

### Tests

```bash
cd backend && DATABASE_URL=postgresql+psycopg://USER:PASS@localhost:5432/fixsaathi_test pytest -q   # uses (and wipes) a separate test database
cd frontend && npm test && npm run build
```

### What you can attach

Use the **+** button in the chat: photos (JPG, PNG, WebP, up to 8 MB), PDFs, Word (.docx) and text files (.txt, .csv, .md, up to 15 MB), or **Take a photo** with the device camera. You can attach up to 6 files per message, or drag and drop them, or paste an image. The server checks every file's real contents, removes location metadata from photos, and refuses anything else. The camera needs https (or localhost).

### Troubleshooting

| Symptom | Fix |
|---|---|
| `FixSaathi cannot start: check SECRET_KEY ...` | Run `python scripts/setup_env.py` in `backend/`. |
| `connection refused` / `password authentication failed` | PostgreSQL isn't running, or `DATABASE_URL` in `backend/.env` has the wrong user or password. |
| Chat says *AI is not available* | No `GEMINI_API_KEY` in `backend/.env`. Paste it, restart the backend. |
| *Free-tier quota reached* | Wait about a minute; the fallback models are tried automatically. |
| Voice button does nothing | Use Chrome or Edge and allow the microphone. Voice uses browser speech plus Gemini. |
| Camera says permission denied | Click the camera icon in the address bar, allow the camera, then **Try camera again**. On http (not https) browsers block the camera: use **Upload from gallery**. |
| "Waking up the server" on the live site | The free Render plan sleeps when idle; the first load takes up to a minute. You stay signed in. |

## AI behaviour, and what happens without AI

- **Errors:** every Gemini failure is classified (`INVALID_API_KEY`, `PERMISSION_DENIED`, `MODEL_NOT_FOUND`, `BILLING_REQUIRED`, `QUOTA_EXCEEDED`, `AI_TIMEOUT`, `NETWORK_ERROR`, `AI_BLOCKED`, ...). The chat shows the reason and a fix. The technician's message is saved either way.
- **Retries:** free-tier rate limits are retried after the delay Google asks for, then the next fallback model is tried. Every switch is logged. Bad keys and unknown models are never retried.
- **Without a key:** AI endpoints return `AI_NOT_CONFIGURED`. The UI says so and offers the **labelled demo scenarios** (`/demo`). Demo sessions use scripted sample content written by the team, and every screen labels them "Demo scenario: scripted sample, not live AI". The safety lock, logging and reports are the same server code as live sessions.

## Voice

The voice page first tries the **Gemini Live** relay (WebSocket, 16 kHz audio up, 24 kHz down). If the server's key has no Live model, it switches to **browser voice mode**: Chrome or Edge speech recognition turns speech into text, the normal Gemini chat answers through the server, and the browser reads the answer aloud. This is **not** Gemini Live streaming. Microphone denial and unsupported browsers show a clear message.

## Safety model (enforced in backend code)

- The two safety checkboxes are **statements entered by the technician**: "power switched off at the MCB" and "checked with my own tester". FixSaathi cannot measure voltage or verify isolation, and the UI and reports say so.
- `SafetyService.guard` is the only path that permits a power-sensitive action. REST step completion, step pictures and the Live `give_step` tool all go through it. Both statements are required, per session and per technician, and they expire after `SAFETY_CONFIRMATION_TTL_MINUTES` (default 60).
- Locked steps are sent to the client **without their instructions**. The server decides which steps are power-sensitive: it takes the model's flag OR keyword detection.
- The AI has no tool that can record a statement. Every blocked attempt is logged in `safety_events`.

## Tests

```bash
cd backend && createdb fixsaathi_test
DATABASE_URL=postgresql+psycopg://$USER@localhost:5432/fixsaathi_test SECRET_KEY=test-secret-key-0123456789-abcdefghijk pytest -q
cd ../frontend && npm test && npm run build && npm run lint
```

The backend tests run the real Alembic migrations on PostgreSQL. Gemini is replaced by a deterministic fake, so no paid calls are made.

Data licence: ApplianceDB-derived records are ODbL-1.0 (attribution and share-alike). See docs/DATASET_SOURCES.md.
