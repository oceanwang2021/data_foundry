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
set "MAVEN_ARGS="
if exist "%USERPROFILE%\.m2\repository" set "MAVEN_ARGS=-Dmaven.repo.local=%USERPROFILE%\.m2\repository"
if "%DATAFOUNDRY_MAVEN_OFFLINE%"=="1" set "MAVEN_ARGS=-o %MAVEN_ARGS%"
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set "TS=%%i"
call mvn %MAVEN_ARGS% -pl data-foundry-backend-service -am -DskipTests spring-boot:run 1>> logs\backend-!TS!.out.log 2>> logs\backend-!TS!.err.log
