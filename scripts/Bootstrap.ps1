$ErrorActionPreference='Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
if (-not (Test-Path 'build/server/cli.js')) { throw 'Run npm ci and npm run build first.' }
# Capture native stdout/stderr explicitly: Windows PowerShell 5.1 can otherwise
# turn stderr into a terminating NativeCommandError and hide the actual result.
$node=(Get-Command node -ErrorAction Stop).Source
$info=New-Object System.Diagnostics.ProcessStartInfo
$info.FileName=$node
$info.Arguments='"build/server/cli.js" bootstrap-status --json'
$info.WorkingDirectory=(Get-Location).Path
$info.UseShellExecute=$false
$info.RedirectStandardOutput=$true
$info.RedirectStandardError=$true
$info.CreateNoWindow=$true
$process=New-Object System.Diagnostics.Process
$process.StartInfo=$info
try {
 [void]$process.Start()
 $outputTask=$process.StandardOutput.ReadToEndAsync()
 $errorTask=$process.StandardError.ReadToEndAsync()
 if (-not $process.WaitForExit(20000)) {
  $process.Kill()
  throw 'Bootstrap status timed out after 20 seconds. Check the PostgreSQL service and configured host/port.'
 }
 $output=$outputTask.GetAwaiter().GetResult()
 $errorText=$errorTask.GetAwaiter().GetResult()
 $status=$null
 try { $status=$output | ConvertFrom-Json -ErrorAction Stop } catch {}
 if ($process.ExitCode -ne 0 -or $null -eq $status -or $status.ok -ne $true) {
  if ($null -ne $status -and $null -ne $status.error) {
   throw ("Bootstrap status failed [{0}]: {1}`n{2}" -f $status.error.code,$status.error.message,$status.error.hint)
  }
  # Older build/import failures can happen before the JSON handler loads.
  $detail=($errorText+' '+$output).Trim()
  $detail=[regex]::Replace($detail,'(?i)(postgres(?:ql)?://)[^\s/@]+(?::[^\s/@]*)?@','$1***@')
  if ($detail.Length -gt 2000) { $detail=$detail.Substring(0,2000) }
  if (-not $detail) { $detail='Node returned no diagnostic output. Run npm ci, npm run build and npm run migrate.' }
  throw ("Bootstrap status failed (Node exit {0}): {1}" -f $process.ExitCode,$detail)
 }
} finally { $process.Dispose() }
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
