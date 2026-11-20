import secrets, uuid
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from ..core.exceptions import Conflict
from ..db.base import utcnow
from ..db.models import Conversation, RepairSession, User

TRANSITIONS: dict[str, set[str]] = {
    'created': {'active', 'cancelled'},
    'active': {'diagnosing', 'awaiting_confirmation', 'guidance_in_progress', 'escalated', 'completed', 'cancelled'},
    'diagnosing': {'active', 'awaiting_confirmation', 'guidance_in_progress', 'escalated', 'completed', 'cancelled'},
    'awaiting_confirmation': {'active', 'guidance_in_progress', 'escalated', 'completed', 'cancelled'},
    'guidance_in_progress': {'active', 'awaiting_confirmation', 'escalated', 'completed', 'cancelled'},
    'escalated': {'active', 'guidance_in_progress', 'completed', 'cancelled'},
    'completed': set(), 'cancelled': set(),
}
TERMINAL = {'completed', 'cancelled'}
APPLIANCE_LABELS = {'ceiling_fan': 'Ceiling fan', 'split_ac': 'Split AC', 'washing_machine': 'Washing machine', 'refrigerator': 'Refrigerator',
                    'mcb_electrical': 'MCB / electrical', 'rooftop_solar': 'Rooftop solar', 'unknown': 'Appliance'}
KEYWORDS = [('split_ac', ('ac ', ' ac', 'air condition', 'split', 'cooling')), ('ceiling_fan', ('fan', 'pankha')),
            ('washing_machine', ('washing', 'washer', 'spin', 'drum')), ('refrigerator', ('fridge', 'refrigerator', 'freezer')),
            ('mcb_electrical', ('mcb', 'trip', 'breaker', 'rccb')), ('rooftop_solar', ('solar', 'inverter', 'panel'))]


def guess_appliance(text: str) -> str:
    t = f' {text.lower()} '
    for app, kws in KEYWORDS:
        if any(k in t for k in kws):
            return app
    return 'unknown'


def transition(s: RepairSession, new: str) -> None:
    if new == s.status:
        return
    if new not in TRANSITIONS.get(s.status, set()):
        raise Conflict(f'Cannot move a session from {s.status} to {new}.', code='INVALID_TRANSITION')
    s.status = new
    if new in TERMINAL:
        s.completed_at = utcnow()


def ensure_open(s: RepairSession) -> None:
    if s.status in TERMINAL:
        raise Conflict('This session is closed.', code='SESSION_CLOSED')


def create_session(db: Session, user: User, appliance_type: str | None, issue: str, title: str | None) -> RepairSession:
    app = appliance_type or guess_appliance(issue)
    ref = None
    for _ in range(5):
        cand = 'FS-' + secrets.token_hex(3).upper()
        if not db.scalar(select(func.count()).select_from(RepairSession).where(RepairSession.reference == cand)):
            ref = cand; break
    s = RepairSession(id=uuid.uuid4(), reference=ref or 'FS-' + uuid.uuid4().hex[:8].upper(), technician_id=user.id, organisation_id=user.organisation_id,
                      appliance_type=app, issue_description=issue.strip(), status='active',
                      title=(title or (issue.strip()[:80] if issue.strip() else f'{APPLIANCE_LABELS.get(app, "Appliance")} repair')))
    db.add(s); db.flush()
    return s


def add_message(db: Session, s: RepairSession, role: str, text: str, mtype: str = 'text', meta: dict | None = None) -> Conversation:
    m = Conversation(session_id=s.id, role=role, message=text, message_type=mtype, meta=meta or {})
    db.add(m); db.flush()
    return m
