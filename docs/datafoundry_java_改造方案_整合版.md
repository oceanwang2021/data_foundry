# datafoundry_java 改造方案（V3：DDD 分层 + Controller 接口聚合）

> 版本：V3（在“整合版”基础上，补齐 DDD 分层、包命名规范、Controller 接口聚合与兼容策略）  
> 生成时间：2026-04-17（Asia/Shanghai）  
> 适用范围：`data-foundry-*-service`（Java 侧）+ `db/mysql/*` + 前端接口切换/兼容策略

---

## 0. 背景与目标

当前仓库已落地：

- 前端：`data-foundry-frontend/`（Next.js 13.5.x，`/api/*` 代理）
- 后端：Maven 多模块 + 3 个 Spring Boot 服务
  - `data-foundry-backend-service`（Core，上下文：Project/Requirement/Task 等）
  - `data-foundry-scheduler-service`（Scheduling，上下文：ScheduleJob）
  - `data-foundry-agent-service`（Agent，上下文：AgentExecution/MockAgent）
  - `data-foundry-common-contract`（跨服务 contract/DTO）
- 数据库：MySQL 8.0+，脚本位于 `db/mysql/*`

**改造目标（不破坏联调的前提下演进）**：

1. 按 DDD 分层落地：`interfaces(web) / application / domain / infrastructure`，依赖方向明确、禁止跨层直连。
2. 统一包命名规范：按“子域/上下文 + 分层”组织，避免纯技术分层导致的耦合扩散。
3. 现有仅 Controller 的“接口契约”进行聚合：按“大应用服务（App）”聚合 Controller，**同一应用服务下统一前缀与子路径风格**，并提供 legacy 兼容。
4. 接口输出统一：所有业务 API 返回 `Response<T>`，异常统一走全局处理器（`/health` 可豁免）。
5. MyBatis 注解 SQL 迁移至 XML + resultMap；数据库脚本版本化（优先 Flyway，可提供替代 SOP）。
6. 逐步补齐测试：关键用例的单测/集成测最小覆盖（Requirement → Plan → Execute 链路优先）。

---

## 1. 总体架构：Bounded Context 与服务边界

### 1.1 上下文划分（建议）

| Bounded Context | 服务模块 | 数据库 | 主要职责 |
|---|---|---|---|
| Core | `data-foundry-backend-service` | `data_foundry_backend` | Project/Requirement/WideTable/TaskPlan/TaskExecution 等核心域 |
| Scheduling | `data-foundry-scheduler-service` | `data_foundry_scheduler` | ScheduleJob 的创建/查询/状态流转 |
| Agent | `data-foundry-agent-service` | 无（当前） | 采数执行（当前 Mock，可替换真实实现） |

强约束：

- **禁止跨上下文直接写库**（A 服务不得直接操作 B 的库/DAO）。
- 跨服务交互通过 HTTP/消息（若后续引入），并以 `common-contract` 作为集成契约载体（可配合 ACL 防腐层）。

---

## 2. DDD 分层落地（核心规则）

目标依赖方向：

`interfaces(web) -> application -> domain <- infrastructure`

### 2.1 各层职责边界

#### A) `interfaces.web`（表现层 / 入站适配器）

做什么：

- HTTP 路由、参数绑定、基础校验（必填/格式/长度）
- Request DTO → Application Command/Query
- Application DTO → Response DTO
- 异常映射（Domain/Application 异常 → 统一错误码/HTTP）

不做什么：

- 不注入 `Mapper/Record`；不写 SQL
- 不写事务（事务边界归 Application）
- 不写业务规则（规则归 Domain）
- 不做跨子域编排（编排归 Application）

#### B) `application`（应用层 / Use Case 编排）

做什么：

- 用例编排（一个方法对应一个业务用例或一组紧密用例）
- `@Transactional` 事务边界
- 调用 Domain 聚合/领域服务执行业务规则
- 调用 Domain 端口（Repository/Gateway）做持久化/外部访问
- 组装并返回 Application DTO

不做什么：

- 不依赖 MyBatis/Mapper/SQL
- 不处理 HTTP 细节
- 尽量不写复杂规则（复杂规则应下沉到 Domain）

#### C) `domain`（领域层 / 业务核心）

做什么：

- 聚合/实体/值对象建模
- 领域不变量、状态机、规则校验
- 领域服务（当规则无法自然归属聚合时才使用）
- 定义端口（Repository/Gateway 接口）
- 领域事件（可选但推荐，用于解耦跨子域动作）

不做什么：

- 不依赖 Spring MVC/MyBatis
- 不做用例编排

#### D) `infrastructure`（基础设施层 / 出站适配器）

做什么：

- 实现 Domain 端口（Repository/Gateway 实现）
- MyBatis Mapper/Record/XML、外部 client、配置
- Domain ↔ Record 映射（含 JSON 字段如何存取）

不做什么：

- 不承载业务规则
- 不暴露 Mapper/Record 给上层

### 2.2 Service 是否合并（结论与命名约束）

- 不保留语义不清的“裸 `*Service`”。
- 明确区分：
  - 应用服务：`*AppService`（在 `application.service`）
  - 领域服务：`*DomainService`（在 `domain.service`）

---

## 3. 包命名规范（按“子域/上下文 + 分层”）

统一采用：

`com.huatai.datafoundry.<service>.<context>.<layer>...`

其中：

- `<service>`：如 `backend` / `scheduler` / `agent`
- `<context>`：子域/限界上下文，如 `requirement`、`project`、`task`、`schedule`、`ops`
- `<layer>`：`interfaces` / `application` / `domain` / `infrastructure`

### 3.1 推荐结构（以 backend.requirement 为例）

- `com.huatai.datafoundry.backend.requirement.interfaces.web`
  - `RequirementFacadeController`
  - `dto/*`（Request/Response DTO）
  - `assembler/*`（DTO 映射）
- `com.huatai.datafoundry.backend.requirement.application`
  - `service/RequirementAppService`
  - `command/*`、`query/*`、`dto/*`
- `com.huatai.datafoundry.backend.requirement.domain`
  - `model/*`（聚合/实体/值对象）
  - `repository/*`（端口接口）
  - `service/*`、`event/*`、`exception/*`
- `com.huatai.datafoundry.backend.requirement.infrastructure`
  - `persistence/mybatis/mapper/*`
  - `persistence/mybatis/record/*`
  - `repository/*`（端口实现）

强约束：

- Controller 只能依赖 Application；Application 只能依赖 Domain 端口；Mapper/Record 仅允许出现在 Infrastructure。

---

## 4. Controller 接口聚合方案（无独立 API 定义文件的情况下）

### 4.1 目标

由于项目没有 OpenAPI/IDL，当前“接口契约”以 Controller + DTO 形式存在。为降低接口碎片化与路径不一致带来的维护成本，需要：

- 按“大应用服务（App）”聚合 Controller
- 同一个应用服务下统一路径前缀与子路径风格
- 通过 legacy 兼容避免一次性前端大改

### 4.2 推荐策略：Canonical（新前缀）+ Legacy（兼容转发）

- Canonical：新增统一前缀 Controller（Facade Controller），例如：
  - `RequirementFacadeController`：`/api/requirements/**`
  - `TaskFacadeController`：`/api/tasks/**`
- Legacy：保留旧路径 Controller（或新增 `legacy` controller），仅做路径参数适配，内部调用同一个 AppService。
- 前端逐步切换到 Canonical 后，按阶段下线 Legacy。

### 4.3 backend-service 的应用服务聚合建议（覆盖现有 Controller）

| 应用服务（App） | Canonical 前缀（建议） | 覆盖现有接口来源（当前 Controller） |
|---|---|---|
| ProjectApp | `/api/projects/**` | `ProjectController` |
| RequirementApp | `/api/requirements/**` | `RequirementController` + `RequirementWideTableController` + `WideTablePlanController` + `RequirementTaskController` |
| TaskApp | `/api/tasks/**`（或 `/api/task-groups/**`） | `TaskExecutionController` |
| ScheduleFacade（若仍由 backend 提供聚合视图） | `/api/schedule-jobs/**` | `ScheduleJobFacadeController`（注意：真实写操作应在 scheduler-service） |
| OpsAdminApp | `/api/admin/**`、`/api/ops/**`、`/api/dashboard/**` 等 | `PlatformStubController` |
| Health | `/health` | `HealthController` |

> 注：`ScheduleJobFacadeController` 若仅做聚合视图，可保留在 backend；但“创建/变更调度任务”的写操作建议收敛到 scheduler-service。

---

## 5. Requirement 示例：接口聚合 + DDD 分层适配

### 5.1 现状（backend-service）相关路径

当前 Requirement 相关能力分散在多个 Controller：

- `/api/projects/{projectId}/requirements`（Requirement 列表/创建/详情/更新）
- `/api/projects/{projectId}/requirements/{requirementId}/task-groups`、`/tasks`（任务视图）
- `/api/requirements/{requirementId}/wide-tables/{wideTableId}`（宽表定义更新）
- `/api/requirements/{requirementId}/wide-tables/{wideTableId}/preview`、`/plan`（预览/计划持久化）

其中“创建需求时创建 wideTable”语义是：

- 创建 `requirements` 记录后，在同一事务内创建一条 primary `wide_tables` 记录（作为宽表定义/指标口径配置），并在页面配置与任务计划中作为默认入口。

### 5.2 Canonical 路由（聚合后的建议）

统一由 `RequirementFacadeController` 暴露：

- 需求本体
  - `GET /api/requirements?projectId=...`
  - `POST /api/requirements`
  - `GET /api/requirements/{requirementId}`
  - `PUT /api/requirements/{requirementId}`
  - （可选）`POST /api/requirements/{requirementId}/submit`
- 宽表定义
  - `PUT /api/requirements/{requirementId}/wide-tables/{wideTableId}`
  - `POST /api/requirements/{requirementId}/wide-tables/{wideTableId}/preview`
  - `POST /api/requirements/{requirementId}/wide-tables/{wideTableId}/plan`
- 任务视图
  - `GET /api/requirements/{requirementId}/task-groups`
  - `GET /api/requirements/{requirementId}/tasks`

### 5.3 Legacy 兼容映射（保证前端不改也可跑）

- 旧：`GET /api/projects/{projectId}/requirements` → 新：`listByProject(projectId)`
- 旧：`POST /api/projects/{projectId}/requirements` → 新：`create(projectId, command)`
- 旧：`GET /api/projects/{projectId}/requirements/{requirementId}/task-groups|tasks` → 新：`listTaskGroups/listTasks(requirementId)`

> legacy controller 仅做参数适配，内部统一调用 `RequirementAppService`。

### 5.4 分层落地的调用链（示意）

- `RequirementFacadeController (interfaces)`
  - 校验、DTO 转 Command/Query
  - 调用 `RequirementAppService`
- `RequirementAppService (application)`
  - `@Transactional`
  - 调用 `Requirement` 聚合执行业务规则
  - 调用 `RequirementRepository` 端口持久化
  -（可选）发布 `RequirementSubmitted` 事件用于触发 TaskPlan
- `Requirement (domain)`
  - 规则：schemaLocked 禁改 definition；状态流转 ready 时锁 schema
- `MybatisRequirementRepository (infrastructure)`
  - 调用 MyBatis Mapper/Record/XML
  - 完成 Domain ↔ Record 映射

---

## 6. 横切规范（接口返回/异常/日志/MyBatis/DB 迁移）

### 6.1 统一返回：`Response<T>`

- 除 `/health` 外，所有对外 API 统一返回 `Response<T>`。
- `code/message/data` 结构由 `common-core`（或 backend 的 shared）统一提供。

### 6.2 统一异常：全局处理器

- Domain/Application 抛出业务异常（如 `BizException`/`DomainException`），由 `GlobalExceptionHandler` 统一转为 `Response.failure(...)`。
- Controller 不抛 `ResponseStatusException` 作为业务异常（可保留 404/400 这类协议错误映射）。

### 6.3 错误码与异常基类（建议固化）

- `ErrorCode`：枚举化（`code` + `message`），对齐前端展示与排障。
- `BizException`：携带 `ErrorCode` + 可选 `detail`；Domain 层可定义 `DomainException` 并在 Application 层转换为 `BizException`（或直接复用）。
- `GlobalExceptionHandler`：统一输出 `Response.failure(code, message)`，并记录必要的请求上下文日志（requestId、user、path）。

### 6.3 MyBatis：注解 SQL → XML + resultMap

- `Mapper` 仅保留接口签名；SQL 移入 `resources/mapper/*.xml`。
- 明确 DTO/DO：
  - Infrastructure 的 `record/do` 与 Domain 的模型分离
  - JSON 字段通过 TypeHandler（如 JacksonJsonTypeHandler）统一处理

### 6.4 DB 脚本：版本化迁移

- 优先采用 Flyway（dev/test/prod 保持一致）。
- 若审批限制 Flyway，引入“手工版本脚本 + 发布 SOP”替代方案：
  - 明确每次变更脚本编号、执行顺序、回滚策略。

### 6.5 安全与鉴权（最小可用）

- 建议统一实现 `SecurityInterceptor`（或 Spring Security 的轻量替代），支持配置模式：`off|token`。
- 约定请求头（示例）：`X-DF-Token`，生产环境强制开启；测试/本地可配置关闭。
- 鉴权失败统一返回 `Response.failure(401xx, ...)`（具体 code 由 `ErrorCode` 约定）。

### 6.6 日志与审计（建议）

- 关键用例入口（Application Service）打印 INFO 级别业务日志：用例名、关键 ID、耗时、结果码。
- 异常日志统一由全局处理器打印（避免 Controller/Service 重复打印造成噪声）。
- 后续如需审计：在 Application 层统一埋点（谁在何时对哪个聚合做了什么操作）。

### 6.7 DTO 映射（BeanCopier/Assembler 约定）

- `interfaces.web.assembler`：负责 Request/Response DTO 与 Application DTO/Command 的转换。
- `application`：允许组装 Application DTO；禁止直接返回 Domain 对象给接口层。
- `infrastructure`：负责 Domain ↔ Record/DO 的转换，避免“Record 侵入上层”。

### 6.8 “整合版包结构”与 V3 DDD 的关系（迁移说明）

整合版曾约定 `api/api.impl/dao/dto/domain/service/service.impl`。V3 统一改为 DDD 分层：

- 原 `api.impl` ≈ 新 `interfaces.web`
- 原 `service/service.impl` ≈ 新 `application.service`（应用服务）与 `domain.service`（领域服务）
- 原 `dao`/`mapper` ≈ 新 `infrastructure.persistence`
- 原 `domain` 继续保留语义，但需补齐聚合/端口/规则，且不依赖基础设施

迁移策略：优先“依赖方向纠偏 + Controller 变薄”，再逐步重排包结构，避免一次性大搬家影响联调。

---

## 7. 分阶段实施计划（建议）

### Phase 0：冻结接口 + 基线检查

- 冻结现有前端调用路径清单（backend 当前 controller 路由矩阵）
- 建立 Canonical 前缀规划与 legacy 兼容策略
 - 明确“哪些接口属于哪个 App（应用服务）”，形成路由归属表（用于 code review）

### Phase 1：分层骨架落地（不改行为）

- 为 backend 先落 `RequirementAppService` 与 `RequirementFacadeController`（可先不启用 canonical，仅建立调用链）
- Controller 从“直连 Mapper”迁移为“调用 AppService”
 - 引入 `Response<T>`、`ErrorCode`、`BizException`、`GlobalExceptionHandler`（优先覆盖 Requirement 链路）

### Phase 2：Repository 端口化 + MyBatis XML

- 抽 Domain 端口 `RequirementRepository`，实现 `MybatisRequirementRepository`
- 注解 SQL 迁移 XML + resultMap
 - 引入 JSON TypeHandler（针对 WideTable/Requirement 的 JSON 字段优先落地）

### Phase 3：领域规则下沉 + 事件解耦

- `schemaLocked`、状态流转等规则迁移到 Domain 聚合
- 引入 `RequirementSubmitted` 事件（可选），由 Application handler 触发 TaskPlan 构建
 - 将“提交即生成计划/任务实例”等编排从 Controller/Service 收敛到 Application

### Phase 4：接口聚合上线（canonical + legacy）

- 上线 `/api/requirements/**` Canonical 路由
- 保留 legacy 路由与转发，前端逐步切换
 - 前端切换通过配置开关（如 `NEXT_PUBLIC_API_BASE` 或版本变量）实现灰度

### Phase 5：测试补齐 + legacy 下线

- 覆盖 Requirement → Plan → Execute 关键链路的集成测试
- 完成前端切换后，下线 legacy controller
 - scheduler/agent 的跨服务交互稳定后，将 TaskExecution 的“占位逻辑”替换为真实流水线调用

---

## 8. 交付物清单（V3）

- 分层包结构落地（interfaces/application/domain/infrastructure）
- Controller 接口聚合：canonical + legacy 兼容
- `Response<T>` + 全局异常处理器 + 错误码枚举
- MyBatis XML + resultMap + TypeHandler 体系
- Flyway（或替代 SOP）与版本化脚本
- 关键用例测试（最低可用覆盖）
- 文档：本改造方案 + 路由矩阵 + 数据库变更说明 + 前端切换说明

---

## 9. 风险与缓解

| 风险点 | 影响 | 缓解措施 |
|---|---|---|
| 一次性改路由导致前端 404 | 联调中断 | canonical + legacy 双轨，逐步切换 |
| 分层后循环依赖/Bean 装配问题 | 启动失败 | 严格依赖方向；禁止 @Lazy 绕过；优先抽端口 |
| Mapper 迁移 XML 后字段映射错误 | 数据错误 | 为每个 Mapper 增加最小 CRUD 回归用例 |
| 事务边界不清 | 状态不一致 | 事务仅放 Application，用例编排内聚 |
| 跨服务写操作混乱（Schedule） | 数据不一致 | scheduler-service 为写主；backend 只做聚合视图或转发 |

---

## 10. 路由矩阵（backend-service，现状 → 聚合后的归属）

> 用于“Controller 接口聚合”落地时的 code review 对照与前端切换计划。此表以当前代码为准（backend 的 `web` 包）。  

| 现状接口（示例） | 现状归属 Controller | 目标 App（应用服务） | Canonical 前缀（建议） | 兼容策略 |
|---|---|---|---|---|
| `GET /api/projects`、`GET /api/projects/{projectId}` | `ProjectController` | ProjectApp | `/api/projects/**` | 可直接保留（已聚合） |
| `GET/POST/GET/PUT /api/projects/{projectId}/requirements...` | `RequirementController` | RequirementApp | `/api/requirements/**` | legacy 转发到 `RequirementAppService` |
| `GET /api/projects/{projectId}/requirements/{requirementId}/task-groups`、`GET .../tasks` | `RequirementTaskController` | RequirementApp | `/api/requirements/{requirementId}/task-groups|tasks` | legacy 转发 |
| `PUT /api/requirements/{requirementId}/wide-tables/{wideTableId}` | `RequirementWideTableController` | RequirementApp | `/api/requirements/{requirementId}/wide-tables/{wideTableId}` | 可直接纳入 canonical |
| `POST /api/requirements/{requirementId}/wide-tables/{wideTableId}/preview`、`POST .../plan` | `WideTablePlanController` | RequirementApp | 同上 | 可直接纳入 canonical |
| `POST /api/task-groups/{id}/execute`、`POST .../ensure-tasks`、`POST /api/tasks/{id}/execute|retry` | `TaskExecutionController` | TaskApp | `/api/tasks/**` | 逐步收敛到 TaskApp |
| `GET/POST /api/schedule-jobs` | `ScheduleJobFacadeController` | ScheduleApp | `/api/schedule-jobs/**` | 写操作建议迁 scheduler-service |
| `/api/admin/*`、`/api/ops/*`、`/api/dashboard/*` 等 | `PlatformStubController` | OpsAdminApp | 保持前缀分组 | 可保留 stub 或后续拆分 |
