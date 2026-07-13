# Backend image. Serves TWO deployment targets from ONE Dockerfile:
#
#  * Hugging Face Spaces (free) — runs the whole backend in this single
#    container: Redis + Celery worker + FastAPI, started by `start-all.sh`
#    (the default CMD below). This is the free-tier setup.
#
#  * Render (paid) — the web and worker services each OVERRIDE the CMD via
#    render.yaml, and use a separate managed Redis, so the bundled redis-server
#    simply stays idle there.
#
# Python 3.13 matches the version the requirements were pinned against.
FROM python:3.13-slim

# System libraries:
#  * libgl1 / libglib2.0-0 — required by OpenCV/DeepFace ("import cv2" crashes
#    with "libGL.so.1: cannot open shared object" without them).
#  * redis-server — the Celery broker/result backend, run inside the container
#    on Hugging Face (a free managed Redis can't handle Celery's polling).
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgl1 \
        libglib2.0-0 \
        redis-server \
        curl \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    # DeepFace caches its model weights (ArcFace, RetinaFace, MTCNN) here.
    DEEPFACE_HOME=/app/.deepface

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

# Hugging Face Spaces run the container as uid 1000; owning /app lets the app
# write model weights and transient upload files without permission errors.
RUN useradd -m -u 1000 appuser \
    && mkdir -p /app/.deepface /app/uploads \
    && chown -R appuser:appuser /app
USER appuser

# HF Spaces expect the app on the port declared in README.md (7860). On Render,
# $PORT is injected instead, so honour it when present.
EXPOSE 7860

# Default (Hugging Face): bring up Redis + Celery + the web server together.
# Render overrides this per-service in render.yaml.
CMD ["bash", "start-all.sh"]
