[CmdletBinding()]
param([ValidateSet('api','worker')][string]$Component='api', [string]$ListenHost='0.0.0.0', [ValidateRange(1,65535)][int]$Port=3002)
$ErrorActionPreference='Stop'
$AppRoot=Split-Path -Parent $PSScriptRoot
Set-Location $AppRoot
if (-not (Test-Path '.env')) { throw 'Copy .env.example to .env and configure private credentials first.' }
$Node=(Get-Command node -ErrorAction Stop).Source
$Entry=if ($Component -eq 'api') { 'build/server/main.js' } else { 'build/server/worker.js' }
if (-not (Test-Path $Entry)) { throw 'Production build missing. Run npm ci and npm run build first.' }
$env:NODE_ENV='production'
$env:HOST=$ListenHost
$env:PORT=[string]$Port
& $Node scripts/build-state.mjs
if ($LASTEXITCODE -ne 0) { throw 'Build is missing or stale; run npm run build.' }
& $Node $Entry
exit $LASTEXITCODE
