# datafoundry_java 全项目 DDD 分层重构方案（按“子域/上下文 + 分层”包命名规范）

> 目标：在不破坏现有联调的前提下，把 `data-foundry-*` 三个服务统一重构为 DDD 分层架构，并完成 Controller 接口聚合（同一应用服务下路径风格统一 + legacy 兼容）。
>
> 包命名规范（以图片为准）：统一采用  
> `com.huatai.datafoundry.<service>.<context>.<layer>...`  
> - `<service>`：`backend` / `scheduler` / `agent`  
> - `<context>`：子域/限界上下文（如 `requirement`、`project`、`task`、`schedule`、`ops`）  
> - `<layer>`：`interfaces` / `application` / `domain` / `infrastructure`

---

## 1. 总体架构与依赖规则

### 1.1 服务与上下文（Bounded Context）划分

| Bounded Context | 服务模块 | DB | 责任边界 |
|---|---|---|---|
| Core | `data-foundry-backend-service` | `data_foundry_backend` | Project/Requirement/WideTable/TaskPlan/TaskExecution 等核心域 |
| Scheduling | `data-foundry-scheduler-service` | `data_foundry_scheduler` | ScheduleJob 的创建/查询/状态流转/触发策略 |
| Agent | `data-foundry-agent-service` | 无（当前） | 采数执行（当前 Mock；后续替换真实执行器） |

强约束：
- **禁止跨服务直连数据库/DAO**（例如 backend 不允许直接写 scheduler 的表）。
- 跨服务交互通过 HTTP（或后续事件/消息），并使用 `data-foundry-common-contract` 承载集成契约（DTO/请求响应结构）。

### 1.2 DDD 分层依赖方向（必须遵守）

目标依赖方向：

`interfaces -> application -> domain <- infrastructure`

分层职责边界：
- `interfaces`：HTTP 入站适配（Controller、DTO、assembler），不含业务规则/事务/SQL。
- `application`：用例编排（事务边界、调用 domain、调用 repository 端口），不依赖 MyBatis/SQL。
- `domain`：业务核心（聚合/实体/值对象/领域服务/领域事件/端口接口/领域异常），尽量纯 Java。
- `infrastructure`：出站适配（MyBatis/XML/Mapper/Record、Repository 实现、外部 client、配置），实现 domain 端口。

附加约束（落地检查清单）：
- Controller **只能依赖** `application`（禁止注入 Mapper/Record）。
- Application **只能依赖** `domain`（以及 domain 中定义的端口接口）。
- `Mapper/Record/XML` **只允许**存在于 `infrastructure`。
- 禁止使用 `@Lazy` / 字段注入绕过依赖方向，优先抽端口与拆分职责解决循环依赖。

---

## 2. 分层目录模板（统一约定）

> 以下模板适用于所有服务的所有 `<context>`。

### 2.1 `interfaces`（入站）

`com.huatai.datafoundry.<service>.<context>.interfaces.web`
- `*FacadeController`（聚合后的 Controller）
- `dto/*`（Request/Response DTO）
- `assembler/*`（DTO 映射：Request → Command、DTO → Response）
- `legacy/*`（可选：旧路径兼容 Controller，仅做参数适配/转发）

### 2.2 `application`（用例）

`com.huatai.datafoundry.<service>.<context>.application`
- `service/*AppService`（用例编排 + 事务边界）
- `command/*`（写用例入参）
- `query/*`（读用例入参）
- `dto/*`（应用层 DTO；对接口层输出，不暴露 domain 对象）
- `handler/*`（可选：领域事件/集成事件处理）

### 2.3 `domain`（核心）

`com.huatai.datafoundry.<service>.<context>.domain`
- `model/*`（聚合/实体/值对象）
- `repository/*`（端口接口，如 `*Repository`）
- `service/*DomainService`（仅在规则无法归属聚合时使用）
- `event/*`（领域事件，可选但推荐）
- `exception/*`（领域异常）

### 2.4 `infrastructure`（出站）

`com.huatai.datafoundry.<service>.<context>.infrastructure`
- `persistence/mybatis/mapper/*`（MyBatis Mapper 接口）
- `persistence/mybatis/record/*`（DB Record/DO）
- `persistence/mybatis/xml/*`（resources 下的 mapper.xml）
- `repository/*RepositoryImpl`（端口实现：Domain ↔ Record 映射）
- `client/*`（调用其它服务的 HTTP client / ACL）
- `config/*`（配置类）

---

## 3. Controller 接口聚合方案（全项目统一策略）

### 3.1 聚合目标

项目无独立 OpenAPI/IDL，接口契约以 Controller 为准。为减少接口碎片与路径不一致：
- 按“大应用服务（App）”聚合 Controller：一个 App 对应一个聚合后的 `*FacadeController` + 一个 `*AppService`（必要时拆多个 AppService 但保持同一前缀）。
- 同一 App 下路径风格统一：以资源树为中心，统一前缀与子路径规则。

### 3.2 双轨落地：Canonical + Legacy

- **Canonical**：新增统一前缀（推荐）Controller，例如 `/api/requirements/**`。
- **Legacy**：保留旧路径 Controller（或新增 `interfaces.web.legacy`），只做参数适配/转发到同一个 AppService。
- 前端逐步切换到 Canonical 后，再下线 Legacy。

> 该策略保证“可联调、可演进”，避免一次性改路由导致前端 404。

---

## 4. 各服务的上下文划分与目标包结构

> 说明：下述 `<context>` 为推荐划分。可按你们业务实际微调，但建议保持少而清晰的上下文集合。

### 4.1 backend-service（Core）

推荐 `<context>`：
- `project`：项目与数据源策略
- `requirement`：需求 + wideTable 定义 + 需求维度的任务视图
- `task`：任务计划/实例/执行（taskGroup、fetchTask、execution）
- `schedule`（可选）：若 backend 仍保留“调度聚合视图/转发”，则落在此上下文（写操作建议迁 scheduler-service）
- `ops`：运维/管理/平台 stub
- `health`（可选）：健康检查（也可不按 DDD 分层，保持极简）

#### 4.1.1 backend-service 目标包树（示例）

- `com.huatai.datafoundry.backend.project.interfaces.web/*`
- `com.huatai.datafoundry.backend.project.application/*`
- `com.huatai.datafoundry.backend.project.domain/*`
- `com.huatai.datafoundry.backend.project.infrastructure/*`

- `com.huatai.datafoundry.backend.requirement.interfaces.web/*`
- `com.huatai.datafoundry.backend.requirement.application/*`
- `com.huatai.datafoundry.backend.requirement.domain/*`
- `com.huatai.datafoundry.backend.requirement.infrastructure/*`

- `com.huatai.datafoundry.backend.task.interfaces.web/*`
- `com.huatai.datafoundry.backend.task.application/*`
- `com.huatai.datafoundry.backend.task.domain/*`
- `com.huatai.datafoundry.backend.task.infrastructure/*`

- `com.huatai.datafoundry.backend.ops.interfaces.web/*`
- `com.huatai.datafoundry.backend.ops.application/*`
- `com.huatai.datafoundry.backend.ops.domain/*`（通常较少，仅当有明确业务规则）
- `com.huatai.datafoundry.backend.ops.infrastructure/*`

#### 4.1.2 backend-service 接口聚合（建议）

现状（以当前 `...backend/web/*.java` 为准）可聚合为：

1) ProjectApp（已有聚合度较好）
- Canonical：`/api/projects/**`
- Controller：`ProjectFacadeController`
- Application：`ProjectAppService`

2) RequirementApp（将需求/宽表/计划/任务视图统一）
- Canonical：`/api/requirements/**`
- Controller：`RequirementFacadeController`
- Application：`RequirementAppService`
- Legacy：兼容 `/api/projects/{projectId}/requirements/**`

3) TaskApp（执行类接口收敛）
- Canonical：`/api/tasks/**`（或 `/api/task-groups/**`，建议统一 `/api/tasks/**`）
- Controller：`TaskFacadeController`
- Application：`TaskAppService`（含 execute/retry/ensure 等用例）

4) ScheduleFacade（若 backend 仅聚合视图/转发）
- Canonical：`/api/schedule-jobs/**`
- Controller：`ScheduleFacadeController`
- Application：`ScheduleFacadeAppService`
- 写操作建议最终迁移到 scheduler-service 的 `schedule` 上下文

5) OpsAdminApp（平台 stub/运维口）
- Canonical：保持 `/api/admin/**`、`/api/ops/**`、`/api/dashboard/**` 分组
- Controller：`OpsFacadeController`（必要时按前缀再拆）
- Application：`OpsAppService`

---

### 4.2 scheduler-service（Scheduling）

推荐 `<context>`：
- `schedule`：ScheduleJob 聚合与调度策略
- `ops`（可选）：调度系统运维口
- `health`（可选）

目标包树：
- `com.huatai.datafoundry.scheduler.schedule.interfaces.web/*`
- `com.huatai.datafoundry.scheduler.schedule.application/*`
- `com.huatai.datafoundry.scheduler.schedule.domain/*`
- `com.huatai.datafoundry.scheduler.schedule.infrastructure/*`

接口聚合：
- Canonical：`/api/schedule-jobs/**`
- Controller：`ScheduleJobFacadeController`
- Application：`ScheduleJobAppService`

跨服务协作建议：
- backend 只做“展示/聚合”，写操作由 scheduler-service 作为**写主**，避免数据一致性风险。

---

### 4.3 agent-service（Agent）

推荐 `<context>`：
- `agent`：执行入口与 mock/真实执行适配
- `health`（可选）

目标包树：
- `com.huatai.datafoundry.agent.agent.interfaces.web/*`
- `com.huatai.datafoundry.agent.agent.application/*`
- `com.huatai.datafoundry.agent.agent.domain/*`（规则较少也可轻量）
- `com.huatai.datafoundry.agent.agent.infrastructure/*`（外部调用/执行器实现）

接口聚合：
- Canonical：`/api/agent-executions/**`（或沿用现状路径但统一风格）
- Controller：`AgentExecutionFacadeController`
- Application：`AgentExecutionAppService`

---

### 4.4 common-contract（集成契约）

`data-foundry-common-contract` 不作为某个服务的 domain 层使用，它是跨服务 DTO/请求响应契约。

建议约定：
- 包：`com.huatai.datafoundry.contract.<context>.*`（你们当前已有 `agent` / `scheduler`）
- 只放：DTO、枚举（契约级）、请求/响应对象
- 禁止放：Repository、Service、领域聚合

若需要防腐层（ACL）：
- 在各服务的 `infrastructure.client` 下实现对 contract 的适配（domain 模型不直接依赖 contract DTO）。

---

## 5. Requirement 作为示范：DDD 分层 + 接口聚合落地

### 5.1 业务语义澄清：创建 Requirement 时创建 WideTable

你们当前语义是：创建 `requirements` 记录后，在同一事务内创建一条 primary `wide_tables` 记录（作为“宽表定义/指标口径/计划配置”的默认入口），并非立刻创建物理宽表。

因此 Recommendation：
- `requirement` 上下文内：把 wideTable 作为 Requirement 聚合内实体/定义对象（强一致）。

### 5.2 Canonical 路由（聚合后建议）

统一由 `RequirementFacadeController` 暴露（同一个 App 同一前缀）：

- 需求本体
  - `GET /api/requirements?projectId=...`
  - `POST /api/requirements`
  - `GET /api/requirements/{requirementId}`
  - `PUT /api/requirements/{requirementId}`
  - （推荐补充）`POST /api/requirements/{requirementId}/submit`
- 宽表定义
  - `PUT /api/requirements/{requirementId}/wide-tables/{wideTableId}`
  - `POST /api/requirements/{requirementId}/wide-tables/{wideTableId}/preview`
  - `POST /api/requirements/{requirementId}/wide-tables/{wideTableId}/plan`
- 任务视图
  - `GET /api/requirements/{requirementId}/task-groups`
  - `GET /api/requirements/{requirementId}/tasks`

Legacy 兼容：
- 兼容旧路径 `/api/projects/{projectId}/requirements/**`，在 `interfaces.web.legacy` 中转发到同一 `RequirementAppService`。

### 5.3 Requirement 上下文包结构（示例，完全按规范）

- `com.huatai.datafoundry.backend.requirement.interfaces.web`
  - `RequirementFacadeController`
  - `dto/*`
  - `assembler/*`
  - `legacy/*`（旧路径转发）
- `com.huatai.datafoundry.backend.requirement.application`
  - `service/RequirementAppService`
  - `command/*`（Create/Update/Submit/UpdateWideTable/Plan 等）
  - `query/*`（Get/List/TaskView 等）
  - `dto/*`
- `com.huatai.datafoundry.backend.requirement.domain`
  - `model/*`（`Requirement`、`WideTableDefinition`、`RequirementStatus` 等）
  - `repository/*`（`RequirementRepository` 端口）
  - `exception/*`（`RequirementLockedException`、`InvalidTransitionException`）
  - `event/*`（可选：`RequirementSubmitted`）
- `com.huatai.datafoundry.backend.requirement.infrastructure`
  - `persistence/mybatis/mapper/*`（`RequirementMapper`、`WideTableMapper`）
  - `persistence/mybatis/record/*`（`RequirementRecord`、`WideTableRecord`）
  - `repository/*`（`MybatisRequirementRepository`）

---

## 6. 迁移路线图（全项目，最小风险）

> 原则：先“依赖方向纠偏 + Controller 变薄 + 用例编排集中”，再“端口化 + 规则下沉 + 路由聚合上线”，最后“清理 legacy 与补齐测试”。

### Phase 0：冻结接口矩阵与 App 划分
- 冻结现有 controller 路由清单与前端调用点。
- 确认 App 划分与 canonical 前缀（backend: project/requirement/task/ops…）。
- 定义 legacy 兼容范围与下线策略。

### Phase 1：分层骨架落地（不改行为）
- 为每个 context 建立 `interfaces/application/domain/infrastructure` 目录骨架。
- Controller 改为只调用 `*AppService`（先不搬迁所有类也可，但必须断开对 Mapper 的直接依赖）。
- 引入统一返回与异常处理（除 `/health`）。

### Phase 2：Repository 端口化 + MyBatis XML
- 抽取 domain 端口：`*Repository`。
- 在 infrastructure 实现：`*RepositoryImpl`，内部调用 MyBatis。
- MyBatis 注解 SQL 迁移到 XML + resultMap（优先 Requirement/Task 链路）。

### Phase 3：领域规则下沉（从 Requirement 开始）
- 把 `schemaLocked`、状态流转、编辑约束等规则迁移到 domain 聚合。
- Application 只负责编排与事务，不承载复杂 if/else。
- 可选：引入领域事件（例如 `RequirementSubmitted`），由 application handler 驱动 task plan 生成，解耦跨子域动作。

### Phase 4：接口聚合上线（Canonical + Legacy）
- 上线 canonical facade controller（例如 `/api/requirements/**`）。
- legacy controller 保留，内部转发同一个 app service。
- 前端逐步切换到 canonical（灰度开关），完成后下线 legacy。

### Phase 5：测试补齐与技术债清理
- 覆盖关键链路集成测试：Requirement → Plan → Execute（最小可用）。
- 清理遗留：删除 legacy、清理 unused service、统一 DTO/assembler 规范。

---

## 7. 交付物清单（按阶段验收）

1) 分层包结构落地（按规范命名，且依赖方向通过 code review 校验）  
2) Controller 聚合：Facade + legacy 双轨（路由矩阵 + 兼容策略文档）  
3) Application Service 用例编排集中（事务边界清晰）  
4) Domain 端口（Repository/Gateway）与 Infrastructure 实现（MyBatis XML + resultMap）  
5) 核心领域规则下沉（Requirement 优先）  
6) 前端切换方案（canonical 前缀）与 legacy 下线计划  
7) 最小测试覆盖（关键链路回归）  

---

## 8. 附：命名与落地检查（代码评审用）

- 是否符合 `com.huatai.datafoundry.<service>.<context>.<layer>...`？
- Controller 是否仅依赖 application？是否存在注入 Mapper/Record？
- Application 是否仅依赖 domain + domain 端口？是否依赖 MyBatis/SQL？
- Mapper/Record 是否仅出现在 infrastructure？
- 业务规则是否下沉到 domain（或至少不在 controller）？
- 是否存在通过 `@Lazy` 等方式绕过分层/循环依赖？
- 是否提供 canonical + legacy 的平滑迁移？

