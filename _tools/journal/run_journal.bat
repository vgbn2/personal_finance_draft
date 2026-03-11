@echo off
REM Run the Terminus Daily Journal as a background tray application
cd /d "%~dp0"
python journal_app.py
pause
