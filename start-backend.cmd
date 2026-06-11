@echo off
setlocal enabledelayedexpansion
cd /d %~dp0
if not exist logs mkdir logs

powershell -NoProfile -Command ^
  "try { $r = Invoke-RestMethod -Uri 'http://127.0.0.1:8000/actuator/health' -TimeoutSec 2; if ($r.status -eq 'UP') { exit 0 } } catch {}; exit 1"
if not errorlevel 1 (
  echo [backend] Backend is already running and healthy at http://127.0.0.1:8000.
  echo [backend] Stop the existing process before restarting to load new code.
  timeout /t 5 >nul
  exit /b 0
)

powershell -NoProfile -Command ^
  "$client = New-Object Net.Sockets.TcpClient; try { $client.Connect('127.0.0.1', 8000); exit 0 } catch { exit 1 } finally { $client.Dispose() }"
if not errorlevel 1 (
  echo [backend] Startup aborted: port 8000 is occupied by another process.
  echo [backend] Run "netstat -ano ^| findstr :8000" to locate it.
  pause
  exit /b 1
)

if not defined JAVA_HOME (
  if exist "%USERPROFILE%\.jdks\temurin-8\jre\bin\java.exe" set "JAVA_HOME=%USERPROFILE%\.jdks\temurin-8\jre"
)
if defined MAVEN_HOME (
  set "PATH=%MAVEN_HOME%\bin;%PATH%"
) else if exist "%USERPROFILE%\.trae-cn\tools\maven\latest\bin\mvn.cmd" (
  set "PATH=%USERPROFILE%\.trae-cn\tools\maven\latest\bin;%PATH%"
)
if defined JAVA_HOME set "PATH=%JAVA_HOME%\bin;%PATH%"
set "MAVEN_OFFLINE_ARG="
set "MAVEN_REPO_LOCAL="
if exist "%USERPROFILE%\.m2\repository" set "MAVEN_REPO_LOCAL=%USERPROFILE%\.m2\repository"
if "%DATAFOUNDRY_MAVEN_OFFLINE%"=="1" set "MAVEN_OFFLINE_ARG=-o"
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set "TS=%%i"
if defined MAVEN_REPO_LOCAL (
  call mvn %MAVEN_OFFLINE_ARG% "-Dmaven.repo.local=%MAVEN_REPO_LOCAL%" -pl data-foundry-backend-service -am -DskipTests spring-boot:run 1>> logs\backend-!TS!.out.log 2>> logs\backend-!TS!.err.log
) else (
  call mvn %MAVEN_OFFLINE_ARG% -pl data-foundry-backend-service -am -DskipTests spring-boot:run 1>> logs\backend-!TS!.out.log 2>> logs\backend-!TS!.err.log
)
if errorlevel 1 (
  echo [backend] Startup failed. Check logs\backend-!TS!.out.log and logs\backend-!TS!.err.log
  pause
  exit /b %errorlevel%
)
