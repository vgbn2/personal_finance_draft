# ─── sync_keys.ps1 — CODEPTIT Orchestrator ───
# Usage: .\sync_keys.ps1 -Target "..\terminus\packages\server"

param (
    [Parameter(Mandatory=$true)]
    [string]$Target
)

$GlobalEnv = Get-Content -Path "$PSScriptRoot\.env" -Raw
if (-not $GlobalEnv) {
    Write-Host " [ERROR] Global .env in _orchestrator is empty or missing." -ForegroundColor Red
    exit 1
}

$TargetEnvPath = Join-Path $Target ".env"
if (-not (Test-Path $TargetEnvPath)) {
    Write-Host " [INFO] Target .env not found. Creating from example..." -ForegroundColor Cyan
    $ExamplePath = Join-Path $Target ".env.example"
    if (Test-Path $ExamplePath) {
        Copy-Item $ExamplePath $TargetEnvPath
    } else {
        New-Item -Path $TargetEnvPath -ItemType File > $null
    }
}

# Parse Global Keys (Lines with '=' and not starting with '#')
$GlobalKeys = $GlobalEnv -split "`r?`n" | Where-Object { $_ -match '=' -and -not $_.StartsWith('#') }

$TargetContent = Get-Content $TargetEnvPath

foreach ($Line in $GlobalKeys) {
    $Key = $Line.Split('=')[0].Trim()
    $Value = $Line.Split('=', 2)[1].Trim()
    
    if (-not $Value) { continue } # Skip empty keys

    $MatchFound = $false
    for ($i = 0; $i -lt $TargetContent.Count; $i++) {
        if ($TargetContent[$i] -match "^$Key=") {
            $TargetContent[$i] = "$Key=$Value"
            $MatchFound = $true
            break
        }
    }

    if (-not $MatchFound) {
        $TargetContent += "$Key=$Value"
    }
}

$TargetContent | Set-Content $TargetEnvPath
Write-Host " [SUCCESS] Synced global keys to $TargetEnvPath" -ForegroundColor Green
