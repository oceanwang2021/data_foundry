@echo off
setlocal

cd /d %~dp0data-foundry-frontend
if errorlevel 1 (
    echo [frontend] Failed to enter frontend directory.
    pause
    exit /b 1
)

set "PATH=C:\Program Files\nodejs;%PATH%"
set "NODE_OPTIONS=--max-old-space-size=4096"

echo [frontend] Starting on Windows...
echo [frontend] Directory: %CD%
echo [frontend] URL: http://127.0.0.1:3000
echo.

npm.cmd run dev

pause