"""Helpers for setting/clearing the auth cookies consistently.

Two cookies are used:

* the session cookie — HttpOnly, so JavaScript can never read the session token;
* the CSRF cookie — intentionally readable by JS, so the SPA can echo the token
  back in the ``X-CSRF-Token`` header on state-changing requests.

Both are ``Path=/``. ``Secure`` and ``SameSite`` are environment-driven: in
production they become ``Secure; SameSite=None`` so the cookies survive a
cross-site SPA→API setup (e.g. Vercel frontend + Render backend); in dev they
are ``SameSite=Lax`` over plain HTTP on localhost. See ``Settings.cookie_samesite``.
"""

from fastapi import Response

from app.core.config import get_settings

settings = get_settings()

# Cookie lifetime matches the session's absolute expiry.
_MAX_AGE_SECONDS = settings.SESSION_ABSOLUTE_TIMEOUT_DAYS * 24 * 60 * 60


def set_auth_cookies(response: Response, raw_token: str, csrf_token: str) -> None:
    secure = settings.is_production
    samesite = settings.cookie_samesite

    response.set_cookie(
        key=settings.SESSION_COOKIE_NAME,
        value=raw_token,
        max_age=_MAX_AGE_SECONDS,
        httponly=True,          # never exposed to JavaScript
        secure=secure,          # HTTPS-only in production
        samesite=samesite,      # "none" in prod (cross-site), "lax" in dev
        path="/",
    )
    response.set_cookie(
        key=settings.CSRF_COOKIE_NAME,
        value=csrf_token,
        max_age=_MAX_AGE_SECONDS,
        httponly=False,         # read by the SPA to populate the CSRF header
        secure=secure,
        samesite=samesite,
        path="/",
    )


def clear_auth_cookies(response: Response) -> None:
    # Delete with matching path/secure/samesite so the browser actually drops the
    # cookies (a mismatch on these attributes can leave the cookie in place).
    secure = settings.is_production
    samesite = settings.cookie_samesite
    response.delete_cookie(
        settings.SESSION_COOKIE_NAME, path="/", secure=secure, samesite=samesite
    )
    response.delete_cookie(
        settings.CSRF_COOKIE_NAME, path="/", secure=secure, samesite=samesite
    )
