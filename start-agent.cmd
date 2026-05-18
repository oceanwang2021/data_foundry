@echo off
setlocal enabledelayedexpansion
cd /d %~dp0
if not exist logs mkdir logs
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
  call mvn %MAVEN_OFFLINE_ARG% "-Dmaven.repo.local=%MAVEN_REPO_LOCAL%" -pl data-foundry-agent-service -am -DskipTests spring-boot:run 1>> logs\agent-!TS!.out.log 2>> logs\agent-!TS!.err.log
) else (
  call mvn %MAVEN_OFFLINE_ARG% -pl data-foundry-agent-service -am -DskipTests spring-boot:run 1>> logs\agent-!TS!.out.log 2>> logs\agent-!TS!.err.log
)
if errorlevel 1 (
  echo [agent] Startup failed. Check logs\agent-!TS!.out.log and logs\agent-!TS!.err.log
  pause
  exit /b %errorlevel%
)
