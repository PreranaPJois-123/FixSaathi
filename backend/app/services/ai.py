"""Business services that call Gemini agents. Model output is validated and treated as untrusted data."""
import base64, logging, time
from google.genai import types
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from ..agents import prompts
from ..agents.schemas import ComponentOut, DiagnosisOutput, GuidanceOutput
from ..core.exceptions import AIError, AppError, Conflict, NotFound
from ..db.models import (AIUsage, Conversation, DiagnosisResult, IdentifiedComponent, Media, RepairSession, RepairStep, User)
from ..integrations.gemini.client import CallResult, get_gemini as _live_gemini
from ..demo.client import DemoClient, is_demo
from ..integrations.storage.local import get_storage
from . import knowledge_base as kb
import re
from .sessions import add_message, ensure_open, transition

logger = logging.getLogger('ai')


def _ai(db: Session, s: RepairSession):
    """Labelled demo sessions use scripted content; every other session uses the real Gemini client."""
    sc = is_demo(s)
    if not sc:
        return _live_gemini()
    turns = db.scalar(select(func.count()).select_from(Conversation).where(Conversation.session_id == s.id, Conversation.role == 'assistant')) or 0
    return DemoClient(sc, turns)


def record_usage(db: Session, s: RepairSession | None, op: str, meta: CallResult | None, ok: bool = True, code: str | None = None, model: str = '') -> None:
    db.add(AIUsage(session_id=s.id if s else None, operation=op, model_identifier=meta.model if meta else model, latency_ms=meta.latency_ms if meta else 0,
                   input_tokens=meta.input_tokens if meta else None, output_tokens=meta.output_tokens if meta else None, ok=ok, error_code=code))


def _history(db: Session, s: RepairSession, limit: int = 16) -> str:
    rows = list(db.scalars(select(Conversation).where(Conversation.session_id == s.id).order_by(Conversation.created_at.desc()).limit(limit)))[::-1]
    return '\n'.join(f'{r.role}: {r.message}' for r in rows if r.message)


def _images(db: Session, s: RepairSession, ids: list | None, limit: int = 3) -> list[types.Part]:
    q = select(Media).where(Media.session_id == s.id, Media.kind != 'generated')
    if ids:
        q = q.where(Media.id.in_(ids))
    rows = db.scalars(q.order_by(Media.created_at.desc()).limit(limit)).all()
    st = get_storage()
    return [types.Part.from_bytes(data=st.get(m.storage_key), mime_type=m.mime_type) for m in rows]


CITE = re.compile(r'\[([a-z]+:[^\]\s]{1,110})\]')


def _clean_citations(text: str, allowed: set[str]) -> tuple[str, list[str], list[str]]:
    """Keep citations to retrieved records; strip any id the model made up."""
    used, invented = [], []
    def sub(m):
        rid = m.group(1)
        if rid in allowed:
            used.append(rid); return m.group(0)
        invented.append(rid); return ''
    return CITE.sub(sub, text).replace('  ', ' ').strip(), list(dict.fromkeys(used)), invented


async def _retrieve(db: Session, s: RepairSession, text: str) -> dict:
    return await kb.retrieve(db, f'{s.issue_description} {text}'.strip(), category=s.appliance_type)


async def chat_reply(db: Session, s: RepairSession, user: User, text: str, media_ids: list) -> Conversation:
    g = _ai(db, s)
    res = await _retrieve(db, s, text)
    contents: list = [prompts.wrap('knowledge', kb.context_block(res)), prompts.wrap('history', _history(db, s)), f'Appliance (from session): {s.appliance_type}',
                      prompts.wrap('technician_input', text or '(technician shared a photo)')]
    contents += _images(db, s, media_ids) if media_ids else []
    try:
        reply, meta = await g.generate_text('chat', contents, prompts.CHAT_SYSTEM.format(language=user.preferred_language))
    except AppError as e:
        record_usage(db, s, 'chat', None, ok=False, code=e.code, model='agent'); raise
    record_usage(db, s, 'chat', meta)
    allowed = {h.record_id for h in res['hits']}
    reply, used, invented = _clean_citations(reply, allowed)
    sources = [h.citation() for h in res['hits'] if h.record_id in used]
    return add_message(db, s, 'assistant', reply, meta={'model': meta.model, 'latency_ms': meta.latency_ms, 'ai_generated': meta.model != 'demo-scenario', 'demo': meta.model == 'demo-scenario', 'sources': sources,
                                                         'knowledge_coverage': res['coverage'], 'removed_invalid_citations': len(invented)})


async def diagnose(db: Session, s: RepairSession, media_ids: list | None = None) -> DiagnosisResult:
    ensure_open(s)
    g = _ai(db, s)
    note = prompts.APPLIANCE_NOTES.get(s.appliance_type, prompts.APPLIANCE_NOTES['unknown'])
    prev = db.scalars(select(DiagnosisResult).where(DiagnosisResult.session_id == s.id).order_by(DiagnosisResult.created_at.desc()).limit(1)).first()
    res = await kb.retrieve(db, f'{s.issue_description} {_history(db, s, 6)}', category=s.appliance_type)
    contents: list = [f'Appliance type: {s.appliance_type}. Notes: {note}', prompts.wrap('knowledge', kb.context_block(res)), prompts.wrap('history', _history(db, s)),
                      prompts.wrap('technician_input', s.issue_description or '(no description yet)')]
    if prev:
        contents.append(f'Previous diagnosis summary: {prev.problem_summary}')
    imgs = _images(db, s, media_ids)
    contents += imgs or ['No images supplied: do not use observed_in_image evidence.']
    prior = s.status
    if s.status != 'diagnosing':
        transition(s, 'diagnosing')
    t0 = time.perf_counter()
    try:
        out, meta = await g.generate_json('diagnosis', DiagnosisOutput, contents, prompts.DIAGNOSIS_SYSTEM)
    except AppError as e:
        s.status = prior if prior != 'diagnosing' else 'active'
        record_usage(db, s, 'diagnosis', None, ok=False, code=e.code, model='agent'); raise
    if not imgs:  # never keep image evidence the model could not have seen
        for f in out.possible_faults:
            f.evidence = [ev for ev in f.evidence if ev.source != 'observed_in_image']
    allowed = {h.record_id for h in res['hits']}
    for f in out.possible_faults:  # citations are checked by the server, not trusted
        f.record_ids = [r for r in f.record_ids if r in allowed]
        if f.status == 'supported_by_records' and not f.record_ids:
            f.status = 'unverified_hypothesis'
        if res['coverage'] == 'none':
            f.status = 'unverified_hypothesis'
    if res['coverage'] == 'none':
        out.missing_information = (out.missing_information or []) + ['No matching repair record was found in the FixSaathi knowledge base.']
        if not out.follow_up_questions:
            out.follow_up_questions = ['What is the brand and model number on the rating label?']
    if res['error_codes_unknown']:
        out.missing_information.append(f"No record for error code(s) {', '.join(res['error_codes_unknown'])}. Check the model's manual or ask a senior technician.")
    out.possible_faults.sort(key=lambda f: -f.confidence)
    used = {r for f in out.possible_faults for r in f.record_ids}
    d = DiagnosisResult(session_id=s.id, problem_summary=out.problem_summary, faults=[f.model_dump() for f in out.possible_faults],
                        recommended_checks=out.recommended_checks, follow_up_questions=out.follow_up_questions, safety_requirements=out.safety_requirements,
                        requires_escalation=out.requires_escalation, confirmed_findings=out.confirmed_findings, missing_information=out.missing_information,
                        knowledge_coverage=res['coverage'], sources=[h.citation() for h in res['hits'] if h.record_id in used],
                        model_identifier=meta.model, latency_ms=int((time.perf_counter() - t0) * 1000))
    if s.appliance_type == 'unknown' and out.appliance_type != 'unknown':
        s.appliance_type = out.appliance_type
    transition(s, 'active')
    db.add(d); record_usage(db, s, 'diagnosis', meta); db.flush()
    return d


async def generate_steps(db: Session, s: RepairSession) -> list[RepairStep]:
    ensure_open(s)
    existing = db.scalars(select(RepairStep).where(RepairStep.session_id == s.id)).all()
    if any(x.status == 'completed' for x in existing):
        raise Conflict('Steps already in progress. Steps that were done are kept and are not regenerated.', code='STEPS_IN_PROGRESS')
    d = db.scalars(select(DiagnosisResult).where(DiagnosisResult.session_id == s.id).order_by(DiagnosisResult.created_at.desc()).limit(1)).first()
    if not d:
        raise Conflict('Run a diagnosis before generating repair steps.', code='DIAGNOSIS_REQUIRED')
    top = d.faults[0]['fault'] if d.faults else d.problem_summary
    res = await kb.retrieve(db, f'{s.issue_description} {top}', category=s.appliance_type)
    contents = [f'Appliance type: {s.appliance_type}', f'Most likely fault (model estimate): {top}', prompts.wrap('knowledge', kb.context_block(res)),
                f'Safety requirements from diagnosis: {d.safety_requirements}', f'Escalation suggested: {d.requires_escalation}']
    try:
        out, meta = await _ai(db, s).generate_json('guidance', GuidanceOutput, contents, prompts.GUIDANCE_SYSTEM)
    except AppError as e:
        record_usage(db, s, 'guidance', None, ok=False, code=e.code, model='agent'); raise
    for x in existing:
        db.delete(x)
    db.flush()
    from .live import POWER_WORDS
    cited = [r for r in out.record_ids if r in {h.record_id for h in res['hits']}]
    # The server re-checks power sensitivity; source steps from unverified records never relax it.
    steps = [RepairStep(session_id=s.id, step_number=i + 1, title=o.title, instruction=o.instruction, kind=o.kind,
                        requires_power_off=o.requires_power_off or bool(POWER_WORDS.search(f'{o.title} {o.instruction}')), source_record_ids=cited)
             for i, o in enumerate(out.steps)]
    db.add_all(steps); record_usage(db, s, 'guidance', meta)
    transition(s, 'guidance_in_progress'); db.flush()
    return steps


async def identify_component(db: Session, s: RepairSession, media_id, query: str | None) -> IdentifiedComponent:
    m = db.get(Media, media_id)
    if not m or m.session_id != s.id or m.kind == 'generated':
        raise NotFound('Image not found in this session.')
    part = types.Part.from_bytes(data=get_storage().get(m.storage_key), mime_type=m.mime_type)
    ask = f'Appliance: {s.appliance_type}. ' + (prompts.wrap('technician_input', f'Find: {query}') if query else 'Identify the most relevant visible component for the reported issue.')
    try:
        out, meta = await _ai(db, s).generate_json('part_locator', ComponentOut, [ask, part], prompts.PART_LOCATOR_SYSTEM, temperature=0.1)
    except AppError as e:
        record_usage(db, s, 'part_locator', None, ok=False, code=e.code, model='agent'); raise
    c = IdentifiedComponent(session_id=s.id, media_id=m.id, query=query, result=out.model_dump(), model_identifier=meta.model)
    db.add(c); record_usage(db, s, 'part_locator', meta); db.flush()
    return c


async def step_visual(db: Session, s: RepairSession, step: RepairStep) -> Media:
    if step.visual_media_id:
        m = db.get(Media, step.visual_media_id)
        if m:
            return m  # do not regenerate
    prompt = prompts.IMAGE_STEP_PROMPT.format(appliance=s.appliance_type, title=step.title, instruction=step.instruction)
    try:
        data, mime, meta = await _ai(db, s).generate_image(prompt)
    except AppError as e:
        record_usage(db, s, 'image_generation', None, ok=False, code=e.code, model='image'); raise
    from ..integrations.storage.local import inspect_image
    mime, ext, w, h = inspect_image(data)
    key = get_storage().put(data, ext, f'generated/{s.id}')
    m = Media(session_id=s.id, uploaded_by=None, kind='generated', storage_key=key, mime_type=mime, size_bytes=len(data), width=w, height=h,
              meta={'ai_generated': True, 'label': 'AI-generated illustration, not a photo of this appliance', 'step_id': str(step.id), 'model': meta.model})
    db.add(m); db.flush(); step.visual_media_id = m.id; record_usage(db, s, 'image_generation', meta)
    return m


def b64(b: bytes) -> str: return base64.b64encode(b).decode()
