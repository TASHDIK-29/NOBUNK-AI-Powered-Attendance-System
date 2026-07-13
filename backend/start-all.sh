#!/usr/bin/env bash
# Single-container startup for Hugging Face Spaces: runs Redis, the Celery
# worker, and the FastAPI web server in one process group. The web server runs
# in the FOREGROUND so the container stays alive and HF can health-check it.
set -e

echo "[start] launching internal Redis (Celery broker/backend)..."
# No persistence needed — Redis only holds transient Celery jobs.
redis-server --daemonize yes --save "" --appendonly no --bind 127.0.0.1 --port 6379

echo "[start] applying database migrations..."
alembic upgrade head

echo "[start] launching Celery worker..."
celery -A app.tasks.celery_app:celery_app worker \
    --loglevel=info --concurrency=1 &

echo "[start] launching web server..."
# concurrency kept low: each worker loads TensorFlow (~1.5GB). A high timeout
# covers occasional slow model loads on a cold container.
exec gunicorn app.main:app \
    -k uvicorn.workers.UvicornWorker \
    -b "0.0.0.0:${PORT:-7860}" \
    --workers 1 \
    --timeout 300
