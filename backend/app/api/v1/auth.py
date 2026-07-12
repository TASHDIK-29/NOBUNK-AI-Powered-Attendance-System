from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.core import security, sessions, rate_limit
from app.core.config import get_settings
from app.core.cookies import set_auth_cookies, clear_auth_cookies
from app.api.deps import get_current_active_user
from app.core.database import get_db
from app.models.models import User
from app.schemas.user import UserCreate, UserOut

settings = get_settings()
router = APIRouter()

# One generic message for every login failure so we never reveal whether an
# email is registered or whether it was the password that was wrong.
_GENERIC_LOGIN_ERROR = "Incorrect email or password"


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


@router.post("/register", response_model=UserOut)
def register(user_in: UserCreate, db: Session = Depends(get_db)):
    """
    Register a new user (Student or Teacher)
    """
    user = db.query(User).filter(User.email == user_in.email).first()
    if user:
        raise HTTPException(
            status_code=400,
            detail="The user with this email already exists in the system.",
        )

    # Check if student ID already exists
    if user_in.student_id:
        existing_student = db.query(User).filter(User.student_id == user_in.student_id).first()
        if existing_student:
             raise HTTPException(status_code=400, detail="Student ID already registered.")

    db_user = User(
        email=user_in.email,
        hashed_password=security.get_password_hash(user_in.password),
        full_name=user_in.full_name,
        role=user_in.role,
        student_id=user_in.student_id if user_in.role == "student" else None,
        department=user_in.department,
        session_year=user_in.session_year if user_in.role == "student" else None,
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


@router.post("/login", response_model=UserOut)
def login(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    form_data: OAuth2PasswordRequestForm = Depends(),
):
    """
    Authenticate with email + password and open a server-side session.

    On success a session row is created and two cookies are set: an HttpOnly
    session cookie (the opaque token) and a JS-readable CSRF cookie. No token is
    ever returned in the response body.
    """
    ip = _client_ip(request)
    email = form_data.username

    # Brute-force guard: reject early (before hitting the DB / hashing) once the
    # identity is locked out.
    if rate_limit.is_locked(email, ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed attempts. Please try again later.",
        )

    user = db.query(User).filter(User.email == email).first()
    if not user or not security.verify_password(form_data.password, user.hashed_password):
        rate_limit.register_failure(email, ip)
        # Same error whether the user is missing or the password is wrong.
        raise HTTPException(status_code=400, detail=_GENERIC_LOGIN_ERROR)
    if not user.is_active:
        rate_limit.register_failure(email, ip)
        raise HTTPException(status_code=400, detail=_GENERIC_LOGIN_ERROR)

    rate_limit.reset(email, ip)

    raw_token, csrf_token = sessions.create_session(db, user.id)
    set_auth_cookies(response, raw_token, csrf_token)
    return user


@router.post("/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    """
    Destroy the current server session and clear the auth cookies. Idempotent —
    safe to call even without a valid session.
    """
    raw_token = request.cookies.get(settings.SESSION_COOKIE_NAME)
    sessions.destroy_session(db, raw_token)
    clear_auth_cookies(response)
    return {"message": "Logged out"}


@router.get("/me", response_model=UserOut)
def read_current_user(current_user: User = Depends(get_current_active_user)):
    return current_user
