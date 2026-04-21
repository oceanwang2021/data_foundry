# datafoundry_java：数据库表 ownership（写主/读侧/索引/约束）

> 本文为执行保障文档：任何涉及 DB 变更的 PR 必须同步更新本表。  
> 命名规范与分层方案参见：`docs/DDD-重构方案-评审补齐版.md`、`docs/DDD-重构执行计划.md`。

---

## 0) 规则（必须遵守）

1) **单表单写主**：每张表必须明确 `owner context` 与 `写主服务`，写入只能发生在写主服务内。
2) **跨服务不直连 DB**：backend 不允许直连 scheduler DB；scheduler 不允许直连 backend DB；跨服务只允许走 gateway/ACL（HTTP/RPC）。
3) **跨上下文只读要显式**：如果同库内跨 context 读取（如 dashboard/ops 统计），必须以 `QueryDao/ReadModel` 的方式显式声明，不允许“顺手 mapper/join”。
4) **幂等策略需落在唯一性上**：优先用“稳定主键/唯一约束”承载幂等；如需保留幂等键可观测性，再补充 `idempotency_key` 列 + `UNIQUE`。

## 1) backend DB：`data_foundry_backend`

> 说明：`db/mysql/backend/001_schema.sql` 为当前 runtime schema（联调闭环最小集：`projects/requirements/wide_tables/task_groups/fetch_tasks`）。  
> `db/mysql/backend/002_full_schema.sql` 为目标态完整表（其余表目前多数无接口/无落表链路）。

| 表 | owner context | 写主服务 | 读侧访问（建议） | 关键索引/唯一约束（现状/建议） | 备注 |
|---|---|---|---|---|---|
| `projects` | `backend.project` | backend | `ProjectRepository` / `ProjectQueryDao` | `PK(id)`、`idx_projects_created_at(created_at)`（001/002） | |
| `requirements` | `backend.requirement` | backend | `RequirementRepository` / `RequirementQueryDao` | `PK(id)`、`idx_requirements_project_id(project_id)`、`idx_requirements_project_created_at(project_id,created_at)`、`idx_requirements_created_at(created_at)`（001/002） | |
| `wide_tables` | `backend.requirement` | backend | `RequirementRepository` / `WideTableQueryDao` | `PK(id)`、`idx_wide_tables_requirement_id(requirement_id)`、`idx_wide_tables_requirement_sort(requirement_id,sort_order)`、`idx_wide_tables_sort_order(sort_order)`（001/002） | 主宽表：`sort_order=0` |
| `wide_table_rows` | `backend.requirement` | backend | `WideTableRowRepository` / `WideTableRowQueryDao` | `PK(wide_table_id,row_id)`、（建议）`idx(requirement_id)`、`idx(business_date)`、`idx(row_binding_key)`（仅 002） | 目标态：宽表行落库；当前无接口/无落表 |
| `wide_table_row_snapshots` | `backend.requirement` | backend | `WideTableSnapshotRepository` / `WideTableRowQueryDao` | `PK(batch_id,wide_table_id,row_id)`、（建议）`idx(wide_table_id)`、`idx(business_date)`（仅 002） | 目标态：按批次快照；当前无接口/无落表 |
| `backfill_requests` | `backend.requirement` | backend | `BackfillRepository` / `BackfillQueryDao` | `PK(id)`、（建议）`idx(requirement_id)`、`idx(wide_table_id)`（仅 002） | 目标态：补采请求；当前无接口/无落表 |
| `collection_batches` | `backend.requirement` | backend | `BatchRepository` / `BatchQueryDao` | `PK(id)`、（建议）`idx(requirement_id)`、`idx(wide_table_id)`、`idx(is_current)`（仅 002） | 目标态：采集批次；当前无接口/无落表 |
| `task_groups` | `backend.task` | backend | `TaskGroupRepository` / `TaskQueryDao` | `PK(id)`、`idx_tg_requirement_id(requirement_id)`、`idx_tg_requirement_sort(requirement_id,sort_order)`、`idx_tg_requirement_wide_table_sort(requirement_id,wide_table_id,sort_order)`、`idx_tg_wide_table_id(wide_table_id)`、`idx_tg_batch_id(batch_id)`、`idx_tg_business_date(business_date)`、`idx_tg_status(status)`（001/002） | 计划落地/任务组列表（按 wide_table 过滤）/执行触发 |
| `fetch_tasks` | `backend.task` | backend | `FetchTaskRepository` / `TaskQueryDao` | `PK(id)`、`idx_ft_requirement_id(requirement_id)`、`idx_ft_requirement_sort(requirement_id,sort_order)`、`idx_ft_task_group_id(task_group_id)`、`idx_ft_task_group_sort(task_group_id,sort_order)`、`idx_ft_batch_id(batch_id)`、`idx_ft_status(status)`（001）；（002 已有 `idx_ft_batch_id/idx_ft_sort_order`） | ensure-tasks 生成/任务列表/执行触发 |
| `retrieval_tasks` | `backend.task` | backend | `RetrievalTaskRepository` / `TaskQueryDao` | `PK(id)`、（建议）`idx(parent_task_id)`、`idx(wide_table_id)`（仅 002） | 目标态：单指标检索任务产物；当前无接口/无落表 |
| `execution_records` | `backend.task` | backend | `ExecutionRecordRepository` / `ExecutionQueryDao` | `PK(id)`、（建议）`idx(task_id)`、`idx(started_at)`（仅 002） | 目标态：执行记录；当前无接口/无落表 |
| `knowledge_bases` | `backend.platform`（建议） | backend | `KnowledgeBaseQueryDao` | `PK(id)`、（建议）`idx(status)`（仅 002） | 当前为 stub（不读表） |
| `preprocess_rules` | `backend.platform`（建议） | backend | `PreprocessRuleQueryDao` | `PK(id)`、（建议）`idx(enabled)`（仅 002） | 当前为 stub（不读表） |
| `audit_rules` | `backend.platform`（建议） | backend | `AuditRuleQueryDao` | `PK(id)`、（建议）`idx(enabled)`（仅 002） | 当前为 stub（不读表） |

---

## 2) scheduler DB：`data_foundry_scheduler`

| 表 | owner context | 写主服务 | 读侧访问（建议） | 关键索引/唯一约束（现状/建议） | 备注 |
|---|---|---|---|---|---|
| `schedule_jobs` | `scheduler.schedule` | scheduler | `ScheduleJobRepository` / `ScheduleJobQueryDao` | `PK(id)`、`idx_schedule_jobs_created_at(created_at)`、`idx_schedule_jobs_status_created_at(status,created_at)`、`idx_schedule_jobs_trigger_created_at(trigger_type,created_at)`、`idx_schedule_jobs_trigger_status_created_at(trigger_type,status,created_at)`、`idx_schedule_jobs_task_group_id(task_group_id)`、`idx_schedule_jobs_task_id(task_id)`（001/002） | 幂等：使用 `X-Idempotency-Key` 推导稳定 `id`（无需 `idempotency_key` 列）；如需可观测性再补列 + UNIQUE |

---

## 3) agent-service

| 范围 | owner context | 写主服务 | 持久化 | 备注 |
|---|---|---|---|---|
| 执行接口 | `agent.agent` | agent | 无 DB（当前 mock） | 由 scheduler 调用；幂等通过 `X-Idempotency-Key`（内存 TTL 去重） |

---

## 4) DB 变更 DoD（Definition of Done）

任何涉及 DB 表结构/索引/约束/查询方式变化的 PR，必须同时满足：

1) **ownership 同步**：更新本文件对应表行（owner/写主/读侧/索引/备注）。
2) **迁移策略明确**：新增迁移脚本（或至少补充可执行的 `ALTER` 脚本与回滚策略说明）。
3) **读写路径核对**：在 `docs/datafoundry_java_前后端数据流_接口与库表交互梳理.md` 更新“接口⇄表交互速查”（如受影响）。
4) **最小回归链路**：列出受影响的最小关键链路（create requirement / plan / ensure-tasks / execute / schedule-jobs）并完成自测。
