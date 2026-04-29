# MySQL → GoldenDB：变更范围梳理与分阶段变更计划

> 适用范围：`datafoundry_java`（已完成 DDD 分层重构后的代码结构）  
> 目标：将运行数据库从 **MySQL** 切换为 **GoldenDB**，并保持领域分层稳定（尽量将变更收敛在 `infrastructure` + 配置 + 迁移脚本层）。  
> 原则：小步可回滚、按 profile 灰度切换、每个 PR 控制在 300~800 行改动。

---

## 1. 变更范围（Where to change）

### 1.1 涉及的服务/模块

- `data-foundry-backend-service`：业务库（当前为 `data_foundry_backend`）
- `data-foundry-scheduler-service`：调度库（当前为 `data_foundry_scheduler`）
- `data-foundry-agent-service`：当前不直连 DB（通常无需变更）
- `db/`：本地初始化脚本、参考 DDL、以及 Flyway 迁移脚本

### 1.2 当前仓库中“绑定 MySQL”的位置（需要改/需要验证）

#### A) 配置层：JDBC URL / Driver

- backend：`data-foundry-backend-service/src/main/resources/application.yml`
  - `spring.datasource.driver-class-name: com.mysql.cj.jdbc.Driver`
  - `spring.datasource.url: jdbc:mysql://...`
- scheduler：`data-foundry-scheduler-service/src/main/resources/application.yml`
  - 同上

> 处理方式：新增 GoldenDB profile（例如 `application-goldendb.yml`）并完成可切换；是否保留 MySQL 本地开发由团队决定（建议保留）。

#### B) 依赖层：MySQL Connector

- backend：`data-foundry-backend-service/pom.xml`（`com.mysql:mysql-connector-j` runtime）
- scheduler：`data-foundry-scheduler-service/pom.xml`（同上）

> 处理方式：替换为 GoldenDB JDBC Driver（或双驱动并存，通过 profile 控制实际使用）。

#### C) 运行期 SQL：MySQL 方言（潜在不兼容点）

当前代码/SQL 中出现：

- `ON DUPLICATE KEY UPDATE`（多处 upsert：backend mapper/服务、scheduler admin seed）
- `LIMIT 1`（多处单条查询）

> 处理方式：若 GoldenDB 支持 MySQL 语法则以“验证”为主；若不支持则引入 **SQL 方言适配**（建议走 MyBatis `databaseId` 或关键 SQL 从注解迁到 XML 双版本）。

#### D) DDL/迁移脚本：MySQL DDL 语法与类型（必改）

典型 MySQL-only 内容：

- 列类型：`JSON`、`TINYINT(1)`、`MEDIUMTEXT`
- 表选项：`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
- 时间列：`ON UPDATE CURRENT_TIMESTAMP`

脚本位置：

- `db/mysql/backend/001_schema.sql`
- `db/mysql/scheduler/001_schema.sql`
- backend Flyway：`data-foundry-backend-service/src/main/resources/db/migration/V00*__*.sql`
- scheduler Flyway：`data-foundry-scheduler-service/src/main/resources/db/migration/V00*__*.sql`

> 处理方式：新增 `db/goldendb/**` 与 `classpath:db/migration/goldendb/**` 双轨脚本，并将 Flyway locations 按 vendor 分离。

#### E) 工具/脚手架：硬编码 MySQL 的 CLI

- `data-foundry-backend-service/src/main/java/com/huatai/datafoundry/backend/tools/TargetTablesBootstrapCli.java`
  - 目前硬编码 `jdbc:mysql://...`、`com.mysql.cj.jdbc.Driver`、`information_schema`、以及 MySQL DDL

> 处理方式：改为走 Spring `DataSource`（vendor 无关），或标记为仅本地 MySQL demo 工具并在 GoldenDB 环境禁用。

---

## 2. GoldenDB 兼容性前置确认（否则无法确定改造强度）

在进入实现前，建议先确认：

1. **GoldenDB 兼容模式/方言**：MySQL / Oracle / PostgreSQL 兼容？（不同模式决定 SQL/DDL 改造量）
2. **JDBC Driver**：Maven 坐标（groupId/artifactId/version）或私服/本地 jar 接入方式；`driver-class-name` 是什么
3. **SQL 兼容**：是否支持 `ON DUPLICATE KEY UPDATE`、`LIMIT`、`CURRENT_TIMESTAMP ON UPDATE`、`JSON` 类型
4. **Flyway 可用性**：是否允许在目标环境执行 Flyway（权限、审计策略、是否需要 schema history 表权限）

> 若 GoldenDB 是强 MySQL 兼容：改造会显著收敛在“驱动 + 配置 + 少量 DDL”。  
> 若不是：需要引入更明确的“数据库方言适配”策略（DDL 与 SQL 双轨）。

---

## 3. 分阶段变更计划（Phase plan）

> 说明：每个阶段可拆多个小 PR；每个 PR 建议 300~800 行变更；每个阶段开始前先明确“变更范围”，确认后再执行。

### Phase 0：准备/对齐（0 代码或极少代码）

**目标**：把 GoldenDB 的约束落成“可执行输入”，避免实现阶段返工。

**产出**：

- GoldenDB 连接信息模板（url/driver/username/password）
- 兼容性确认结论（第 2 节 4 点）

**DoD**：

- 团队确认切换策略：双驱动并存（推荐）或一次性替换

### Phase 1：依赖 + 配置切换底座（先“能连上”）

**目标**：backend/scheduler 在 `goldendb` profile 下能拿到连接并启动（不要求功能全通）。

**变更范围**：

- 替换/新增 GoldenDB JDBC Driver 依赖（backend/scheduler）
- 新增 profile：
  - `data-foundry-backend-service/src/main/resources/application-goldendb.yml`
  - `data-foundry-scheduler-service/src/main/resources/application-goldendb.yml`
- datasource/flyway 的 vendor 差异收敛到配置（避免业务代码感知）

**DoD**：

- `SPRING_PROFILES_ACTIVE=goldendb` 下 backend/scheduler 可启动并成功连接 DB（以最小健康检查为准）

### Phase 2：DDL/Flyway 双轨（让库结构可用、可版本化）

**目标**：GoldenDB 环境能通过脚本/迁移创建出 backend/scheduler 运行所需表结构。

**变更范围**：

- 为 backend/scheduler 提供 GoldenDB 版 baseline/indexes 脚本
- Flyway locations 按 vendor 分离（示例）：
  - `classpath:db/migration/mysql`
  - `classpath:db/migration/goldendb`
- 保留 `db/mysql/*` 作为参考/回退，新建 `db/goldendb/*` 作为 GoldenDB 初始化脚本

**关键改造点（脚本层）**：

- `JSON` 列：按 GoldenDB 支持情况改为 `TEXT/CLOB` 或原生 JSON
- 移除/替换 `ENGINE/CHARSET`
- `ON UPDATE CURRENT_TIMESTAMP`：按 GoldenDB 语法替代（或改为触发器/应用侧维护）
- `TINYINT(1)`：替换为 `SMALLINT/BOOLEAN` 等等价类型

**DoD**：

- 空库执行 GoldenDB baseline 后，两服务可正常启动（不报“表/字段不存在”）

### Phase 3：SQL 方言适配（修运行期不兼容）

**目标**：核心链路在 GoldenDB 下可用。

**变更范围**：

- 处理 `ON DUPLICATE KEY UPDATE`（upsert）
- 处理 `LIMIT 1`
- 如有需要，引入 MyBatis 的 `databaseIdProvider` 或双 SQL 方案（同一 mapper 按 DB 选择 SQL）

**建议策略**：

- 若 GoldenDB 支持 MySQL upsert/limit：以验证为主，仅修少量差异
- 若不支持：
  - upsert：改 `MERGE INTO`（或 GoldenDB 等价语法）
  - limit：改 `FETCH FIRST 1 ROWS ONLY`（或等价）

**DoD**：

- 核心读写链路跑通（建议最小集）：
  - Project/Requirement 列表与详情
  - TaskGroup/FetchTask 列表与执行触发
  - ScheduleJob 创建与列表（backend→scheduler）

### Phase 4：工具/文档/联调脚本收口（让切换“可重复”）

**目标**：形成可复制的 GoldenDB 启动/初始化 SOP，并降低“隐性 MySQL 依赖”。

**变更范围**：

- `TargetTablesBootstrapCli` vendor 化或下线/隔离
- 文档更新：
  - `docs/db-migration-sop.md`
  - `docs/DDD-数据库表改造方案.md`
  - 新增 GoldenDB 初始化说明、profile 用法

**DoD**：

- 新同学按文档可在 GoldenDB 环境从 0 启动并跑通最小链路

---

## 4. 建议的 PR 拆分（示例）

1. PR-DB-1：JDBC Driver + `application-goldendb.yml`（backend/scheduler）
2. PR-DB-2：backend GoldenDB baseline/Flyway 双轨 locations
3. PR-DB-3：scheduler GoldenDB baseline/Flyway 双轨 locations
4. PR-DB-4：SQL 方言适配（upsert/limit 第一批，保证核心链路）
5. PR-DB-5：补齐剩余 SQL/脚本 + 文档 SOP + 工具收口

---

## 5. 需要你方提供/确认的信息（输入项）

为确保计划可落地，建议你方先确认并提供：

- GoldenDB JDBC driver 的坐标/获取方式（Maven 私服坐标或 jar）
- GoldenDB 兼容模式与版本
- 是否允许 Flyway 在目标环境执行（权限/审计要求）
- 目标环境 schema/用户权限策略（是否一库一用户、是否允许建表/建索引、是否需要指定 schema 前缀）

