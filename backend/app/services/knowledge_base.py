"""Repair knowledge base over `repair_records`.

retrieve(): structured filters (category, brand, model, error code) → PostgreSQL full-text keyword ranking →
optional Gemini-embedding re-ranking. Synthetic demo records are excluded unless include_synthetic=True.
Every hit carries its record_id, source, licence and verification status so answers can cite it.
"""
import logging, re
from dataclasses import dataclass, field
from sqlalchemy import func, or_, select, text
from sqlalchemy.orm import Session
from ..config import get_settings
from ..core.exceptions import AppError
from ..core.logging import log
from ..datasets import normalize as N
from ..datasets.schema import RELATED, VERIFICATION_MEANING, RepairRecord
from ..db.models import RepairEmbedding, RepairRecordRow
from ..integrations.gemini.client import get_gemini
from .knowledge import cosine

logger = logging.getLogger('knowledge_base')
WORD = re.compile(r'[a-z0-9]{2,}')
STOP = {'the', 'and', 'is', 'it', 'my', 'not', 'of', 'to', 'in', 'on', 'with', 'hai', 'nahi', 'ka', 'ki', 'raha', 'rahi', 'but', 'its', 'this', 'that', 'was', 'are', 'code', 'error', 'err', 'showing', 'shows',
        'display', 'machine', 'washing', 'washer', 'fridge', 'refrigerator', 'ac', 'split', 'appliance', 'unit', 'please', 'help', 'kya', 'karu', 'problem', 'issue', 'microwave', 'purifier', 'oven'}
VERIFICATION_WEIGHT = {'technician_reviewed': 1.25, 'verified_source': 1.15, 'unverified': 1.0, 'synthetic_demo': 0.5}


@dataclass
class Hit:
    record_id: str
    category: str
    related: bool
    score: float
    match: str  # error_code | keyword | embedding | filter
    record: dict
    flags: list[str] = field(default_factory=list)

    def citation(self) -> dict:
        r = self.record
        return {'record_id': self.record_id, 'source_name': r['source_name'], 'source_url': r.get('source_url'), 'license': r['source_license'],
                'verification_status': r['verification_status'], 'match': self.match, 'related_category': self.related}


def ingest(db: Session, records: list[RepairRecord]) -> dict:
    """Idempotent upsert by record_id. Returns counts."""
    existing = {r.record_id: r for r in db.scalars(select(RepairRecordRow).where(RepairRecordRow.record_id.in_([x.record_id for x in records])))}
    added = updated = 0
    for r in records:
        d = r.model_dump(mode='json')
        cols = dict(appliance_category=r.appliance_category, appliance_brand=r.appliance_brand, appliance_model=r.appliance_model, market=r.market,
                    error_code=r.error_code, severity=r.severity, requires_power_off=r.requires_power_off, verification_status=r.verification_status,
                    source_name=r.source_name[:200], source_license=r.source_license[:200], source_url=r.source_url, source_record_id=r.source_record_id[:120],
                    search_text=r.search_text(), data=d, last_updated=r.last_updated)
        row = existing.get(r.record_id)
        if row:
            if row.data != d or row.search_text != cols['search_text']:
                for k, v in cols.items(): setattr(row, k, v)
                updated += 1
        else:
            db.add(RepairRecordRow(record_id=r.record_id, **cols)); added += 1
    db.flush()
    return {'added': added, 'updated': updated, 'unchanged': len(records) - added - updated}


def _tsquery(q: str) -> str | None:
    toks = [t for t in WORD.findall(q.lower()) if t not in STOP][:24]
    return ' | '.join(dict.fromkeys(toks)) or None


def known_brands(db: Session) -> list[str]:
    return [b for (b,) in db.execute(select(RepairRecordRow.appliance_brand).where(RepairRecordRow.appliance_brand.is_not(None)).distinct())]


def detect_brand(db: Session, text_: str) -> str | None:
    t = f' {text_.lower()} '
    for b in sorted(known_brands(db) + list(set(N.BRANDS.values())), key=len, reverse=True):
        if re.search(rf'\b{re.escape(b.lower())}\b', t):
            return b
    return None


async def retrieve(db: Session, query: str, category: str | None = None, brand: str | None = None, model: str | None = None,
                   error_codes: list[str] | None = None, k: int = 6, include_synthetic: bool = False, use_embeddings: bool = True) -> dict:
    detected = None
    if not category or category == 'unknown':  # appliance-aware even when the session has no appliance yet
        detected = N.detect_appliance(query)
        category = detected if detected != 'unknown' else None
    cats = [category] + RELATED.get(category, []) if category else []
    brand = brand or detect_brand(db, query)
    codes = error_codes if error_codes is not None else N.extract_codes(query)

    def base():
        q = select(RepairRecordRow)
        if cats:
            q = q.where(RepairRecordRow.appliance_category.in_(cats))
        if not include_synthetic:
            q = q.where(RepairRecordRow.verification_status != 'synthetic_demo')
        if model:
            q = q.where(or_(RepairRecordRow.appliance_model.is_(None), func.lower(RepairRecordRow.appliance_model) == model.lower()))
        if brand:  # another brand's record (and its code meanings) never answers this brand's question; brand-less records still can
            q = q.where(or_(RepairRecordRow.appliance_brand.is_(None), func.lower(RepairRecordRow.appliance_brand) == brand.lower()))
        return q

    hits: dict[str, Hit] = {}

    def add(row: RepairRecordRow, score: float, match: str):
        rel = bool(category and row.appliance_category != category)
        s = score * VERIFICATION_WEIGHT.get(row.verification_status, 1.0) * (0.6 if rel else 1.0)
        if brand and row.appliance_brand and row.appliance_brand.lower() == brand.lower():
            s *= 1.3
        cur = hits.get(row.record_id)
        if not cur or s > cur.score:
            hits[row.record_id] = Hit(row.record_id, row.appliance_category, rel, s, match, row.data)

    code_found, code_missing = [], []
    for c in codes:
        rows = db.scalars(base().where(RepairRecordRow.error_code == c).limit(10)).all()
        # Codes a source lists as alternatives (LG 'CH38 / F4') match too, as whole tokens only, so E1 never matches E10.
        alias_rows = db.scalars(base().where(RepairRecordRow.error_code != c, RepairRecordRow.data['error_code_original'].as_string()
                                             .op('~*')(rf'\m{re.escape(c)}\M')).limit(10)).all() if re.fullmatch(r'[A-Z0-9]{1,8}', c) else []
        (code_found if rows or alias_rows else code_missing).append(c)
        for row in rows:
            add(row, 10.0, 'error_code')
        for row in alias_rows:
            add(row, 9.0, 'error_code')

    code_missing = [c for c in code_missing if not any(c.endswith(f) or f.endswith(c) for f in code_found)]  # 'ERIF' alias of found 'IF'
    tsq = _tsquery(query)
    if tsq:
        rank = func.ts_rank(func.to_tsvector('simple', RepairRecordRow.search_text), func.to_tsquery('simple', tsq))
        rows = db.execute(base().add_columns(rank).where(func.to_tsvector('simple', RepairRecordRow.search_text).op('@@')(func.to_tsquery('simple', tsq)))
                          .order_by(rank.desc()).limit(40)).all()
        for row, r in rows:
            add(row, float(r) * 10, 'keyword')

    mode, reason = 'keyword', None
    st = get_settings()
    if use_embeddings and st.vector_search_mode != 'keyword' and get_gemini().configured and st.gemini_embed_model and hits is not None:
        try:
            (qv,), mdl = await get_gemini().embed([query], task='RETRIEVAL_QUERY')
            ids = select(RepairRecordRow.id).where(RepairRecordRow.id.in_(base().with_only_columns(RepairRecordRow.id).scalar_subquery()))
            embs = db.execute(select(RepairEmbedding, RepairRecordRow).join(RepairRecordRow, RepairRecordRow.id == RepairEmbedding.source_id)
                              .where(RepairEmbedding.source_type == 'record', RepairEmbedding.model_identifier == mdl, RepairEmbedding.dimensions == len(qv),
                                     RepairEmbedding.source_id.in_(ids))).all()
            if embs:
                mode = 'hybrid'
                for e, row in embs:
                    sim = cosine(qv, e.vector)
                    if sim > 0.5:
                        add(row, sim * 3, 'embedding' if row.record_id not in hits else hits[row.record_id].match)
            else:
                reason = 'No record embeddings for the configured model. Run scripts/index_knowledge.py.'
        except AppError as e:
            reason = f'Embedding call failed ({e.code}); keyword results only.'
    else:
        reason = 'Embeddings not configured or VECTOR_SEARCH_MODE=keyword.'

    ranked = sorted(hits.values(), key=lambda h: -h.score)[:k]
    for h in ranked:
        if h.record['verification_status'] == 'synthetic_demo':
            h.flags.append('SYNTHETIC_DEMO')
        if h.related:
            h.flags.append('RELATED_CATEGORY')
    coverage = 'none' if not ranked else 'grounded' if any(not h.related and h.match in ('error_code', 'keyword', 'embedding') for h in ranked) else 'partial'
    if codes and code_missing and not code_found:
        coverage = 'partial' if ranked else 'none'
    log(logger, 'retrieve', category=category, detected=detected, brand=brand, codes=codes, hits=len(ranked), mode=mode, coverage=coverage)
    return {'mode': mode, 'fallback_reason': reason, 'coverage': coverage, 'brand': brand, 'category': category, 'category_detected': detected, 'error_codes_found': code_found,
            'error_codes_unknown': code_missing, 'hits': ranked}


def context_block(res: dict) -> str:
    """Evidence passed to Gemini. Each record is tagged with its id so the model can cite it; nothing else may be cited."""
    lines = []
    for h in res['hits']:
        r = h.record
        tag = f"[{h.record_id}] ({r['appliance_category']}{', ' + r['appliance_brand'] if r.get('appliance_brand') else ''}{', ' + r['market'] if r.get('market') else ''}; "
        tag += f"{r['verification_status']}{'; RELATED CATEGORY ONLY' if h.related else ''}{'; SYNTHETIC DEMO, NOT REAL' if 'SYNTHETIC_DEMO' in h.flags else ''})"
        body = []
        if r.get('error_code'): body.append(f"code {r['error_code']}")
        if r.get('reported_symptoms'): body.append('symptoms: ' + '; '.join(r['reported_symptoms'][:4]))
        if r.get('observed_conditions'): body.append('reported: ' + '; '.join(c[:200] for c in r['observed_conditions'][:2]))
        if r.get('possible_faults'): body.append('faults: ' + '; '.join(r['possible_faults'][:4]))
        if r.get('suspected_components'): body.append('components: ' + ', '.join(r['suspected_components'][:4]))
        if r.get('diagnostic_procedure'): body.append('checks: ' + '; '.join(r['diagnostic_procedure'][:4]))
        if r.get('repair_steps'): body.append('source repair steps: ' + '; '.join(s[:200] for s in r['repair_steps'][:3]))
        if r.get('repair_outcome'): body.append(f"outcome: {r['repair_outcome']}")
        lines.append(f"{tag} " + ' | '.join(body))
    hdr = f"Retrieval coverage: {res['coverage']}."
    if res['error_codes_unknown']:
        hdr += f" No record exists for error code(s) {', '.join(res['error_codes_unknown'])}{' for ' + res['brand'] if res['brand'] else ''}: do not state what they mean."
    return hdr + '\n' + ('\n'.join(lines) if lines else '(no matching records)')


def stats(db: Session) -> dict:
    rows = db.execute(select(RepairRecordRow.appliance_category, RepairRecordRow.verification_status, func.count()).group_by(RepairRecordRow.appliance_category, RepairRecordRow.verification_status)).all()
    out: dict = {'total': sum(r[2] for r in rows), 'by_category': {}, 'by_verification_status': {}}
    for c, v, n in rows:
        out['by_category'][c] = out['by_category'].get(c, 0) + n
        out['by_verification_status'][v] = out['by_verification_status'].get(v, 0) + n
    srcs = db.execute(select(RepairRecordRow.source_license, func.count()).group_by(RepairRecordRow.source_license)).all()
    out['by_license'] = {s: n for s, n in srcs}
    out['verification_meaning'] = VERIFICATION_MEANING
    return out


async def index_records(db: Session, batch: int = 50) -> int:
    g = get_gemini(); mdl = g.model('embed')
    have = set(db.scalars(select(RepairEmbedding.source_id).where(RepairEmbedding.source_type == 'record', RepairEmbedding.model_identifier == mdl)))
    rows = [r for r in db.scalars(select(RepairRecordRow).where(RepairRecordRow.verification_status != 'synthetic_demo')) if r.id not in have]
    n = 0
    for i in range(0, len(rows), batch):
        chunk = rows[i:i + batch]
        vecs, mdl = await g.embed([r.search_text[:2000] for r in chunk])
        for r, v in zip(chunk, vecs):
            db.add(RepairEmbedding(source_type='record', source_id=r.id, appliance_type=r.appliance_category, content=r.search_text[:2000],
                                   model_identifier=mdl, dimensions=len(v), vector=v))
        db.flush(); n += len(chunk)
    return n


def seed_curated(db: Session) -> int:
    """Make sure FixSaathi's own guidance is always present, so the app works before any external dataset is ingested."""
    from ..agents.prompts import KNOWLEDGE_FILE
    from ..datasets.importers import curated
    from ..datasets.pipeline import validate
    cands, _ = curated.load(KNOWLEDGE_FILE)
    recs, _ = validate(cands)
    return ingest(db, recs)['added']
