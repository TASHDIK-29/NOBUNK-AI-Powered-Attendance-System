#!/usr/bin/env bash
# Apply migrations to the LOCAL development database.
#   ./scripts/migrate-local.sh              -> alembic upgrade head
#   ./scripts/migrate-local.sh downgrade -1 -> any other alembic command
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

PY="$DIR/../venv/Scripts/python.exe"          # Windows venv (Git Bash)
[ -x "$PY" ] || PY="$DIR/../venv/bin/python"  # POSIX venv
[ -x "$PY" ] || PY="$(command -v python || command -v python3)"

if [ "$#" -gt 0 ]; then
  "$PY" "$DIR/migrate.py" local "$@"
else
  "$PY" "$DIR/migrate.py" local upgrade head
fi
