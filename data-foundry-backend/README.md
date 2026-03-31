# Backend API (FastAPI + SQLite + uv)

后端启动时会自动初始化 SQLite 数据库，并写入当前接口所需的初始数据。

当前后端已经切换到与 [数据模型.md](../数据模型.md) 一致的实现：

- `Requirement` 是聚合根，可包含 `1..n` 张 `WideTable`
- `WideTable` 承载 `Schema / Scope / IndicatorGroup / ScheduleRule`
- 宽表记录按“维度组合 × 业务日期”规则初始化，并使用整数型 `row_id`
- `TaskGroup` 以“宽表 + 业务日期”为边界组织任务
- `FetchTask = row_id × indicator_group`
- 历史业务日期通过 `BackfillRequest` 创建或激活 `TaskGroup`
- 单指标窄表请求仍可查看，但只是 `FetchTask` 的执行载体，不是新的核心任务概念
- `ExecutionRecord` 只记录执行历史，不承载需求定义

默认数据库文件路径：

- `data-foundry-backend/data/data-foundry.sqlite3`

也可以通过环境变量覆盖：

- `DATA_FOUNDRY_DB_PATH`

## 要求
- `uv` 已安装
- Python `3.12`

## 初始化
```bash
cd data-foundry-backend
uv venv --python 3.12
uv sync
```

## 启动开发服务
```bash
cd data-foundry-backend
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## 数据库初始化

- 首次启动会自动创建 SQLite 文件和表结构
- 后续重启不会重复插入初始数据
- 初始数据当前包含：
  - 2 个项目
  - 3 个需求
  - 4 张宽表
  - 15 条宽表记录
  - 4 个补采请求
  - 8 个任务组
  - 28 个采集任务
  - 41 条单指标执行载体
  - 7 条执行记录

## 核心接口
- `GET /health`
- `GET /api/projects`
- `GET /api/projects/{project_id}`
- `GET /api/projects/{project_id}/requirements`
- `GET /api/projects/{project_id}/requirements/{requirement_id}`
- `GET /api/projects/{project_id}/requirements/{requirement_id}/rows`
- `GET /api/projects/{project_id}/requirements/{requirement_id}/backfill-requests`
- `GET /api/projects/{project_id}/requirements/{requirement_id}/task-groups`
- `GET /api/projects/{project_id}/requirements/{requirement_id}/tasks`
- `GET /api/projects/{project_id}/requirements/{requirement_id}/tasks/{task_id}`
- `GET /api/tasks/{task_id}/retrieval-tasks`
- `GET /api/tasks/{task_id}/runs`
