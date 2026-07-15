#!/usr/bin/env pwsh
# Apply migrations to the PRODUCTION (Supabase) database. Asks for confirmation.
#   ./scripts/migrate-production.ps1              -> alembic upgrade head
#   ./scripts/migrate-production.ps1 --yes        -> skip prompt (CI)
#   ./scripts/migrate-production.ps1 current      -> any other alembic command
$ErrorActionPreference = "Stop"
$scriptDir = $PSScriptRoot
$py = Join-Path $scriptDir "..\venv\Scripts\python.exe"
if (-not (Test-Path $py)) { $py = "python" }
if ($args.Count -gt 0) { $alembicArgs = @($args) } else { $alembicArgs = @("upgrade", "head") }
& $py (Join-Path $scriptDir "migrate.py") "production" @alembicArgs
exit $LASTEXITCODE
