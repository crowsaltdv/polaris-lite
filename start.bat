@echo off
cd /d "%~dp0"
set "PATH=C:\Program Files\nodejs;%PATH%"
title Polaris Lite

netstat -ano | findstr /R /C:":3031 .*LISTENING" >nul
if not errorlevel 1 (
  echo Polaris Lite is already running on port 3031, so I'm opening it instead of starting a second copy.
  start "" http://localhost:3031
  echo.
  pause
  exit /b
)

start "" http://localhost:3031
node tools\serve.mjs
echo.
echo Polaris Lite stopped. Read the message above to see why.
pause
