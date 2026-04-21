# DB 迁移与版本化（M5b / Flyway SOP）

> 目标：让**开发环境 / 联调环境**的 schema 具备“可初始化、可增量升级、可对齐”的可执行 SOP；并且在重构期默认**不自动改库**（opt-in 执行）。

## 1. 适用范围与约束

- 服务与库（当前 MVP 运行态）
  - `data-foundry-backend-service` → MySQL：`data_foundry_backend`
  - `data-foundry-scheduler-service` → MySQL：`data_foundry_scheduler`
  - `data-foundry-agent-service`：无库
- 约束
  - 重构期默认禁用 Flyway（避免启动即改库）：`spring.flyway.enabled=false`
  - 不提供自动回滚；如需回滚，依赖 DB 备份/快照（Flyway 解决“前进”）。

## 2. 迁移脚本位置（代码即事实）

Flyway migrations（按服务隔离）：
- backend：`data-foundry-backend-service/src/main/resources/db/migration/`
  - `V001__baseline.sql`：最小可运行 schema（DROP-free）
  - `V002__add_indexes.sql`：索引补齐（增量）
- scheduler：`data-foundry-scheduler-service/src/main/resources/db/migration/`
  - `V001__baseline.sql`
  - `V002__add_indexes.sql`

手工建表脚本（无 Flyway 时快速初始化）：
- backend：`db/mysql/backend/001_schema.sql`
- scheduler：`db/mysql/scheduler/001_schema.sql`

说明：
- `db/mysql/**/001_schema.sql` 与 Flyway 的 `V001 + V002` 目标保持一致，用于“一键初始化”；但它不会记录版本历史（`flyway_schema_history`）。
- 需要“持续演进 + 环境对齐”时，优先使用 Flyway。

## 3. 配置约定（默认不自动执行）

backend / scheduler 的 `application.yml` 已统一配置（默认禁用）：
- `spring.flyway.enabled=false`
- `spring.flyway.locations=classpath:db/migration`
- `spring.flyway.baseline-on-migrate=true`
- `spring.flyway.baseline-version=1`

## 4. 两种初始化方式（选其一）

### 方式 A：手工初始化（最快）

1) 创建数据库与账号（按环境规范执行）
2) 执行：
- backend：`db/mysql/backend/001_schema.sql`
- scheduler：`db/mysql/scheduler/001_schema.sql`

优点：快；缺点：无版本历史，后续增量难对齐。

### 方式 B：Flyway 初始化（推荐：可演进）

1) 创建数据库与账号（库可以是空库）
2) 启动服务时显式开启 Flyway（opt-in）：
- backend：设置环境变量 `SPRING_FLYWAY_ENABLED=true`
- scheduler：设置环境变量 `SPRING_FLYWAY_ENABLED=true`

结果：
- 空库：执行 `V001` → `V002`，并创建 `flyway_schema_history`
- 非空库（已有表但无 history）：
  - 因 `baseline-on-migrate=true`，Flyway 先 baseline 为版本 `1`
  - 然后执行后续版本（如 `V002`）

建议校验：
- 检查 `flyway_schema_history` 是否存在且版本记录符合预期。

## 5. 重构期的“对齐策略”

为避免“新旧模型并存但 schema 不一致”，约定：
- 任何 Java 代码新增/依赖的列/索引/表：
  - 先补到对应服务的 `src/main/resources/db/migration/V00x__*.sql`
  - 同步更新 `db/mysql/**/001_schema.sql`（保持新环境一键初始化可用）
- 表 ownership 以 `docs/表-ownership.md` 为准；写路径只能出现在 owner context 的 repository/application 中。

