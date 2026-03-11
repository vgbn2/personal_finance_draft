@echo off
title Sentinel-MT5
echo ============================================
echo   Sentinel-MT5 — Launcher
echo ============================================
echo.

:: 1. Activate venv (Local or Parent)
if exist "%~dp0.venv\Scripts\activate.bat" (
    echo [INFO] Activating local .venv...
    call "%~dp0.venv\Scripts\activate.bat"
) else if exist "%~dp0..\.venv\Scripts\activate.bat" (
    echo [INFO] Activating parent .venv...
    call "%~dp0..\.venv\Scripts\activate.bat"
) else (
    echo [INFO] No venv found — using system Python.
)

:: 2. Check Environment
python "%~dp0core/check_env.py"
if errorlevel 1 (
    echo.
    echo [ERROR] Configuration check failed.
    echo Please edit .env with your credentials.
    pause
    exit /b 1
)

:: 3. Launch
echo.
echo Launching Sentinel-MT5...
cd /d "%~dp0"
python sentinel.py

if errorlevel 1 (
    echo.
    echo [CRASHED] Use STOP.bat to kill stale processes if needed.
    pause >nul
)
