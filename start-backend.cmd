@echo off
cd /d E:\huatai\file\data-foundry-backend
set "DATA_FOUNDRY_DB_PATH=E:\huatai\file\data-foundry-backend\data\data-foundry-recovered.sqlite3"
call E:\huatai\file\data-foundry-backend\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 1>> E:\huatai\file\backend.log 2>> E:\huatai\file\backend.err.log
