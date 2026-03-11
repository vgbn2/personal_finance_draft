@echo off
setlocal

cd /d "%~dp0"

echo ---------------------------------------
echo 🚀 Setting up Elon Tweet Tracker Environment
echo ---------------------------------------

REM Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Python is not installed or not in PATH.
    pause
    exit /b
)

REM Create venv if it doesn't exist
if not exist ".venv" (
    echo 📦 Creating virtual environment...
    python -m venv .venv
)

REM Helper variable for the python executable in venv
set "VENV_PYTHON=.venv\Scripts\python.exe"

REM Install dependencies
echo ⬇️  Installing/Checking dependencies...
"%VENV_PYTHON%" -m pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo ❌ Failed to install dependencies.
    pause
    exit /b
)

echo.
echo ✅ Environment Ready. Launching Tracker...
echo ---------------------------------------
echo.

REM Run the main script
"%VENV_PYTHON%" elonmusk_tweet.py --no-browser

echo.
echo 🛑 Script finished.
pause
