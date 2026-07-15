#!/usr/bin/env bash
# Autogenerate a new migration from model changes, compared against LOCAL.
#   ./scripts/make-migration.sh "add attendance reviews table"
# Review the generated file in alembic/versions/ before applying it.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ "$#" -lt 1 ] || [ -z "${1// }" ]; then
  echo 'Provide a message, e.g.:  ./scripts/make-migration.sh "add table"' >&2
  exit 1
fi

PY="$DIR/../venv/Scripts/python.exe"          # Windows venv (Git Bash)
[ -x "$PY" ] || PY="$DIR/../venv/bin/python"  # POSIX venv
[ -x "$PY" ] || PY="$(command -v python || command -v python3)"

"$PY" "$DIR/migrate.py" local revision --autogenerate -m "$1"
