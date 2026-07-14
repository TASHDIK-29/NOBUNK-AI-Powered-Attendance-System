"""Vercel serverless entrypoint.

Vercel's Python runtime serves the ASGI ``app`` exported here. All routes are
funnelled to this function by ``vercel.json``; FastAPI does the real routing
(the app already prefixes its routes with ``/api/v1`` plus ``/health``).
"""

from app.main import app  # noqa: F401  (re-exported for Vercel to serve)
