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
echo.
echo [4/5] Stopping listeners on service ports...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ports=3000,8000,8100,8200; Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $ports -contains $_.LocalPort } | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { if ($_ -and $_ -ne $PID) { Write-Host ('  Stopping listener process ' + $_); Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue } }"

echo.
echo [5/5] Checking results...
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
