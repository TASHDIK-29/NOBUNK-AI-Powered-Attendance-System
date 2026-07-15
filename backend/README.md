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

## Database migrations (local vs. Supabase)

There are two databases — **local** Postgres for development and **Supabase**
for production — and a workflow that makes it impossible to migrate the wrong
one by accident. **You never edit `DATABASE_URL` to switch databases.** The
target is chosen by the command you run.

### One-time setup

Create two gitignored overlay files next to `.env`. Each holds only the
`DATABASE_URL` for that database — nothing else, so no secrets are duplicated:

```
backend/.env.local        DATABASE_URL=postgresql://user:password@localhost:5435/attendancedb
backend/.env.production   DATABASE_URL=postgresql://postgres.<ref>:<pwd>@aws-0-<region>.pooler.supabase.com:5432/postgres
```

`.env.local` ships with the default local URL already filled in. For
`.env.production`, copy the URI from **Supabase → Project Settings → Database →
Connection string** and replace the placeholders. The running app still reads
its config from `.env` as before — these overlays are used **only** by the
migration scripts.

> Windows: use `scripts\...ps1` (PowerShell). Git Bash: use `scripts/...sh`.
> Both call the same `scripts/migrate.py`, so behaviour is identical.

### Apply pending migrations locally

```powershell
.\scripts\migrate-local.ps1          # PowerShell   → alembic upgrade head
```
```bash
./scripts/migrate-local.sh           # Git Bash     → alembic upgrade head
```

### Create a new migration (autogenerate)

Change your SQLAlchemy models, then generate a migration by diffing them against
your **local** database (autogenerate always runs against local):

```powershell
.\scripts\make-migration.ps1 "add attendance reviews table"
```
```bash
./scripts/make-migration.sh "add attendance reviews table"
```

Review the new file in `alembic/versions/` before applying it, then run
`migrate-local` to apply it to your dev DB.

### Deploy schema changes to Supabase (production)

Once the migration is committed and verified locally, apply it to Supabase:

```powershell
.\scripts\migrate-production.ps1     # prompts for confirmation, then upgrade head
```
```bash
./scripts/migrate-production.sh
```

You'll see a banner with the exact target host and must type `migrate production`
to proceed. In CI/non-interactive shells the prompt is skipped only if you pass
`--yes`.

### Any other alembic command

Extra arguments pass straight through to alembic, e.g.:

```bash
./scripts/migrate-local.sh current           # show current revision
./scripts/migrate-local.sh downgrade -1      # roll back one
./scripts/migrate-production.sh history
```

### Why this is safer than editing `DATABASE_URL`

- **The database is chosen by the command, not by file state.** There is no
  "current" DB to forget you left switched to production.
- **`DATABASE_URL` is injected only into the migration subprocess** — never
  written to `.env`, never left in your shell. Environment variables outrank
  `.env` in pydantic-settings, so the override is clean and temporary.
- **Production requires typing a confirmation phrase**, and refuses to run
  unattended unless you explicitly pass `--yes`.
- **A banner prints the exact target host/database (password masked) first**,
  so you always see where a migration is about to land before it runs.
- **Autogenerate is hard-wired to local**, so you can never diff models against
  the production database.
- **Placeholder guard:** the scripts refuse to run while `.env.production` still
  contains the `REPLACE_...` template values.
