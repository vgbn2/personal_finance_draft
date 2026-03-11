@echo off
setlocal enabledelayedexpansion

:: ── Navigate to project root ─────────────────────────────────
pushd "%~dp0.."

:: ── Activate virtual environment ─────────────────────────────
if exist .venv\Scripts\activate.bat (
    call .venv\Scripts\activate.bat
    echo [OK] Virtual environment activated.
) else if exist venv\Scripts\activate.bat (
    call venv\Scripts\activate.bat
    echo [OK] Virtual environment activated.
) else (
    echo [WARN] No .venv or venv found. Using system Python.
)

:: ── Audit Log ────────────────────────────────────────────────
python -m polymarket_sim.core.audit_log "Executed start_all.bat"


echo ===================================================
echo   Polymarket Simulator — Starting Unified Engine
echo ===================================================
echo.

echo [INFO] Cleaning up background processes...
taskkill /IM python.exe /F 2>nul
echo.

if not exist polymarket_sim\strategies (
    echo [ERROR] strategies folder not found!
    popd
    pause
    exit /b 1
)

:: ── Launch unified strategy engine ───────────────────────────
echo [INFO] Opening Web Dashboard...
start http://localhost:8000

echo [INFO] Launching unified engine with all strategies...
python -m polymarket_sim --strategies-dir polymarket_sim\strategies

echo.
popd
pause
