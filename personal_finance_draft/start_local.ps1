# Sovereign Local Orchestration Script
Write-Host "--- Starting Sovereign Local Suite ---" -ForegroundColor Cyan

$TS_NODE = ".\node_modules\.bin\ts-node.ps1"

# 1. The Brain: Continuous Ingestion
Write-Host "[1/3] Starting Data Ingestor..."
Start-Process powershell.exe -ArgumentList "-NoExit", "-Command", "node scripts\cli\sovereign_cli.js watch"

# 2. The Dashboard: Visualization
Write-Host "[2/3] Starting Web Dashboard..."
Start-Process powershell.exe -ArgumentList "-NoExit", "-Command", "node web\app.js"

# 3. The Hands: Execution Gateway
Write-Host "[3/3] Starting Execution Gateway..."
# Using direct path to ts-node to avoid npx/shell issues
Start-Process powershell.exe -ArgumentList "-NoExit", "-Command", "$TS_NODE execution_gateway\src\index.ts --live --demo"

Write-Host "`nAll systems launched." -ForegroundColor Green
Write-Host "Dashboard: http://localhost:8080"
