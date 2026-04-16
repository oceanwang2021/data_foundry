# Data Foundry（datafoundry_java）项目架构与代码结构分析

> 生成时间：2026-04-16（Asia/Shanghai）  
> 分析范围：当前仓库 `E:\huatai\datafoundry_java` 的**实际落地代码**（Spring Boot 多服务 + Next.js 前端 + MySQL 脚本）。

## 1. 总览：这是一个什么仓库

该仓库是“Data Foundry（AI 采数平台）”的**可联调原型**：

- **前端**：Next.js（App Router）负责项目/需求/任务/运维等页面
- **后端**：Spring Boot 多模块拆分为
  - backend-service：业务主服务（项目、需求、宽表定义、任务计划等）
  - scheduler-service：调度服务（调度作业列表、创建作业）
  - agent-service：采数 Agent Mock（接收执行请求并返回模拟结果）
- **数据库**：MySQL（拆分两套 schema：backend 与 scheduler）

> 注意：`docs/` 中存在部分文档仍以 “FastAPI + SQLite” 为主叙述，这是历史设计/旧实现方案；本仓库 **当前落地** 以 `docs/java-refactor-quickstart.md`、根目录 `README.md`、以及 `data-foundry-*-service/` 的代码为准。

## 2. 代码目录结构（Top-level）

```text
E:\huatai\datafoundry_java
├─ data-foundry-frontend/          # Next.js 前端
├─ data-foundry-backend-service/   # Spring Boot 业务后端（8000）
├─ data-foundry-scheduler-service/ # Spring Boot 调度服务（8200）
├─ data-foundry-agent-service/     # Spring Boot Agent Mock（8100）
├─ data-foundry-common-contract/   # DTO/契约（供 backend/scheduler/agent 复用）
├─ db/
│  └─ mysql/                       # MySQL 初始化与 DDL/seed 脚本
└─ docs/                           # 架构/数据模型/方案文档 + Java 联调说明
```

## 3. 技术栈与版本（以“声明版本 + 锁定版本/约束”为准）

### 3.1 前端（`data-foundry-frontend/`）

- 框架：Next.js
  - `package.json`：`next: ^13.5.11`
  - `package-lock.json` 锁定：`next@13.5.11`
- React：
  - `package.json`：`react: ^18.2.0`、`react-dom: ^18.2.0`
  - `package-lock.json` 锁定：`react@18.3.1`、`react-dom@18.3.1`
- TypeScript：
  - `package.json`：`typescript: ^5.9.3`
  - `package-lock.json` 锁定：`typescript@5.9.3`
- 样式：Tailwind CSS
  - `package.json`：`tailwindcss: ^3.4.1`
  - `package-lock.json` 锁定：`tailwindcss@3.4.19`
- 测试：Vitest（`vitest: ^4.1.0`）

### 3.2 后端（Java 多模块，`pom.xml`）

- Java：`1.8`（Java 8）
- Spring Boot：`2.7.18`
- MyBatis Spring Boot Starter：`2.3.2`
- MySQL 驱动：`com.mysql:mysql-connector-j`（运行时依赖，版本由 Spring Boot 2.7.18 的依赖管理控制）

### 3.3 数据库（MySQL）

从 `db/mysql/init_local.sql` 的字符集/排序规则可推断目标环境为 **MySQL 8.0+**（使用 `utf8mb4_0900_ai_ci`）。

数据库按服务拆分为两套 schema：

- `data_foundry_backend`：业务主数据与宽表相关数据（backend-service 使用）
- `data_foundry_scheduler`：调度/运行时数据（scheduler-service 使用）

## 4. 依赖清单（关键依赖）

### 4.1 Maven（后端）

聚合模块（根 `pom.xml`）：

- `data-foundry-common-contract`
- `data-foundry-backend-service`
- `data-foundry-scheduler-service`
- `data-foundry-agent-service`

后端常用依赖（以 `data-foundry-backend-service/pom.xml` 为例）：

- `spring-boot-starter-web`（REST API）
- `spring-boot-starter-actuator`（健康检查/指标，默认 `/actuator/*`）
- `spring-boot-starter-validation`（参数校验）
- `mybatis-spring-boot-starter`（DAO 映射）
- `mysql-connector-j`（MySQL 连接）

### 4.2 NPM（前端）

核心依赖见 `data-foundry-frontend/package.json`：

- `next`、`react`、`react-dom`
- `date-fns`（日期工具）
- `tailwindcss`、`postcss`、`autoprefixer`
- `eslint`、`eslint-config-next`

## 5. 运行与联调方式（本仓库“可跑起来”的路径）

### 5.1 MySQL 初始化

推荐使用脚本 `db/mysql/init_local.sql` 一次性完成：

- 创建数据库：`data_foundry_backend` / `data_foundry_scheduler`
- 创建用户：`data_foundry_backend` / `data_foundry_scheduler`
- 导入 DDL：`db/mysql/backend/001_schema.sql` 与 `db/mysql/scheduler/001_schema.sql`

### 5.2 服务端口与配置

配置文件：

- backend：`data-foundry-backend-service/src/main/resources/application.yml`
  - `server.port: 8000`
  - `spring.datasource.url: jdbc:mysql://127.0.0.1:3306/data_foundry_backend ...`
  - 依赖调度服务：`data-foundry.scheduler.base-url: http://127.0.0.1:8200`
- scheduler：`data-foundry-scheduler-service/src/main/resources/application.yml`
  - `server.port: 8200`
  - `spring.datasource.url: jdbc:mysql://127.0.0.1:3306/data_foundry_scheduler ...`
- agent：`data-foundry-agent-service/src/main/resources/application.yml`
  - `server.port: 8100`

Windows 启动脚本（根目录）：

- `start-backend.cmd`：`mvn -pl data-foundry-backend-service -am spring-boot:run`
- `start-scheduler.cmd`：`mvn -pl data-foundry-scheduler-service -am spring-boot:run`
- `start-agent.cmd`：`mvn -pl data-foundry-agent-service -am spring-boot:run`
- `start-frontend-dev.cmd`：进入前端目录后 `npm run dev`

### 5.3 前端如何访问后端

前端通过 Next.js 的 Route Handler 代理所有 `/api/*` 请求到后端（避免浏览器跨域）：

- 代理实现：`data-foundry-frontend/app/api/[...path]/route.ts`
- 后端基址：`data-foundry-frontend/.env.local`
  - `BACKEND_API_BASE=http://127.0.0.1:8000`

## 6. 数据库结构（DDL 与当前代码使用范围）

### 6.1 backend DB（`data_foundry_backend`）

最小可用 DDL：`db/mysql/backend/001_schema.sql`（目前 Java 代码至少依赖 `projects`、`requirements`）

完整 DDL（规划/目标态）：`db/mysql/backend/002_full_schema.sql`，包含表（14 张）：

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

> 当前 Java 落地代码主要直接访问：`projects`、`requirements`、`wide_tables`、`task_groups`、`fetch_tasks`。其余表更多是“目标态/后续补齐”。

### 6.2 scheduler DB（`data_foundry_scheduler`）

DDL：`db/mysql/scheduler/001_schema.sql`，目前仅 1 张表：

- `schedule_jobs`

## 7. 主要功能模块与接口（按服务拆分，含代码位置）

下面列出**当前仓库实际实现的接口**，以及对应代码位置（Controller 类）。

### 7.1 backend-service（8000，业务主服务）

#### 7.1.1 健康检查

- `GET /health`  
  - 代码：`data-foundry-backend-service/src/main/java/com/huatai/datafoundry/backend/web/HealthController.java`

#### 7.1.2 项目（Project）

- `GET /api/projects`（项目列表）  
- `GET /api/projects/{projectId}`（项目详情）  
  - 代码：`data-foundry-backend-service/src/main/java/com/huatai/datafoundry/backend/web/ProjectController.java`
  - DAO：`data-foundry-backend-service/src/main/java/com/huatai/datafoundry/backend/persistence/ProjectMapper.java`

#### 7.1.3 需求（Requirement）+ 主宽表（Primary WideTable）

- `GET /api/projects/{projectId}/requirements`（需求列表，包含主宽表摘要）  
- `POST /api/projects/{projectId}/requirements`（创建需求 + 创建 1 张主宽表）  
- `GET /api/projects/{projectId}/requirements/{requirementId}`（需求详情）  
- `PUT /api/projects/{projectId}/requirements/{requirementId}`（更新需求；当 status 置为 `ready` 时锁定 schema，并生成默认任务组）  
  - 代码：`data-foundry-backend-service/src/main/java/com/huatai/datafoundry/backend/web/RequirementController.java`
  - 依赖服务：`TaskPlanService.ensureDefaultTaskGroupsOnSubmit(...)`
  - DAO：`RequirementMapper` / `WideTableMapper`

#### 7.1.4 宽表定义更新（写入 JSON 配置）

- `PUT /api/requirements/{requirementId}/wide-tables/{wideTableId}`（更新宽表 schema/scope/指标组/调度规则等 JSON 字段；schema 锁定时会拒绝）  
  - 代码：`data-foundry-backend-service/src/main/java/com/huatai/datafoundry/backend/web/RequirementWideTableController.java`

#### 7.1.5 计划落地（Plan/Preview 协议占位）

- `POST /api/requirements/{requirementId}/wide-tables/{wideTableId}/preview`（预览持久化：当前为兼容占位，仅返回 ok）  
- `POST /api/requirements/{requirementId}/wide-tables/{wideTableId}/plan`（计划落地：主要 upsert TaskGroup）  
  - 代码：`data-foundry-backend-service/src/main/java/com/huatai/datafoundry/backend/web/WideTablePlanController.java`
  - 关键落地逻辑：`TaskPlanService.upsertPlanTaskGroups(...)`

#### 7.1.6 任务（TaskGroup / FetchTask）查询

- `GET /api/projects/{projectId}/requirements/{requirementId}/task-groups`（任务组列表）  
- `GET /api/projects/{projectId}/requirements/{requirementId}/tasks`（采集任务列表）  
  - 代码：`data-foundry-backend-service/src/main/java/com/huatai/datafoundry/backend/web/RequirementTaskController.java`
  - DAO：`TaskGroupMapper` / `FetchTaskMapper`

#### 7.1.7 执行（占位执行：用于前端按钮不 404）

- `POST /api/task-groups/{taskGroupId}/ensure-tasks`（确保 FetchTask 已生成：lazy generation）  
- `POST /api/task-groups/{taskGroupId}/execute`（执行任务组：当前直接把状态标记为 completed）  
- `POST /api/tasks/{taskId}/execute`（执行单任务：running -> completed）  
- `POST /api/tasks/{taskId}/retry`（重试：置回 pending）  
  - 代码：`data-foundry-backend-service/src/main/java/com/huatai/datafoundry/backend/web/TaskExecutionController.java`
  - 计划生成核心：`data-foundry-backend-service/src/main/java/com/huatai/datafoundry/backend/service/TaskPlanService.java`

#### 7.1.8 调度服务 Facade（backend 转发 scheduler）

- `GET /api/schedule-jobs?trigger_type=&status=`（从 scheduler 拉取）  
- `POST /api/schedule-jobs`（在 scheduler 创建）  
  - 代码：`data-foundry-backend-service/src/main/java/com/huatai/datafoundry/backend/web/ScheduleJobFacadeController.java`
  - 配置：`data-foundry.scheduler.base-url`（见 backend `application.yml`）

#### 7.1.9 平台占位接口 + Demo 数据管理

以下接口目前主要用于“页面能渲染/不 404”，多数返回空数组或简易统计：

- `GET /api/knowledge-bases`
- `GET /api/preprocess-rules`
- `GET /api/audit-rules`
- `GET /api/acceptance-tickets`
- `GET /api/dashboard/metrics`（返回 projects/requirements 计数）
- `GET /api/ops/overview`
- `GET /api/ops/task-status-counts`
- `GET /api/ops/data-status-counts`
- `POST /api/admin/seed`（写入 Demo 项目/需求）
- `POST /api/admin/reset`（清空 Demo 项目/需求）
  - 代码：`data-foundry-backend-service/src/main/java/com/huatai/datafoundry/backend/web/PlatformStubController.java`
  - Demo 数据实现：`data-foundry-backend-service/src/main/java/com/huatai/datafoundry/backend/service/DemoDataService.java`

### 7.2 scheduler-service（8200，调度服务）

- `GET /health`  
  - `data-foundry-scheduler-service/src/main/java/com/huatai/datafoundry/scheduler/web/HealthController.java`

- `GET /api/schedule-jobs?trigger_type=&status=`（列表）  
- `GET /api/schedule-jobs/{jobId}`（详情）  
- `POST /api/schedule-jobs`（创建：当前为 skeleton 行为，创建后立即标记 completed）  
  - `data-foundry-scheduler-service/src/main/java/com/huatai/datafoundry/scheduler/web/ScheduleJobController.java`
  - DAO：`data-foundry-scheduler-service/src/main/java/com/huatai/datafoundry/scheduler/persistence/ScheduleJobMapper.java`

- `POST /api/admin/seed`（插入演示 schedule_jobs）  
- `POST /api/admin/reset`（清空 schedule_jobs）  
  - `data-foundry-scheduler-service/src/main/java/com/huatai/datafoundry/scheduler/web/AdminController.java`

### 7.3 agent-service（8100，采数 Agent Mock）

- `GET /health`  
  - `data-foundry-agent-service/src/main/java/com/huatai/datafoundry/agent/web/HealthController.java`

- `POST /agent/executions`（执行入口：返回 Mock 执行结果）  
  - `data-foundry-agent-service/src/main/java/com/huatai/datafoundry/agent/web/AgentExecutionController.java`
  - Mock 逻辑：`data-foundry-agent-service/src/main/java/com/huatai/datafoundry/agent/service/MockAgentService.java`
  - DTO 契约：`data-foundry-common-contract/src/main/java/com/huatai/datafoundry/contract/agent/*`

## 8. 前端页面与核心代码分布（与后端联动点）

### 8.1 路由页面（Next.js App Router）

页面入口位于 `data-foundry-frontend/app/`，例如：

- `/projects`：`data-foundry-frontend/app/projects/page.tsx`
- `/projects/[id]`：`data-foundry-frontend/app/projects/[id]/page.tsx`
- `/projects/[id]/requirements/[reqId]`：`data-foundry-frontend/app/projects/[id]/requirements/[reqId]/...`
- `/scheduling`：`data-foundry-frontend/app/scheduling/page.tsx`
- `/ops-monitoring`：`data-foundry-frontend/app/ops-monitoring/page.tsx`

### 8.2 API 客户端与后端对接

- API 访问封装：`data-foundry-frontend/lib/api-client.ts`
- 后端基址解析：`data-foundry-frontend/lib/api-base.ts`
- 代理层：`data-foundry-frontend/app/api/[...path]/route.ts`

### 8.3 业务核心前端逻辑（仍然存在的“原型期”实现）

`data-foundry-frontend/lib/` 中存在较多业务逻辑（计划、任务展开、提示词构造、处理/稽核等），在 Java 后端尚未完全迁移时仍可能承担部分计算/展示职责，例如：

- 任务计划对齐/合并：`task-plan-reconciliation.ts`
- 指标组 prompt 构造：`indicator-group-prompt.ts`
- 数据后处理模拟流水线：`requirement-data-pipeline.ts`
- 任务执行交互：`task-group-execution.ts`

> 从仓库定位上看，本项目处于“前端主流程逐步切换到后端 API、后端域模型逐步补齐”的迁移阶段。

## 9. 建议的阅读顺序（快速理解代码）

1. `docs/java-refactor-quickstart.md`（Java 联调骨架说明）
2. 根目录 `README.md`（模块划分与端口）
3. 后端接口入口：`data-foundry-backend-service/.../web/*Controller.java`
4. 任务计划核心：`data-foundry-backend-service/.../service/TaskPlanService.java`
5. MySQL 脚本：`db/mysql/init_local.sql` + `db/mysql/backend/001_schema.sql` + `db/mysql/scheduler/001_schema.sql`
6. 前端 API 调用链路：`data-foundry-frontend/lib/api-client.ts` + `app/api/[...path]/route.ts`

