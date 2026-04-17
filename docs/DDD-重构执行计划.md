# datafoundry_java DDD 重构执行计划（可执行版）

> 本计划以 `docs/DDD-重构方案-评审补齐版.md` 为准，拆解为可落地、可分 PR 推进的执行步骤。  
> 目标：在不中断前后端联调的前提下，完成 DDD 分层、接口聚合（Canonical + Legacy）、端口化、MyBatis XML、ACL、防腐层、统一响应与错误语义、最小关键链路测试。

---

## 0. 执行原则（必须遵守）

1) **垂直切片优先**：先从 `Requirement` 端到端跑通（Controller → AppService → Domain → Repository → DB），再扩展到 `Task/Project/Schedule/Ops`。  
2) **双轨迁移**：Canonical 新路径上线的同时保留 legacy 兼容，做到“可联调、可演进”。  
3) **依赖方向先纠偏**：先把 Controller 直连 Mapper 的链路断掉（即便暂时仍用旧 record），再逐步端口化/规则下沉。  
4) **每个 PR 都可回滚**：保持编译通过、服务能启动、关键接口可用。  
5) **不做分布式事务**：跨服务一律“本地提交 + after-commit + 幂等 + 重试/补偿”。Outbox 作为可选增强能力，在网关与幂等稳定后再引入。  

---

## 1. 工作包划分（WBS）与里程碑

> 建议按 6 个里程碑推进，每个里程碑可由多个小 PR 组成（单 PR 控制在 300~800 行改动为宜）。

### M0：基线冻结与路由矩阵确认（1~2 天）

**目标**
- 冻结现有接口矩阵（backend/scheduler/agent）与前端调用点清单。
- 固化 App 划分与 Canonical 前缀（RequirementApp/TaskApp/ProjectApp/OpsApp 等）。

**交付物**
- `docs/路由矩阵-现状.md`：列出所有 Controller 路由（含 method、path、request/response）。
- `docs/路由矩阵-目标.md`：Canonical + legacy 映射表（与评审补齐版一致）。

**验收**
- 前端确认：哪些接口必须保持不变、哪些可逐步切换。

---

### M1：工程骨架与基础设施底座（2~4 天）

**目标**
- 建立 DDD 分层目录骨架与**基础设施底座**：`Response<T>`、`ErrorCode`、异常体系、全局异常处理器。
- 先把底座铺好，**不在此里程碑强制全量接口统一返回/错误语义**：后续在核心上下文（先 Requirement）试点，再逐步扩面。

**步骤（可拆 3 个 PR）**

PR-1：新增 common-core（或 shared）基础库
- 新增模块（推荐）：`data-foundry-common-core`（与现有 `common-contract` 并列）
  - `Response<T>`、`ErrorCode`、`BizException`、`DomainException`（可选）、`IntegrationException`
  - `GlobalExceptionHandler`
  - 统一 Jackson 配置（如需）
- 三服务依赖该模块（Maven `dependencyManagement` 统一版本）

PR-2：底座接入（不改现有业务返回/路由）
- 三服务接入 `GlobalExceptionHandler`（先兜底异常，不要求所有 Controller 立刻改返回类型）。
- 明确 `/health` 豁免规则（保持原状或仅返回纯字符串/Map）。

PR-3：静态架构约束检查入口（先 warn）
- 引入 ArchUnit（或等价静态检查）规则草案：分层依赖、禁止 Controller 直连 Mapper、Mapper/Record 包边界等。
- 初期仅作为“警告输出”，不作为 CI gate；等 M2/M3 稳定后再逐步 gate（见第 5.3.4 节）。

**验收**
- 三个服务都能启动。
- common-core 底座可复用；其余接口可暂保持原状但由全局异常兜底（统一 Response/错误语义的试点放到 M2 的 Requirement 命令侧推进）。

---

### M2：Requirement 命令侧垂直切片（DDD 分层 + 端口化 + 规则归属）（5~10 天）

**目标**
- 按包规范落地 `backend.requirement` 上下文的 `interfaces/application/domain/infrastructure`。
- 断开 Controller 直连 Mapper。
- 完成 Requirement 关键规则下沉：状态流转、schemaLocked 约束、提交触发计划生成（先应用内同步事件）。

#### 2.1 目录与包创建（PR-4）

在 backend-service 新增包（示意）：
- `com.huatai.datafoundry.backend.requirement.interfaces.web`
- `com.huatai.datafoundry.backend.requirement.application`
- `com.huatai.datafoundry.backend.requirement.domain`
- `com.huatai.datafoundry.backend.requirement.infrastructure`

**验收**
- 不改任何路由，不改行为，仅新增空骨架与少量 DTO/assembler 基类。

#### 2.2 Controller 变薄：Requirement 旧接口改为调用 AppService（PR-5）

**修改范围**
- 将现有：
  - `RequirementController`
  - `RequirementWideTableController`
  - `WideTablePlanController`
  - `RequirementTaskController`
 逐步改为“注入 `RequirementAppService`，不再注入 Mapper/Record”。

**约束**
- PR-5 允许 AppService 内部暂时仍调用旧 Mapper（临时过渡），但 Controller 必须断开 Mapper 依赖。
- 在不影响前端联调的前提下，优先选择 2~3 个核心接口试点 `Response<T>` + 错误语义（建议：create/get/submit）。

**验收**
- 路由与返回结构保持一致（或统一为 `Response<T>`，由 M1 的策略决定）。
- 现有前端不改也能联调。

#### 2.3 Domain 聚合与规则下沉（PR-6）

**新增/调整**
- `Requirement` 聚合根：封装 `schemaLocked` 与状态机（`submit()`、`assertUnlocked()`、`updateDefinition()`）。
- `WideTableDefinition`（聚合内实体/定义对象）。
- `RequirementRepository`（domain 端口）定义：`save/find`（先满足 create/get/update/submit 用例）。

**验收**
- `schemaLocked` 的冲突判断不再出现在 Controller。
- status → ready 时 schemaLocked=true 的规则由聚合保证。

#### 2.4 Infrastructure Repository 实现（PR-7）

**实现**
- `MybatisRequirementRepository`：实现 `RequirementRepository`，内部调用 MyBatis Mapper，并负责 Domain ↔ Record 映射。
- 保留现有 `RequirementMapper/WideTableMapper` 但逐步迁移包到：
  - `com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.mapper`
  - `...record`

**验收**
- Application 层不再依赖 Mapper。
- 关键用例（create/get/update/submit）走 repository 端口。

#### 2.5 命令侧最小查询与断言（PR-8）

**目标**
- 为命令侧用例提供必要的“存在性校验/并发版本校验/锁状态读取”等最小查询能力，避免 Controller 里散落 `assertExists()`。

**实现建议**
- 通过 `RequirementRepository.find(...)` 获取聚合并做断言（优先）。
- 若性能需要，可在 infrastructure 增加只读的 `RequirementAssertDao`（仅提供 exists/lock/status 读取），由 application 调用（禁止 controller 直连）。

**验收**
- controller 中不再出现 `assertRequirementExists(...)` 这类直连 mapper 的逻辑；命令侧校验集中在 application/domain。

#### 2.6 提交触发 TaskPlan：应用内事件（PR-9）

**目标**
- 把“Requirement 提交后默认 TaskGroup 生成”从 Controller 中剥离：
  - `Requirement.submit()` 记录领域事件 `RequirementSubmitted`
  - application handler 订阅并调用 `TaskPlan` 用例（先同库同步；跨服务 outbox 后置可选）

**验收**
- submit 用例完成后，task_groups 生成逻辑依然生效（不退化）。

---

### M2b：Requirement 查询侧落地（CQRS-lite）（2~5 天）

**目标**
- 将 Requirement 的列表/详情/任务视图查询从命令模型中解耦，统一 QueryService/ReadDTO 风格。
- 解决“查询要不要还原聚合”的一致性问题：列表/统计走投影，核心详情视需要还原聚合。

**步骤（建议 1~2 个 PR）**
- PR-10：新增 `RequirementQueryService` + ReadDTO；Controller 改走 query service（禁止直接返回 Record）。
- PR-11（可选）：引入只读 `RequirementQueryDao`（infrastructure）或 `RequirementReadRepository`（domain 端口可选），覆盖分页/筛选/联表。

**验收**
- Requirement list/get（读接口）不依赖聚合还原即可工作，且不泄漏 Record 给接口层。

---

### M3：Task 计划算法侧（TaskPlan）重构（3~7 天）

**目标**
- 建立 `backend.task` context 的分层骨架与**计划算法侧**的清晰归属（DomainService + 批处理落库）。
- 将现有 `TaskPlanService` 拆分为：`TaskPlanDomainService`（规则/算法）+ `TaskPlanAppService`（persistPlan/ensureTasks 等编排）。
- 先保证“计划落地/补齐任务”这条链路稳定与幂等，为后续执行侧打基础。

#### 3.1 结构迁移与端口化（PR-12 ~ PR-13）

**步骤**
- 新建 `backend.task.*` 分层包。
- 把 task_group/fetch_task 的 Mapper/Record 归入 infrastructure。
- 定义 `TaskGroupRepository`、`FetchTaskRepository`（domain 端口）。

**验收**
- Controller 不直连 Mapper。

#### 3.2 计划规则归属与批处理（PR-14）

**实现**
- `TaskPlanDomainService`：负责维度组合、indicator group 选择、row_binding_key 生成等纯规则。
- `TaskPlanAppService.persistPlan(...)`：批量 upsert task_groups（幂等）。
- `TaskPlanAppService.ensureTasks(taskGroupId)`：批量生成 fetch_tasks（幂等），并回写 totals。

**验收**
- `persistPlan` 与 `ensureTasks` 用例可重复调用（幂等），不会重复生成/破坏 totals。
- 批量写通过 repository batch/upsert 完成，不出现循环写库。

---

### M3b：Task 执行侧（Execution）重构（3~7 天）

**目标**
- 将 `TaskExecutionController` 收敛到 `backend.task.interfaces.web.TaskFacadeController`。
- 把“状态迁移”下沉到 domain（TaskGroup/FetchTask），把“跨服务触发”上提到 application（after-commit）。

**步骤（建议 1~2 个 PR）**
- PR-15：domain 增加状态迁移方法（`markQueued/running/completed/failed`、`retry`），application 用例替换直接 updateStatus。
- PR-16：执行用例改为“本地事务提交 + after-commit 触发 gateway”（scheduler 未接入时可先 stub）。

**验收**
- execute/retry/ensure 的接口行为与错误语义稳定；跨服务失败不导致本地事务不一致（可重试/补偿）。

---

### M4：跨服务 Gateway/ACL（先稳定幂等 + after-commit）（3~8 天）

**目标**
- 明确写主：`schedule_jobs` 由 scheduler-service 写主。
- backend/scheduler 通过端口 + infrastructure client 实现对下游的调用，禁止 AppService 直接写 HTTP。
- **先完成** gateway + after-commit + 幂等 + 错误翻译；outbox 作为后续增强能力，不与 ACL 同优先级绑定。

#### 4.1 backend → scheduler（PR-17）

**实现**
- domain 端口：`ScheduleJobGateway`
- infrastructure client：`SchedulerScheduleJobClient`（超时/重试/错误翻译/幂等键）
- application：`TaskAppService` after-commit 调用 gateway

**验收**
- backend 不再直接持有 scheduler 的 DTO（contract 仅在 client 内使用或转为 domain DTO）。

#### 4.2 scheduler → agent（PR-18）

**实现**
- scheduler domain 端口：`AgentGateway`
- infrastructure client：`AgentClient`（调用 `/agent/executions`）
- application：`ScheduleJobAppService` 在 create/trigger 后 after-commit 调 agent（或通过 job runner）

**验收**
- agent-service 替换 mock 时不影响 scheduler 的 domain/application。

#### 4.3 outbox（可选增强，后置里程碑）

触发条件（满足其一再引入）：
- after-commit 重试/补偿逻辑开始变复杂，且需要可靠投递可观测性；
- 下游（scheduler/agent）稳定性不足导致调用失败频繁；
- 需要“任务排队/后台重试/可视化状态”能力。

建议作为独立里程碑（M7，可选）引入：outbox 表 + publisher + 重试策略 + 监控指标。

---

### M5：MyBatis XML + DB 版本化 + 表 ownership（并行推进，贯穿 M2~M4）

**目标**
- 将核心 Mapper 迁移到 XML + resultMap。
- DB schema 版本化（Flyway 或替代 SOP），并明确表 ownership。

**建议节奏**
- 每完成一个 context 的 repository 端口化，就迁移该 context 的 mapper 到 XML。
- 优先顺序：Requirement → Task → ScheduleJob。

**交付物**
- `docs/表-ownership.md`：至少覆盖已落地表（projects/requirements/wide_tables/task_groups/fetch_tasks/schedule_jobs），含写主/读侧/索引/唯一约束。
- Flyway（或替代 SOP）迁移脚本：支持空库初始化与增量升级；联调环境与开发环境一致性校验说明。

**验收**
- migration 可在空库一键初始化（dev/test），并与联调环境一致。
- ownership 文档与代码实现一致（写路径只能出现在 owner context 的 repository/application 中）。

---

### M6：接口聚合上线（Canonical + Legacy）与回归测试（3~7 天）

**目标**
- 上线 Canonical facade controller（按 App 聚合）。
- legacy controller 仅做转发，统一 Response/错误语义。
- 补齐最小关键链路测试集与兼容性回归。

**步骤**
- backend：
  - 新增 `/api/requirements/**`、`/api/tasks/**` facade
  - legacy：保留 `/api/projects/{projectId}/requirements/**` 等旧路径转发
- scheduler：保持 `/api/schedule-jobs/**`，统一 Response
- agent：保持 `/agent/executions`，统一 Response

**验收**
- 前端可通过开关切换 canonical（灰度）；
- legacy 与 canonical 输出一致；
- 最小关键链路测试通过（见第 6 节）。

---

### M7（可选）：Outbox 与可靠投递（按需引入，1~2 周）

**前置条件**
- M4 的 Gateway/ACL + after-commit + 幂等已稳定运行一段时间；
- 失败重试/补偿需求开始复杂化，或需要可观测的“待投递/已投递/失败”状态。

**目标**
- 在 backend/scheduler 引入 `outbox_events`（或等价）表与 publisher，实现跨服务副作用的可靠投递与可观测重试。

**验收**
- 下游短暂故障不影响本地用例提交；outbox 可自动重试并具备可观测指标/告警。

---

## 2. 具体“可执行任务清单”（按服务/上下文）

> 建议在项目管理工具中直接复制为任务卡片。

### 2.1 backend-service

**backend.project**
- [ ] 迁移 `ProjectController` → `ProjectFacadeController`（迁包 + Response<T>）
- [ ] 引入 `ProjectAppService`（读写用例）
- [ ] `Project` 聚合 + `ProjectRepository` + `MybatisProjectRepository`
- [ ] 列表/详情 query 投影（可选）

**backend.requirement**
- [ ] `RequirementFacadeController`（canonical：`/api/requirements/**`）
- [ ] legacy controller：`/api/projects/{projectId}/requirements/**` → 转发
- [ ] `RequirementAppService`（create/update/submit/updateWideTable/persistPlan/listTasks…）
- [ ] `Requirement` 聚合：状态机 + schemaLocked 规则
- [ ] `RequirementRepository`（端口）+ `MybatisRequirementRepository`
- [ ] QueryService：`RequirementQueryService`（list/get/readDTO/投影）
- [ ] 领域事件：`RequirementSubmitted` + handler（同步域事件；跨服务 outbox 后置可选）

**backend.task**
- [ ] `TaskFacadeController`（canonical：`/api/tasks/**`）
- [ ] `TaskPlanAppService`（persistPlan/ensureTasks…）
- [ ] `TaskAppService`（execute/retry/ensure…，执行侧）
- [ ] `TaskPlanDomainService`（替代/拆分 `TaskPlanService` 规则）
- [ ] `TaskGroup`/`FetchTask` 聚合建模与端口
- [ ] batch upsert 与索引补齐
- [ ] `ScheduleJobGateway`（端口）+ scheduler client（ACL）

**backend.ops**
- [ ] `OpsFacadeController`（按前缀分组或拆分）
- [ ] 权限拦截（seed/reset/execute 等敏感接口）

### 2.2 scheduler-service

**scheduler.schedule**
- [ ] `ScheduleJobFacadeController` + `ScheduleJobAppService`
- [ ] `ScheduleJob` 聚合 + repository 端口 + mybatis impl
- [ ] `AgentGateway` + agent client（ACL）
- [ ] 幂等创建 job（幂等键 + upsert/唯一约束）

**scheduler.ops**
- [ ] admin seed/reset 权限与统一 Response
- [ ] 将 JDBC 直连脚本迁移为 migration + seed 工具（可选）

### 2.3 agent-service

**agent.agent**
- [ ] `AgentExecutionFacadeController` + `AgentExecutionAppService`
- [ ] 执行器策略端口（为从 mock → 真实实现预留）
- [ ] 统一 Response 与错误语义

---

## 3. 最小关键链路回归（每个里程碑必须过）

> 建议把以下链路做成自动化回归（集成测/契约测），并作为 CI gate。

1) Project → Requirement create → primary wide table create  
2) Requirement update → submit → schemaLocked 生效  
3) WideTable plan → TaskGroup upsert（幂等）  
4) TaskGroup ensure-tasks → FetchTask 批量生成（幂等）  
5) Task execute / retry 状态迁移  
6) backend → scheduler create/list（ACL + 错误语义一致）  
7) scheduler → agent execute（mock 链路可用）  
8) legacy 与 canonical 路由输出一致性  

---

## 4. PR 切分建议与顺序（推荐）

1) common-core（Response/错误/异常/全局处理）  
2) Requirement（命令侧）：Controller 变薄 → domain 聚合 → repository 端口化 → submit 事件（含 Response 试点）  
3) Requirement（查询侧）：QueryService/ReadDTO/投影（分页/统计）  
4) Task（计划算法侧）：TaskPlanDomainService + persistPlan/ensureTasks（幂等 + batch）  
5) Task（执行侧）：状态迁移下沉 + after-commit 触发 gateway  
6) scheduler：端口化 + agent gateway + 幂等与错误语义  
7) agent：统一 Response + 执行器端口  
8) MyBatis XML 与 Flyway + 表 ownership：随 context 迁移推进  
9) Canonical facade 上线 + legacy 下线计划  

---

## 5. 风险点与操作规程（执行期强约束）

### 5.1 常见风险与规避

- **退化为事务脚本**：任何新规则必须先写入“规则归属表”，再落代码；AppService 中禁止出现大段业务 if/else。
- **聚合过大导致性能问题**：TaskGroup/FetchTask 不在一个大聚合里加载；列表/统计走 query 投影。
- **跨服务双写**：schedule_jobs 必须由 scheduler 写主；backend 仅通过 gateway 触发。
- **接口格式分裂**：legacy/canonical/转发接口必须共享 Response/错误语义。

### 5.2 Code Review 必过项

- 是否满足包命名：`com.huatai.datafoundry.<service>.<context>.<layer>`？
- Controller 是否注入 mapper/record？（禁止）
- Application 是否依赖 contract DTO？（禁止，contract 仅在 ACL）
- 是否引入 after-commit 处理跨服务副作用？（outbox 后置为可选增强）
- 是否提供幂等（upsert/唯一约束/幂等键）？

### 5.3 执行保障（补齐：表 ownership、角色分工、DoD、静态架构检查）

#### 5.3.1 表 ownership（必须固化并持续更新）

在 `docs/表-ownership.md` 固化以下信息（每次涉及 DB 变更必须同步更新）：
- 表名、owner context、写主服务、允许读服务、访问方式（repository/query/ACL）
- 关键索引与唯一约束（用于幂等与性能）

最低必须覆盖（现状已依赖表）：
- backend：`projects`、`requirements`、`wide_tables`、`task_groups`、`fetch_tasks`
- scheduler：`schedule_jobs`

#### 5.3.2 角色分工（建议）

- **Context Owner（子域负责人）**：对一个 context 的聚合边界、端口、事务边界、性能负责（Requirement/Task/Schedule 各 1 人）。
- **Infra Owner（基础设施负责人）**：负责 common-core、全局异常、MyBatis XML、Flyway、TypeHandler、ArchUnit 规则。
- **Integration Owner（集成负责人）**：负责 Gateway/ACL、超时重试、幂等键、错误翻译、跨服务时序回归。
- **QA/联调 Owner**：维护最小关键链路回归脚本与前端切换灰度策略。

#### 5.3.3 Definition of Done（DoD，建议作为 PR 模板）

每个 PR 至少满足：
- 编译通过、服务可启动、核心接口不 5xx（如涉及路由则 legacy/canonical 兼容通过）。
- 新增/修改的用例具备：幂等约束（upsert/唯一约束/幂等键）与错误语义（code/message）清晰。
- Controller 不直连 mapper；application 不依赖 contract（仅 ACL 使用）。
- 涉及 DB 变更：migration 脚本 + ownership 文档更新 + 最小回归用例。
- 涉及跨服务调用：超时/重试策略、错误翻译、调用日志（可观测性）明确。

#### 5.3.4 静态架构约束检查（建议 ArchUnit）

在 CI 中逐步启用（先 warn 后 gate）：
- 规则：`interfaces` 不能依赖 `infrastructure`；`application` 不能依赖 MyBatis/HTTP client；`domain` 不能依赖 Spring/MyBatis。
- 规则：`Mapper/Record` 仅能出现在 `infrastructure` 包名下。
- 规则：禁止 `interfaces.web` 包出现 `*Mapper` 字段注入/构造注入。

---

## 6. 实施后“下线清理清单”（最后 1~2 个 PR）

- [ ] 删除 legacy controller（在前端全部切换后）
- [ ] 删除旧 `backend.web` 下已空置的 controller/service/persistence 旧包（分批删）
- [ ] 清理重复 DTO/Record 暴露
- [ ] 文档归档：路由矩阵、表 ownership、事件清单、错误码清单
