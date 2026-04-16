# datafoundry_java 改造方案（对齐“项目集开发规范与规则”）

> 生成时间：2026-04-16（Asia/Shanghai）  
> 关联现状分析文档：`docs/datafoundry_java_项目架构分析.md`

## 0. 背景与目标

当前仓库已落地：

- 前端：`data-foundry-frontend/`（Next.js 13.5.11，App Router，`/api/*` 代理）
- 后端：Maven 多模块 + 3 个 Spring Boot 服务
  - `data-foundry-backend-service`（8000，MySQL：`data_foundry_backend`）
  - `data-foundry-scheduler-service`（8200，MySQL：`data_foundry_scheduler`）
  - `data-foundry-agent-service`（8100，无库，Mock Agent）
  - `data-foundry-common-contract`（共享 DTO）
- 数据库：MySQL 脚本位于 `db/mysql/*`

本次任务：在保持“可联调、可演进”的前提下，将后端工程整体改造成**符合项目集开发规范与规则**的一套 DDD 化服务与代码规范体系，并给出尽可能详细的落地方案（接口/表不遗漏）。

---

## 1. 对开发规范与规则的理解（结合本仓库落地方式）

下面按规范条款逐条说明“我对规则的理解”以及落地时的关键点。

### 1.1 架构规范：DDD 设计服务

**理解**：

- DDD 不是“分层命名”，而是以**领域边界（Bounded Context）**为核心划分服务与模块，强调：
  - 聚合根（Aggregate Root）、实体（Entity）、值对象（Value Object）
  - 领域服务（Domain Service）、应用服务（Application Service）
  - 基础设施层（Repository/DAO、外部系统调用）
  - 统一的异常、返回、日志、校验与测试策略

**在本项目的落地**（建议）：

- 仍保留三服务拆分（backend/scheduler/agent），但需要明确边界与责任：
  - **backend-service**：业务域（Project/Requirement/WideTable/Plan/Task/Execution/Config）
  - **scheduler-service**：调度域（ScheduleJob/Trigger/History），提供可被 backend 调用的调度 API
  - **agent-service**：执行域（AgentExecution/IndicatorRetrieval），提供可被 backend/scheduler 调用的执行 API

### 1.2 技术栈

规范要求：

- Spring Boot 2.x + Spring 5.x（当前：2.7.18，符合）
- MyBatis（当前：MyBatis Spring Boot Starter 2.3.2，符合）
- Maven + dependencyManagement 统一版本（当前：引入 Spring Boot BOM + 子模块仍显式写 mybatis 版本；需调整为“版本全部由父 POM 管控”）
- 日志：Apache Commons Logging（Spring 默认桥接 JCL；代码层面应统一使用 `LogFactory`，不直接依赖 slf4j API）

### 2.1 包结构规范（API/impl/DAO/DTO/Domain）

规范给出的示例根包为：`com.htsc.demo.*`。  
**理解**：这是“组织级命名空间模板”，核心是**分层与职责**。在本仓库可以采用：

- 方案 A（严格照抄模板）：`com.htsc.demo.*`
- 方案 B（建议，保持语义）：`com.htsc.datafoundry.*`（或公司统一根包），但包结构仍按 `api / api.impl / dao / dto / domain` 组织

下文方案以 **`com.htsc.datafoundry`** 作为根包示例；如必须使用 `com.htsc.demo`，可整体替换根包前缀。

### 2.2 类命名规范

**理解**：需要实现“可读、可检索、可统一治理”：

- Service 接口：`XXXService`
- Service 实现：`XXXServiceImpl`
- Mapper：`XXXMapper`（对应 XML）
- DTO：`XXXDTO`（请求/响应对象统一 DTO）
- DO：`XXXDO`（持久化对象/数据对象）

> 注意：DDD 语境下“DO/Entity/PO”容易混用。为同时满足规范与 DDD：  
> - `domain` 下存放领域实体/值对象（业务语义）  
> - `domain.do`（或 `domain.data`）存放 MyBatis 映射的 `XXXDO`（偏数据结构）  
> - DTO 仅用于 API 层出入参，不承载业务规则

### 3.1 Service 层设计

规范要求点：

- `@Autowired` 注入（当前多为构造注入；需统一策略。若项目集要求强制 `@Autowired` 字段注入，则要遵循；否则建议保留构造注入并在规范评审时确认。本文方案按规范：使用 `@Autowired`）
- 所有 Service 必须有接口 + 实现类
- DO/DTO 转换用 BeanCopier（需要提供统一工具类，避免散落）
- 返回值统一 `Response<T>`

### 3.2 数据访问层规范（MyBatis XML）

规范要求点：

- Mapper 使用 XML（当前 backend/scheduler 使用注解 SQL，需要迁移）
- SQL 标准 MyBatis 语法
- `resultMap` 显式映射
- 参数类型明确，避免 `Object`（当前存在 `Map<String,Object>` 和 `Object` 入参，需要 DTO 化）

### 4.1 响应格式规范：`Response<T>`

**理解**：

- 所有 Controller/Api 方法统一返回 `Response<T>`（包括错误）
- 全局异常处理器负责把异常转成标准 `Response`（含 code/message）
- code 体系要可扩展（业务码/系统码）

### 5. 日志规范：Commons Logging

**理解**：

- 每个关键业务链路（创建需求、锁定 schema、计划落地、生成任务、触发调度、触发执行、回填等）记录 INFO
- 异常捕获记录 ERROR，含关键参数（脱敏）+ requestId/traceId（如有）
- 使用：`private static final Log log = LogFactory.getLog(Xxx.class);`

### 6. 依赖管理规范

**理解**：

- 父 POM 使用 `dependencyManagement` 管控版本（可以 import Spring Boot BOM）
- 子模块依赖不写版本
- 遵循最小化引入

### 7. 注释规范（JavaDoc）

**理解**：

- API 接口（建议为 `api` 包下的接口）每个方法必须 JavaDoc：功能、参数、返回值（类型含义）
- 复杂逻辑（例如 TaskPlan 生成规则）需要注释解释“为什么这么做”

### 8. 异常处理规范

**理解**：

- 引入自定义业务异常：`BizException`（含 code/message/建议）
- 全局异常处理：`@RestControllerAdvice` -> 统一 `Response` 输出
- 不在 Controller 中随处 `throw ResponseStatusException`（当前存在，需要替换）

### 9. 测试规范

**理解**：

- Service 层方法单测覆盖正常/异常
- 外部依赖（DAO、HTTP Client）用 Mock（Mockito）
- 多模块流程用集成测试（SpringBootTest + Testcontainers 可选；若项目集不允许则本地 MySQL）

### 10. 安全规范（输入校验、权限控制）

**理解**：

- 所有外部入参 DTO 使用 `javax.validation` 注解 + `@Valid`
- 基础防护：XSS、SQL 注入（MyBatis 参数化）、输出转义（前端）
- 权限：敏感操作（`/api/admin/*`、执行/重试、计划落地、schema 更新）需鉴权（最少要有“开关/拦截器”，哪怕当前是 demo）

### 11. 性能优化建议

**理解**：

- DB：索引（按查询条件/排序字段），避免 N+1（必要时 join/批量查询）
- 批量写入：MyBatis batch（例如生成 fetch_tasks）
- 缓存：字典类数据（knowledge_bases、rules）可缓存（本地/Redis 视项目集要求）

---

## 2. 现状方案 vs 改造规范：差异点清单（基于当前代码与架构分析）

> 下文差异以“必须改 / 建议改 / 可暂缓”标记。

### 2.1 包结构与命名（必须改）

- 当前根包为 `com.huatai.datafoundry.*`，且按 `backend/web`、`backend/persistence`、`backend/service` 分布；不符合要求的 `api / api.impl / dao / dto / domain` 结构。
- Controller 未按“API 接口定义 + impl 实现”拆分（当前 Controller 直接类）。
- DTO 命名与分层不统一：Controller 内嵌 Request/Response 类，或直接返回 Record/Map。
- DO/DTO/Domain 未明确分离：`*Record` 同时承担“持久化对象 + API 输出对象”的角色。

### 2.2 Service 层（必须改）

- 当前 Service 并非“接口 + impl”全覆盖，且 Controller 直接依赖 Mapper（例如 `ProjectController`）。
- DO/DTO 转换未使用 BeanCopier，JSON 解析/组装散落在 Controller。
- 返回值不统一：大量直接返回 `Map` / `List` / POJO，未使用 `Response<T>`。

### 2.3 MyBatis 使用方式（必须改）

- 当前 Mapper 使用注解 SQL（`@Select/@Insert/...`），不符合“XML + resultMap”。
- 参数类型存在 `Object` / `Map<String,Object>`（例如部分 API body），不符合“参数类型明确”。

### 2.4 异常与响应（必须改）

- 当前大量使用 `ResponseStatusException` 或 try/catch 返回 Map（`ok/message`），未统一 `Response<T>`。
- 无全局异常处理器。
- code/message 缺少统一体系。

### 2.5 日志（必须改）

- 当前关键业务路径基本无日志；也未统一使用 Commons Logging API（虽然 Spring 内部是 JCL，但业务代码缺少规范化日志）。

### 2.6 dependencyManagement（必须改）

- 子模块仍显式指定部分依赖版本（如 mybatis starter）。
- 需要保证“版本只在父 POM 统一声明”，子模块不写版本。

### 2.7 注释/JavaDoc（必须改）

- API 方法缺少 JavaDoc。
- TaskPlan 等核心规则说明不足（目前只有少量注释，需补齐）。

### 2.8 安全与权限（必须改/可暂缓）

- 输入校验：部分接口缺少 `@Valid` 校验。
- 权限控制：`/api/admin/seed`、`/api/admin/reset` 等敏感接口无任何限制。

### 2.9 测试（建议改）

- 目前缺少 Service 单测与集成测试体系（仅前端有 Vitest）。

### 2.10 数据库一致性（必须改/建议改）

- backend DB：`db/mysql/backend/001_schema.sql` 仅覆盖 projects/requirements；而代码已依赖 wide_tables/task_groups/fetch_tasks 等（在完整脚本 `002_full_schema.sql` 才完整）。
- DemoDataService 运行时 `alter table add column` 属于“漂移式”补字段，不适合作为规范化迁移方案（建议引入迁移脚本或 Flyway）。
- 外键/约束/索引策略尚未统一梳理（应结合查询与任务生成做索引设计）。

---

## 3. 改造总体方案（尽可能不遗漏接口与表）

### 3.1 改造目标

1. 服务仍按三大边界：backend / scheduler / agent
2. 每个服务内部按 DDD 思路做**分层与职责**，并严格满足包结构、命名、返回、DAO、日志、异常、注释规范
3. 所有 API 返回 `Response<T>`，异常统一走全局处理器
4. MyBatis 迁移到 XML + resultMap，参数/返回 DTO/DO 化
5. 数据库脚本统一为“可复现、可迁移”的版本化脚本，覆盖全部表
6. 逐步补齐单元测试与关键流程集成测试

### 3.2 代码目录结构调整（Maven 模块 + 包结构）

#### 3.2.1 Maven 模块建议

在保持现有 4 模块的基础上，新增一个“公共核心模块”（避免 Response/异常/工具在各服务重复）：

- `data-foundry-common-core`（新增）
  - `Response<T>`、错误码、BizException、全局异常处理基类、BeanCopier 工具、通用校验/工具
- `data-foundry-common-contract`（保留/调整）
  - 仅放跨服务 DTO（例如 scheduler 的 ScheduleJobDTO、agent 的 AgentExecutionRequestDTO/ResponseDTO）
- `data-foundry-backend-service`
- `data-foundry-scheduler-service`
- `data-foundry-agent-service`

父 POM（根 `pom.xml`）：

- 继续 import Spring Boot BOM（版本锁定）
- 将所有“非 BOM 管控”的依赖版本收敛到 `dependencyManagement`
- 子模块依赖不写版本

#### 3.2.2 每个服务的包结构（按规范）

以 backend-service 为例（scheduler/agent 同理）：

```text
com.htsc.datafoundry.backend
├─ api/                # 接口定义（Spring MVC 注解 + JavaDoc）
├─ api/impl/           # 接口实现（Controller），实现 api 接口
├─ dto/                # DTO：XXXDTO（RequestDTO/ResponseDTO）
├─ domain/             # 领域对象（实体/值对象/聚合根/领域服务）
│  └─ do/              # 持久化 DO：XXXDO（与 MyBatis resultMap 对齐）
├─ service/            # Service 接口：XXXService
└─ service/impl/       # Service 实现：XXXServiceImpl
└─ dao/                # MyBatis Mapper 接口：XXXMapper
```

资源目录（MyBatis XML）：

```text
src/main/resources/
└─ mapper/
   ├─ ProjectMapper.xml
   ├─ RequirementMapper.xml
   └─ ...
```

> 说明：规范中“DAO 包”为 `com.htsc.demo.dao`。本方案保持 `dao` 命名，并将 MyBatis mapper 放在该包。

### 3.3 统一响应、异常、日志、转换（核心落地组件）

#### 3.3.1 Response 统一

在 `data-foundry-common-core` 提供：

```java
public class Response<T> {
  private Integer code;
  private String message;
  private T data;
  // getter/setter
  public static <T> Response<T> success(String message, T data) { ... }
  public static <T> Response<T> failure(Integer code, String message) { ... }
}
```

建议建立 code 体系（示例）：

- `0`：成功
- `400xxx`：参数/校验类错误
- `404xxx`：资源不存在
- `409xxx`：冲突（schema locked）
- `500xxx`：系统错误

#### 3.3.2 BizException + 全局异常处理

- `BizException`：包含 `code/message`（可附带建议）
- `GlobalExceptionHandler`：`@RestControllerAdvice`，将所有异常统一转 `Response.failure(...)`

#### 3.3.3 BeanCopier 转换

提供 `BeanCopierUtils`：

- 内部缓存 `BeanCopier`（key：sourceClass->targetClass）
- DO <-> DTO 转换集中化

#### 3.3.4 日志

每个关键 ServiceImpl 使用：

- `private static final Log log = LogFactory.getLog(XxxServiceImpl.class);`

并在：

- 创建/更新需求、宽表变更、锁定 schema、计划落地、生成任务、执行/重试、调度创建

记录 INFO；异常记录 ERROR（含关键 id/参数）。

---

## 4. 接口改造方案（不遗漏：列出“当前全部接口”并给出规范化后的定义）

> 目标：**所有接口**均返回 `Response<T>`，并在 `api` 包用接口定义（带 JavaDoc），实现类在 `api.impl`。

### 4.0 接口矩阵（逐条列出：不遗漏）

> 说明：`现状代码位置` 为当前 Controller 文件路径；`目标归属` 为建议的 DDD/分层归属（可按实际进一步细化）。

#### 4.0.1 backend-service（8000）

| 方法 | 路径 | 现状代码位置 | 目标 API 接口方法（示例） | 请求 DTO（示例） | 响应 data（示例） | 目标归属 |
|---|---|---|---|---|---|---|
| GET | `/health` | `data-foundry-backend-service/src/main/java/com/huatai/datafoundry/backend/web/HealthController.java` | `HealthApi.health()` | - | `HealthDTO` | Platform |
| GET | `/api/projects` | `data-foundry-backend-service/src/main/java/com/huatai/datafoundry/backend/web/ProjectController.java` | `ProjectApi.listProjects()` | - | `List<ProjectDTO>` | Project |
| GET | `/api/projects/{projectId}` | `data-foundry-backend-service/src/main/java/com/huatai/datafoundry/backend/web/ProjectController.java` | `ProjectApi.getProject(String projectId)` | - | `ProjectDTO` | Project |
| GET | `/api/projects/{projectId}/requirements` | `data-foundry-backend-service/src/main/java/com/huatai/datafoundry/backend/web/RequirementController.java` | `RequirementApi.listByProject(String projectId)` | - | `List<RequirementWithWideTableDTO>` | Requirement/WideTable |
| POST | `/api/projects/{projectId}/requirements` | `data-foundry-backend-service/src/main/java/com/huatai/datafoundry/backend/web/RequirementController.java` | `RequirementApi.create(String projectId, RequirementCreateDTO body)` | `RequirementCreateDTO` | `RequirementWithWideTableDTO` | Requirement/WideTable |
| GET | `/api/projects/{projectId}/requirements/{requirementId}` | `data-foundry-backend-service/src/main/java/com/huatai/datafoundry/backend/web/RequirementController.java` | `RequirementApi.get(String projectId, String requirementId)` | - | `RequirementDTO`（或 WithWideTable） | Requirement |
| PUT | `/api/projects/{projectId}/requirements/{requirementId}` | `data-foundry-backend-service/src/main/java/com/huatai/datafoundry/backend/web/RequirementController.java` | `RequirementApi.update(String projectId, String requirementId, RequirementUpdateDTO body)` | `RequirementUpdateDTO` | `RequirementDTO`（或 WithWideTable） | Requirement/Plan |
| PUT | `/api/requirements/{requirementId}/wide-tables/{wideTableId}` | `data-foundry-backend-service/src/main/java/com/huatai/datafoundry/backend/web/RequirementWideTableController.java` | `WideTableApi.update(String requirementId, String wideTableId, WideTableUpdateDTO body)` | `WideTableUpdateDTO` | `WideTableDTO` | WideTable |
| POST | `/api/requirements/{requirementId}/wide-tables/{wideTableId}/preview` | `data-foundry-backend-service/src/main/java/com/huatai/datafoundry/backend/web/WideTablePlanController.java` | `WideTablePlanApi.persistPreview(String requirementId, String wideTableId, WideTablePreviewPersistDTO body)` | `WideTablePreviewPersistDTO` | `OkDTO` | Plan |
| POST | `/api/requirements/{requirementId}/wide-tables/{wideTableId}/plan` | `data-foundry-backend-service/src/main/java/com/huatai/datafoundry/backend/web/WideTablePlanController.java` | `WideTablePlanApi.persistPlan(String requirementId, String wideTableId, WideTablePlanPersistDTO body)` | `WideTablePlanPersistDTO` | `PlanPersistResultDTO`（或 OkDTO） | Plan |
| GET | `/api/projects/{projectId}/requirements/{requirementId}/task-groups` | `data-foundry-backend-service/src/main/java/com/huatai/datafoundry/backend/web/RequirementTaskController.java` | `TaskQueryApi.listTaskGroups(String projectId, String requirementId)` | - | `List<TaskGroupDTO>` | Task |
| GET | `/api/projects/{projectId}/requirements/{requirementId}/tasks` | `data-foundry-backend-service/src/main/java/com/huatai/datafoundry/backend/web/RequirementTaskController.java` | `TaskQueryApi.listFetchTasks(String projectId, String requirementId)` | - | `List<FetchTaskDTO>` | Task |
| POST | `/api/task-groups/{taskGroupId}/ensure-tasks` | `data-foundry-backend-service/src/main/java/com/huatai/datafoundry/backend/web/TaskExecutionController.java` | `ExecutionApi.ensureTasks(String taskGroupId)` | - | `EnsureTasksResultDTO` | Execution |
| POST | `/api/task-groups/{taskGroupId}/execute` | `data-foundry-backend-service/src/main/java/com/huatai/datafoundry/backend/web/TaskExecutionController.java` | `ExecutionApi.executeTaskGroup(String taskGroupId, ExecuteTaskGroupDTO body)` | `ExecuteTaskGroupDTO`（可为空） | `ExecutionResultDTO` | Execution |
| POST | `/api/tasks/{taskId}/execute` | `data-foundry-backend-service/src/main/java/com/huatai/datafoundry/backend/web/TaskExecutionController.java` | `ExecutionApi.executeTask(String taskId)` | - | `ExecutionResultDTO` | Execution |
| POST | `/api/tasks/{taskId}/retry` | `data-foundry-backend-service/src/main/java/com/huatai/datafoundry/backend/web/TaskExecutionController.java` | `ExecutionApi.retryTask(String taskId)` | - | `ExecutionResultDTO` | Execution |
| GET | `/api/schedule-jobs` | `data-foundry-backend-service/src/main/java/com/huatai/datafoundry/backend/web/ScheduleJobFacadeController.java` | `ScheduleJobApi.list(String triggerType, String status)` | - | `List<ScheduleJobDTO>` | Scheduler Facade |
| POST | `/api/schedule-jobs` | `data-foundry-backend-service/src/main/java/com/huatai/datafoundry/backend/web/ScheduleJobFacadeController.java` | `ScheduleJobApi.create(CreateScheduleJobDTO body)` | `CreateScheduleJobDTO` | `ScheduleJobDTO` | Scheduler Facade |
| GET | `/api/knowledge-bases` | `data-foundry-backend-service/src/main/java/com/huatai/datafoundry/backend/web/PlatformStubController.java` | `PlatformApi.listKnowledgeBases()` | - | `List<KnowledgeBaseDTO>` | Platform/Config |
| GET | `/api/preprocess-rules` | `data-foundry-backend-service/src/main/java/com/huatai/datafoundry/backend/web/PlatformStubController.java` | `PlatformApi.listPreprocessRules()` | - | `List<PreprocessRuleDTO>` | Platform/Config |
| GET | `/api/audit-rules` | `data-foundry-backend-service/src/main/java/com/huatai/datafoundry/backend/web/PlatformStubController.java` | `PlatformApi.listAuditRules()` | - | `List<AuditRuleDTO>` | Platform/Config |
| GET | `/api/acceptance-tickets` | `data-foundry-backend-service/src/main/java/com/huatai/datafoundry/backend/web/PlatformStubController.java` | `PlatformApi.listAcceptanceTickets()` | - | `List<AcceptanceTicketDTO>` | Platform |
| GET | `/api/dashboard/metrics` | `data-foundry-backend-service/src/main/java/com/huatai/datafoundry/backend/web/PlatformStubController.java` | `PlatformApi.dashboardMetrics()` | - | `DashboardMetricsDTO` | Platform |
| GET | `/api/ops/overview` | `data-foundry-backend-service/src/main/java/com/huatai/datafoundry/backend/web/PlatformStubController.java` | `OpsApi.overview()` | - | `List<OpsOverviewDTO>` | Ops |
| GET | `/api/ops/task-status-counts` | `data-foundry-backend-service/src/main/java/com/huatai/datafoundry/backend/web/PlatformStubController.java` | `OpsApi.taskStatusCounts()` | - | `List<TaskStatusCountDTO>` | Ops |
| GET | `/api/ops/data-status-counts` | `data-foundry-backend-service/src/main/java/com/huatai/datafoundry/backend/web/PlatformStubController.java` | `OpsApi.dataStatusCounts()` | - | `List<DataStatusCountDTO>` | Ops |
| POST | `/api/admin/seed` | `data-foundry-backend-service/src/main/java/com/huatai/datafoundry/backend/web/PlatformStubController.java` | `AdminApi.seed()` | - | `AdminResultDTO` | Admin |
| POST | `/api/admin/reset` | `data-foundry-backend-service/src/main/java/com/huatai/datafoundry/backend/web/PlatformStubController.java` | `AdminApi.reset()` | - | `AdminResultDTO` | Admin |

#### 4.0.2 scheduler-service（8200）

| 方法 | 路径 | 现状代码位置 | 目标 API 接口方法（示例） | 请求 DTO（示例） | 响应 data（示例） | 目标归属 |
|---|---|---|---|---|---|---|
| GET | `/health` | `data-foundry-scheduler-service/src/main/java/com/huatai/datafoundry/scheduler/web/HealthController.java` | `HealthApi.health()` | - | `HealthDTO` | Platform |
| GET | `/api/schedule-jobs` | `data-foundry-scheduler-service/src/main/java/com/huatai/datafoundry/scheduler/web/ScheduleJobController.java` | `ScheduleJobApi.list(String triggerType, String status)` | - | `List<ScheduleJobDTO>` | Scheduler |
| GET | `/api/schedule-jobs/{jobId}` | `data-foundry-scheduler-service/src/main/java/com/huatai/datafoundry/scheduler/web/ScheduleJobController.java` | `ScheduleJobApi.get(String jobId)` | - | `ScheduleJobDTO` | Scheduler |
| POST | `/api/schedule-jobs` | `data-foundry-scheduler-service/src/main/java/com/huatai/datafoundry/scheduler/web/ScheduleJobController.java` | `ScheduleJobApi.create(CreateScheduleJobDTO body)` | `CreateScheduleJobDTO` | `ScheduleJobDTO` | Scheduler |
| POST | `/api/admin/seed` | `data-foundry-scheduler-service/src/main/java/com/huatai/datafoundry/scheduler/web/AdminController.java` | `AdminApi.seed()` | - | `AdminResultDTO` | Admin |
| POST | `/api/admin/reset` | `data-foundry-scheduler-service/src/main/java/com/huatai/datafoundry/scheduler/web/AdminController.java` | `AdminApi.reset()` | - | `AdminResultDTO` | Admin |

#### 4.0.3 agent-service（8100）

| 方法 | 路径 | 现状代码位置 | 目标 API 接口方法（示例） | 请求 DTO（示例） | 响应 data（示例） | 目标归属 |
|---|---|---|---|---|---|---|
| GET | `/health` | `data-foundry-agent-service/src/main/java/com/huatai/datafoundry/agent/web/HealthController.java` | `HealthApi.health()` | - | `HealthDTO` | Platform |
| POST | `/agent/executions` | `data-foundry-agent-service/src/main/java/com/huatai/datafoundry/agent/web/AgentExecutionController.java` | `AgentExecutionApi.execute(AgentExecutionRequestDTO body)` | `AgentExecutionRequestDTO` | `AgentExecutionResponseDTO` | Agent |

### 4.1 backend-service（8000）接口清单与调整

#### 4.1.1 健康检查

- 现状接口：`GET /health`
- 目标接口：保持不变  
  - 返回：`Response<HealthDTO>`

#### 4.1.2 平台占位/配置接口（当前为 stub，但也需规范化）

现状接口（全部保留，不遗漏）：

- `GET /api/knowledge-bases`
- `GET /api/preprocess-rules`
- `GET /api/audit-rules`
- `GET /api/acceptance-tickets`
- `GET /api/dashboard/metrics`
- `GET /api/ops/overview`
- `GET /api/ops/task-status-counts`
- `GET /api/ops/data-status-counts`

目标调整：

- 全部返回 `Response<List<...DTO>>` 或 `Response<...DTO>`
- 由 `PlatformQueryService` 提供接口（接口：`PlatformQueryService`，实现：`PlatformQueryServiceImpl`）
- DTO 明确化，禁止 `Map<String,Object>`

建议 DTO：

- `KnowledgeBaseDTO`
- `PreprocessRuleDTO`
- `AuditRuleDTO`
- `AcceptanceTicketDTO`
- `DashboardMetricsDTO`
- `OpsOverviewDTO`
- `TaskStatusCountDTO`
- `DataStatusCountDTO`

#### 4.1.3 Admin（敏感接口）

现状接口（全部保留，不遗漏）：

- `POST /api/admin/seed`
- `POST /api/admin/reset`

目标调整：

- 返回 `Response<AdminResultDTO>`
- 增加权限控制（至少：开关/拦截器，或简单 token）
- 业务逻辑下沉到 `AdminService`（接口/实现）

#### 4.1.4 Project

现状接口（全部保留，不遗漏）：

- `GET /api/projects`
- `GET /api/projects/{projectId}`

目标调整：

- 返回：
  - `Response<List<ProjectDTO>>`
  - `Response<ProjectDTO>`
- Controller（api.impl）不直接访问 Mapper，统一走 `ProjectService`
- DAO 改为 XML Mapper：`ProjectMapper` + `ProjectMapper.xml`
- 数据对象命名：
  - DO：`ProjectDO`
  - DTO：`ProjectDTO`

#### 4.1.5 Requirement + Primary WideTable

现状接口（全部保留，不遗漏）：

- `GET  /api/projects/{projectId}/requirements`
- `POST /api/projects/{projectId}/requirements`
- `GET  /api/projects/{projectId}/requirements/{requirementId}`
- `PUT  /api/projects/{projectId}/requirements/{requirementId}`

目标调整：

- 返回：
  - `Response<List<RequirementWithWideTableDTO>>`
  - `Response<RequirementWithWideTableDTO>`（或拆分 RequirementDTO + WideTableDTO）
- 请求 DTO：
  - `RequirementCreateDTO`
  - `RequirementUpdateDTO`
- 业务规则放到 ServiceImpl：
  - “status=ready -> schema_locked=true + 生成默认 task_groups”
  - “schema_locked 时禁止 definition edits”
- 禁止 Controller 里拼 JSON / 捕获异常后吞掉；统一异常抛 `BizException`

#### 4.1.6 WideTable 更新

现状接口（不遗漏）：

- `PUT /api/requirements/{requirementId}/wide-tables/{wideTableId}`

目标调整：

- 请求 DTO：`WideTableUpdateDTO`（字段类型明确，schema/scope/indicatorGroups/scheduleRules 使用结构化 DTO，而非 `Object`）
- 返回：`Response<WideTableDTO>`
- schema 锁定冲突：抛 `BizException(409xxx, "...")`

#### 4.1.7 Plan / Preview

现状接口（不遗漏）：

- `POST /api/requirements/{requirementId}/wide-tables/{wideTableId}/preview`
- `POST /api/requirements/{requirementId}/wide-tables/{wideTableId}/plan`

目标调整：

- 请求 DTO：
  - `WideTablePreviewPersistDTO`（即便当前占位，也要固定结构）
  - `WideTablePlanPersistDTO`（包含 `taskGroups: List<TaskGroupDTO>`，参数类型明确）
- 返回：`Response<OkDTO>` 或 `Response<PlanPersistResultDTO>`
- Service：
  - `TaskPlanService`（接口） + `TaskPlanServiceImpl`（实现）
  - `ensureDefaultTaskGroupsOnSubmit`、`upsertPlanTaskGroups`、`ensureFetchTasksForTaskGroup` 等逻辑从当前类迁移到实现类，并补齐日志与注释

#### 4.1.8 TaskGroup / FetchTask 查询

现状接口（不遗漏）：

- `GET /api/projects/{projectId}/requirements/{requirementId}/task-groups`
- `GET /api/projects/{projectId}/requirements/{requirementId}/tasks`

目标调整：

- 返回：
  - `Response<List<TaskGroupDTO>>`
  - `Response<List<FetchTaskDTO>>`
- DAO：XML + resultMap（禁止直接返回 DO 给 API）
- 参数校验：projectId/requirementId 非空、格式校验

#### 4.1.9 执行/重试（占位执行也要规范化）

现状接口（不遗漏）：

- `POST /api/task-groups/{taskGroupId}/execute`
- `POST /api/task-groups/{taskGroupId}/ensure-tasks`
- `POST /api/tasks/{taskId}/execute`
- `POST /api/tasks/{taskId}/retry`

目标调整：

- 返回：`Response<ExecutionResultDTO>`（或 `Response<OkDTO>` + 明确字段）
- 输入 DTO：
  - `ExecuteTaskGroupDTO`（body 当前可为空，也要定义 DTO 结构）
  - `ExecuteTaskDTO` / `RetryTaskDTO`
- Service：
  - `ExecutionService`（接口） + `ExecutionServiceImpl`
- 日志：记录 taskGroupId/taskId、触发者 operator（后续从鉴权上下文获取）
- 将“状态流转”规则集中化（避免散落）

#### 4.1.10 ScheduleJobs Facade（backend -> scheduler）

现状接口（不遗漏）：

- `GET  /api/schedule-jobs?trigger_type=&status=`
- `POST /api/schedule-jobs`

目标调整：

- API 返回 `Response<List<ScheduleJobDTO>>` / `Response<ScheduleJobDTO>`
- 引入 `SchedulerClient`（基础设施层），封装 RestTemplate 调用、超时、错误码映射
- `api` 层参数类型明确，禁止 `Object body`：定义 `CreateScheduleJobDTO`

#### 4.1.11 Spring Actuator

现状：已引入 `spring-boot-starter-actuator`。  
目标：若对外暴露需纳入访问控制；若只用于内部，可保留默认 `/actuator/*` 并在网关层限制。

---

### 4.2 scheduler-service（8200）接口清单与调整

现状接口（不遗漏）：

- `GET /health`
- `GET /api/schedule-jobs?trigger_type=&status=`
- `GET /api/schedule-jobs/{jobId}`
- `POST /api/schedule-jobs`
- `POST /api/admin/seed`
- `POST /api/admin/reset`

目标调整：

- 全部返回 `Response<T>`
- `CreateScheduleJobInput` 改为 `CreateScheduleJobDTO`
- Service：
  - `ScheduleJobService` + `ScheduleJobServiceImpl`
  - Admin 同 backend：`AdminService` + 权限控制
- DAO：
  - `ScheduleJobMapper` 改为 XML + resultMap
  - DO：`ScheduleJobDO`，DTO：`ScheduleJobDTO`

---

### 4.3 agent-service（8100）接口清单与调整

现状接口（不遗漏）：

- `GET /health`
- `POST /agent/executions`

目标调整：

- 返回：
  - `Response<HealthDTO>`
  - `Response<AgentExecutionResponseDTO>`
- 入参 DTO：`AgentExecutionRequestDTO`（来自 `data-foundry-common-contract`，或 agent 自己 dto 包并在 contract 中复用）
- 业务逻辑：
  - `AgentExecutionService` + `AgentExecutionServiceImpl`
  - Mock 实现作为 `MockAgentExecutionServiceImpl` 或通过配置切换

---

## 5. 数据库改造方案（不遗漏：列出全部表，并说明“当前/目标/调整点”）

### 5.1 总体策略

1. backend 与 scheduler 继续拆库（符合服务边界与隔离）
2. 禁止运行时 `alter table` 漂移补字段：改为**版本化迁移脚本**
3. 建议引入 Flyway（Spring Boot 原生支持）：
   - backend-service：`classpath:db/migration/backend/V1__init.sql ...`
   - scheduler-service：`classpath:db/migration/scheduler/V1__init.sql ...`
   - 如项目集不允许引入 Flyway，则至少保证 `db/mysql/*` 脚本分版本并严格执行

### 5.2 backend DB：`data_foundry_backend`

#### 5.2.1 现状脚本与问题

- `db/mysql/backend/001_schema.sql`：只含 `projects`、`requirements`（与当前代码依赖不完全一致）
- `db/mysql/backend/002_full_schema.sql`：包含 14 张表（可作为目标态基准）

目标：以 `002_full_schema.sql` 的 14 张表作为**目标 schema**，并补齐：

- 外键/约束（至少 requirement_id/wide_table_id/task_group_id 的关联约束）
- 必要索引（按查询条件 + 排序字段）
- 审计字段统一（created_at/updated_at 已有，需保证所有表一致）

#### 5.2.2 backend 全量表清单（14 张，不遗漏）

> 下面字段来自 `db/mysql/backend/002_full_schema.sql`（按“表的职责 + 关键字段 + 建议调整点”描述）。

1) `projects`  
关键字段：
- `id`、`sort_order`、`name`、`owner_team`、`status`、`business_background`、`data_source(JSON)`、`created_at/updated_at`  
建议调整点：
- 为 `id` 保持 varchar(64) 统一
- `data_source` 建议给出 JSON 结构约束（在代码 DTO 层校验）

2) `requirements`  
关键字段：
- `id`、`sort_order`、`project_id`、`title`、`phase`、`schema_locked`、`status`、`owner/assignee`
- `business_goal/background_knowledge/business_boundary/delivery_scope`
- `data_update_enabled/data_update_mode`
- `processing_rule_drafts(JSON)`、`collection_policy(JSON)`、`created_at/updated_at`  
建议调整点：
- 增加 `INDEX idx_requirements_project_id(project_id)`（001_schema 已有）
- `status/phase/data_update_mode` 建议枚举化（代码常量统一）

3) `wide_tables`  
关键字段：
- `id`、`requirement_id`、`title`、`table_name`
- `schema_version`、`schema_json`、`scope_json`、`indicator_groups_json`、`schedule_rules_json`
- `semantic_time_axis`、`collection_coverage_mode`、`record_count`、`status`、`created_at/updated_at`  
建议调整点：
- `requirement_id` 外键（或至少索引）
- `table_name` 命名规则与唯一性策略（是否允许同名）

4) `wide_table_rows`  
关键字段：
- 复合键语义：`wide_table_id + row_id`
- `requirement_id`、`schema_version`、`plan_version`
- `row_status`、`dimension_values_json`、`business_date`、`row_binding_key`
- `indicator_values_json`、`system_values_json`  
建议调整点：
- 建议补充 `PRIMARY KEY (wide_table_id, row_id)` 或唯一约束（按脚本实际定义为主）
- 为 `row_binding_key` 建索引（若常用于定位/去重）

5) `wide_table_row_snapshots`  
关键字段：
- `batch_id`、`wide_table_id`、`row_id`、`row_binding_key`、`business_date`
- `row_status`、`dimension_values_json/indicator_values_json/system_values_json`
- `created_at/updated_at`  
建议调整点：
- 与 `collection_batches.id` 关联约束（batch_id）

6) `backfill_requests`  
关键字段：
- `id`、`requirement_id`、`wide_table_id`
- `start_business_date/end_business_date`
- `requested_by`、`origin`、`status`、`reason`  
建议调整点：
- 对 `(requirement_id, wide_table_id, status)` 建索引（按查询场景）

7) `collection_batches`  
关键字段：
- `id`、`requirement_id`、`wide_table_id`
- `snapshot_at/snapshot_label`
- `coverage_mode/semantic_time_axis`
- `status/is_current/plan_version/triggered_by`
- `start_business_date/end_business_date`
- `created_at/updated_at`  
建议调整点：
- 对 `(wide_table_id, is_current)` 建索引（当前批次）

8) `task_groups`  
关键字段：
- `id`、`requirement_id`、`wide_table_id`、`batch_id`
- `business_date/source_type/status`
- `schedule_rule_id/backfill_request_id`
- `plan_version/group_kind`
- `partition_type/partition_key/partition_label`
- `total_tasks/completed_tasks/failed_tasks/triggered_by`
- `created_at/updated_at`  
建议调整点：
- 对 `(requirement_id, status)`、`(wide_table_id, batch_id)` 建索引（列表/筛选）

9) `fetch_tasks`  
关键字段：
- `id`（varchar(128)）
- `requirement_id/wide_table_id/task_group_id/batch_id/row_id`
- `indicator_group_id/indicator_group_name/name`
- `schema_version/execution_mode/indicator_keys_json/dimension_values_json`
- `business_date/status/can_rerun/invalidated_reason/owner/confidence`
- `plan_version/row_binding_key`
- `created_at/updated_at`  
建议调整点：
- 对 `(task_group_id, status)` 建索引（任务组内查询）
- `id` 生成规则需统一（避免过长/冲突）

10) `retrieval_tasks`  
关键字段：
- `id`、`parent_task_id`、`wide_table_id`、`row_id`
- `indicator_key/query/status/confidence/narrow_row_json`  
建议调整点：
- 对 `parent_task_id` 建索引（按任务聚合）

11) `execution_records`  
关键字段：
- `id`、`task_id`、`trigger_type/status`
- `started_at/ended_at/operator/output_ref/log_ref`  
建议调整点：
- 对 `(task_id, started_at)` 建索引（执行历史）

12) `knowledge_bases`  
关键字段：
- `id/name/description/document_count/status/last_updated`  
建议调整点：
- 与 `/api/knowledge-bases` 的 DTO 对齐

13) `preprocess_rules`  
关键字段：
- `id/name/source/enabled/category/expression/sample_issue`
- `indicator_bindings_json/filling_config_json`  
建议调整点：
- enabled/分类索引（如用于筛选）

14) `audit_rules`  
关键字段：
- `id/name/mode/scenario_rigour/condition_expr/action_text/enabled`  
建议调整点：
- enabled/模式索引（如用于筛选）

---

### 5.3 scheduler DB：`data_foundry_scheduler`

表清单（1 张，不遗漏）：

1) `schedule_jobs`（`db/mysql/scheduler/001_schema.sql`）
- `id`、`task_group_id`、`task_id`
- `trigger_type/status`
- `started_at/ended_at/operator/log_ref`
- `created_at`（含索引 `idx_schedule_jobs_created_at`）

建议调整点：

- `started_at/ended_at` 当前为 varchar(64)，建议统一为 `DATETIME`（与 backend execution_records 对齐），或明确 ISO8601 文本策略并在 DTO 校验。
- 增加 `(status, created_at)` 复合索引（若经常按状态筛选）

---

## 6. 迁移实施步骤（建议里程碑）

为降低风险，建议分阶段改造（每阶段可运行、可回归）。

### Phase 1：规范底座（Response/异常/日志/包结构骨架）

- 新增 `data-foundry-common-core`
- 引入 `Response<T>`、`BizException`、`GlobalExceptionHandler`、`BeanCopierUtils`
- backend/scheduler/agent：新增 `api` 接口与 `api.impl` 实现壳子（先不改业务逻辑）
- 统一日志 API（Commons Logging）与关键路径日志

### Phase 2：DAO 迁移到 MyBatis XML

- 将所有注解 Mapper 改为 XML：
  - backend：Project/Requirement/WideTable/TaskGroup/FetchTask
  - scheduler：ScheduleJob
- 完整引入 DO + resultMap + 参数类型明确化

### Phase 3：Service 层接口化 + Controller 退耦

- Controller 只做参数校验与调用 Service
- Service 接口/实现补齐，替换 Controller 直连 Mapper
- DO/DTO 转换统一走 BeanCopier（必要处手工补字段）

### Phase 4：接口契约稳定 + 前端联调回归

- 确保所有“现有接口路径”仍可用（或提供兼容层/重定向）
- 前端 `/api/*` 代理继续生效
- 回归关键页面流程：projects -> requirement -> plan -> tasks -> execute -> scheduling/ops

### Phase 5：数据库脚本版本化 + 清理漂移逻辑

- 以 `002_full_schema.sql` 为基准，生成版本化迁移（Flyway 或手动版本脚本）
- 删除 `DemoDataService.ensureSchemaColumns()` 这类运行时 alter（改成迁移脚本）

### Phase 6：测试补齐与安全开关

- Service 单测覆盖核心流程
- `admin/execute/retry/plan` 增加权限拦截（至少环境开关 + token）

---

## 7. 风险点与注意事项

- **前端依赖返回字段结构**：引入 `Response<T>` 会改变 JSON 结构，必须统一前端 API client（或提供兼容：旧路径继续返回旧结构，新增 `/v2/...` 返回 Response；建议一次性切换）
- **MyBatis 注解转 XML**：resultMap 映射与字段命名（snake_case/camelCase）需严格校验
- **数据库脚本切换**：从 001 -> 002_full，会影响本地数据；建议提供一键初始化/重置脚本，并明确禁止生产运行 002 的 drop 行为
- **时间字段类型**：scheduler 的 started_at/ended_at 若改为 DATETIME，需要同步代码与历史数据处理策略
