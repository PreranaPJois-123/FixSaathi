"""Embed repair records with GEMINI_EMBED_MODEL so retrieval can use hybrid (keyword + embedding) mode. Needs a Gemini key; costs API usage."""
import asyncio, os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.db.session import SessionLocal
from app.services.knowledge_base import index_records


async def main():
    db = SessionLocal(); n = await index_records(db); db.commit(); print(f'Embedded {n} repair records.')

asyncio.run(main())
