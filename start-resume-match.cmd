@echo off
setlocal
cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo [ResumeMatch] Cannot find npm. Please install Node.js 22 or later.
  pause
  exit /b 1
)

start "" powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 4; Start-Process 'http://localhost:5173/'"
echo [ResumeMatch] Starting at http://localhost:5173/
echo Keep this window open while using the app. Press Ctrl+C to stop it.
call npm run dev

if errorlevel 1 (
  echo.
  echo ResumeMatch stopped with an error.
  pause
)
