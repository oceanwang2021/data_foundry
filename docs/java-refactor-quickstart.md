# Java 重构工程骨架（当前落地）

本仓库已新增 Maven 多模块与 3 个 Spring Boot 服务工程，用于承接“后端服务/调度服务/采数 Agent 服务”的 Java 迁移；前端保持不变，仍通过 Next.js 的 `/api/*` 代理转发到后端基址。

## 目录

- `data-foundry-backend-service/`：后端服务（端口 `8000`，MySQL：`data_foundry_backend`）
- `data-foundry-scheduler-service/`：调度服务（端口 `8200`，MySQL：`data_foundry_scheduler`）
- `data-foundry-agent-service/`：采数 Agent 服务（端口 `8100`，无状态，无库）
- `data-foundry-common-contract/`：公共契约（DTO/接口契约类，非部署）

## MySQL 建表脚本

- `db/mysql/backend/001_schema.sql`
- `db/mysql/scheduler/001_schema.sql`

## Flyway（可选，推荐用于环境对齐）

重构期间默认 **不自动改库**：backend/scheduler 的 `application.yml` 都配置了：
- `spring.flyway.enabled=false`
- `spring.flyway.baseline-on-migrate=true`
- `spring.flyway.locations=classpath:db/migration`

需要让 schema 具备“可初始化 + 可增量升级 + 可对齐”能力时，建议使用 Flyway：
- SOP 文档：`docs/db-migration-sop.md`
- 空库初始化（opt-in）：启动服务前设置环境变量 `SPRING_FLYWAY_ENABLED=true`
- 已有库接入（opt-in）：同样设置 `SPRING_FLYWAY_ENABLED=true`，Flyway 会先 baseline 再执行增量迁移（如 `V002__add_indexes.sql`）

## 本机启动（联调）

为避免沙盒环境对 `C:\Users\...\ .m2` 的写入限制，建议统一加 `--% -Dmaven.repo.local=E:\huatai\datafoundry_java\tmp\.m2`。

- backend-service：
  - `cd data-foundry-backend-service; mvn --% -Dmaven.repo.local=E:\huatai\datafoundry_java\tmp\.m2 spring-boot:run`
- scheduler-service：
  - `cd data-foundry-scheduler-service; mvn --% -Dmaven.repo.local=E:\huatai\datafoundry_java\tmp\.m2 spring-boot:run`
- agent-service：
  - `cd data-foundry-agent-service; mvn --% -Dmaven.repo.local=E:\huatai\datafoundry_java\tmp\.m2 spring-boot:run`

## 执行回写闭环（可选联调）

默认 backend 会“占位立即完成”（不依赖 scheduler/agent）。要联调完整闭环（scheduler→agent→backend 回写）：
- backend 启动时设置 `SPRING_PROFILES_ACTIVE=integration`（或 `DATAFOUNDRY_TASK_EXECUTION_PLACEHOLDER_COMPLETE=false`）
- 说明文档：`docs/execution-callback-smoke.md`

## 前端联调

前端已有 `/api/*` 代理路由与环境变量：

- `data-foundry-frontend/.env.local`
  - `BACKEND_API_BASE=http://127.0.0.1:8000`

因此浏览器访问前端时，页面请求的 `/api/...` 会由 Next.js 转发到后端服务。

## 说明

当前 Java 服务提供的是“可启动/可联调的骨架”和少量占位接口；业务域完整迁移（宽表、任务、执行、回填等）会在后续迭代中逐步补齐。
