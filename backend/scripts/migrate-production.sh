#!/usr/bin/env bash
# Apply migrations to the PRODUCTION (Supabase) database. Asks for confirmation.
#   ./scripts/migrate-production.sh          -> alembic upgrade head
#   ./scripts/migrate-production.sh --yes    -> skip prompt (CI)
#   ./scripts/migrate-production.sh current  -> any other alembic command
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

PY="$DIR/../venv/Scripts/python.exe"          # Windows venv (Git Bash)
[ -x "$PY" ] || PY="$DIR/../venv/bin/python"  # POSIX venv
[ -x "$PY" ] || PY="$(command -v python || command -v python3)"

if [ "$#" -gt 0 ]; then
  "$PY" "$DIR/migrate.py" production "$@"
else
  "$PY" "$DIR/migrate.py" production upgrade head
fi
