@echo off
setlocal enabledelayedexpansion
cd /d %~dp0
if not exist logs mkdir logs
set "JAVA_HOME=C:\Program Files\Eclipse Adoptium\jdk-8.0.482.8-hotspot"
set "MAVEN_HOME=G:\apache-maven-3.9.14-bin\apache-maven-3.9.14"
set "PATH=%JAVA_HOME%\bin;%MAVEN_HOME%\bin;%PATH%"
call mvn -q -pl data-foundry-scheduler-service -DskipTests spring-boot:run 1>> logs\scheduler.out.log 2>> logs\scheduler.err.log
