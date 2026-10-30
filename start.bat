@echo off
cd /d "%~dp0"
if exist ".venv\Scripts\python.exe" (
  ".venv\Scripts\python.exe" run.py
) else if exist "..\.venv\Scripts\python.exe" (
  "..\.venv\Scripts\python.exe" run.py
) else (
  echo Install Python 3.11/3.12 and the dependencies using README.md first.
)
pause
