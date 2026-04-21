# datafoundry_java：路由矩阵（legacy ↔ canonical）

> 目标：在不影响现有前端联调的前提下，逐步引入 canonical API（按应用服务聚合），并将 legacy API 收敛为薄适配层。  
> 本文更新时间：2026-04-20（Asia/Shanghai）

---

## 1. 命名与约定

- **Legacy**：当前前端实际调用的路径（以 `/api/projects/{projectId}/requirements/**`、`/api/task-groups/**` 等为主），保持不变。
- **Canonical**：新增聚合后的 facade 路由（以 `/api/requirements/**`、`/api/tasks/**` 为主），用于后续灰度切换。
- **兼容策略**：同一业务用例的 legacy 与 canonical 均调用同一 application/query service；输出 DTO 结构保持一致（snake_case）。
- **返回格式**：当前阶段保持“裸 JSON”，不引入统一 `Response<T>` 包装（后续在核心上下文试点再推广）。

---

## 2. backend-service 路由矩阵

### 2.1 Requirement（列表/详情/创建/更新）

| 用例 | Legacy（现用） | Canonical（新增） | 说明 |
|---|---|---|---|
| 列表 | `GET /api/projects/{projectId}/requirements` | `GET /api/requirements?project_id={projectId}` | 返回 `List<RequirementReadDto>`（内嵌 `wide_table`） |
| 创建 | `POST /api/projects/{projectId}/requirements` | `POST /api/requirements?project_id={projectId}` | 创建需求并同步创建 primary wide table（`sort_order=0`） |
| 详情 | `GET /api/projects/{projectId}/requirements/{requirementId}` | `GET /api/requirements/{requirementId}?project_id={projectId}` | 返回 `RequirementReadDto` |
| 更新 | `PUT /api/projects/{projectId}/requirements/{requirementId}` | `PUT /api/requirements/{requirementId}?project_id={projectId}` | `status=ready` 会触发 schema_locked + after-commit 事件 |

实现位置：
- Canonical：`data-foundry-backend-service/src/main/java/com/huatai/datafoundry/backend/requirement/interfaces/web/RequirementFacadeController.java`
- Legacy：`data-foundry-backend-service/src/main/java/com/huatai/datafoundry/backend/requirement/interfaces/web/legacy/RequirementLegacyController.java`

### 2.2 Requirement 下的任务查询（TaskGroups/FetchTasks）

| 用例 | Legacy（现用） | Canonical（新增） | 说明 |
|---|---|---|---|
| 任务组列表 | `GET /api/projects/{projectId}/requirements/{requirementId}/task-groups` | `GET /api/tasks/task-groups?project_id={projectId}&requirement_id={requirementId}` | 返回 `List<TaskGroupReadDto>` |
| 任务列表 | `GET /api/projects/{projectId}/requirements/{requirementId}/tasks` | `GET /api/tasks?project_id={projectId}&requirement_id={requirementId}` | 返回 `List<FetchTaskReadDto>` |

实现位置：
- Canonical：`data-foundry-backend-service/src/main/java/com/huatai/datafoundry/backend/task/interfaces/web/TaskFacadeController.java`
- Legacy：`data-foundry-backend-service/src/main/java/com/huatai/datafoundry/backend/requirement/interfaces/web/legacy/RequirementTaskLegacyController.java`

### 2.3 WideTable 定义更新 + 计划落地（仍以 requirement 维度组织）

| 用例 | 当前路径（前端依赖） | Canonical（规划） | 说明 |
|---|---|---|---|
| 宽表定义更新 | `PUT /api/requirements/{requirementId}/wide-tables/{wideTableId}` | `PUT /api/requirements/{requirementId}/wide-tables/{wideTableId}` | 已满足 canonical 前缀（`/api/requirements/**`），后续仅做“controller 归位”（从 legacy 包迁出） |
| plan 预览持久化 | `POST /api/requirements/{requirementId}/wide-tables/{wideTableId}/preview` | `POST /api/requirements/{requirementId}/wide-tables/{wideTableId}/preview` | 当前只返回 `{ok:true}`（不落 `wide_table_rows`） |
| plan 持久化 | `POST /api/requirements/{requirementId}/wide-tables/{wideTableId}/plan` | `POST /api/requirements/{requirementId}/wide-tables/{wideTableId}/plan` | 当前仅 upsert `task_groups`（后续按 M3/M3b 完整化） |

实现位置（Legacy）：
- `data-foundry-backend-service/src/main/java/com/huatai/datafoundry/backend/requirement/interfaces/web/legacy/RequirementWideTableLegacyController.java`
- `data-foundry-backend-service/src/main/java/com/huatai/datafoundry/backend/requirement/interfaces/web/legacy/WideTablePlanLegacyController.java`

### 2.4 执行/重试（Task execution）

| 用例 | Legacy（现用） | Canonical（新增） | 说明 |
|---|---|---|---|
| 确保子任务生成 | `POST /api/task-groups/{taskGroupId}/ensure-tasks` | `POST /api/tasks/task-groups/{taskGroupId}/actions/ensure-tasks` | 生成 `fetch_tasks`（lazy） |
| 执行任务组 | `POST /api/task-groups/{taskGroupId}/execute` | `POST /api/tasks/task-groups/{taskGroupId}/actions/execute` | after-commit 触发 scheduler create job（best-effort） |
| 执行任务 | `POST /api/tasks/{taskId}/execute` | `POST /api/tasks/{taskId}/actions/execute` | 同上 |
| 重试任务 | `POST /api/tasks/{taskId}/retry` | `POST /api/tasks/{taskId}/actions/retry` | 同上（幂等键含 requestId，确保可重复触发） |

实现位置：
- Canonical：`data-foundry-backend-service/src/main/java/com/huatai/datafoundry/backend/task/interfaces/web/TaskFacadeController.java`
- Legacy：`data-foundry-backend-service/src/main/java/com/huatai/datafoundry/backend/task/interfaces/web/legacy/TaskExecutionLegacyController.java`

### 2.5 调度 facade（backend → scheduler）

| 用例 | 路径 | 说明 |
|---|---|---|
| 列表 | `GET /api/schedule-jobs` | backend 转发 scheduler（gateway/ACL） |
| 创建 | `POST /api/schedule-jobs` | 可透传 `X-Idempotency-Key`（可选） |

实现位置：
- `data-foundry-backend-service/src/main/java/com/huatai/datafoundry/backend/task/interfaces/web/ScheduleJobFacadeController.java`

---

## 3. scheduler-service 路由矩阵

| 用例 | 路径 | 说明 |
|---|---|---|
| 列表 | `GET /api/schedule-jobs` | 支持 `trigger_type/status` 过滤 |
| 详情 | `GET /api/schedule-jobs/{jobId}` | 按 id 查询 |
| 创建 | `POST /api/schedule-jobs` | 支持 `X-Idempotency-Key`（稳定 jobId + 幂等返回） |

after-commit：创建 job 后提交事务，再调用 agent 执行并回写 `completed/failed`。

---

## 4. 弃用与灰度策略（建议）

1) **灰度切换**：前端（或 Next.js proxy）增加开关，允许将部分页面从 legacy 切换到 canonical。
2) **对比期**：灰度期内，同一用例在前端可切换双路由，对比响应结构一致性（字段 + 语义）。
3) **弃用标记**：当 canonical 覆盖率达到可用水平后，legacy 可逐步增加：
   - 访问日志标记（legacy=true）
   - （可选）HTTP 响应头 `Deprecation`/`Sunset`（具体日期由项目决定）
4) **下线**：以“页面维度”逐步下线 legacy，而不是“一刀切”。

建议节奏（示例，可按项目调整）：
- T0：前端接入 canonical 开关（页面维度），默认仍走 legacy。
- T0 + 1 周：核心页面（Project/Requirement/Task 列表与详情）灰度到 canonical（10% → 50% → 100%）。
- T0 + 2 周：对 legacy 增加“弃用提示”（日志/监控维度）并冻结 legacy 的新增需求。
- T0 + 4~6 周：移除 legacy 路由（或仅保留 301/410），同时清理 legacy controller 代码与路由矩阵标记。
