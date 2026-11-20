# Handoff: FixSaathi (20 Nov 2026)

## Architecture
- `frontend/`: React 19 + Vite + Tailwind 4. All data goes through `src/services/index.ts` and `src/services/api.ts`. Live voice is in `src/hooks/useLiveVoice.ts`.
- `backend/`: FastAPI. Routers in `app/api/v1`. Business rules in `app/services`, including safety, access, knowledge_base, ai and live. Gemini in `app/integrations/gemini` (client.py, errors.py). Dataset code in `app/datasets`. Migrations 0001 and 0002.
- `data/`: raw ApplianceDB (ODbL), processed (292 records), synthetic (4, separate), schemas.

## Status
| Item | Status |
|---|---|
| Auth, sessions, chat persistence, uploads, steps, reports, escalations, dashboard | TESTED WITH MOCKS (pytest on real PostgreSQL) + browser E2E against the real API |
| Safety gate (REST, AI tools, Live tools) | TESTED WITH MOCKS |
| Gemini error classification | TESTED WITH MOCKS using real SDK error classes; browser-verified message for INVALID_API_KEY |
| Real Gemini text, image, Live, Nano Banana, embeddings | NOT VERIFIED: the build sandbox cannot reach Google. Run scripts/check_gemini.py --call |
| Model IDs | Present in Google's catalogue (20 Nov 2026). Access for the user's key is NOT VERIFIED |
| Dataset | 292 records verified in files and DB (280 ApplianceDB, 12 curated) + 4 synthetic kept separate |
| Docker | Compose validated (`docker compose config`); images NOT built here (no daemon) |
| Cloud Run | Guide only, NOT deployed |

## Bug fixed: "The AI could not reply: The AI service returned an error"
Root cause in our code: `_call` mapped 400 and 403 provider errors to codes that all shared the same generic message. Non-`APIError` exceptions (network, SDK) were not caught at all. So every real failure looked identical.
Fix: `integrations/gemini/errors.py` classifies into INVALID_API_KEY, UNAUTHORIZED, PERMISSION_DENIED, MODEL_NOT_FOUND, BILLING_REQUIRED, QUOTA_EXCEEDED, REGION_NOT_SUPPORTED, INVALID_REQUEST, PROVIDER_UNAVAILABLE, AI_TIMEOUT, NETWORK_ERROR, AI_BLOCKED, AI_EMPTY and AI_INTERNAL_ERROR, each with a hint. Only transient categories are retried, with bounded backoff. The key is stripped of quotes and whitespace. The underlying provider cause on the user's machine is still unknown until `check_gemini.py` is run there.

## Tests (last run)
- backend `pytest -q`: 94 passed
- frontend `npm test`: 5 passed; `npm run build` OK
- browser E2E (Playwright, real API + Postgres + fake Gemini): 29/29, plus 1 AI-error display check

## Next commands
```bash
cd backend && python scripts/check_gemini.py && python scripts/check_gemini.py --call
# then fix .env per the printed hint, restart, retry chat
python scripts/check_gemini.py --call --image --live   # costs more: image generation
docker compose up --build && docker compose ps && docker compose logs --tail=100 backend
```
