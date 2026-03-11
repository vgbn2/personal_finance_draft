param([string]$Goal)
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Magenta
Write-Host " GSD ► INSTRUCTION AGENT" -ForegroundColor Magenta
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Magenta
Write-Host "Goal: $Goal"
Write-Host "Action: Decomposing goal into executable tasks..."
Write-Host "Generating PLAN.md..."
@'
# PLAN: $Goal
- Task 1: ...
- Task 2: ...
'@ | Out-File -FilePath "PLAN.md" -Encoding utf8
Write-Host "Done." -ForegroundColor Green
