[CmdletBinding()]
param([ValidateSet('api','worker')][string]$Component='api')
$ErrorActionPreference='Stop'
$AppRoot=Split-Path -Parent $PSScriptRoot
Set-Location $AppRoot
if (-not (Test-Path '.env')) { throw 'Copy .env.example to .env and configure private credentials first.' }
$Node=(Get-Command node -ErrorAction Stop).Source
$Entry=if ($Component -eq 'api') { 'build/server/main.js' } else { 'build/server/worker.js' }
if (-not (Test-Path $Entry)) { throw 'Production build missing. Run npm ci and npm run build first.' }
$env:NODE_ENV='production'
# Bind is configured in .env; the company deployment must use HOST=0.0.0.0, PORT=3002.
& $Node $Entry
exit $LASTEXITCODE
