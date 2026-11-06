$ErrorActionPreference='Stop'
Get-CimInstance Win32_OperatingSystem | Select-Object Caption,Version,OSArchitecture
Get-NetIPConfiguration
Get-NetConnectionProfile
$listeners=@(Get-NetTCPConnection -State Listen -LocalPort 3002 -ErrorAction SilentlyContinue)
if ($listeners.Count) { $listeners | Select-Object LocalAddress,LocalPort,OwningProcess; $listeners | ForEach-Object { Get-Process -Id $_.OwningProcess }; throw 'Port 3002 is already used. Do not stop an unrelated process.' }
Get-Command node,npm,psql,pg_dump,pg_restore -ErrorAction Stop | Select-Object Name,Source
node --version
Write-Output 'Preflight only: no firewall or network changes were made.'
