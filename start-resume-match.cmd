@echo off
setlocal
cd /d "%~dp0"
call npm run desktop:dev
if errorlevel 1 (
  echo.
  echo ResumeMatch failed to start. Keep this window open and copy the error message.
  pause
)
