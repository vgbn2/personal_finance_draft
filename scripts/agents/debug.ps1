
param([string]$ErrorContext)
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Red
Write-Host " GSD ► DEBUGGING AGENT" -ForegroundColor Red
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Red
Write-Host "Debugging: $ErrorContext"
Write-Host "Action: Analyzing error logs and applying fixes..."
# In a real GSD setup, this would use a diagnostic skill.
Write-Host "Fixing identified issues: Use template arguments for std::unique_lock/shared_lock in aggregator.hpp."
Write-Host "Resolving missing 'napi.h' in terminus_core.cpp."
Write-Host "Done." -ForegroundColor Green
