"""Lightweight in-memory brute-force protection for the login endpoint.

Failed attempts are counted per (email, client-IP) key. After
``LOGIN_MAX_ATTEMPTS`` failures the key is locked for ``LOGIN_LOCKOUT_MINUTES``.
A successful login clears the counter.

This is deliberately in-process and dependency-free, which is the right fit for
a small/single-worker deployment (the app already avoids distributed session
stores by design). If you scale to multiple worker processes, move this state
to the shared Redis that Celery already uses.
"""

import threading
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from app.core.config import get_settings

settings = get_settings()


@dataclass
class _Attempts:
    count: int = 0
    # When set and in the future, the key is currently locked out.
    locked_until: datetime | None = field(default=None)


_store: dict[str, _Attempts] = {}
_lock = threading.Lock()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _key(email: str, client_ip: str) -> str:
    return f"{(email or '').strip().lower()}|{client_ip or ''}"


def is_locked(email: str, client_ip: str) -> bool:
    """True if this identity is temporarily blocked from logging in."""
    with _lock:
        entry = _store.get(_key(email, client_ip))
        if entry is None or entry.locked_until is None:
            return False
        if _now() >= entry.locked_until:
            # Lock expired — reset so the user gets a fresh set of attempts.
            _store.pop(_key(email, client_ip), None)
            return False
        return True


def register_failure(email: str, client_ip: str) -> None:
    """Record a failed attempt and lock the key once the limit is reached."""
    with _lock:
        key = _key(email, client_ip)
        entry = _store.get(key) or _Attempts()
        entry.count += 1
        if entry.count >= settings.LOGIN_MAX_ATTEMPTS:
            entry.locked_until = _now() + timedelta(minutes=settings.LOGIN_LOCKOUT_MINUTES)
        _store[key] = entry


def reset(email: str, client_ip: str) -> None:
    """Clear all recorded failures (call on a successful login)."""
    with _lock:
        _store.pop(_key(email, client_ip), None)
