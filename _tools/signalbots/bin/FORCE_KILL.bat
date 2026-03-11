@echo off
echo ===================================================
echo   Sentinel-MT5 — Force Kill (Nuclear Option)
echo ===================================================
echo.

echo 1. Killing Python processes...
taskkill /F /IM python.exe /T 2>nul
if errorlevel 1 echo   (No python.exe found or access denied)

echo.
echo 2. Killing any process on port 5560...
for /f "tokens=5" %%a in ('netstat -aon ^| find ":5560"') do (
    echo   Found PID %%a on port 5560 — Killing...
    taskkill /F /PID %%a 2>nul
)

echo.
echo Done. Port 5560 should be free.
pause
