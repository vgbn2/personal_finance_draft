@echo off
title Polymarket Research Lab
cd /d "%~dp0"
echo Starting Research Dashboard...
python -m polymarket_sim.research.dashboard
pause
