[CmdletBinding(SupportsShouldProcess=$true)]
param([Parameter(Mandatory=$true)][string]$TrustedSubnet,[Parameter(Mandatory=$true)][System.Net.IPAddress]$ServerLanIP)
$ErrorActionPreference='Stop'
if ($TrustedSubnet -notmatch '^\d{1,3}(\.\d{1,3}){3}/\d{1,2}$') { throw 'Specify the actual trusted IPv4 LAN CIDR, not a wildcard.' }
$prefix=[int]$TrustedSubnet.Split('/')[1]
if ($prefix -lt 16 -or $prefix -gt 32) { throw 'Refusing a broad subnet. Ask network administrator for the employee LAN CIDR.' }
if (Get-NetFirewallRule -Name 'SuperNet-LAN-3002' -ErrorAction SilentlyContinue) { throw 'Rule already exists; inspect it before changing.' }
if ($PSCmdlet.ShouldProcess("TCP 3002 on $ServerLanIP from $TrustedSubnet",'Allow inbound on Private profile')) {
 New-NetFirewallRule -Name 'SuperNet-LAN-3002' -DisplayName 'Super Net company LAN TCP 3002' -Direction Inbound -Action Allow -Protocol TCP -LocalAddress $ServerLanIP.IPAddressToString -LocalPort 3002 -RemoteAddress $TrustedSubnet -Profile Private | Out-Null
}
