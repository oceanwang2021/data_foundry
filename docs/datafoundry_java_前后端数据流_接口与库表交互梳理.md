# datafoundry_java：前端数据流、后端接口与数据库表交互梳理

> 生成时间：2026-04-16（Asia/Shanghai）  
> 范围：`data-foundry-frontend/`、`data-foundry-backend-service/`、`data-foundry-scheduler-service/`、`db/mysql/*`

---

## 1. 前端：哪些操作会触发“查询/新增/落表”

### 1.1 数据来源分三类

1) **走后端 API（通过 Next.js `/api/*` 代理转发）**  
代理：`data-foundry-frontend/app/api/[...path]/route.ts`  
后端基址：`data-foundry-frontend/.env.local`（`BACKEND_API_BASE=http://127.0.0.1:8000`）

2) **纯前端本地持久化（localStorage）**  
例如运行时配置、权限配置：`data-foundry-frontend/lib/runtime-settings.ts`、`data-foundry-frontend/lib/auth-permissions.ts`

3) **前端静态/内置 mock**  
例如数据血缘：`data-foundry-frontend/lib/mock-platform.ts`

### 1.2 目前“确实会触发后端接口”的主要页面/动作

> 下面列的是前端路由页与其关键动作（实际调用集中在 `data-foundry-frontend/lib/api-client.ts`）。

#### A) 项目（Projects）

- 页面：`data-foundry-frontend/app/projects/page.tsx`
  - 查询：`fetchProjects()` → `GET /api/projects`
  - 查询（为统计需求数量）：`fetchRequirements(projectId)` → `GET /api/projects/{projectId}/requirements`

- 页面：`data-foundry-frontend/app/projects/[id]/page.tsx`
  - 聚合加载：`loadProjectData(projectId)`（内部多次调用）

> **前端已实现但当前 UI 未必入口可达**：`createProject()` / `updateProject()`（如果接入会调用 `POST/PUT /api/projects`，当前后端缺失）。

#### B) 需求（Requirements）与需求详情

- 页面：`data-foundry-frontend/app/requirements/page.tsx`
  - 查询：`fetchProjects()` + `fetchRequirementWideTables(projectId)`（本质也是 `GET /api/projects/{projectId}/requirements`）

- 页面：`data-foundry-frontend/app/projects/[id]/requirements/[reqId]/page.tsx`
  - 聚合加载：`loadRequirementDetailData(projectId, requirementId)`
  - 自动保存需求基本信息：`updateRequirement(...)` → `PUT /api/projects/{projectId}/requirements/{requirementId}`

#### C) 采集任务管理（TaskGroups / FetchTasks）

- 页面：`data-foundry-frontend/app/collection-tasks/page.tsx`
  - 查询 taskGroups：`fetchTaskGroups(projectId, requirementId)` → `GET .../task-groups`
  - 查询 fetchTasks：`fetchFetchTasks(projectId, requirementId)` → `GET .../tasks`
  - 展开任务组时生成子任务：`ensureTaskGroupTasks(taskGroupId)` → `POST /api/task-groups/{taskGroupId}/ensure-tasks`

- 需求详情页内任务面板：`data-foundry-frontend/components/RequirementTasksPanel.tsx`
  - 执行：`executeTaskGroup` / `executeTask` / `retryTask`
  - 计划持久化：`persistWideTablePlan` / `persistWideTablePreview`

#### D) 调度（Scheduling）

- 页面：`data-foundry-frontend/app/scheduling/page.tsx`
  - 查询调度记录：`fetchScheduleJobs(...)` → `GET /api/schedule-jobs`
  - 创建调度记录：`createScheduleJob(...)` → `POST /api/schedule-jobs`

#### E) 运维监控 / 规则 / 验收（目前多为 stub 或缺失）

- 监控页：`data-foundry-frontend/app/ops-monitoring/page.tsx`
  - `fetchOpsOverview()` → `GET /api/ops/overview`（后端 stub 空数组）
  - `fetchTaskStatusCounts()` → `GET /api/ops/task-status-counts`（stub）
  - `fetchDataStatusCounts()` → `GET /api/ops/data-status-counts`（stub）

- 后处理页：`data-foundry-frontend/app/preprocessing/page.tsx`
  - `fetchPreprocessRules()` → `GET /api/preprocess-rules`（stub）
  - `fetchAuditRules()` → `GET /api/audit-rules`（stub）
  - 页面内“执行后处理/落库”逻辑目前是前端演示，不会落后端表

- 验收页：`data-foundry-frontend/app/acceptance/page.tsx`
  - `fetchAcceptanceTickets()` → `GET /api/acceptance-tickets`（stub）
  - 需求详情页验收面板还会调用 `createAcceptanceTicket/updateAcceptanceTicket/updateWideTableRow`，但后端均缺失（见 4.3）。

---

## 2. 后端：接口与数据库表的交互（按服务拆分）

### 2.1 backend-service（8000 / MySQL：`data_foundry_backend`）

配置：`data-foundry-backend-service/src/main/resources/application.yml`

#### 2.1.1 Project

- `GET /api/projects`
  - Controller：`data-foundry-backend-service/.../web/ProjectController.java`
  - Mapper：`data-foundry-backend-service/.../persistence/ProjectMapper.java`
  - 表：`projects`（读）

- `GET /api/projects/{projectId}`
  - 同上
  - 表：`projects`（读）

> 说明：后端当前**没有** `POST/PUT /api/projects`，因此前端 `createProject/updateProject` 对应落表链路尚不存在。

#### 2.1.2 Requirement（包含“创建主宽表”）

- `GET /api/projects/{projectId}/requirements`
  - Controller：`.../web/RequirementController.java`
  - Mapper：`RequirementMapper.listByProject(...)` → 表 `requirements`（读）
  - 同时读取主宽表：`WideTableMapper.getPrimaryByRequirement(...)` → 表 `wide_tables`（读，若存在）

- `POST /api/projects/{projectId}/requirements`
  - Controller：`.../web/RequirementController.java`
  - 写入：
    - `RequirementMapper.insert(...)` → 表 `requirements`（写）
    - `WideTableMapper.insert(...)` → 表 `wide_tables`（写，创建 1 张主宽表）

- `GET /api/projects/{projectId}/requirements/{requirementId}`
  - `RequirementMapper.get(...)` → 表 `requirements`（读）

- `PUT /api/projects/{projectId}/requirements/{requirementId}`
  - `RequirementMapper.updateByProjectAndId(...)` → 表 `requirements`（写）
  - **特殊规则**：当 `status=ready`：
    - 需求 schema 锁定：`schema_locked=true`（写 requirements）
    - 触发默认任务组生成：`TaskPlanService.ensureDefaultTaskGroupsOnSubmit(requirementId)`
      - `TaskGroupMapper.upsert(...)` → 表 `task_groups`（写/更新）

#### 2.1.3 WideTable 定义更新

- `PUT /api/requirements/{requirementId}/wide-tables/{wideTableId}`
  - Controller：`.../web/RequirementWideTableController.java`
  - 读 requirement：`RequirementMapper.getById(...)` → `requirements`（读）
  - 读 wide_table：`WideTableMapper.getByIdForRequirement(...)` → `wide_tables`（读）
  - 写 wide_table：`WideTableMapper.updateByIdAndRequirement(...)` → `wide_tables`（写）
  - JSON 字段写入：`schema_json/scope_json/indicator_groups_json/schedule_rules_json`（目前以字符串化 JSON 方式落表）

#### 2.1.4 Plan/Preview（计划/预览持久化）

- `POST /api/requirements/{requirementId}/wide-tables/{wideTableId}/preview`
  - Controller：`.../web/WideTablePlanController.java`
  - 行为：**占位**（仅返回 ok，不落表宽表行）

- `POST /api/requirements/{requirementId}/wide-tables/{wideTableId}/plan`
  - Controller：`.../web/WideTablePlanController.java`
  - 写入：`TaskPlanService.upsertPlanTaskGroups(...)` → `TaskGroupMapper.upsert(...)` → 表 `task_groups`（写/更新）
  - 说明：当前仅落 task_groups；并未落 `wide_table_rows/collection_batches/...`

#### 2.1.5 TaskGroup/FetchTask 查询

- `GET /api/projects/{projectId}/requirements/{requirementId}/task-groups`
  - Controller：`.../web/RequirementTaskController.java`
  - `TaskGroupMapper.listByRequirement(requirementId)` → 表 `task_groups`（读）

- `GET /api/projects/{projectId}/requirements/{requirementId}/tasks`
  - `FetchTaskMapper.listByRequirement(requirementId)` → 表 `fetch_tasks`（读）

#### 2.1.6 执行相关（当前为 placeholder）

- `POST /api/task-groups/{taskGroupId}/ensure-tasks`
  - Controller：`.../web/TaskExecutionController.java`
  - 读 task_group：`TaskGroupMapper.getById(...)` → `task_groups`（读）
  - lazy 生成 fetch_tasks：`TaskPlanService.ensureFetchTasksForTaskGroup(...)`
    - `FetchTaskMapper.upsertBatch(...)` → 表 `fetch_tasks`（批量写/更新）

- `POST /api/task-groups/{taskGroupId}/execute`
  - 行为：占位执行，仅 `task_groups.status` 置为 running→completed（写 `task_groups`）

- `POST /api/tasks/{taskId}/execute`
  - 行为：占位执行，仅 `fetch_tasks.status` running→completed（写 `fetch_tasks`）

- `POST /api/tasks/{taskId}/retry`
  - 行为：仅 `fetch_tasks.status=pending`（写 `fetch_tasks`）

> 说明：当前 backend-service 并未落 `execution_records/retrieval_tasks`，因此前端“执行记录/窄表产物”展示缺少数据支撑。

#### 2.1.7 调度 facade（backend -> scheduler）

- `GET /api/schedule-jobs`
- `POST /api/schedule-jobs`

Controller：`.../web/ScheduleJobFacadeController.java`  
数据库：backend-service **不落表**，仅 HTTP 转发到 scheduler-service。

#### 2.1.8 平台 stub + demo 数据

Controller：`.../web/PlatformStubController.java`

- `GET /api/knowledge-bases`、`/api/preprocess-rules`、`/api/audit-rules`、`/api/acceptance-tickets`、`/api/ops/*`：当前大多直接返回空数组（不查库）
- `GET /api/dashboard/metrics`：调用 `DemoDataService.metrics()` 查询 `projects/requirements` 数量（读库）
- `POST /api/admin/seed`：`DemoDataService.seed()` upsert demo 项目/需求（写 `projects/requirements`）
- `POST /api/admin/reset`：`DemoDataService.reset()` 清空项目/需求（写 `projects/requirements`）

### 2.2 scheduler-service（8200 / MySQL：`data_foundry_scheduler`）

配置：`data-foundry-scheduler-service/src/main/resources/application.yml`

- `GET /api/schedule-jobs` / `GET /api/schedule-jobs/{jobId}` / `POST /api/schedule-jobs`
  - Controller：`data-foundry-scheduler-service/.../web/ScheduleJobController.java`
  - Mapper：`.../persistence/ScheduleJobMapper.java`
  - 表：`schedule_jobs`（读/写）
  - 说明：`POST` 创建 job（status=running）后，**after-commit** 触发调用 agent（`POST /agent/executions`），并回写 `completed/failed` 与 `ended_at`

- `POST /api/admin/seed` / `POST /api/admin/reset`
  - Controller：`.../web/AdminController.java`
  - 表：`schedule_jobs`（写/清空）

### 2.3 agent-service（8100 / 无库）

- `POST /agent/executions`
  - Controller：`data-foundry-agent-service/.../web/AgentExecutionController.java`
  - Service：`.../service/MockAgentService.java`
  - 行为：Mock 随机返回结果，不落库

---

## 3. “实际数据库中有哪些表”与功能映射

这里分两种“实际”：

1) **按默认初始化脚本创建的表**（`db/mysql/init_local.sql` 会 `SOURCE` `backend/001_schema.sql` 与 `scheduler/001_schema.sql`）
2) **按完整目标态脚本的表**（`db/mysql/backend/002_full_schema.sql` 的 14 张表 + scheduler 1 张表）

### 3.1 默认初始化（001_schema）会创建哪些表

> 依据：`db/mysql/init_local.sql` + `db/mysql/backend/001_schema.sql` + `db/mysql/scheduler/001_schema.sql`

#### backend DB：`data_foundry_backend`

- `projects`：项目主数据（项目列表/详情、dashboard metrics 计数、demo seed/reset）
- `requirements`：需求主数据（需求列表/详情、demo seed/reset、需求状态更新）
- `wide_tables`：宽表定义（创建需求时同步创建主宽表、宽表更新）
- `task_groups`：任务组（status=ready 默认生成、/plan upsert、列表查询、execute 占位）
- `fetch_tasks`：采集任务（lazy 生成、列表查询、execute/retry 占位）

> 说明：`backend/001_schema.sql` 已升级为 MVP runtime schema，用于保证当前联调链路不缺表/缺字段。

#### scheduler DB：`data_foundry_scheduler`

- `schedule_jobs`：调度运行记录（调度页列表、创建调度记录、admin seed/reset）

### 3.2 完整目标态（002_full_schema）有哪些表（backend 14 张 + scheduler 1 张）

> 依据：`db/mysql/backend/002_full_schema.sql` + `db/mysql/scheduler/001_schema.sql`

#### backend DB：`data_foundry_backend`（14 张）

| 表名 | 功能定位（目标态） | 当前后端是否有读写链路 |
|---|---|---|
| `projects` | 项目容器 | ✅ 读写已用 |
| `requirements` | 需求聚合根 | ✅ 读写已用 |
| `wide_tables` | 宽表定义（schema/scope/指标组/调度规则） | ✅ 读写已用 |
| `wide_table_rows` | 宽表行（初始化后数据锚点） | ❌ 当前无接口/无落表链路 |
| `wide_table_row_snapshots` | 宽表行快照（按 batch 记录） | ❌ 当前无接口/无落表链路 |
| `backfill_requests` | 补采请求 | ❌ 当前无接口/无落表链路 |
| `collection_batches` | 采集批次（快照/增量批次） | ❌ 当前无接口/无落表链路 |
| `task_groups` | 任务组（调度单位） | ✅ 已用（status=ready 生成、/plan upsert、列表查询、execute 占位） |
| `fetch_tasks` | 采集任务（执行单位） | ✅ 已用（lazy 生成、列表查询、execute/retry 占位） |
| `retrieval_tasks` | 单指标检索任务（执行产物） | ❌ 当前无接口/无落表链路 |
| `execution_records` | 执行记录（attempt/runs） | ❌ 当前无接口/无落表链路 |
| `knowledge_bases` | 知识库配置 | 🟡 后端接口存在但 stub（不读表） |
| `preprocess_rules` | 后处理规则 | 🟡 stub（不读表） |
| `audit_rules` | 稽核规则 | 🟡 stub（不读表） |

#### scheduler DB：`data_foundry_scheduler`（1 张）

| 表名 | 功能定位 | 当前后端是否有读写链路 |
|---|---|---|
| `schedule_jobs` | 调度记录（创建/查询） | ✅ scheduler 读写；backend 通过 facade 转发 |

---

## 4. 当前缺口摘要（按“前端操作 -> 后端/DB 未闭环”）

### 4.1 前端已写但后端缺失的关键接口（直接影响落表/展示）

- `POST /api/projects`、`PUT /api/projects/{projectId}`（项目新增/编辑）
- `GET /api/wide-tables/{wideTableId}/rows`、`PUT /api/wide-tables/{wideTableId}/rows/{rowId}`（宽表行查询/修订落库）
- `GET /api/tasks/{taskId}/runs`（执行记录）
- `POST/PUT /api/acceptance-tickets`（验收工单）
- `collection_batches/backfill/trial-run/generate task-groups` 相关接口

### 4.2 后端存在但占位的关键接口（不产生真实执行/结果）

- backend：`POST /api/task-groups/{id}/execute`、`POST /api/tasks/{id}/execute`、`POST /api/tasks/{id}/retry`（主要改状态）
- backend：`POST .../preview`（接受 payload，不落宽表行）
- scheduler：`POST /api/schedule-jobs`（创建后触发 agent 执行并回写状态；backend 也会在 task execute/retry 后 after-commit 触发创建）

---

## 5. 附：后端接口 ⇄ 表交互速查（已实现链路）

| 后端接口 | backend DB 表 | scheduler DB 表 | 备注 |
|---|---|---|---|
| `GET /api/projects` | `projects`(R) | - | |
| `GET /api/projects/{id}` | `projects`(R) | - | |
| `GET /api/projects/{pid}/requirements` | `requirements`(R) + `wide_tables`(R) | - | 列表拼主宽表摘要 |
| `POST /api/projects/{pid}/requirements` | `requirements`(W) + `wide_tables`(W) | - | 创建需求时同步创建主宽表 |
| `PUT /api/projects/{pid}/requirements/{rid}` | `requirements`(W) +（可选）`task_groups`(W) | - | status=ready 会生成默认 task_groups |
| `PUT /api/requirements/{rid}/wide-tables/{wtid}` | `requirements`(R) + `wide_tables`(R/W) | - | schema_locked 冲突会拒绝 |
| `POST .../plan` | `task_groups`(W) | - | 仅 upsert task_groups |
| `POST /api/task-groups/{id}/ensure-tasks` | `task_groups`(R) + `fetch_tasks`(W) | - | lazy 生成 fetch_tasks |
| `POST /api/task-groups/{id}/execute` | `task_groups`(W) | - | 占位：running->completed |
| `POST /api/tasks/{id}/execute` | `fetch_tasks`(W) | - | 占位：running->completed |
| `POST /api/tasks/{id}/retry` | `fetch_tasks`(W) | - | 占位：pending |
| `GET /api/schedule-jobs` | - | `schedule_jobs`(R) | backend 转发 scheduler |
| `POST /api/schedule-jobs` | - | `schedule_jobs`(W) | scheduler 创建 job 后 after-commit 调 agent，回写 completed/failed |
| `POST /api/admin/seed` | `projects/requirements`(W) | - | demo seed |
| `POST /api/admin/reset` | `projects/requirements`(W) | - | demo reset |
