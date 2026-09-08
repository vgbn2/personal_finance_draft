$ErrorActionPreference = 'Stop'

$repo = 'C:\Users\Lenovo\Desktop\VGBN\.vscode\CODEPTIT\personal_finance_draft'
$hostName = 'clob.polymarket.com'

Set-Location $repo

try {
  Resolve-DnsName $hostName | Out-Null
} catch {
  Write-Host "DNS cannot resolve $hostName from this machine."
  Write-Host "Fix DNS/network first, then rerun this script."
  exit 1
}

python .\polymarket_client.py
