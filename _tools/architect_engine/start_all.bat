@echo off
setlocal

:: Ensure we are in the script's directory
cd /d "%~dp0"

echo ==================================================
echo      PERSONAL ARCHITECT ENGINE - LAUNCHER
echo ==================================================
echo.
echo [1] Starting Telemetry Dashboard...
start "Architect Dashboard" cmd /k "streamlit run personal_ML/dashboard.py"
echo    - Dashboard launched in new window.
echo.

echo [2] Initializing Chat Log...
if not exist chat.log (
    echo [Chat Log Initialized %DATE% %TIME%] > chat.log
)
echo    - Chat log active at: %CD%\chat.log
echo.

echo ==================================================
echo                 READY TO USE
echo ==================================================
echo.
echo To generate code, open a new terminal here and run:
echo   python -m personal_ML.cli generate "Your prompt here"
echo.
echo To query constraints:
echo   python -m personal_ML.cli query "Keywords"
echo.
echo Press any key to exit this launcher (Dashboard remains open)...
pause >nul
