# Lightweight backend image (Zeabur / any container host).
#
# Installs the default (lite) requirements.txt — no TensorFlow/DeepFace/OpenCV/scipy — so
# the image is small and boots on a free tier. The face-recognition endpoints
# return 503 in this build (run the full stack locally for those). The database
# is external (Supabase, pgvector).
FROM python:3.13-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    AI_FEATURES_ENABLED=false \
    ENVIRONMENT=production

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

# Zeabur injects $PORT (default 8080) and expects the app to listen on it.
EXPOSE 8080

# Apply migrations (also enables the pgvector extension), then serve.
CMD ["sh", "-c", "alembic upgrade head && gunicorn app.main:app -k uvicorn.workers.UvicornWorker -b 0.0.0.0:${PORT:-8080} --workers 1 --timeout 120"]
