# Sovereign Local Orchestration Script
Write-Host "--- Starting Sovereign Local Suite ---" -ForegroundColor Cyan

$TSX = ".\node_modules\.bin\tsx.cmd"
if (-not (Test-Path $TSX)) {
    $TSX = "npx tsx"
}

# 1. The Brain: Continuous Ingestion
Write-Host "[1/3] Starting Data Ingestor (CLI)..."
Start-Process powershell.exe -ArgumentList "-NoExit", "-Command", "node backend\cli\sovereign_cli.js watch"

# 2. The Dashboard: Visualization (API)
Write-Host "[2/3] Starting Web API & Dashboard..."
Start-Process powershell.exe -ArgumentList "-NoExit", "-Command", "node backend\api\app.js"

# 3. The Hands: Execution Gateway
Write-Host "[3/3] Starting Execution Gateway..."
Start-Process powershell.exe -ArgumentList "-NoExit", "-Command", "$TSX backend\gateway\src\index.ts --demo"

Write-Host "`nAll systems launched." -ForegroundColor Green
Write-Host "Dashboard: http://localhost:8787"
