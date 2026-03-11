@echo off
title Polymarket Simulator - Diagnostic Suite
cd /d "%~dp0.."
echo.
echo ===================================================
echo   Running Diagnostic Suite...
echo ===================================================
echo.

REM Activate venv
call "%~dp0..\..\..\.venv\Scripts\activate.bat" 2>nul

cd /d "%~dp0..\.."
python -m polymarket_sim.tests.unit.run_all_tests

echo.
echo ===================================================
echo   Check error_log.txt for details
echo ===================================================
pause
