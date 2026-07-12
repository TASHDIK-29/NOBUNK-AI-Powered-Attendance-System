"""Server-side session store.

The single source of truth for authentication. A login creates a row here and
hands the client an opaque random token in an HttpOnly cookie; every subsequent
request is validated by looking the token up and checking both the idle and the
absolute expiry. Logout deletes the row so the token can never be reused.
"""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.models import UserSession

settings = get_settings()


def _hash_token(raw_token: str) -> str:
    """SHA-256 of the raw cookie token; this hash is what we persist/look up."""
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _as_aware(dt: datetime) -> datetime:
    """Treat naive DB timestamps as UTC so comparisons never crash."""
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


def create_session(db: Session, user_id: int) -> tuple[str, str]:
    """Create a new session for a user.

    Returns ``(raw_token, csrf_token)``. Only the SHA-256 of ``raw_token`` is
    stored, so the caller must set ``raw_token`` in the cookie immediately —
    it can never be recovered later.
    """
    raw_token = secrets.token_urlsafe(32)
    csrf_token = secrets.token_urlsafe(32)
    now = _now()

    db_session = UserSession(
        id=_hash_token(raw_token),
        user_id=user_id,
        csrf_token=csrf_token,
        created_at=now,
        last_activity_at=now,
        expires_at=now + timedelta(days=settings.SESSION_ABSOLUTE_TIMEOUT_DAYS),
    )
    db.add(db_session)
    db.commit()
    return raw_token, csrf_token


def get_valid_session(db: Session, raw_token: str) -> UserSession | None:
    """Return the live session for a cookie token, or ``None``.

    Enforces absolute expiry and idle timeout. An expired session is deleted as
    a side effect so it cannot be reused and the table self-cleans.
    """
    if not raw_token:
        return None

    db_session = db.query(UserSession).filter(UserSession.id == _hash_token(raw_token)).first()
    if db_session is None:
        return None

    now = _now()
    idle_deadline = _as_aware(db_session.last_activity_at) + timedelta(
        minutes=settings.SESSION_IDLE_TIMEOUT_MINUTES
    )
    if now >= _as_aware(db_session.expires_at) or now >= idle_deadline:
        db.delete(db_session)
        db.commit()
        return None

    # Slide the idle window forward on activity.
    db_session.last_activity_at = now
    db.commit()
    return db_session


def destroy_session(db: Session, raw_token: str) -> None:
    """Delete a session so its token is permanently invalidated (logout)."""
    if not raw_token:
        return
    db_session = db.query(UserSession).filter(UserSession.id == _hash_token(raw_token)).first()
    if db_session is not None:
        db.delete(db_session)
        db.commit()
