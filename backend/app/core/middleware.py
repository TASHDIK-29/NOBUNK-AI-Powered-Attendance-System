"""Security middleware: CSRF protection and response security headers."""

import hashlib
import secrets

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.core.config import get_settings
from app.core.database import SessionLocal
from app.models.models import UserSession

settings = get_settings()

# Methods that never change state don't need CSRF protection.
_SAFE_METHODS = {"GET", "HEAD", "OPTIONS", "TRACE"}

# Pre-session endpoints have no CSRF token yet, so they're exempt. Every other
# state-changing endpoint (including logout) requires a valid token.
_CSRF_EXEMPT_PATHS = {
    f"{settings.API_V1_STR}/auth/login",
    f"{settings.API_V1_STR}/auth/register",
}

_DOCS_PATHS = {"/docs", "/redoc", f"{settings.API_V1_STR}/openapi.json"}


class CSRFMiddleware(BaseHTTPMiddleware):
    """Double-token CSRF check for authenticated, state-changing requests.

    The SPA reads the (non-HttpOnly) CSRF cookie and echoes it back in the
    ``X-CSRF-Token`` header. We compare that header against the token stored on
    the server session — a cross-site attacker can ride the session cookie but
    cannot read the CSRF cookie to forge the header.
    """

    async def dispatch(self, request: Request, call_next):
        if request.method in _SAFE_METHODS or request.url.path in _CSRF_EXEMPT_PATHS:
            return await call_next(request)

        raw_token = request.cookies.get(settings.SESSION_COOKIE_NAME)
        if raw_token:
            token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
            db = SessionLocal()
            try:
                db_session = (
                    db.query(UserSession).filter(UserSession.id == token_hash).first()
                )
            finally:
                db.close()

            # A real session is present — enforce CSRF. (If there's no session,
            # fall through so the auth dependency returns a normal 401.)
            if db_session is not None:
                header_token = request.headers.get(settings.CSRF_HEADER_NAME, "")
                if not header_token or not secrets.compare_digest(
                    header_token, db_session.csrf_token
                ):
                    return JSONResponse(
                        status_code=403,
                        content={"detail": "Invalid or missing CSRF token"},
                    )

        return await call_next(request)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Attach standard security headers to every response."""

    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)

        if request.url.path in _DOCS_PATHS:
            # Swagger/ReDoc load assets from a CDN — relax CSP just for them.
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; img-src 'self' data: https://fastapi.tiangolo.com; "
                "script-src 'self' https://cdn.jsdelivr.net; "
                "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net"
            )
        else:
            # This API only ever returns JSON, so nothing may be loaded/embedded.
            response.headers["Content-Security-Policy"] = (
                "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
            )

        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        if settings.is_production:
            response.headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains"
            )
        return response
