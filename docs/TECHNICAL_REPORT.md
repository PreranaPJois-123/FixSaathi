# FixSaathi: technical report

Team Tensor Trailblazers (Prerana P Jois, Priyam Thakur). Google Startup Buildathon India 2026. Status as of 20 November 2026.

## 1. Architecture (what runs today)

| Layer | Technology | Purpose |
|---|---|---|
| Web app | React 19, TypeScript, Vite, Tailwind CSS 4, Framer Motion | Technician workspace: chat, photo or camera, voice, repair workspace, reports, manager dashboard. Pages load on demand. |
| API | FastAPI, Pydantic v2, SQLAlchemy 2, Alembic | Login, repair sessions, chat, diagnosis and step agents, the server-side safety gate, retrieval, reports, dashboard, the Live voice WebSocket relay. |
| Auth | JWT access tokens (30 min), rotating hashed refresh tokens, Argon2 passwords, technician/manager/admin roles | Each user sees only their own or their organisation's sessions. |
| AI | Google Gemini via the official `google-genai` SDK, called only from the server | `gemini-3.6-flash` for chat, vision and structured JSON, with fallbacks `gemini-3.5-flash`, `gemini-3.1-flash-lite` and `gemini-2.5-flash`. `gemini-embedding-001` for embeddings. `gemini-3.1-flash-image` (Nano Banana) for step pictures. Live API relay. |
| Knowledge | `repair_records` table: 292 records with a PostgreSQL full-text (GIN) index and brand, model and error-code fields | Retrieval-grounded answers with sources. The server removes any record ID the model invents. Each answer gets a coverage label: grounded, partial or none. |
| Database | PostgreSQL on Neon (free tier) | Users, sessions, messages, safety events, steps, reports, repair records, and **photos** (`stored_files`, with `STORAGE_PROVIDER=database`). |
| Demo mode | `app/demo/` with 2 scripted scenarios | Lets the product be shown without AI. The content is labelled; the safety gate, logging and reports are real. |
| Hosting | Render, as one Docker service in the Singapore region | One service serves both the website and the API over HTTPS. The Gemini key stays on the server. |

**Planned, not built:** Google Cloud Run, AlloyDB vector search, Cloud Storage.

## 2. Feature audit

See `FEATURE_AUDIT.md` for the current, complete list. The table below is a summary.

Evidence levels:
- **A:** automated tests (real PostgreSQL, fake Gemini).
- **B:** checked with real Gemini on the team's laptop on 20 Nov 2026.
- **C:** code only, not checked against real Gemini.

| Feature | Status | Evidence |
|---|---|---|
| Register, login, refresh, roles, org scoping | Implemented and tested | A |
| Repair session create, list and close | Implemented and tested | A |
| Appliance selection (6 categories) | Implemented and tested | A (browser) |
| Chat with message history | Implemented and tested | A, B |
| Photo upload and camera capture | Implemented and tested | A; real Gemini photo answer, B |
| Gemini vision reply in Hinglish | Verified with real Gemini | B (burnt fan photo, 15:37 IST) |
| Fault diagnosis (structured, ranked, confidence marked as estimate) | Implemented, not checked with real Gemini | A, C |
| Component identification with a box on the photo | Implemented, not checked with real Gemini | A, C |
| Step-by-step guidance | Implemented, not checked with real Gemini | A, C |
| **Safety gate**: power-sensitive steps need both `power_off_confirmed` and `tester_checked`, enforced on the server for REST, AI tools and voice; 60-min expiry; blocked attempts logged; the model cannot record the statements | Implemented and tested | A |
| Service report | Implemented and tested | A |
| Manager dashboard | Implemented and tested | A |
| RAG retrieval (full-text) with citation checks | Implemented and tested | A |
| Embedding re-ranking | Partially implemented: code exists, no index built in deployment, so the deployment uses full-text only | C |
| Nano Banana step pictures | Implemented, not checked with real Gemini (model is visible to the key) | A, C |
| Gemini Live voice and camera streaming | Partially implemented: relay built and tested with a fake, **but the key has no Live model** | A |
| Browser voice fallback (Chrome speech to Gemini text to Chrome speech) | Implemented; verified manually | B (transcription and reply seen) |
| Model fallback on free-tier rate limits | Implemented and tested | A |
| Specific AI error messages with a fix hint | Implemented and tested | A |
| Labelled demo mode (`/demo`) | Implemented and tested with no AI key | A (browser) |
| Photo persistence in PostgreSQL | Implemented and tested, including a real server restart | A |
| `/health` checks the database, returns 503 when it's down, accepts HEAD | Implemented and tested | A |
| Field accuracy measurement | Not done. No accuracy numbers are claimed. | n/a |

## 3. Improvements made

**Latest round:**
- **Photo persistence:** photos are now stored in PostgreSQL, so they survive restarts. Missing files return a clear 404.
- **Demo mode:** a labelled demo mode, offered from the AI-unavailable notice.
- **Health check:** `/health` now checks the database, returns 503 when it fails and accepts HEAD.
- **Bug fix:** photos now reload when a saved session is reopened.
- **Voice copy:** it no longer claims Gemini Live before Live is actually connected.
- **Repo cleanup:** removed an outdated handoff file.

**Earlier rounds:**

1. **Root cause of "needs paid tier":** every free-tier rate limit was being reported as "billing required" and never retried. Now only a real `limit: 0` counts as billing. Ordinary rate limits wait the delay Google asks for, then fall back to the next configured model. Two tests were added.
2. **Speed:** replies use `thinking_level=low`, and the app turns this off if a model rejects it. Pages load lazily and are prefetched while idle. Chat shows its progress stage with an elapsed timer. Voice runs diagnosis once after two turns, not on every sentence. Deployed retrieval uses full-text search directly, so no embedding call is wasted.
3. **Voice:** Chrome speech is used when the Live model isn't available. This happens only for model or provider errors; a closed session or a login error still shows its own message.
4. **User journey:** added an appliance picker to the start screen. Session titles are now clean first sentences.
5. **Deployment:** one service serving both site and API from the same address (same-origin WebSocket). The app accepts `postgres://` database URLs. Added `.gitignore` and `.dockerignore`, so the `.env` file and keys can't be committed.

## 4. Test results (run 20 Nov 2026)

| Suite | Result |
|---|---|
| Backend pytest (real PostgreSQL, fake Gemini) | **104 passed, 0 failed** |
| Frontend unit tests (Vitest) | **5 passed** |
| TypeScript type check and production build | Pass |
| Lint (oxlint) | 0 errors, 3 warnings (re-render performance hints) |
| Browser end-to-end, real Chrome against the production-style single service | **29 of 29 checks pass**: login and errors, register, refresh survives reload, chat, sidebar, camera capture, component box, diagnosis, image evidence, lock, server 409 refusal, one statement keeps the lock, both unlock, step completion, step picture, report contents, safety disclaimer, history, saved diagnoses, roles, manager dashboard, voice on a closed session, mobile without horizontal scroll |
| Browser test for a provider failure | Pass: the specific "API key invalid" error and its fix hint are shown |
| Browser demo-mode test, **no AI key**, `STORAGE_PROVIDER=database`, server restarted mid-test | **16 of 16 pass**: health, AI-unavailable notice, demo link, labels, photo, banner, lock (409), photo after restart, unlock, demo report label, 401 without a token, no page errors |
| Console or page errors during the full screenshot journey | 0 |

**Not covered by automated tests:**
- Real Gemini answers. The tests use a fake, so you need a manual check after the key is set.
- Browser voice mode. Headless Chrome has no speech recognition.

## 5. Known limitations

- **Gemini Live:** not available on the current key. Voice uses browser speech plus Gemini.
- **Free Render plan:** sleeps after 15 minutes idle, and the first request afterwards takes about 50 seconds. Keep it awake with a free uptime monitor, or use the Starter plan.
- **Photo storage:** photos are stored in Neon, whose free tier has limited storage (about 0.5 to 1 GB). That's fine for the evaluation; move to Cloud Storage for scale.
- **Knowledge base:** 253 of 292 records are washing machines. AC, fans, electrical and solar have very few.
- **Data licence:** ApplianceDB is ODbL-1.0 (attribution and share-alike). Keep the attribution.
- **Free-tier key:** small per-minute limits. The fallback models help, but heavy use during judging can still slow replies.

## 6. Deployment

- **Code:** https://github.com/PreranaPJois-123/FixSaathi (branch `main`). Pushes deploy automatically.
- **Service:** Render "fixsaathi" (Docker, Singapore, free plan) at https://fixsaathi.onrender.com
- **Database:** Neon, database `fixsaathi` on the default branch of the existing project.
- **Startup:** each start runs `alembic upgrade head`, loads the knowledge records if they're missing, then starts uvicorn.
- **To finish:** in the Render dashboard, go to fixsaathi > Environment and set `GEMINI_API_KEY` (a newly created key), then choose Save, rebuild and deploy.
- **To run locally:** see `README.md` in the repo. You need Python 3.12, Node 22 and PostgreSQL 16.
