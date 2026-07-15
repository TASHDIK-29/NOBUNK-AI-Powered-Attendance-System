#!/usr/bin/env pwsh
# Apply migrations to the LOCAL development database.
#   ./scripts/migrate-local.ps1              -> alembic upgrade head
#   ./scripts/migrate-local.ps1 downgrade -1 -> any other alembic command
$ErrorActionPreference = "Stop"
$scriptDir = $PSScriptRoot
$py = Join-Path $scriptDir "..\venv\Scripts\python.exe"
if (-not (Test-Path $py)) { $py = "python" }
if ($args.Count -gt 0) { $alembicArgs = @($args) } else { $alembicArgs = @("upgrade", "head") }
& $py (Join-Path $scriptDir "migrate.py") "local" @alembicArgs
exit $LASTEXITCODE
