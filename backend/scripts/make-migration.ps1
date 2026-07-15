#!/usr/bin/env pwsh
# Autogenerate a new migration from model changes, compared against LOCAL.
#   ./scripts/make-migration.ps1 "add attendance reviews table"
# Review the generated file in alembic/versions/ before applying it.
$ErrorActionPreference = "Stop"
if ($args.Count -lt 1 -or [string]::IsNullOrWhiteSpace($args[0])) {
    Write-Error 'Provide a message, e.g.:  ./scripts/make-migration.ps1 "add table"'
    exit 1
}
$msg = $args[0]
$scriptDir = $PSScriptRoot
$py = Join-Path $scriptDir "..\venv\Scripts\python.exe"
if (-not (Test-Path $py)) { $py = "python" }
& $py (Join-Path $scriptDir "migrate.py") "local" revision --autogenerate -m $msg
exit $LASTEXITCODE
