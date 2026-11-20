"""Server-enforced safety gate. The ONLY place that decides whether a power-sensitive action may proceed.

Statements are technician-entered. FixSaathi cannot physically verify isolation; the API and UI say so.
Rules:
- Both power_off_confirmed and tester_checked must be recorded, by the session's own technician, for THIS session.
- Statements expire after SAFETY_CONFIRMATION_TTL_MINUTES so a stale confirmation cannot unlock later work.
- Every blocked attempt and every change is recorded in safety_events.
- AI tools, REST step completion and the live relay all call `guard`.
"""
import logging
from dataclasses import dataclass, field
from datetime import timedelta
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..config import get_settings
from ..core.exceptions import Forbidden
from ..core.logging import log
from ..db.base import utcnow
from ..db.models import RepairSession, SafetyConfirmation, SafetyEvent, User
from .sessions import ensure_open

logger = logging.getLogger('safety')
DISCLAIMER = ('These are statements entered by the technician. FixSaathi cannot measure voltage or verify that a circuit is isolated. '
              'Always switch off at the MCB or isolator and verify with your own tester.')


@dataclass
class SafetyState:
    power_off_confirmed: bool = False
    tester_checked: bool = False
    confirmed_at: str | None = None
    expires_at: str | None = None
    expired: bool = False

    @property
    def missing(self) -> list[str]:
        return [k for k, v in (('power_off_confirmed', self.power_off_confirmed), ('tester_checked', self.tester_checked)) if not v]

    @property
    def unlocked(self) -> bool:
        return not self.missing


@dataclass
class Decision:
    allowed: bool
    reason: str | None = None
    missing: list[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {'allowed': self.allowed, 'reason': self.reason, 'missing': self.missing, 'disclaimer': DISCLAIMER}


def current_state(db: Session, s: RepairSession) -> SafetyState:
    row = db.scalars(select(SafetyConfirmation).where(SafetyConfirmation.session_id == s.id, SafetyConfirmation.technician_id == s.technician_id)
                     .order_by(SafetyConfirmation.confirmed_at.desc()).limit(1)).first()
    if not row:
        return SafetyState()
    ttl = timedelta(minutes=get_settings().safety_confirmation_ttl_minutes)
    exp = row.confirmed_at + ttl
    if utcnow() > exp:
        return SafetyState(confirmed_at=row.confirmed_at.isoformat(), expires_at=exp.isoformat(), expired=True)
    return SafetyState(row.power_off_confirmed, row.tester_checked, row.confirmed_at.isoformat(), exp.isoformat())


def confirm(db: Session, s: RepairSession, user: User, power_off: bool, tester: bool, source: str = 'ui') -> SafetyState:
    if s.technician_id != user.id:
        raise Forbidden('Only the technician working on this session can record safety statements.')
    ensure_open(s)
    db.add(SafetyConfirmation(session_id=s.id, technician_id=user.id, power_off_confirmed=power_off, tester_checked=tester, confirmation_source=source))
    db.add(SafetyEvent(session_id=s.id, technician_id=user.id, event_type='confirmation_changed', actor=source, blocked=False,
                       details={'power_off_confirmed': power_off, 'tester_checked': tester}))
    db.flush()
    log(logger, 'safety_confirmation', session=str(s.id), power_off=power_off, tester=tester)
    return current_state(db, s)


def guard(db: Session, s: RepairSession, user: User | None, action: str, requires_power_off: bool, actor: str = 'api') -> Decision:
    if not requires_power_off:
        return Decision(True)
    if user is not None and user.id != s.technician_id:
        d = Decision(False, 'NOT_SESSION_TECHNICIAN', ['power_off_confirmed', 'tester_checked'])
    else:
        st = current_state(db, s)
        d = Decision(True) if st.unlocked else Decision(False, 'SAFETY_CONFIRMATION_EXPIRED' if st.expired else 'SAFETY_CONFIRMATION_REQUIRED', st.missing)
    db.add(SafetyEvent(session_id=s.id, technician_id=user.id if user else None, event_type='action_allowed' if d.allowed else 'action_blocked',
                       attempted_action=action[:120], actor=actor, blocked=not d.allowed, reason=d.reason, details={'missing': d.missing}))
    db.flush()
    if not d.allowed:
        log(logger, 'safety_block', logging.WARNING, session=str(s.id), action=action, actor=actor, reason=d.reason)
    return d
