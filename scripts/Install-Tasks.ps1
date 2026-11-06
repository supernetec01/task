[CmdletBinding(SupportsShouldProcess=$true)]
param([Parameter(Mandatory=$true)][string]$ServiceAccount)
$ErrorActionPreference='Stop'
$Root=Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $Root 'build/server/main.js'))) { throw 'Build the application first.' }
if ($ServiceAccount -notmatch '^[A-Za-z0-9_.\\-]+$') { throw 'Use an existing dedicated local service account.' }
foreach ($component in @('api','worker')) {
  $name="SuperNet-$component"
  if (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue) { throw "$name already exists; inspect and update it deliberately." }
}
foreach ($component in @('api','worker')) {
  $name="SuperNet-$component"
  $script=Join-Path $PSScriptRoot 'Start-SuperNet.ps1'
  $action=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -NonInteractive -File `"$script`" -Component $component" -WorkingDirectory $Root
  $trigger=New-ScheduledTaskTrigger -AtStartup
  $principal=New-ScheduledTaskPrincipal -UserId $ServiceAccount -LogonType S4U -RunLevel Limited
  $settings=New-ScheduledTaskSettingsSet -RestartCount 10 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -MultipleInstances IgnoreNew
  if ($PSCmdlet.ShouldProcess($name,'Register startup task under the supplied local account')) {
    Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Principal $principal -Settings $settings | Out-Null
  }
}
Write-Output 'Registered startup tasks. Grant the account Log on as a batch job and filesystem access, then test both tasks and reboot. S4U does not support NAS credentials.'
