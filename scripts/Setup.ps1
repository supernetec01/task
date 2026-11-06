$ErrorActionPreference='Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
if (-not (Test-Path '.env')) { Copy-Item '.env.example' '.env'; throw 'Created .env template. Configure private DATABASE_URL, VAULT_KEY and storage paths, then run again.' }
$major=[int]((& node --version).TrimStart('v').Split('.')[0])
if ($major -lt 24) { throw 'Node.js 24 LTS or later is required.' }
& npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw 'Dependency install failed.' }
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'Production build failed.' }
& node build/server/cli.js migrate
if ($LASTEXITCODE -ne 0) { throw 'Migration failed. Inspect DB credentials and migration logs.' }
Write-Output 'Build and migration completed. Run Bootstrap.ps1 to create admin without overwriting an existing account, or use the isolated demo instructions.'
