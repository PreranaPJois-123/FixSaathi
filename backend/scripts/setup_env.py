"""Create a working .env file for local runs, with a freshly generated SECRET_KEY.

    python scripts/setup_env.py             # writes backend/.env (manual run)
    python scripts/setup_env.py --compose   # writes .env in the project root (docker compose)

Never overwrites an existing .env unless --force is given. The Gemini key is left for you to paste in yourself;
the app runs without it (AI features answer AI_NOT_CONFIGURED and demo scenarios still work).
"""
import argparse, re, secrets
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
ROOT = BACKEND.parent


def main():
    p = argparse.ArgumentParser(); p.add_argument('--compose', action='store_true'); p.add_argument('--force', action='store_true')
    p.add_argument('--database-url', help='e.g. postgresql+psycopg://postgres:postgres@localhost:5432/fixsaathi')
    a = p.parse_args()
    src = (ROOT / '.env.example') if a.compose else (BACKEND / '.env.example')
    dst = (ROOT / '.env') if a.compose else (BACKEND / '.env')
    if dst.exists() and not a.force:
        print(f'{dst} already exists. Use --force to replace it.'); return
    text = src.read_text()
    text = re.sub(r'^SECRET_KEY=.*$', f'SECRET_KEY={secrets.token_urlsafe(48)}', text, flags=re.M)
    if a.database_url and not a.compose:
        text = re.sub(r'^DATABASE_URL=.*$', f'DATABASE_URL={a.database_url}', text, flags=re.M)
    dst.write_text(text)
    print(f'Wrote {dst} with a new SECRET_KEY.')
    print('Next: open it and paste your Gemini key after GEMINI_API_KEY= (no quotes, no spaces). The app also runs without it.')
    if not a.compose:
        db = re.search(r'^DATABASE_URL=(.*)$', text, flags=re.M)
        print(f'Database: {db.group(1) if db else "(not set)"}  <- change it if your PostgreSQL user or password differs.')


if __name__ == '__main__':
    main()
