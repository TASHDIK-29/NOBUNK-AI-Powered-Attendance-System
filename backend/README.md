---
title: NoBunk Attendance API
emoji: 📸
colorFrom: indigo
colorTo: purple
sdk: docker
app_port: 7860
pinned: false
short_description: Face-recognition attendance backend (FastAPI + DeepFace)
---

# NoBunk — Attendance API (backend)

FastAPI backend for the NoBunk face-recognition attendance system. On Hugging
Face Spaces this single container runs **Redis + a Celery worker + the FastAPI
server** together (see `start-all.sh`); Postgres (with pgvector) is hosted
externally on Supabase.

## Required Space secrets

Set these in **Settings → Variables and secrets** on the Space:

| Key | Value |
|-----|-------|
| `ENVIRONMENT` | `production` |
| `SECRET_KEY` | a long random string (`python -c "import secrets; print(secrets.token_urlsafe(48))"`) |
| `CORS_ORIGINS` | your Vercel URL, e.g. `https://your-app.vercel.app` (no trailing slash) |
| `DATABASE_URL` | Supabase connection string (Session pooler, `sslmode=require`) |
| `REDIS_URL` | `redis://localhost:6379/0` (Redis runs inside this container) |
| `CLOUDINARY_CLOUD_NAME` | from your Cloudinary dashboard |
| `CLOUDINARY_API_KEY` | from your Cloudinary dashboard |
| `CLOUDINARY_API_SECRET` | from your Cloudinary dashboard |

The container applies database migrations (`alembic upgrade head`) on every
start, which also enables the `pgvector` extension.

> Note: free Spaces sleep after ~48h of inactivity and cold-start in 30–60s
> while TensorFlow loads. Use test/dummy face data only — this is a public demo.
