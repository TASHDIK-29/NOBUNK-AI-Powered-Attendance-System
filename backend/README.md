# NoBunk — Backend (FastAPI)

Face-recognition attendance backend. It runs in two modes, selected by the
`AI_FEATURES_ENABLED` setting:

| Mode | `AI_FEATURES_ENABLED` | Dependencies | Face features | Where |
|------|----------------------|--------------|---------------|-------|
| **Full** | `true` (default) | `requirements-full.txt` (TensorFlow, DeepFace, OpenCV, Celery) | ✅ enabled | local dev / demo |
| **Lite** | `false` | `requirements.txt` (default/lightweight) | ⛔ endpoints return 503 | free public deploy |

The lite build omits the ~2 GB face-recognition stack so it fits a free host.
The face-recognition libraries are imported lazily (inside the methods that use
them), so the app boots and serves every non-AI route without them installed.

## Run locally (full AI features)

```bash
docker compose up -d          # Postgres (pgvector) + Redis
python -m venv venv && source venv/Scripts/activate
pip install -r requirements-full.txt
cp .env.example .env          # fill in values; keep AI_FEATURES_ENABLED=true
alembic upgrade head
uvicorn app.main:app --reload            # API on :8000
celery -A app.tasks.celery_app:celery_app worker --loglevel=info   # worker
```

## Lightweight deploy (Vercel / Render free)

The default `requirements.txt` is the lightweight set, so hosts that auto-install
it get the small build. On Vercel, `vercel.json` + `api/index.py` serve the ASGI
app; set `AI_FEATURES_ENABLED=false` and point `DATABASE_URL` at a free Supabase
(pgvector) database. See the root README / deployment walkthrough for setup.
