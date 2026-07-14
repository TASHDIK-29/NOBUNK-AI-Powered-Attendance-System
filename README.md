# NoBunk — AI-Powered Attendance System

Smart classroom attendance using face recognition. Teachers upload a classroom
photo and the system marks every enrolled student automatically by matching
faces against their reference photos; students can self-check their look and
request an automated review if they're missed.

> **Live demo:** _add your Vercel URL here_
> The public demo runs a **lightweight** backend, so the face-recognition
> features are disabled there (you'll see a notice linking back here). **Clone
> the repo and follow the setup below to run the full AI system locally.**

---

## How it works

- **Students** register, upload up to 3 reference face photos (turned into
  ArcFace embeddings), and join a teacher's course.
- **Teachers** create courses, approve join requests, and upload one or more
  classroom photos for a date. A background worker detects every face, matches
  each to an enrolled student via vector similarity, and marks attendance.
- **Review flow:** a student marked absent can mark their own face in a session
  photo and get a 1:1 automated re-check.
- **Notifications & reports:** low-attendance alerts and PDF attendance exports.

## Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS, Redux Toolkit |
| Backend | Python 3.13, FastAPI, SQLAlchemy, Alembic |
| Database | PostgreSQL + **pgvector** (face-embedding similarity search) |
| Background jobs | Celery + Redis |
| Face recognition | DeepFace — ArcFace embeddings, RetinaFace/MTCNN detection |
| Image hosting | Cloudinary (optional) |
| Auth | Server-side sessions + HttpOnly cookies (no JWT), bcrypt hashing |

---

## Prerequisites

- **Python 3.11–3.13** (3.13 recommended)
- **Node.js 20+** and npm
- **Docker Desktop** (easiest way to get PostgreSQL + pgvector and Redis)
  - _Alternative:_ a local PostgreSQL 16 with the `pgvector` extension and a
    local Redis, if you prefer not to use Docker.
- ~2 GB free RAM and ~1 GB disk for the face-recognition models (downloaded
  automatically on first use).

---

## Quick start (full app, local)

### 1. Clone

```bash
git clone https://github.com/TASHDIK-29/NOBUNK-AI-Powered-Attendance-System.git
cd NOBUNK-AI-Powered-Attendance-System
```

### 2. Start PostgreSQL (pgvector) + Redis

```bash
docker compose up -d
```

This starts Postgres on host port **5435** and Redis on **6379** (see
[`docker-compose.yml`](docker-compose.yml)).

### 3. Backend (FastAPI)

```bash
cd backend

# Create & activate a virtual environment
python -m venv venv
source venv/Scripts/activate        # Windows (Git Bash)
# source venv/bin/activate          # macOS / Linux

# Install dependencies (full set — pulls TensorFlow/DeepFace, a few minutes)
pip install -r requirements-full.txt

# Configure environment
cp .env.example .env                 # then edit values if needed

# Create the database schema (also enables the pgvector extension)
alembic upgrade head
```

Run the API and the worker in **two terminals** (both with the venv active):

```bash
# Terminal 1 — API  (http://localhost:8000, docs at /docs)
uvicorn app.main:app --reload

# Terminal 2 — Celery worker (processes attendance/reviews)
celery -A app.tasks.celery_app:celery_app worker --loglevel=info --pool=solo
```

> **Windows:** the `--pool=solo` flag is required — Celery's default prefork
> pool doesn't work on Windows. On macOS/Linux you can drop it.

### 4. Frontend (Next.js)

```bash
cd ../frontend
npm install

# Point the app at your local backend
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local

npm run dev                          # http://localhost:3000
```

Open **http://localhost:3000**, register an account (choose **student** or
**teacher**), and you're ready. Because `NEXT_PUBLIC_AI_ENABLED` is unset
locally, all face-recognition features are enabled.

---

## Environment variables

### Backend (`backend/.env`) — see [`.env.example`](backend/.env.example)

| Variable | Default / example | Notes |
|----------|-------------------|-------|
| `ENVIRONMENT` | `development` | `production` enables HTTPS-only, cross-site cookies |
| `AI_FEATURES_ENABLED` | `true` | Keep `true` locally for full face recognition |
| `SECRET_KEY` | _(random string)_ | `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `CORS_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` | Comma-separated allowed frontends |
| `DATABASE_URL` | `postgresql://user:password@localhost:5435/attendancedb` | Matches docker-compose |
| `REDIS_URL` | `redis://localhost:6379/0` | Celery broker/result backend |
| `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` | _(blank)_ | Optional — image hosting degrades gracefully if unset |

### Frontend (`frontend/.env.local`) — see [`.env.example`](frontend/.env.example)

| Variable | Default | Notes |
|----------|---------|-------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Backend base URL |
| `NEXT_PUBLIC_AI_ENABLED` | `true` (when unset) | Set to `false` only for the lightweight public deploy |
| `NEXT_PUBLIC_REPO_URL` | this repo | Shown in the "AI runs locally" notice |

---

## Using the app

1. **Register** as a **student** → go to **Reference photos**, upload 1–3 clear
   selfies. Use **Check current look** to confirm you'll be recognized.
2. **Register** (separately) as a **teacher** → create a course, share the join
   token, and approve the student's join request.
3. As the teacher, open the course → **upload a classroom photo** for a date.
   The worker marks attendance within a few seconds.
4. If a student was missed, they can open the session and **request a review**.

## Project structure

```
├─ backend/            FastAPI app
│  ├─ app/api/v1/      Routes: auth, students, attendance, courses, teacher, notifications
│  ├─ app/services/    Face recognition, matching, review, Cloudinary, PDF
│  ├─ app/tasks/       Celery worker + background jobs
│  ├─ app/models/      SQLAlchemy models (incl. pgvector embedding column)
│  ├─ alembic/         Database migrations
│  ├─ requirements.txt        Lightweight deps (default — public deploy, no AI stack)
│  ├─ requirements-full.txt   Full deps (local / full AI)
│  ├─ api/index.py            Vercel serverless entrypoint
│  └─ vercel.json             Vercel routing (all requests → FastAPI app)
├─ frontend/           Next.js app (App Router)
│  └─ src/app, src/components, src/lib, src/store
├─ docker-compose.yml  Local Postgres (pgvector) + Redis
└─ render.yaml         Lightweight backend deploy config (Render free)
```

---

## Deployment (lightweight)

The public deployment is intentionally split and lightweight:

- **Frontend → Vercel** (free).
- **Backend → Vercel** (free, serverless) via `backend/api/index.py` +
  `backend/vercel.json`, installing the default lightweight `requirements.txt` —
  the heavy face-recognition stack is omitted so it fits, and the AI endpoints
  return `503` there. Set `NEXT_PUBLIC_AI_ENABLED=false` on the frontend so the
  UI shows the "runs locally" notice instead. (`render.yaml` + `Dockerfile` are
  kept as alternative host options.)
- **Database → Supabase** (free Postgres with pgvector). Run
  `alembic upgrade head` once against it (serverless can't run migrations on boot).

To showcase the AI features, run the full stack locally (steps above) and record
a short demo.

## Troubleshooting

- **First face operation is slow / downloads a lot** — DeepFace fetches its model
  weights (~1 GB) once, then caches them. Subsequent runs are fast.
- **`celery` exits immediately on Windows** — add `--pool=solo` (see above).
- **`type "vector" does not exist`** — the `alembic upgrade head` step enables
  the extension; make sure it ran successfully against your database.
- **Login works but requests fail with 401 in production** — ensure
  `ENVIRONMENT=production` (so cookies are `Secure; SameSite=None`) and that
  `CORS_ORIGINS` exactly matches your frontend URL.
