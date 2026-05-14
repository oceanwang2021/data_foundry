# Agent 结果存储与清洗落库改动日志

日期：2026-05-14

## 背景

本次改动围绕“Agent AI 采集任务在 `GET /api/task/{task_id}/result` 返回结果之后”的链路展开，目标是让 Agent 返回结果能够被统一归一化、随 scheduler 回调传回 backend，并最终写入现有平台宽表行 `wide_table_rows.indicator_values_json`。

本轮不处理外部 Agent 任务创建、SSE 执行、轮询时机，也不实现动态物理目标表。

## 已完成改动

### common-contract

- 扩展 `AgentExecutionResponse`：
  - 新增 `externalTaskId`
  - 新增 `finalReport`
  - 新增 `rawResult`
  - 新增 `warnings`
  - 新增 `normalizedRows`
- 扩展 `NarrowIndicatorRow`：
  - 新增业务日期、指标列、原始值、发布日期、来源、上下限、置信度、推理说明、未找到原因等字段。
  - 保留原有字段，兼容现有 mock 和旧调用方。

### agent-service

- 新增 `AgentResultNormalizer`：
  - 优先读取结构化 `rows` / `table_data` / `tableData`。
  - 若结构化行为空，解析 `final_report` 中第一张 Markdown 表格。
  - 支持窄表行直接归一化。
  - 支持宽表行按当前 FetchTask 的 `indicatorKeys` 反向展开为多条指标行。
  - 保留原始结果、最终报告和 warning，方便后续追溯。
- 更新 `MockAgentService`：
  - mock 返回结果开始填充 `externalTaskId`、`finalReport`、`rawResult`、`normalizedRows`。
  - mock 的 `NarrowIndicatorRow` 增加 `businessDate`、`rawValue`、`confidence` 等新字段。

### scheduler-service

- 更新 `ScheduleJobCreatedHandler`：
  - Agent 执行完成后，scheduler 在回调 backend 时把 `agent_result` 一并放入 `/internal/scheduler/executions/callback` 请求体。
- 更新 `BackendClientConfig`：
  - scheduler 调用 backend 的 RestTemplate 使用 `SNAKE_CASE` Jackson 配置，保证内部回调字段如 `agent_result`、`fetch_task_id` 能正确匹配 backend。

### backend-service

- 新增 Flyway 迁移 `V007__add_collection_results.sql`：
  - 新增 `collection_results`，用于保存 FetchTask 级别的 Agent 原始结果档案。
  - 新增 `collection_result_rows`，用于保存单指标粒度的清洗后窄表结果。
- 新增领域模型：
  - `CollectionResult`
  - `CollectionResultRow`
  - `WideTableRowValuePatch`
- 新增仓储接口：
  - `CollectionResultRepository`
  - `WideTableRowWriteRepository`
- 新增 MyBatis 实现：
  - `CollectionResultMapper`
  - `MybatisCollectionResultRepository`
  - `MybatisWideTableRowWriteRepository`
- 扩展 `WideTableRowMapper`：
  - 新增按 `wide_table_id + row_id` 查询宽表行的方法，用于合并写回已有 `indicator_values_json`。
- 扩展 `FetchTaskRepository` / `FetchTaskMapper`：
  - 新增按 task group 查询 FetchTask。
  - 新增同时更新任务状态与置信度的方法。
- 新增 `CollectionResultAppService`：
  - 接收 scheduler callback 中的 `agent_result`。
  - 保存原始结果到 `collection_results`。
  - 将归一化行写入 `collection_result_rows`。
  - 只接受当前 FetchTask `indicator_keys_json` 中声明的指标。
  - 发现未知指标或维度冲突时，将结果行标记为 `rejected`，不写入宽表。
  - 对 NUMBER / INTEGER / DATE 做基础清洗。
  - 将 accepted 行合并写回 `wide_table_rows.indicator_values_json`。
- 更新 `TaskExecutionCallbackAppService`：
  - 支持处理 callback 中的 `agent_result`。
  - Agent 有可识别结果时，FetchTask 进入 `completed`。
  - Agent 失败或无可识别结果时，FetchTask 进入 `failed`。
  - 回调后按当前 task group 下所有 FetchTask 重新汇总 `completed_tasks`、`failed_tasks` 和 task group 状态。

## 当前仍在进行的事项

- backend 查询接口尚未完全接入：
  - `GET /api/tasks/{taskId}/results`
  - `GET /api/tasks/{taskId}/runs`
- 前端尚未完成全部适配：
  - `api-client` 还需要读取真实 `raw_value`、`source_link`、`quote_text`、`confidence`。
  - `FetchTaskDetailPopup` 和任务详情页还需要优先展示 backend 返回的真实窄表结果。
  - `preprocessing` 页面还需要从静态 demo 数据改为读取已落库宽表结果。
- 测试尚未补齐和执行：
  - backend 结果解析、幂等、宽表写回测试。
  - frontend 映射和展示测试。
  - Maven / frontend test/build 验证。

## 2026-05-14 启动问题修复

- 修复 `TaskExecutionCallbackAppServiceTest` 仍使用旧构造器的问题，避免 backend 在 `spring-boot:run` 的 `test-compile` 阶段失败，导致前端代理请求 `127.0.0.1:8000` 时出现 502 / ECONNREFUSED。
- 更新 `start-backend.cmd`、`start-agent.cmd`、`start-scheduler.cmd`、`start-all.ps1`：
  - 不再写死不可用的 `JAVA_HOME` 和 `MAVEN_HOME`。
  - 优先使用当前环境变量；若未设置，则回退到 `%USERPROFILE%\.jdks\temurin-8\jre` 和 `%USERPROFILE%\.trae-cn\tools\maven\latest\bin\mvn.cmd`。
  - 默认使用 `%USERPROFILE%\.m2\repository` 作为 Maven 本地仓库；如需强制离线启动，可设置 `DATAFOUNDRY_MAVEN_OFFLINE=1`。
- 已验证 backend、scheduler、agent 三个 Java 模块均可通过 `test -DskipTests` 编译检查；backend 启动日志显示 Tomcat 可正常启动到 `8000` 端口。

## 重要说明

- 示例目录 `db/mysql/测试数据/算法算力相关接口数据/20260313_145542` 仅作为开发 fixture，不作为运行时存储位置。
- 本次实现的 v1 目标表仍是 `wide_table_rows`，不会创建动态物理业务表。
- 当前工作树中已有的 `application.yml`、`next-env.d.ts` 和示例数据目录改动被视为既有用户改动，本次没有回滚。
