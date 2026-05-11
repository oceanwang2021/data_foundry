@echo off
setlocal enabledelayedexpansion
cd /d %~dp0
if not exist logs mkdir logs
set "JAVA_HOME=C:\Program Files\Eclipse Adoptium\jdk-8.0.482.8-hotspot"
set "MAVEN_HOME=G:\apache-maven-3.9.14-bin\apache-maven-3.9.14"
set "PATH=%JAVA_HOME%\bin;%MAVEN_HOME%\bin;%PATH%"
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set "TS=%%i"
call mvn -pl data-foundry-backend-service -am -DskipTests spring-boot:run 1>> logs\backend-!TS!.out.log 2>> logs\backend-!TS!.err.log
