@echo off
setlocal

echo ========================================
echo   Data Foundry - Stop All Services
echo ========================================
echo.

cd /d %~dp0

echo [1/4] Stopping all Data Foundry Java services...
for /f "tokens=1" %%i in ('jps -l ^| findstr "DataFoundry"') do (
    echo   Stopping process %%i
    taskkill /F /PID %%i >nul 2>&1
)

echo.
echo [2/4] Stopping all Maven processes...
for /f "tokens=1" %%i in ('jps -l ^| findstr "plexus.classworlds.launcher.Launcher"') do (
    echo   Stopping process %%i
    taskkill /F /PID %%i >nul 2>&1
)

echo.
echo [3/4] Stopping Node.js and npm processes...
taskkill /F /IM node.exe >nul 2>&1
taskkill /F /IM npm.exe >nul 2>&1

echo.
echo [4/4] Checking results...
echo.
echo Remaining Java processes:
jps -l 2>nul | findstr /v "Jps" || echo   (none)

echo.
echo Remaining Node.js processes:
tasklist /FI "IMAGENAME eq node.exe" 2>nul | findstr "node.exe" || echo   (none)

echo.
echo ========================================
echo   Done!
echo ========================================
echo.
pause
