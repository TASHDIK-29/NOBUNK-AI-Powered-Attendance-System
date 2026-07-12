from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core import sessions
from app.core.database import get_db
from app.models.models import User

settings = get_settings()

_credentials_exception = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Not authenticated",
)


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    """Resolve the logged-in user from the server-side session cookie.

    The cookie holds only an opaque session token; the session is validated
    (existence, idle timeout, absolute expiry) on the server for every request.
    """
    raw_token = request.cookies.get(settings.SESSION_COOKIE_NAME)
    db_session = sessions.get_valid_session(db, raw_token)
    if db_session is None:
        raise _credentials_exception

    user = db.query(User).filter(User.id == db_session.user_id).first()
    if user is None:
        raise _credentials_exception
    return user


def get_current_active_user(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user


def get_current_active_teacher(current_user: User = Depends(get_current_active_user)) -> User:
    if current_user.role != "teacher" and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="The user doesn't have enough privileges")
    return current_user


def get_current_admin(current_user: User = Depends(get_current_active_user)) -> User:
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="The user doesn't have enough privileges")
    return current_user
