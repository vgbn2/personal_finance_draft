@echo off
setlocal enabledelayedexpansion
for %%f in (a) do (
    set "fname=%%f"
    start "PolySim - !fname!" /d "%cd%" cmd /k "echo Working"
)
