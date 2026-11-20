import uuid
from fastapi import APIRouter, Depends, File, Query, UploadFile
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from ...core.exceptions import AppError, NotFound
from ...db.models import Conversation, Media, RepairSession, User
from ...db.session import get_db
from ...dependencies import current_user
from ...integrations.storage.local import get_storage, inspect_image
from ...schemas.repair import ChatResult, MediaOut, MessageIn, MessageOut, Page, SessionCreate, SessionOut, SessionPatch
from ...services import ai
from ...services.access import get_owned_session, get_readable_session, session_scope
from ...services.sessions import add_message, create_session, ensure_open, transition
from .serializers import media_out, session_out

router = APIRouter(tags=['sessions'])


@router.post('/sessions', response_model=SessionOut, status_code=201)
def create(body: SessionCreate, u: User = Depends(current_user), db: Session = Depends(get_db)):
    return session_out(db, create_session(db, u, body.appliance_type, body.issue_description, body.title))


@router.get('/sessions', response_model=Page)
def list_sessions(status: str | None = None, appliance_type: str | None = None, limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0),
                  u: User = Depends(current_user), db: Session = Depends(get_db)):
    q = session_scope(u)
    if status:
        q = q.where(RepairSession.status.in_(status.split(',')))
    if appliance_type:
        q = q.where(RepairSession.appliance_type == appliance_type)
    total = db.scalar(select(func.count()).select_from(q.subquery()))
    rows = db.scalars(q.order_by(RepairSession.created_at.desc()).limit(limit).offset(offset)).unique().all()
    return Page(items=[session_out(db, s) for s in rows], total=total or 0, limit=limit, offset=offset)


@router.get('/sessions/{session_id}', response_model=SessionOut)
def get_session(session_id: uuid.UUID, u: User = Depends(current_user), db: Session = Depends(get_db)):
    return session_out(db, get_readable_session(db, u, session_id))


@router.patch('/sessions/{session_id}', response_model=SessionOut)
def patch_session(session_id: uuid.UUID, body: SessionPatch, u: User = Depends(current_user), db: Session = Depends(get_db)):
    s = get_owned_session(db, u, session_id, lock=True); ensure_open(s)
    data = body.model_dump(exclude_none=True)
    if 'status' in data:
        transition(s, data.pop('status'))
    for k, v in data.items():
        setattr(s, k, v)
    db.flush()
    return session_out(db, s)


@router.post('/sessions/{session_id}/cancel', response_model=SessionOut)
def cancel(session_id: uuid.UUID, u: User = Depends(current_user), db: Session = Depends(get_db)):
    s = get_owned_session(db, u, session_id, lock=True); transition(s, 'cancelled')
    return session_out(db, s)


@router.get('/sessions/{session_id}/messages', response_model=Page)
def messages(session_id: uuid.UUID, limit: int = Query(100, ge=1, le=500), offset: int = Query(0, ge=0), u: User = Depends(current_user), db: Session = Depends(get_db)):
    s = get_readable_session(db, u, session_id)
    q = select(Conversation).where(Conversation.session_id == s.id)
    total = db.scalar(select(func.count()).select_from(q.subquery()))
    rows = db.scalars(q.order_by(Conversation.created_at).limit(limit).offset(offset)).all()
    return Page(items=[MessageOut.model_validate(r) for r in rows], total=total or 0, limit=limit, offset=offset)


@router.post('/sessions/{session_id}/messages', response_model=ChatResult, status_code=201)
async def post_message(session_id: uuid.UUID, body: MessageIn, u: User = Depends(current_user), db: Session = Depends(get_db)):
    s = get_owned_session(db, u, session_id); ensure_open(s)
    if not body.text.strip() and not body.media_ids:
        raise AppError('Message is empty.', code='EMPTY_MESSAGE')
    if body.media_ids:
        found = set(db.scalars(select(Media.id).where(Media.id.in_(body.media_ids), Media.session_id == s.id)))
        if found != set(body.media_ids):
            raise NotFound('One or more images do not belong to this session.')
    um = add_message(db, s, 'user', body.text.strip(), 'image' if body.media_ids and not body.text.strip() else 'text', {'media_ids': [str(i) for i in body.media_ids]})
    if not s.issue_description and body.text.strip():
        s.issue_description = body.text.strip()[:2000]
    db.commit()  # persist the technician's message even if the AI call fails
    try:
        am = await ai.chat_reply(db, s, u, body.text.strip(), body.media_ids)
        return ChatResult(user_message=MessageOut.model_validate(um), assistant_message=MessageOut.model_validate(am), ai_status='ok')
    except AppError as e:
        db.commit()
        return ChatResult(user_message=MessageOut.model_validate(um), assistant_message=None, ai_status='unavailable' if e.status == 503 else 'error',
                          ai_error={'code': e.code, 'message': e.message, 'hint': e.details.get('hint'), 'provider_status': e.details.get('provider_status')})


@router.post('/sessions/{session_id}/images', response_model=MediaOut, status_code=201)
async def upload(session_id: uuid.UUID, file: UploadFile = File(...), source: str = Query('upload', pattern='^(upload|capture)$'),
                 u: User = Depends(current_user), db: Session = Depends(get_db)):
    s = get_owned_session(db, u, session_id); ensure_open(s)
    from ...config import get_settings
    limit = get_settings().max_upload_size_mb * 1024 * 1024
    data = await file.read(limit + 1)
    mime, ext, w, h = inspect_image(data)
    key = get_storage().put(data, ext, f'sessions/{s.id}')
    m = Media(session_id=s.id, uploaded_by=u.id, kind=source, storage_key=key, mime_type=mime, size_bytes=len(data), width=w, height=h, meta={})
    db.add(m); db.flush()
    return media_out(m)


@router.get('/sessions/{session_id}/images', response_model=list[MediaOut])
def list_images(session_id: uuid.UUID, u: User = Depends(current_user), db: Session = Depends(get_db)):
    s = get_readable_session(db, u, session_id)
    return [media_out(m) for m in db.scalars(select(Media).where(Media.session_id == s.id).order_by(Media.created_at))]


@router.get('/media/{media_id}')
def get_media(media_id: uuid.UUID, u: User = Depends(current_user), db: Session = Depends(get_db)):
    m = db.get(Media, media_id)
    if not m:
        raise NotFound('Image not found.')
    get_readable_session(db, u, m.session_id)  # authorisation through the owning session
    return Response(get_storage().get(m.storage_key), media_type=m.mime_type, headers={'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff'})
