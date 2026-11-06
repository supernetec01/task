$ErrorActionPreference='Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
if (-not (Test-Path 'build/server/cli.js')) { throw 'Run npm ci and npm run build first.' }
$statusText = & node build/server/cli.js bootstrap-status
if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect bootstrap status. Check .env and run npm run migrate.' }
$status = $statusText | ConvertFrom-Json
if ($status.exists) {
 & node build/server/cli.js bootstrap
 if ($LASTEXITCODE -ne 0) { throw 'Existing admin requires review. No password or data was changed.' }
 return
}
$first=Read-Host 'New password for admin (at least 11 characters)' -AsSecureString
$second=Read-Host 'Confirm password' -AsSecureString
$firstPtr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($first)
$secondPtr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($second)
try {
 $value=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($firstPtr)
 if ($value -cne [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secondPtr)) { throw 'Passwords do not match. No account created.' }
 $env:ADMIN_PASSWORD=$value
 & node build/server/cli.js bootstrap
 if ($LASTEXITCODE -ne 0) { throw 'Bootstrap failed. Password must contain at least 11 characters.' }
} finally {
 [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($firstPtr)
 [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secondPtr)
 Remove-Item Env:ADMIN_PASSWORD -ErrorAction SilentlyContinue
 $value=$null
}
