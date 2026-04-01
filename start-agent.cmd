@echo off
cd /d E:\huatai\file\data-foundry-agent
call E:\huatai\file\data-foundry-agent\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8100 1>> E:\huatai\file\agent.log 2>> E:\huatai\file\agent.err.log
