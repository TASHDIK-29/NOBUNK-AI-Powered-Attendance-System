"""Password hashing.

We use bcrypt (via the `bcrypt` package directly) as required for production
password storage. passlib's bcrypt backend is NOT usable here — passlib 1.7.x
reads `bcrypt.__about__.__version__`, which was removed in bcrypt 5.x, so it
raises on hash. Calling bcrypt directly sidesteps that entirely.

Existing accounts created before this change were hashed with pbkdf2_sha256
(passlib). `verify_password` transparently accepts those legacy hashes so no one
is locked out; new and changed passwords are always stored as bcrypt.
"""

import bcrypt
from passlib.context import CryptContext

# Legacy verifier only — pbkdf2_sha256 doesn't touch the broken bcrypt backend.
_legacy_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

# bcrypt hashes at most the first 72 bytes of a password; longer inputs are
# truncated here explicitly so behaviour is deterministic and never errors.
_BCRYPT_MAX_BYTES = 72


def _to_bcrypt_bytes(password: str) -> bytes:
    return password.encode("utf-8")[:_BCRYPT_MAX_BYTES]


def get_password_hash(password: str) -> str:
    hashed = bcrypt.hashpw(_to_bcrypt_bytes(password), bcrypt.gensalt())
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    # bcrypt hashes start with $2a$/$2b$/$2y$; anything else is a legacy hash.
    if hashed_password.startswith("$2"):
        try:
            return bcrypt.checkpw(_to_bcrypt_bytes(plain_password), hashed_password.encode("utf-8"))
        except ValueError:
            return False
    return _legacy_context.verify(plain_password, hashed_password)
