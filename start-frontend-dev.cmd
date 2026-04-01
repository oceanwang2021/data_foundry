@echo off
cd /d E:\huatai\file\data-foundry-frontend
set "PATH=C:\Program Files\nodejs;%PATH%"
call npm run dev 1>> E:\huatai\file\frontend.log 2>> E:\huatai\file\frontend.err.log
