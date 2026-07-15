#!/usr/bin/env python3
"""
Safe Alembic migration runner.

The problem this solves
-----------------------
We have two databases: a LOCAL Postgres for development and a SUPABASE Postgres
for production. The dangerous, error-prone workflow is to hand-edit
`DATABASE_URL` in `.env` before every migration and hope you remember to change
it back. Forget once and you run `alembic upgrade head` against the wrong
database.

How this makes it safe
----------------------
The target database is chosen by the COMMAND you type, never by editing a file:

    python scripts/migrate.py local      upgrade head
    python scripts/migrate.py production upgrade head
    python scripts/migrate.py local      revision --autogenerate -m "add table"

For each run it:
  1. Reads shared config from `.env`         (base — everything except the DB).
  2. Reads `.env.<target>`                    (overlay — only DATABASE_URL).
  3. Sets DATABASE_URL in the SUBPROCESS environment only (never in your shell,
     never written to any file). Because environment variables take precedence
     over `.env` in pydantic-settings, this cleanly overrides the app default.
  4. Prints a banner showing the exact host / database it is about to touch
     (password masked) so you can see the target before anything happens.
  5. Requires you to type the confirmation phrase for PRODUCTION.
  6. Runs `alembic <args>` from the backend directory with that environment.

`.env` itself is never modified, so normal app startup is unaffected.
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlsplit

try:
    from dotenv import dotenv_values
except ImportError:  # pragma: no cover
    sys.exit(
        "python-dotenv is not installed. Activate your venv and run:\n"
        "    pip install -r requirements.txt"
    )

# scripts/ lives inside the backend directory; the backend dir is alembic's CWD.
BACKEND_DIR = Path(__file__).resolve().parent.parent

TARGETS = {
    "local": {
        "env_file": ".env.local",
        "label": "LOCAL (development)",
        "needs_confirm": False,
    },
    "production": {
        "env_file": ".env.production",
        "label": "PRODUCTION — Supabase (LIVE DATA)",
        "needs_confirm": True,
    },
}

CONFIRM_PHRASE = "migrate production"


def _mask(url: str) -> str:
    """Render a DB URL for display with the password redacted."""
    try:
        parts = urlsplit(url)
        host = parts.hostname or "?"
        port = f":{parts.port}" if parts.port else ""
        db = parts.path.lstrip("/") or "?"
        user = parts.username or "?"
        return f"{user}@{host}{port}/{db}"
    except ValueError:
        # Almost always an un-encoded special char in the password (#, @, /, ...).
        return (
            "<could not parse DATABASE_URL — check that special characters in the "
            "password are URL-encoded, e.g. '#' -> '%23'>"
        )


def _load_database_url(target: str) -> str:
    """Merge base `.env` with the target overlay and return its DATABASE_URL."""
    base_file = BACKEND_DIR / ".env"
    overlay_file = BACKEND_DIR / TARGETS[target]["env_file"]

    if not overlay_file.exists():
        sys.exit(
            f"Missing overlay file: {overlay_file.name}\n"
            f"Create it next to .env with a single line:\n"
            f"    DATABASE_URL=<your {target} Postgres URL>"
        )

    merged: dict[str, str | None] = {}
    if base_file.exists():
        merged.update(dotenv_values(base_file))
    merged.update(dotenv_values(overlay_file))  # overlay wins

    url = merged.get("DATABASE_URL")
    if not url:
        sys.exit(
            f"{overlay_file.name} does not define DATABASE_URL.\n"
            f"Add a line:  DATABASE_URL=<your {target} Postgres URL>"
        )
    if "REPLACE_" in url:
        sys.exit(
            f"{overlay_file.name} still contains a placeholder DATABASE_URL.\n"
            f"Edit it and fill in your real {target} connection string."
        )
    return url


def _confirm_production(shown: str, assume_yes: bool) -> None:
    if assume_yes:
        print("  (confirmation skipped via --yes)")
        return
    if not sys.stdin.isatty():
        sys.exit(
            "Refusing to migrate PRODUCTION without confirmation in a "
            "non-interactive shell. Re-run with --yes if this is intentional "
            "(e.g. CI)."
        )
    print(f'\n  You are about to migrate PRODUCTION: {shown}')
    print(f'  Type exactly "{CONFIRM_PHRASE}" to proceed (anything else aborts).')
    answer = input("  > ").strip()
    if answer != CONFIRM_PHRASE:
        sys.exit("Aborted — confirmation phrase did not match. Nothing ran.")


USAGE = "python scripts/migrate.py <local|production> [--yes] <alembic args...>"


def main() -> int:
    # Manual parsing: alembic commands carry their own flags (-m, --autogenerate,
    # etc.), which argparse's REMAINDER mangles. We only need to peel off our own
    # `--yes` and the leading target; everything else is passed to alembic as-is.
    argv = sys.argv[1:]
    if not argv or argv[0] in ("-h", "--help"):
        print(f"usage: {USAGE}")
        return 0

    target = argv[0]
    if target not in TARGETS:
        sys.exit(
            f"Unknown target {target!r}. Choose 'local' or 'production'.\n"
            f"usage: {USAGE}"
        )

    assume_yes = False
    alembic_args: list[str] = []
    for arg in argv[1:]:
        if arg == "--yes":
            assume_yes = True
        else:
            alembic_args.append(arg)

    if not alembic_args:
        sys.exit(f'No alembic command given (e.g. "upgrade head").\nusage: {USAGE}')

    spec = TARGETS[target]
    url = _load_database_url(target)
    shown = _mask(url)

    print("=" * 70)
    print(f"  Alembic target : {spec['label']}")
    print(f"  Database       : {shown}")
    print(f"  Command        : alembic {' '.join(alembic_args)}")
    print("=" * 70)

    if spec["needs_confirm"]:
        _confirm_production(shown, assume_yes)

    # DATABASE_URL is injected ONLY into this child process's environment.
    child_env = os.environ.copy()
    child_env["DATABASE_URL"] = url

    cmd = [sys.executable, "-m", "alembic", *alembic_args]
    print(f"\n$ {' '.join(cmd)}\n", flush=True)
    result = subprocess.run(cmd, cwd=str(BACKEND_DIR), env=child_env)
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
