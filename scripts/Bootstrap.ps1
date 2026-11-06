$ErrorActionPreference='Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
$env:ADMIN_EMAIL=Read-Host 'Email for the first administrator'
$password=Read-Host 'New administrator password (12+ characters)' -AsSecureString
$ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
try {
 $env:ADMIN_PASSWORD=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
 & node build/server/cli.js bootstrap
 if ($LASTEXITCODE -ne 0) { throw 'Administrator bootstrap failed.' }
} finally {
 [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
 Remove-Item Env:ADMIN_PASSWORD -ErrorAction SilentlyContinue
 Remove-Item Env:ADMIN_EMAIL -ErrorAction SilentlyContinue
}
