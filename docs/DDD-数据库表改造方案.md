# datafoundry_java：DDD 重构过程中的数据库表改造方案（基于数据流梳理）

> 输入依据：`docs/datafoundry_java_前后端数据流_接口与库表交互梳理.md` + 现有 MySQL 脚本 `db/mysql/*` + 当前 Java 代码对表的读写事实。  
> 目标：在 DDD 分层与接口聚合改造推进过程中，给出**可执行、可迁移、可回滚**的数据库演进方案（含表 ownership、最小可用 schema、索引/幂等约束、迁移策略）。

---

## 1. 现状结论（必须先修复的 DB 事实）

从数据流梳理可得（并已在代码中验证）：

- backend-service 当前已读写：`projects`、`requirements`、`wide_tables`、`task_groups`、`fetch_tasks`
- scheduler-service 当前已读写：`schedule_jobs`

但在本仓库 **2026-04-20 之前** 的 `db/mysql/init_local.sql` 只会执行：

- `db/mysql/backend/001_schema.sql`（**仅创建** `projects`、`requirements`）
- `db/mysql/scheduler/001_schema.sql`（创建 `schedule_jobs`）

这会导致（旧状态）：

1) 后端在“创建需求（同步创建主宽表）/计划落地/任务补齐/任务执行”等链路在 DB 层直接失败（缺表）。  
2) `requirements` 表字段与代码不完全一致：Java `RequirementMapper.insert(...)` 会写 `processing_rule_drafts`，而 `backend/001_schema.sql` 中不存在该字段。

**因此：数据库改造的第一优先级不是“新增更多目标态表”，而是让“当前代码 + 当前联调链路”拥有稳定一致的最小可用 schema。**

✅ 本阶段已落地的修复（Stage 1.5）：
- 已将 `db/mysql/backend/001_schema.sql` 升级为 **MVP runtime schema**：覆盖 `projects/requirements/wide_tables/task_groups/fetch_tasks`，并补齐 `requirements.processing_rule_drafts` 等代码必需字段。
- `init_local.sql` 无需修改（仍 SOURCE `001_schema.sql`），新 schema 会随本地初始化自动生效。

---

## 2. 表 ownership（按 DDD context 固化）

> ownership 是 DDD 边界最终落地到数据库层的体现。  
> 原则：**写路径只能出现在 owner context**；非 owner 只能通过 ACL / 只读查询模型访问。

### 2.1 backend DB：`data_foundry_backend`

| 表 | owner context | 写主服务 | 读侧访问方式（建议） | 备注 |
|---|---|---|---|---|
| `projects` | `backend.project` | backend | `ProjectRepository` / `ProjectQueryDao` | 项目主数据 |
| `requirements` | `backend.requirement` | backend | `RequirementRepository` / `RequirementQueryDao` | 需求聚合根 |
| `wide_tables` | `backend.requirement` | backend | `RequirementRepository` / `WideTableQueryDao` | Requirement 聚合内定义对象 |
| `task_groups` | `backend.task` | backend | `TaskGroupRepository` / `TaskQueryDao` | 任务组（计划/调度单位） |
| `fetch_tasks` | `backend.task` | backend | `FetchTaskRepository` / `TaskQueryDao` | 子任务（执行单位） |

### 2.2 scheduler DB：`data_foundry_scheduler`

| 表 | owner context | 写主服务 | 读侧访问方式（建议） | 备注 |
|---|---|---|---|---|
| `schedule_jobs` | `scheduler.schedule` | scheduler | `ScheduleJobRepository` / `ScheduleJobQueryDao` | 调度记录写主 |

> 结论：backend 中若仍保留 `schedule-jobs` facade，只能做 **BFF/ACL 转发或聚合读视图**，不得直写 scheduler DB。

---

## 3. 最小可用 schema（MVP）方案：把 `001_schema` 改造成“可联调基线”

> 目标：不依赖 `002_full_schema.sql`（其包含 DROP，不适合迁移），也不引入多余表；先确保“当前已实现链路”100% 可跑。

### 3.1 backend MVP（必须覆盖 5 张表 + 字段对齐）

建议将 `db/mysql/backend/001_schema.sql` 升级为 **MVP runtime schema**，满足当前 Java Mapper 写入字段：

#### 3.1.1 `projects`

- 保持现有字段即可（当前代码主要读 `id/name/.../data_source`）。
- 建议补充索引：`created_at`（便于排序/统计）。

#### 3.1.2 `requirements`

必须补齐字段（与 Java Mapper 对齐）：
- `processing_rule_drafts`（JSON 或 TEXT，建议 JSON）
- 已存在的 `collection_policy`、`schema_locked`、`data_update_*` 保留

建议索引：
- `idx_requirements_project_id (project_id)`
- （可选）`idx_requirements_created_at (created_at)`

#### 3.1.3 `wide_tables`（当前链路必须）

Java 当前写入/更新字段（见 `WideTableMapper` / `WideTableRecord`）至少需要：
- `id`（PK）、`sort_order`、`requirement_id`、`title`、`description`、`table_name`
- `schema_version`
- `schema_json`、`scope_json`、`indicator_groups_json`、`schedule_rules_json`（JSON）
- `semantic_time_axis`、`collection_coverage_mode`、`status`、`record_count`
- `created_at`、`updated_at`

索引：
- `idx_wide_tables_requirement_id (requirement_id)`
- `idx_wide_tables_sort_order (sort_order)`（用于 primary wide table 查询）

#### 3.1.4 `task_groups`（当前链路必须）

Java 当前 upsert/查询字段（见 `TaskGroupMapper`）至少需要：
- `id`（PK）、`sort_order`、`requirement_id`、`wide_table_id`
- `batch_id`、`business_date`、`source_type`、`status`
- `schedule_rule_id`、`backfill_request_id`
- `plan_version`、`group_kind`
- `partition_type`、`partition_key`、`partition_label`
- `total_tasks`、`completed_tasks`、`failed_tasks`
- `triggered_by`
- `created_at`、`updated_at`

索引（按当前接口与常用过滤）：
- `idx_tg_requirement_id (requirement_id)`（列表/存在性判断）
- `idx_tg_wide_table_id (wide_table_id)`（wide table 维度查询）
- `idx_tg_business_date (business_date)`（计划/时间轴）
- `idx_tg_status (status)`（ops/监控预留，可选）

幂等关键点：
- `TaskGroupMapper.upsert` 以 `id` 为唯一键（PK）即可保证幂等。

#### 3.1.5 `fetch_tasks`（当前链路必须）

Java 当前 batch upsert/查询字段（见 `FetchTaskMapper`）至少需要：
- `id`（PK）、`sort_order`
- `requirement_id`、`wide_table_id`、`task_group_id`
- `batch_id`、`row_id`
- `indicator_group_id`、`indicator_group_name`、`name`
- `schema_version`、`execution_mode`
- `indicator_keys_json`、`dimension_values_json`（JSON）
- `business_date`
- `status`、`can_rerun`、`invalidated_reason`、`owner`、`confidence`
- `plan_version`、`row_binding_key`
- `created_at`、`updated_at`

索引：
- `idx_ft_requirement_id (requirement_id)`（列表）
- `idx_ft_task_group_id (task_group_id)`（ensure-tasks、列表）
- `idx_ft_status (status)`（执行/监控）

幂等关键点：
- `FetchTaskMapper.upsertBatch` 以 `id` 为唯一键（PK）即可保证幂等（重复 ensure 不会重复插入）。

### 3.2 scheduler MVP（建议增强但可后置）

`db/mysql/scheduler/001_schema.sql` 当前可跑，但建议补齐/增强：

- 增加 `updated_at`（便于状态流转时间）
- 增加索引：`(status)`、`(trigger_type)`、`(task_group_id)`（列表过滤会用）
- 幂等：为 `POST /api/schedule-jobs` 预留幂等键（两种方案二选一）：
  1) **新增字段** `idempotency_key` + 唯一索引（推荐）  
  2) **客户端传入 jobId** 并以 jobId 为幂等（需要改 contract/接口）

> `started_at/ended_at` 当前为 VARCHAR（scheduler 代码也是 String），可先不动；未来需要 DATETIME 时采用“新增 datetime 列 + 双写 + 回填”方式，避免直接改类型导致历史数据失败。

---

## 4. 目标态表（`002_full_schema`）的使用策略：不要直接作为迁移脚本

`db/mysql/backend/002_full_schema.sql` 特点：
- 包含 `DROP TABLE`（数据清空）
- 更像“本地一键重建 demo 环境”的脚本，而非“可用于演进的 migration”

建议定位：
- 保留为 **dev/demo 重建脚本**（配合 `003_seed_sample_data.sql`）
- 不纳入生产/联调环境的版本化迁移序列

迁移序列应以“增量、可回滚、不 drop”为原则，由 Flyway/Liquibase 或 SOP 管控（见下一节）。

---

## 5. 版本化迁移策略（与 DDD 重构里程碑对齐）

> 推荐 Flyway；若审批限制，则用“手工版本脚本 + 发布 SOP”替代，但仍需满足：编号、顺序、回滚、环境一致性校验。

### 5.1 推荐：Flyway（每个服务独立维护）

每个服务一套 migrations：
- backend：`data_foundry_backend`
- scheduler：`data_foundry_scheduler`

建议迁移命名（示例）：

- backend
  - `V1__init_mvp.sql`：MVP 的 5 张表 + 字段对齐（无 DROP）
  - `V2__add_indexes_for_queries.sql`：为列表/过滤补齐索引
  - `V3__add_execution_records.sql`：当 M3b 执行侧开始落执行记录时引入（可选）
  - `V4__add_wide_table_rows.sql`：当宽表行落库功能开始做时引入（可选）
- scheduler
  - `V1__init.sql`：schedule_jobs
  - `V2__add_idempotency_and_indexes.sql`：幂等键 + status/trigger_type 索引

> Flyway 的 migration 只会执行一次，因此无需大量 `IF NOT EXISTS`；但 `CREATE TABLE IF NOT EXISTS` 可以保留以增强脚本鲁棒性（视团队规范）。

### 5.2 替代：脚本 + SOP（无 Flyway）

若暂不引入 Flyway：
- 保持 `init_local.sql` 仅用于本地初始化
- 增加 `db/mysql/backend/migrations/` 与 `db/mysql/scheduler/migrations/`（或在 docs 中维护顺序）
- 每次 schema 变更必须：
  - 新增一个增量脚本（只 ALTER/CREATE，不 DROP）
  - 更新 `docs/表-ownership.md`
  - 在联调环境执行并记录执行回执

---

## 6. 与 DDD 重构里程碑的表改造对齐（重点）

> 下表把“代码重构里程碑”与“必需的 DB 变更”对齐，避免出现“目录改完了、DB 没跟上导致联调失败”。

### 6.1 M1（底座）阶段：只做 schema 基线一致性

必须做：
- backend `001_schema` 升级为 MVP（覆盖 5 表 + 字段对齐）
- scheduler `001_schema` 保持可用（可先不做幂等增强）

### 6.2 M2（Requirement 命令侧）阶段：确保 requirement/wide_table 写路径稳定

重点表：
- `requirements`：补齐 `processing_rule_drafts`；必要时补索引（project_id/created_at）
- `wide_tables`：确保 JSON 字段可写；索引满足 `getPrimaryByRequirement`

兼容策略：
- 新增字段一律 nullable/有默认值（避免历史数据迁移阻塞）。

### 6.3 M2b（Requirement 查询侧）阶段：为列表/聚合读补索引

重点：
- 为高频 list 接口补索引：`requirements(project_id, created_at)`、`wide_tables(requirement_id, sort_order)`
- 统计/ops 查询若引入 read model，优先新增只读索引，不改现有写路径。

### 6.4 M3（Task 计划算法侧）阶段：批量 upsert 与幂等约束

重点表：
- `task_groups`：确保 upsert 按 PK 幂等；补齐 `idx_tg_requirement_id` 等索引
- `fetch_tasks`：确保 batch upsert 按 PK 幂等；补齐 `idx_ft_task_group_id/status` 等索引

建议增强（可选）：
- 若出现“同一个 task_group 被重复生成不同 id”的风险，增加业务唯一约束（例如 `UNIQUE(task_group_id, indicator_group_id, row_id)` 或基于业务键），但要以真实生成逻辑为依据，避免过早约束导致写失败。

### 6.5 M3b（Task 执行侧）阶段：执行记录表（可选、按成熟度引入）

当执行侧从“占位状态更新”升级到“可追踪多次尝试/日志引用”时，建议引入：
- backend：`execution_records`（或按方案命名 `execution_records` / `task_runs`）
  - 与 `FetchTask`（task_id）关联
  - 支持多次 attempt、started_at/ended_at、operator、output_ref/log_ref

迁移策略：
- 先新增表，不改现有 fetch_tasks/task_groups 结构
- 执行用例逐步写入 execution_records，再决定是否需要冗余字段回写到 fetch_tasks（例如 last_run_id）

### 6.6 M4（Gateway/ACL）阶段：scheduler 幂等与索引增强

重点表：
- scheduler：`schedule_jobs`

建议变更：
- 新增 `idempotency_key`（VARCHAR）+ `UNIQUE`（用于 create job 幂等）
- 增加 `status/trigger_type/task_group_id` 索引（用于列表过滤）
- 增加 `updated_at`（便于状态变更追踪）

---

## 7. DB 变更的“可回滚/可观测”要求（执行保障）

每次涉及 DB 变更，必须同时交付：

1) migration 脚本（或 SOP 增量脚本）  
2) `docs/表-ownership.md` 更新（至少：表归属、写主、索引、唯一约束、访问方式）  
3) 最小回归用例（对应 `docs/DDD-重构执行计划.md` 的关键链路）  
4) 风险说明与回滚方案（例如：新增字段回滚=不使用；新增索引回滚=drop index）  

---

## 8. 附录：本次改造直接涉及的表（按接口数据流）

> 直接来自 `docs/datafoundry_java_前后端数据流_接口与库表交互梳理.md` 的“已实现链路”。

### backend-service
- Project：`projects`（读）
- Requirement：
  - 列表/详情：`requirements`（读）+ `wide_tables`（读）
  - 创建：`requirements`（写）+ `wide_tables`（写）
  - 更新/提交：`requirements`（写）+（提交触发）`task_groups`（写）
- Task：
  - plan：`task_groups`（upsert 写）
  - ensure-tasks：`fetch_tasks`（batch upsert 写）+ `task_groups`（回写 totals）
  - execute/retry（当前占位）：`task_groups/fetch_tasks`（状态写）

### scheduler-service
- Scheduling：`schedule_jobs`（读写；当前 skeleton：创建后立即 completed）
