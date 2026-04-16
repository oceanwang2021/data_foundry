# datafoundry_java 改造方案 V2（严格对齐项目集开发规范：最终实施蓝图）

> 生成时间：2026-04-16（Asia/Shanghai）  
> 适用范围：本仓库 Java 侧（`data-foundry-*-service` + `db/mysql/*`），前端仅涉及“接口兼容与切换策略”  
> V2 目标：从“工程重构建议”升级为“可执行、可落地的统一基线”，包含领域建模、约束落地、迁移顺序与安全边界。

---

## 1. 规范落地总基线（强约束）

### 1.1 技术栈与依赖管理（必须）

- **框架**：Spring Boot `2.7.18`（保持），Spring 5.x（随 Boot）
- **DAO**：MyBatis（改为 **XML + resultMap**，禁止注解 SQL）
- **依赖管理**：所有依赖版本只允许在父 POM 的 `dependencyManagement` 中声明（子模块禁止写版本）
- **日志**：业务代码统一 `org.apache.commons.logging.LogFactory`

### 1.2 代码组织（必须）

规范规定的顶层分层包必须存在（`api/api.impl/dao/dto/domain`），同时 V2 要求进一步领域化拆分（见 3.2）。

### 1.3 统一返回（必须）

所有对外 HTTP API（含健康检查）**最终**必须返回 `Response<T>`：

```java
public class Response<T> {
  private Integer code;
  private String message;
  private T data;
}
```

> 注：为兼容当前前端，采用“版本化 API + 逐步切换”策略（见 6.2），避免一次性破坏性变更。

---

## 2. 领域建模与聚合设计（DDD 深度补齐：聚合根/边界/跨聚合引用/规则归属）

### 2.1 有界上下文（Bounded Context）划分

结合现有三服务拆分，将领域边界固化为 3 个上下文（与服务 1:1 映射，避免跨上下文直接写库）：

1) **Core（backend-service / 8000 / data_foundry_backend）**
- 业务核心：项目、需求、宽表定义、计划、任务、执行记录、规则/配置

2) **Scheduling（scheduler-service / 8200 / data_foundry_scheduler）**
- 调度作业：ScheduleJob 创建、查询、状态流转（未来可扩展触发器/队列）

3) **Agent（agent-service / 8100 / 无库）**
- 采数执行：接收执行请求，返回采数结果（当前为 mock，可切换真实实现）

### 2.2 聚合根与聚合边界（Core 上下文）

> 原则：聚合内部强一致；跨聚合只用 **ID 引用**（不跨聚合事务），通过应用服务编排。

#### A. Project 聚合（聚合根：Project）

- **聚合根**：`Project`
- **实体/值对象**：
  - `Project`（Entity）
  - `DataSourcePolicy`（Value Object，对应 `projects.data_source` JSON）
- **边界内规则**：
  - Project 基本信息维护
  - 默认信源配置（data_source）校验
- **跨聚合引用**：
  - Requirement 通过 `projectId` 引用 Project（只存 ID，不嵌套 Project 对象）

#### B. Requirement 聚合（聚合根：Requirement）

- **聚合根**：`Requirement`
- **实体/值对象**：
  - `Requirement`（Entity）
  - `CollectionPolicy`（VO，对应 `requirements.collection_policy` JSON）
  - `ProcessingRuleDrafts`（VO，对应 `requirements.processing_rule_drafts` JSON）
- **边界内规则（必须归属 Requirement 域）**：
  1. `schema_locked=true` 时禁止“定义类字段”变更（允许状态流转）
  2. `status` 进入 `ready`：锁定 schema，并触发“生成默认 TaskGroup”（这是跨聚合编排，见 2.4）
  3. phase/status/data_update_mode 的枚举合法性与流转校验
- **跨聚合引用**：
  - Requirement 通过 `requirementId` 被 WideTable/Plan/Task 引用
  - 不允许 Task 直接回写 Requirement 定义字段（只能通过 Requirement 应用服务）

#### C. WideTableDefinition 聚合（聚合根：WideTable）

- **聚合根**：`WideTable`（定义边界：1 Requirement 对应 1 主 WideTable）
- **实体/值对象**：
  - `WideTable`（Entity）
  - `WideTableSchema`（VO，对应 `wide_tables.schema_json`）
  - `WideTableScope`（VO，对应 `wide_tables.scope_json`）
  - `IndicatorGroupSet`（VO，对应 `wide_tables.indicator_groups_json`）
  - `ScheduleRuleSet`（VO，对应 `wide_tables.schedule_rules_json`）
- **边界内规则（必须归属 WideTable 域）**：
  1. schema/scope/indicatorGroups/scheduleRules 的结构校验（含必填字段）
  2. `schema_version` 递增策略（修改 schema 时 +1；仅改描述不 +1）
  3. 采集模式约束（`semantic_time_axis` 与 `collection_coverage_mode` 组合合法性）
- **跨聚合引用**：
  - 通过 `requirementId` 与 Requirement 关联（只存 ID）
  - schema_locked 读取来自 Requirement（由应用服务协调：WideTable 更新前必须校验 Requirement.schema_locked）

#### D. Plan 聚合（聚合根：CollectionBatch / TaskGroup）

> 计划域包含“批次/任务组/任务”，目标是把“计划落地与执行单位”的一致性收敛到可治理边界。

- **聚合根 1**：`CollectionBatch`（可选：若当前暂不落地批次，则保留表但 V1 不开放 API）
- **聚合根 2**：`TaskGroup`（核心：调度/执行最小批次单位）
- **实体**：
  - `TaskGroup`（Entity，对应 `task_groups`）
  - `FetchTask`（Entity，对应 `fetch_tasks`，属于 TaskGroup 子实体，但存独立表）
- **边界内规则（必须归属 Plan 域）**：
  1. **计划版本**：同一 requirement/wide_table 的 `plan_version` 单调递增；旧计划可被标记失效（可通过 status/invalidated_reason）
  2. 生成规则：`FetchTask = WideTableRow × IndicatorGroup`（当前实现为 lazy 生成，规则必须集中在 PlanService）
  3. TaskGroup 状态聚合：`total_tasks/completed_tasks/failed_tasks` 的一致性更新
- **跨聚合引用**：
  - TaskGroup 引用 Requirement/WideTable 仅存 ID
  - FetchTask 引用 TaskGroup 仅存 ID

#### E. Execution 聚合（聚合根：FetchTask / ExecutionRecord）

> 执行域关注“执行尝试与回填证据”，与计划域通过 task_id/row_id 关联。

- **聚合根**：`FetchTask`（执行状态最终落到任务）
- **实体**：
  - `ExecutionRecord`（Entity，对应 `execution_records`）
  - `RetrievalTask`（Entity，对应 `retrieval_tasks`，单指标检索执行产物）
- **边界内规则（必须归属 Execution 域）**：
  1. 状态机：`pending -> running -> completed/failed`（重试回到 pending，需记录原因）
  2. `can_rerun` 与重试次数策略（若后续引入）
  3. 生成 execution_records 的幂等/非幂等策略（必须定义：V2 规定“每次 execute 生成一条 record”）
- **跨聚合引用**：
  - Execution 只能更新任务/记录，不允许改 WideTableDefinition
  - 与 Scheduling/Agent 的调用通过“客户端接口 + DTO 契约”实现

#### F. Governance（规则/配置聚合）

聚合根分别为：

- `KnowledgeBase`（`knowledge_bases`）
- `PreprocessRule`（`preprocess_rules`）
- `AuditRule`（`audit_rules`）

规则：

- `enabled` 语义与筛选一致
- JSON 配置字段结构校验（TypeHandler + DTO 校验）

### 2.3 聚合边界内外的引用方式（统一约束）

**强制约束**：

- 跨聚合传递只允许传 `id`（String/Long），禁止把 DO/Domain 对象作为参数跨层传递
- DAO 层只返回 DO；Service 内部转换为 Domain/DTO
- API 层只暴露 DTO，不透出 DO/Domain

### 2.4 关键业务规则归属（“谁负责”一锤定音）

| 规则/行为 | 归属层 | 说明 |
|---|---|---|
| Requirement schema_lock 校验 | Requirement Domain Service | 定义变更前必须检查 |
| WideTable 定义更新（schema/scope/...） | WideTable Domain Service | 结构校验 + schema_version 策略 |
| status=ready 触发默认 TaskGroup | Requirement Application Service | 跨聚合编排：Requirement->Plan |
| TaskGroup/FetchTask 生成 | Plan Domain Service | 统一生成规则，禁止 Controller/DAO 里生成 |
| execute/retry 状态流转 | Execution Domain Service | 状态机集中化 |
| backend 调 scheduler 创建 ScheduleJob | Application Service + SchedulerClient | 失败映射为 BizException |
| /api/admin/seed/reset | Admin Application Service | 必须受权限控制 |

---

## 3. 包结构的领域化拆分原则（在规范 api/dto/domain/dao 之上“按子域细分”）

### 3.1 总原则

- 顶层必须保留：`api / api.impl / dto / domain / dao`
- 每个顶层包下再按子域细分：`project / requirement / widetable / plan / task / execution / scheduling / governance / ops / admin`

### 3.2 backend-service 包结构蓝图（示例：`com.htsc.datafoundry.core`）

```text
com.htsc.datafoundry.core
├─ api/
│  ├─ project/ProjectApi.java
│  ├─ requirement/RequirementApi.java
│  ├─ widetable/WideTableApi.java
│  ├─ plan/WideTablePlanApi.java
│  ├─ task/TaskQueryApi.java
│  ├─ execution/ExecutionApi.java
│  ├─ scheduling/ScheduleJobApi.java
│  ├─ governance/GovernanceApi.java
│  ├─ ops/OpsApi.java
│  ├─ admin/AdminApi.java
│  └─ health/HealthApi.java
├─ api/impl/…（与 api 同子包结构，XXXApiImpl 实现）
├─ dto/…（同子包结构，XXXDTO）
├─ service/…（同子包结构，XXXService）
├─ service/impl/…（XXXServiceImpl）
├─ domain/
│  ├─ project/…（实体/VO/领域服务）
│  ├─ requirement/…
│  ├─ widetable/…
│  ├─ plan/…
│  ├─ execution/…
│  └─ governance/…
└─ dao/
   ├─ project/ProjectMapper.java + xml
   ├─ requirement/RequirementMapper.java + xml
   └─ ...
```

> scheduler-service / agent-service 同理（包名可分别为 `com.htsc.datafoundry.scheduling` / `com.htsc.datafoundry.agent`）。

---

## 4. 依赖注入规范澄清（评审点 3：必须明确）

### 4.1 最终基线（V2 定稿）

**允许构造器注入**，并在构造器上加 `@Autowired`（满足“使用 Spring 的 @Autowired 注入”的字面要求，同时保留可测试性与不可变依赖）。

强制规则：

- ServiceImpl/Client/Assembler：**只允许构造器注入**（构造器 `@Autowired`）
- Controller（api.impl）：允许构造器注入（推荐）或字段注入（不推荐）
- 禁止 `new XxxServiceImpl()` 手工创建（必须由 Spring 管理）

---

## 5. 对象转换策略（评审点 4：BeanCopier + Assembler/Converter + JSON 策略）

### 5.1 分层对象定义（统一命名）

- DTO：`XXXDTO`（API 入参/出参）
- DO：`XXXDO`（MyBatis 映射对象）
- Domain：实体/VO（业务语义，禁止直接暴露给 API）

### 5.2 转换总策略（强制）

1) **简单对象（字段同名、无嵌套/无 JSON）**：使用 `BeanCopier`
- 位置：`common-core` 提供 `BeanCopierUtils.copy(source, Target.class)`

2) **复杂对象（嵌套、字段改名、需要组合多表/多对象）**：使用 Assembler/Converter
- 命名：`XxxAssembler` / `XxxConverter`
- 位置：各子域 `service/impl` 或独立 `domain/*/assembler`
- 规则：Assembler 只能从（DO/Domain）到 DTO，不允许访问 DAO

3) **JSON 字段**（MySQL JSON 列或 text 存 JSON）
- DAO 层 DO 字段类型：优先使用“强类型对象” + MyBatis TypeHandler（见 7）
- DTO 与 Domain 也用强类型对象（例如 `CollectionPolicyDTO` / `CollectionPolicy`）
- 仅在 Assembler 中做“兼容层处理”（例如字段缺失默认值）

### 5.3 JSON 字段清单与强类型化要求（backend DB）

必须强类型化（不得用 `Object`/`Map<String,Object>` 作为 API 入参）：

- `projects.data_source` -> `DataSourcePolicyDTO`
- `requirements.collection_policy` -> `CollectionPolicyDTO`
- `requirements.processing_rule_drafts` -> `ProcessingRuleDraftsDTO`
- `wide_tables.schema_json` -> `WideTableSchemaDTO`
- `wide_tables.scope_json` -> `WideTableScopeDTO`
- `wide_tables.indicator_groups_json` -> `List<IndicatorGroupDTO>`
- `wide_tables.schedule_rules_json` -> `List<ScheduleRuleDTO>`
- `fetch_tasks.indicator_keys_json` -> `List<String>`
- `fetch_tasks.dimension_values_json` -> `Map<String,String>`
- `retrieval_tasks.narrow_row_json` -> `NarrowIndicatorRowDTO`
- `preprocess_rules.*_json` -> 对应 DTO

---

## 6. 统一响应与错误码规范（评审点 5：落到可执行层）

### 6.1 Response 输出规则（强制）

- 成功：`code=0`，`message` 为可读提示（例如“操作成功”），`data` 为实际数据
- 失败：`code!=0`，`message` 为可读错误信息，`data` 必须为 `null`
- 全局异常处理器统一转换（Controller 禁止 try/catch 拼 Map 返回）

### 6.2 前后端兼容策略（强制：必须可平滑切换）

现状前端 `data-foundry-frontend/lib/api-client.ts` 多数期望“裸数据数组/对象”。V2 采用：

1) **新增 v2 API 前缀**：`/api/v2/*` 全量返回 `Response<T>`
2) **保留现有 v1**：`/api/*` 暂保持现状（裸返回），仅做必要 bugfix
3) 前端通过环境变量切换：
- `NEXT_PUBLIC_API_VERSION=v1|v2`（新增）
- v2 时统一解包 `Response<T>` 并处理 code/message

切换里程碑：

- Phase 1：后端双栈（v1/v2 并存）
- Phase 2：前端切 v2（默认）
- Phase 3：v1 下线（或保留只读）

### 6.3 错误码体系（强制：统一枚举 + 文档 + 单测）

在 `common-core` 定义：

- `ErrorCode`（枚举）：`int code + String defaultMessage`
- `BizException`：持有 `ErrorCode` 与自定义 message

建议错误码段（可执行、可扩展）：

- `0`：成功
- `400000`：参数校验失败（通用）
- `401000`：未认证/Token 缺失
- `403000`：无权限
- `404000`：资源不存在（通用）
- `409000`：冲突（通用）
- `500000`：系统异常（通用）

业务细分（示例：必须落枚举，禁止散落魔法数字）：

- `404101`：Project 不存在
- `404201`：Requirement 不存在
- `409201`：Requirement schema 已锁定
- `404301`：WideTable 不存在
- `404401`：TaskGroup 不存在
- `404402`：FetchTask 不存在
- `503001`：Scheduler 服务不可用
- `503002`：Agent 服务不可用

### 6.4 错误映射规则（强制）

- DAO 查不到 -> 抛 `BizException(ErrorCode.NOT_FOUND_*)`
- schema_locked 冲突 -> `BizException(ErrorCode.REQ_SCHEMA_LOCKED)`
- 外部服务调用失败（HTTP 超时/非 2xx）-> `BizException(SCHEDULER_UNAVAILABLE / AGENT_UNAVAILABLE)`

---

## 7. MyBatis XML 与 TypeHandler 规范（评审点 6：JSON/枚举/时间/统计对象）

### 7.1 XML 与 Mapper 命名规则（强制）

- Mapper 接口：`XXXMapper`（位于 `dao/<subdomain>/`）
- XML：`mapper/<subdomain>/XXXMapper.xml`
- 每个查询必须有 `resultMap`，禁止 `resultType` 直接映射复杂对象
- 参数必须明确：
  - 单参数：`parameterType="java.lang.String"` 等
  - 多参数：使用 `@Param` + XML 引用
  - 禁止 `parameterType="java.lang.Object"`

### 7.2 TypeHandler 规范（强制）

统一在 `common-core` 提供并注册：

1) **JSON TypeHandler（Jackson）**
- `JacksonJsonTypeHandler<T>`：支持 `JSON` 列到强类型对象/集合/Map
- 使用方式：
  - 在 DO 字段上声明类型（例如 `private DataSourcePolicyDO dataSource;`）
  - 在 XML 的 `<result>`/`<parameter>` 中指定 `typeHandler`

2) **Enum TypeHandler**
- 统一用 `EnumCodeTypeHandler<E extends CodeEnum>`（枚举实现 `getCode()`）
- DB 存 `varchar` 或 `int`，由 handler 负责映射

3) **时间字段 TypeHandler**
- 推荐 DB 存 `DATETIME`，Java 用 `java.time.LocalDateTime`/`Instant`
- 若 scheduler 仍保留 varchar ISO8601，则提供 `IsoInstantStringTypeHandler`

### 7.3 JSON/枚举/时间字段的具体映射规则（按表）

必须执行以下规则（不允许随意 Map/Object）：

- `projects.data_source (JSON)` -> `DataSourcePolicy`（TypeHandler）
- `requirements.collection_policy (JSON)` -> `CollectionPolicy`
- `requirements.processing_rule_drafts (JSON)` -> `ProcessingRuleDrafts`
- `wide_tables.*_json (JSON)` -> `WideTableSchema/WideTableScope/List<IndicatorGroup>/List<ScheduleRule>`
- `fetch_tasks.indicator_keys_json (JSON)` -> `List<String>`
- `fetch_tasks.dimension_values_json (JSON)` -> `Map<String,String>`
- `retrieval_tasks.narrow_row_json (JSON)` -> `NarrowIndicatorRow`
- `schedule_jobs.started_at/ended_at`：V2 推荐迁移为 `DATETIME`（见 8.3）

### 7.4 统计/聚合查询返回对象（强制）

例如 `/api/dashboard/metrics`、ops 统计等：

- 必须定义专用 DO/DTO：
  - `DashboardMetricsDO`（DAO 返回）
  - `DashboardMetricsDTO`（API 返回）
- 禁止 `Map` 承载统计结果
- resultMap 显式映射聚合字段别名

---

## 8. 数据库迁移治理方案（评审点 7：基线版本/顺序/老库升级/Flyway）

### 8.1 基线选择（强制）

以 `db/mysql/backend/002_full_schema.sql` 的 14 表作为 **Core 库的最终基线模型**，以 `db/mysql/scheduler/001_schema.sql` 的 1 表作为 Scheduling 库基线模型。

> 注意：`002_full_schema.sql` 包含 DROP，不可直接作为迁移脚本；V2 将其拆解为可增量迁移。

### 8.2 是否使用 Flyway（V2 定稿：使用）

V2 规定：**引入 Flyway**（Spring Boot 2.7 原生支持），原因：

- 替代当前 `DemoDataService.ensureSchemaColumns()` 的“运行时 alter 漂移”
- 保证 dev/test/prod 一致可追溯

落地方式：

- backend-service：
  - `src/main/resources/db/migration/backend/V1__init.sql`（创建 14 表 + 索引）
  - 后续变更：`V2__...sql` 增量
- scheduler-service：
  - `src/main/resources/db/migration/scheduler/V1__init.sql`
  - 后续变更增量

Flyway 配置（示例）：

- `spring.flyway.enabled=true`
- `spring.flyway.baseline-on-migrate=true`（用于老库升级；见 8.4）

### 8.3 迁移顺序（强制）

Core（backend DB）建议顺序（按外键依赖从上到下）：

1. `projects`
2. `requirements`
3. `wide_tables`
4. `collection_batches`
5. `wide_table_rows`
6. `wide_table_row_snapshots`
7. `backfill_requests`
8. `task_groups`
9. `fetch_tasks`
10. `retrieval_tasks`
11. `execution_records`
12. `knowledge_bases`
13. `preprocess_rules`
14. `audit_rules`

Scheduling（scheduler DB）：

1. `schedule_jobs`
2. （V2 建议迁移）将 `started_at/ended_at` 改为 `DATETIME`（如需：`V2__schedule_jobs_time_to_datetime.sql`）

### 8.4 老库升级策略（强制）

支持两类现场：

1) 只有 `001_schema.sql`（projects/requirements）：
- Flyway `V1__init.sql` 不应 drop 表，而是：
  - `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ADD COLUMN IF NOT EXISTS`（MySQL 不支持 IF NOT EXISTS for ADD COLUMN，需脚本拆分为“检测+执行”或使用可重复迁移策略；简化方案：V1 直接创建完整表，要求环境为新库）
- V2 定稿：**开发/测试环境允许重建库**；生产若存在旧库，走专项迁移脚本（由 DBA/发布流程执行）。

2) 已存在部分 002_full 的表结构：
- 使用 `baseline-on-migrate=true`，并将基线标记到当前版本后再增量迁移

> V2 约束：**禁用应用运行时 alter**，任何字段变更必须通过 Flyway。

---

## 9. 安全与权限控制最小落地方案（评审点 8：哪些接口受控/如何控/环境差异）

### 9.1 受控接口清单（不遗漏，按现状接口矩阵）

必须受控（至少鉴权 + 授权）：

- backend-service：
  - `POST /api/admin/seed`
  - `POST /api/admin/reset`
  - `PUT /api/requirements/{requirementId}/wide-tables/{wideTableId}`（定义变更）
  - `POST /api/requirements/{requirementId}/wide-tables/{wideTableId}/plan`（计划落地）
  - `POST /api/task-groups/{taskGroupId}/ensure-tasks`
  - `POST /api/task-groups/{taskGroupId}/execute`
  - `POST /api/tasks/{taskId}/execute`
  - `POST /api/tasks/{taskId}/retry`
  - `POST /api/schedule-jobs`（创建调度作业）
- scheduler-service：
  - `POST /api/schedule-jobs`
  - `POST /api/admin/seed`
  - `POST /api/admin/reset`
- agent-service：
  - `POST /agent/executions`（可视为内部接口；外网环境必须受控）

可放开（只读）：

- `/health`
- `GET /api/projects*`
- `GET /api/.../requirements*`
- `GET /api/.../task-groups`、`GET /api/.../tasks`
- `GET /api/schedule-jobs`
- `GET /api/knowledge-bases`、`GET /api/preprocess-rules`、`GET /api/audit-rules`、`GET /api/dashboard/metrics`、`GET /api/ops/*`、`GET /api/acceptance-tickets`

### 9.2 控制方式（V2 最小可落地：Header Token + 环境差异）

V2 定稿采用“最小可实施”的权限方案（不引入复杂 IAM）：

- **认证**：`X-DF-Token`（Header）静态 token
- **授权**：按接口分组（Admin / Write / Execute）配置所需权限

配置示例：

- `datafoundry.security.mode = off | token`
  - `off`：开发环境（默认）
  - `token`：测试/生产（必须）
- `datafoundry.security.token = ...`
- `datafoundry.security.adminToken = ...`（可选：与普通写入 token 区分）

实现方式：

- Spring `HandlerInterceptor`：
  - 匹配受控路径（白名单/黑名单）
  - 校验 token，不通过抛 `BizException(401000/403000)`
- 在 scheduler/agent 同样实现一套拦截器（或复用 common-core）

### 9.3 最小审计日志（必须）

对受控写接口在 ServiceImpl 记录 INFO：

- operator（从 header `X-DF-Operator`，若无则 `unknown`）
- 资源 id（projectId/requirementId/taskId 等）
- 动作类型（seed/reset/updateSchema/plan/execute/retry/createJob）

---

## 10. “接口/表不遗漏”的最终清单（作为基线验收项）

### 10.1 全部接口（现状矩阵：必须在 V2 方案中保留/兼容）

backend-service：

- `GET /health`
- `GET /api/projects`
- `GET /api/projects/{projectId}`
- `GET /api/projects/{projectId}/requirements`
- `POST /api/projects/{projectId}/requirements`
- `GET /api/projects/{projectId}/requirements/{requirementId}`
- `PUT /api/projects/{projectId}/requirements/{requirementId}`
- `PUT /api/requirements/{requirementId}/wide-tables/{wideTableId}`
- `POST /api/requirements/{requirementId}/wide-tables/{wideTableId}/preview`
- `POST /api/requirements/{requirementId}/wide-tables/{wideTableId}/plan`
- `GET /api/projects/{projectId}/requirements/{requirementId}/task-groups`
- `GET /api/projects/{projectId}/requirements/{requirementId}/tasks`
- `POST /api/task-groups/{taskGroupId}/ensure-tasks`
- `POST /api/task-groups/{taskGroupId}/execute`
- `POST /api/tasks/{taskId}/execute`
- `POST /api/tasks/{taskId}/retry`
- `GET /api/schedule-jobs`
- `POST /api/schedule-jobs`
- `GET /api/knowledge-bases`
- `GET /api/preprocess-rules`
- `GET /api/audit-rules`
- `GET /api/acceptance-tickets`
- `GET /api/dashboard/metrics`
- `GET /api/ops/overview`
- `GET /api/ops/task-status-counts`
- `GET /api/ops/data-status-counts`
- `POST /api/admin/seed`
- `POST /api/admin/reset`

scheduler-service：

- `GET /health`
- `GET /api/schedule-jobs`
- `GET /api/schedule-jobs/{jobId}`
- `POST /api/schedule-jobs`
- `POST /api/admin/seed`
- `POST /api/admin/reset`

agent-service：

- `GET /health`
- `POST /agent/executions`

### 10.2 全部数据库表（必须纳入迁移治理）

Core（14 表）：

- `projects`
- `requirements`
- `wide_tables`
- `wide_table_rows`
- `wide_table_row_snapshots`
- `backfill_requests`
- `collection_batches`
- `task_groups`
- `fetch_tasks`
- `retrieval_tasks`
- `execution_records`
- `knowledge_bases`
- `preprocess_rules`
- `audit_rules`

Scheduling（1 表）：

- `schedule_jobs`

---

## 11. 交付物清单（V2 作为最终基线必须产出）

### 11.1 代码层交付物

- `common-core`：
  - `Response<T>`
  - `ErrorCode`（枚举 + 文档）
  - `BizException`
  - `GlobalExceptionHandler`
  - `BeanCopierUtils`
  - MyBatis TypeHandler：JSON/Enum/Time
  - `SecurityInterceptor` 基础能力（可复用）
- 三服务：
  - 领域化包结构落地（api/api.impl/dao/dto/domain + 子域）
  - v2 API（`/api/v2/*`）全覆盖并返回 Response
  - MyBatis XML + resultMap 全覆盖
  - Service 接口 + Impl 全覆盖（Controller 不直连 Mapper）
  - 关键路径日志 + JavaDoc

### 11.2 数据库交付物

- Flyway 迁移脚本：
  - Core：V1 init（14 表）
  - Scheduling：V1 init（1 表），可选 V2 时间字段规范化
- 去除应用运行时 alter（删除/禁用 DemoDataService 的 schema 漂移逻辑）

### 11.3 前端对接交付物

- `NEXT_PUBLIC_API_VERSION` 切换能力
- v2 client 解包与错误处理（code/message）

