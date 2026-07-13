# Backend image: FastAPI web server AND the Celery worker run from this same
# image (they only differ in the start command — see render.yaml). Python 3.13
# matches the version the requirements were pinned against.
FROM python:3.13-slim

# System libraries required by OpenCV / DeepFace at runtime. Without libGL and
# libglib, `import cv2` crashes with "libGL.so.1: cannot open shared object".
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgl1 \
        libglib2.0-0 \
        curl \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    # DeepFace caches its model weights (ArcFace, RetinaFace, MTCNN) here. On an
    # ephemeral host they re-download on each cold start unless pre-baked below.
    DEEPFACE_HOME=/app/.deepface

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

# OPTIONAL but recommended: pre-download the face model weights at build time so
# the first real request doesn't stall (and doesn't time out) fetching ~1GB of
# weights. Uncomment to bake them into the image (larger image, slower build).
# RUN python -c "from deepface import DeepFace; \
#     DeepFace.build_model('ArcFace'); \
#     from deepface.modules import modeling; modeling.build_model('face_detector', 'retinaface')"

# $PORT is provided by the host at runtime; the start command is set per service
# in render.yaml, so no CMD is strictly required here. This is a sane default
# for running the web server standalone.
CMD ["sh", "-c", "gunicorn app.main:app -k uvicorn.workers.UvicornWorker -b 0.0.0.0:${PORT:-8000} --workers 2 --timeout 120"]
