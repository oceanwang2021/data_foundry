# 基于 XXL-JOB 的调度设计清单

## 1. 文档目标

本文档用于将当前 XXL-JOB 调度方案细化为可直接进入开发实施的设计清单。

重点覆盖四部分内容：

1. 库表设计与迁移范围。
2. `xxl-job-admin`、`scheduler-service`、`backend-service` 之间的接口设计。
3. 类设计、分层职责与代码归属。
4. 与当前代码的映射关系，以及推荐实施顺序。

本文档的目标不是讨论思路，而是作为后续开发排期、建模、落库、编码的直接输入。

---

## 2. 范围与边界

### 2.1 本次纳入范围

- 本地部署 XXL-JOB，并接入当前项目。
- 支持月频、年频数据采集任务在指定时间自动触发。
- 基于调度规则自动创建 `task_group` 与 `fetch_tasks`。
- 复用现有 `scheduler-service -> agent-service -> backend-service callback` 的执行链路。
- 补齐业务侧调度日志、幂等控制、失败重跑能力。

### 2.2 第一阶段暂不纳入范围

- 完整的前端“调度规则管理页面”。
- 与 XXL-JOB Admin 的完整双向 API 同步。
- 全量稽核引擎实现。
- GoldenDB 生产细节适配以外的深度数据库治理工作。

### 2.3 设计原则

- `XXL-JOB Admin` 只负责“什么时候触发”。
- `scheduler-service` 只负责“接收调度触发并转发”。
- `backend-service` 负责“按规则生成任务、编排执行、记录业务状态”。
- `agent-service` 继续负责采集执行。

---

## 3. 当前代码能力映射

## 3.1 scheduler-service 当前已有能力

- 应用入口：[DataFoundrySchedulerApplication](E:\huatai\datafoundry_java\data-foundry-scheduler-service\src\main\java\com\huatai\datafoundry\scheduler\DataFoundrySchedulerApplication.java)
- 调度任务查询/创建接口：[ScheduleJobController](E:\huatai\datafoundry_java\data-foundry-scheduler-service\src\main\java\com\huatai\datafoundry\scheduler\schedule\interfaces\web\ScheduleJobController.java)
- 调度任务应用服务：[ScheduleJobAppService](E:\huatai\datafoundry_java\data-foundry-scheduler-service\src\main\java\com\huatai\datafoundry\scheduler\schedule\application\service\ScheduleJobAppService.java)
- 调度任务创建后异步执行处理器：[ScheduleJobCreatedHandler](E:\huatai\datafoundry_java\data-foundry-scheduler-service\src\main\java\com\huatai\datafoundry\scheduler\schedule\application\handler\ScheduleJobCreatedHandler.java)
- 调用 backend 的客户端：[BackendClient](E:\huatai\datafoundry_java\data-foundry-scheduler-service\src\main\java\com\huatai\datafoundry\scheduler\schedule\infrastructure\client\BackendClient.java)
- 调用 agent 的客户端：[AgentClient](E:\huatai\datafoundry_java\data-foundry-scheduler-service\src\main\java\com\huatai\datafoundry\scheduler\schedule\infrastructure\client\AgentClient.java)
- 当前 scheduler 侧持久化表定义：[V001__baseline.sql](E:\huatai\datafoundry_java\data-foundry-scheduler-service\src\main\resources\db\migration\V001__baseline.sql)

结论：

- 当前 `scheduler-service` 已经是一个“调度执行桥接层”。
- 它可以记录 `schedule_job`，也可以调 agent 和回调 backend。
- 但它还不是“按 cron 周期驱动的业务调度中心”。

## 3.2 backend-service 当前可复用能力

- 手动执行任务入口：[TaskFacadeController](E:\huatai\datafoundry_java\data-foundry-backend-service\src\main\java\com\huatai\datafoundry\backend\task\interfaces\web\TaskFacadeController.java)
- 手动执行应用服务：[TaskAppService](E:\huatai\datafoundry_java\data-foundry-backend-service\src\main\java\com\huatai\datafoundry\backend\task\application\service\TaskAppService.java)
- 手动执行后创建 schedule job：[TaskExecutionAfterCommitHandler](E:\huatai\datafoundry_java\data-foundry-backend-service\src\main\java\com\huatai\datafoundry\backend\task\application\handler\TaskExecutionAfterCommitHandler.java)
- scheduler 回调入口：[SchedulerExecutionCallbackController](E:\huatai\datafoundry_java\data-foundry-backend-service\src\main\java\com\huatai\datafoundry\backend\task\interfaces\web\internal\SchedulerExecutionCallbackController.java)
- scheduler 拉取 prompt 入口：[SchedulerFetchTaskPromptController](E:\huatai\datafoundry_java\data-foundry-backend-service\src\main\java\com\huatai\datafoundry\backend\task\interfaces\web\internal\SchedulerFetchTaskPromptController.java)
- 回调处理服务：[TaskExecutionCallbackAppService](E:\huatai\datafoundry_java\data-foundry-backend-service\src\main\java\com\huatai\datafoundry\backend\task\application\service\TaskExecutionCallbackAppService.java)
- 结果落库与宽表回填：[CollectionResultAppService](E:\huatai\datafoundry_java\data-foundry-backend-service\src\main\java\com\huatai\datafoundry\backend\task\application\service\CollectionResultAppService.java)

结论：

- backend 已经具备任务执行、结果回调、状态回写、宽表落值的主链路能力。
- 新方案里最应该复用的就是这一部分，不建议重造执行链路。

## 3.3 当前缺口

当前代码还缺少以下核心能力：

- 调度规则定义。
- 基于 cron 的周期触发。
- `business_date` 解析逻辑。
- 调度业务日志表。
- 月频/年频的幂等控制。
- 调度规则与 `task_group` / `fetch_tasks` 的关系建模。

---

## 4. 目标架构

```text
XXL-JOB Admin
  -> 按 cron 触发 scheduler-service 的 JobHandler

scheduler-service
  -> 解析 XXL-JOB 参数
  -> 调用 backend-service 的内部调度分发接口
  -> 记录 scheduler 运行时 job 状态

backend-service
  -> 读取调度规则
  -> 计算 business_date
  -> 创建 task_group
  -> 创建 fetch_tasks
  -> 触发现有任务执行链路

agent-service
  -> 执行采集

backend-service callback 链路
  -> 落库采集结果
  -> 更新 task / task_group 状态
  -> 后续可接稽核
```

推荐职责拆分：

- `scheduler-service`：面向 XXL-JOB 的触发适配器。
- `backend-service`：业务调度中心。
- `agent-service`：采集执行器。

---

## 5. 库表设计清单

## 5.1 表归属总览

| 表名 | 所属服务 | 用途 | 阶段 |
|---|---|---|---|
| `schedule_jobs` | scheduler-service | 调度运行时记录 | 已有，需扩展 |
| `schedule_rules` | backend-service | 业务调度规则定义 | 第二阶段 |
| `schedule_trigger_logs` | backend-service | 业务调度触发日志 | 第二阶段 |
| `task_groups` | backend-service | 采集批次聚合 | 已有，需扩展 |
| `fetch_tasks` | backend-service | 采集任务实例 | 已有，需扩展 |
| `audit_rules` | backend-service | 稽核规则 | 第四阶段 |
| `audit_results` | backend-service | 稽核结果 | 第四阶段 |

## 5.2 保留并扩展 scheduler-service 的 `schedule_jobs`

### 当前作用

`schedule_jobs` 用于记录调度服务侧的运行状态，目前已经包含：

- `id`
- `task_group_id`
- `task_id`
- `trigger_type`
- `status`
- `started_at`
- `ended_at`
- `operator`
- `log_ref`

### 推荐新增字段

| 字段 | 类型 | 是否必需 | 用途 |
|---|---|---|---|
| `job_source` | `VARCHAR(32)` | 否 | 标识来源，如 `MANUAL`、`RULE_DISPATCH`、`TASK_RERUN` |
| `schedule_rule_id` | `VARCHAR(64)` | 否 | 回溯到业务调度规则 |
| `business_date` | `VARCHAR(32)` | 否 | 记录本次月频/年频业务周期 |
| `request_payload` | `LONGTEXT` | 否 | 保存调度入参快照 |
| `error_message` | `TEXT` | 否 | 保存失败原因 |

### 推荐索引

- `(schedule_rule_id, created_at)`
- `(task_group_id, created_at)`
- `(status, created_at)`

说明：

- `schedule_jobs` 仍然是 scheduler 运行时表。
- 它不应该替代 backend 侧的 `schedule_trigger_logs`。

## 5.3 新表：`schedule_rules`

### 用途

保存月频、年频等业务调度规则。

### 推荐 DDL

```sql
CREATE TABLE schedule_rules (
    id VARCHAR(64) PRIMARY KEY,
    requirement_id VARCHAR(64) NOT NULL,
    wide_table_id VARCHAR(64) NOT NULL,

    rule_name VARCHAR(255) NOT NULL,
    rule_code VARCHAR(128) DEFAULT NULL,
    frequency VARCHAR(32) NOT NULL COMMENT 'MONTHLY, YEARLY',
    cron_expression VARCHAR(128) NOT NULL,
    business_date_mode VARCHAR(64) NOT NULL DEFAULT 'PREVIOUS_PERIOD',

    xxl_job_group VARCHAR(128) DEFAULT NULL,
    xxl_executor_name VARCHAR(128) DEFAULT NULL,
    xxl_job_handler VARCHAR(128) NOT NULL DEFAULT 'dataCollectJobHandler',
    xxl_job_id VARCHAR(64) DEFAULT NULL,

    enabled TINYINT NOT NULL DEFAULT 1,
    trigger_type_default VARCHAR(32) NOT NULL DEFAULT 'SCHEDULE',

    last_trigger_time DATETIME DEFAULT NULL,
    last_success_time DATETIME DEFAULT NULL,
    last_trigger_status VARCHAR(32) DEFAULT NULL,
    next_trigger_time DATETIME DEFAULT NULL,

    created_by VARCHAR(128) DEFAULT NULL,
    updated_by VARCHAR(128) DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) COMMENT='业务调度规则表';
```

### 推荐索引

- `idx_schedule_rules_requirement_id (requirement_id)`
- `idx_schedule_rules_wide_table_id (wide_table_id)`
- `idx_schedule_rules_enabled_frequency (enabled, frequency)`
- 如启用编码，则增加 `uk_schedule_rules_rule_code (rule_code)`

说明：

- `cron_expression` 建议保存在 backend 侧，保证业务配置有完整落地。
- 第一阶段如果 XXL-JOB 任务由后台手工配置，则 `xxl_job_id` 可以为空。

## 5.4 新表：`schedule_trigger_logs`

### 用途

记录每一次调度规则触发的业务执行过程，包括自动、手动、补采、跳过、失败。

### 推荐 DDL

```sql
CREATE TABLE schedule_trigger_logs (
    id VARCHAR(64) PRIMARY KEY,
    schedule_rule_id VARCHAR(64) NOT NULL,
    schedule_job_id VARCHAR(64) DEFAULT NULL,
    task_group_id VARCHAR(64) DEFAULT NULL,

    trigger_type VARCHAR(32) NOT NULL COMMENT 'SCHEDULE, MANUAL, BACKFILL',
    trigger_source VARCHAR(32) NOT NULL COMMENT 'XXL_JOB, API, OPS',
    business_date VARCHAR(32) DEFAULT NULL,
    trigger_param_json LONGTEXT DEFAULT NULL,

    trigger_status VARCHAR(32) NOT NULL COMMENT 'RUNNING, SUCCESS, FAILED, SKIPPED',
    skip_reason VARCHAR(255) DEFAULT NULL,
    error_message TEXT DEFAULT NULL,

    started_at DATETIME DEFAULT NULL,
    ended_at DATETIME DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) COMMENT='业务调度触发日志表';
```

### 推荐索引

- `idx_schedule_trigger_logs_rule_created_at (schedule_rule_id, created_at)`
- `idx_schedule_trigger_logs_task_group_id (task_group_id)`
- `idx_schedule_trigger_logs_status_created_at (trigger_status, created_at)`
- `idx_schedule_trigger_logs_business_date (business_date)`

说明：

- `SKIPPED` 状态非常重要，用于记录“本次被触发了，但因为周期已执行或规则未启用而跳过”。

## 5.5 `task_groups` 扩展清单

现有 `task_groups` 建议增加或确认以下字段：

| 字段 | 类型 | 用途 |
|---|---|---|
| `schedule_rule_id` | `VARCHAR(64)` | 关联调度规则 |
| `business_date` | `VARCHAR(32)` | 保存 `2026-05` 或 `2025` |
| `frequency` | `VARCHAR(32)` | `MONTHLY` / `YEARLY` |
| `source_type` | `VARCHAR(32)` | `SCHEDULE` / `MANUAL` / `BACKFILL` |
| `triggered_by` | `VARCHAR(128)` | 触发人或触发源 |
| `start_time` | `DATETIME` | 执行开始时间 |
| `end_time` | `DATETIME` | 执行结束时间 |
| `error_message` | `TEXT` | 聚合错误信息 |
| `audit_status` | `VARCHAR(32)` | 稽核状态 |
| `acceptance_status` | `VARCHAR(32)` | 验收状态 |
| `publish_status` | `VARCHAR(32)` | 发布状态 |

### 推荐索引

- `uk_task_groups_rule_business_date (schedule_rule_id, business_date)`
- `idx_task_groups_requirement_id (requirement_id)`
- `idx_task_groups_wide_table_id (wide_table_id)`
- `idx_task_groups_batch_id (batch_id)`
- `idx_task_groups_status (status)`

说明：

- `schedule_rule_id + business_date` 是整个月频/年频调度的核心幂等边界。

## 5.6 `fetch_tasks` 扩展清单

现有 `fetch_tasks` 建议增加或确认以下字段：

| 字段 | 类型 | 用途 |
|---|---|---|
| `business_date` | `VARCHAR(32)` | 从 task_group 继承业务日期 |
| `request_payload_json` | `LONGTEXT` | 请求快照 |
| `response_payload_json` | `LONGTEXT` | 响应快照 |
| `retry_count` | `INT` | 重跑次数 |
| `can_rerun` | `TINYINT` | 是否允许手工重跑 |
| `audit_status` | `VARCHAR(32)` | 稽核状态 |
| `error_message` | `TEXT` | 失败原因 |
| `start_time` | `DATETIME` | 开始时间 |
| `end_time` | `DATETIME` | 结束时间 |

### 推荐索引

- `idx_fetch_tasks_task_group_id (task_group_id)`
- `idx_fetch_tasks_wide_table_id (wide_table_id)`
- `idx_fetch_tasks_status (status)`
- `idx_fetch_tasks_business_date (business_date)`

## 5.7 稽核相关表

第一阶段不阻塞调度主链路，但应预留设计：

- `audit_rules`
- `audit_results`

这两张表后续可以补进来，不影响当前 XXL-JOB 接入结构。

## 5.8 Flyway 脚本清单

建议在 `data-foundry-backend-service/src/main/resources/db/migration` 下新增：

1. `V015__add_schedule_rules.sql`
2. `V016__add_schedule_trigger_logs.sql`
3. `V017__alter_task_groups_for_scheduler.sql`
4. `V018__alter_fetch_tasks_for_scheduler.sql`
5. `V019__add_task_group_rule_business_date_unique.sql`

建议在 `data-foundry-scheduler-service/src/main/resources/db/migration` 下新增：

1. `V003__alter_schedule_jobs_for_xxljob_runtime.sql`

---

## 6. 接口设计清单

## 6.1 接口层次划分

本方案涉及三类接口：

1. XXL-JOB -> `scheduler-service` 的执行器触发。
2. `scheduler-service` -> `backend-service` 的内部调度分发接口。
3. `backend-service` 面向前端或运营的调度规则管理接口。

## 6.2 XXL-JOB 执行器接口

这部分不是我们手工定义的普通 REST API，而是通过 `xxl-job-core` 的 `XxlJobSpringExecutor` 自动提供执行器能力。

本地配置建议如下：

```yaml
xxl:
  job:
    admin:
      addresses: http://localhost:8080/xxl-job-admin
    accessToken: ${XXL_JOB_ACCESS_TOKEN:}
    executor:
      appname: data-foundry-scheduler-local
      ip: 127.0.0.1
      port: 9999
      logpath: ./logs/xxl-job/jobhandler
      logretentiondays: 30
```

## 6.3 scheduler-service 调用 backend 的内部接口

### 接口 1：按规则分发调度

| 项 | 设计 |
|---|---|
| 方法 | `POST` |
| 路径 | `/internal/scheduler/rules/{ruleId}/dispatch` |
| 所属服务 | backend-service |
| 调用方 | scheduler-service JobHandler |
| 用途 | 将一次 XXL-JOB 触发转换为一次业务调度分发 |

请求体建议：

```json
{
  "trigger_type": "SCHEDULE",
  "trigger_source": "XXL_JOB",
  "frequency": "MONTHLY",
  "business_date": null,
  "business_date_mode": "PREVIOUS_PERIOD",
  "schedule_job_id": "SJ_xxx",
  "xxl_job_param": "{\"ruleId\":\"rule_monthly_auto_sales\"}",
  "operator": "system"
}
```

响应体建议：

```json
{
  "ok": true,
  "schedule_rule_id": "rule_monthly_auto_sales",
  "task_group_id": "TG_xxx",
  "business_date": "2026-05",
  "trigger_log_id": "STL_xxx",
  "status": "DISPATCHED"
}
```

`status` 建议值：

- `DISPATCHED`
- `SKIPPED_ALREADY_EXISTS`
- `SKIPPED_DISABLED`
- `FAILED`

### 接口 2：获取 fetch_task prompt

当前已有，可直接复用：

- [SchedulerFetchTaskPromptController](E:\huatai\datafoundry_java\data-foundry-backend-service\src\main\java\com\huatai\datafoundry\backend\task\interfaces\web\internal\SchedulerFetchTaskPromptController.java)

### 接口 3：scheduler 回调执行结果

当前已有，可直接复用：

- [SchedulerExecutionCallbackController](E:\huatai\datafoundry_java\data-foundry-backend-service\src\main\java\com\huatai\datafoundry\backend\task\interfaces\web\internal\SchedulerExecutionCallbackController.java)

## 6.4 backend-service 对外规则管理接口

### 规则 CRUD

| 方法 | 路径 | 用途 |
|---|---|---|
| `GET` | `/api/schedule-rules` | 查询规则列表 |
| `GET` | `/api/schedule-rules/{id}` | 查询规则详情 |
| `POST` | `/api/schedule-rules` | 新建规则 |
| `PUT` | `/api/schedule-rules/{id}` | 更新规则 |
| `POST` | `/api/schedule-rules/{id}/enable` | 启用规则 |
| `POST` | `/api/schedule-rules/{id}/disable` | 停用规则 |
| `DELETE` | `/api/schedule-rules/{id}` | 删除或软删除 |

### 手动触发

| 方法 | 路径 | 用途 |
|---|---|---|
| `POST` | `/api/schedule-rules/{id}/trigger` | 手动执行或补采 |

请求体建议：

```json
{
  "trigger_type": "MANUAL",
  "business_date": "2026-05",
  "operator": "alice"
}
```

### 调度执行日志查询

| 方法 | 路径 | 用途 |
|---|---|---|
| `GET` | `/api/schedule-trigger-logs` | 查询调度日志列表 |
| `GET` | `/api/schedule-trigger-logs/{id}` | 查询调度日志详情 |

### 任务失败重跑

当前已有或接近已有的接口可以复用：

- `POST /api/tasks/{taskId}/actions/retry`
- `POST /api/tasks/task-groups/{taskGroupId}/actions/execute`

建议新增：

- `POST /api/tasks/task-groups/{taskGroupId}/actions/rerun-failed`

## 6.5 scheduler-service 对外接口

保留现有接口：

- `/api/schedule-jobs`
- `/api/schedule-jobs/{jobId}`

建议扩展查询条件：

| 方法 | 路径 | 用途 |
|---|---|---|
| `GET` | `/api/schedule-jobs?task_group_id=...` | 按任务组查询 |
| `GET` | `/api/schedule-jobs?schedule_rule_id=...` | 按调度规则查询 |

说明：

- 规则管理应放在 backend-service，不建议放到 scheduler-service。
- scheduler-service 应保持轻量。

---

## 7. 类设计清单

## 7.1 scheduler-service 设计清单

## A. 配置层

### 新增类

- `com.huatai.datafoundry.scheduler.schedule.infrastructure.config.XxlJobProperties`

职责：

- 绑定 `xxl.job.*` 配置。
- 提供强类型配置对象。

### 新增类

- `com.huatai.datafoundry.scheduler.schedule.infrastructure.config.XxlJobExecutorConfig`

职责：

- 创建 `XxlJobSpringExecutor` Bean。
- 注入 `adminAddresses`、`appname`、`ip`、`port`、`accessToken`、`logPath`、`logRetentionDays`。

## B. JobHandler 层

### 新增 DTO

- `com.huatai.datafoundry.scheduler.schedule.application.dto.ScheduleDispatchParam`

字段建议：

- `ruleId`
- `frequency`
- `triggerType`
- `businessDate`
- `businessDateMode`
- `operator`

### 新增类

- `com.huatai.datafoundry.scheduler.schedule.interfaces.job.DataCollectJobHandler`

职责：

- 接收 XXL-JOB 触发。
- 通过 `XxlJobHelper.getJobParam()` 读取参数。
- 解析 JSON 成 `ScheduleDispatchParam`。
- 打 XXL-JOB 日志。
- 调用调度分发服务。

## C. 调度适配层

### 新增应用服务

- `com.huatai.datafoundry.scheduler.schedule.application.service.XxlJobDispatchAppService`

职责：

- 将 JobHandler 入参转换为 backend 可识别的内部调度命令。
- 可选地先落一条 `schedule_jobs` 运行时记录。
- 调用 backend 内部调度分发接口。
- 根据结果回写本地 `schedule_jobs` 状态。

### 新增 DTO

- `com.huatai.datafoundry.scheduler.schedule.application.dto.DispatchScheduleRuleCommand`

字段建议：

- `ruleId`
- `triggerType`
- `triggerSource`
- `frequency`
- `businessDate`
- `businessDateMode`
- `operator`
- `scheduleJobId`
- `xxlJobParam`

## D. Backend Gateway 扩展

### 修改现有接口

- `com.huatai.datafoundry.scheduler.schedule.domain.gateway.BackendGateway`

新增方法：

- `Map<String, Object> dispatchScheduleRule(String ruleId, Map<String, Object> body, String idempotencyKey)`

### 修改现有类

- [BackendClient](E:\huatai\datafoundry_java\data-foundry-scheduler-service\src\main\java\com\huatai\datafoundry\scheduler\schedule\infrastructure\client\BackendClient.java)

新增方法：

- `dispatchScheduleRule(String ruleId, Map<String, Object> body, String idempotencyKey)`

## E. schedule_jobs 模型扩展

### 修改现有类

- [ScheduleJob](E:\huatai\datafoundry_java\data-foundry-scheduler-service\src\main\java\com\huatai\datafoundry\scheduler\schedule\domain\model\ScheduleJob.java)
- [CreateScheduleJobCommand](E:\huatai\datafoundry_java\data-foundry-scheduler-service\src\main\java\com\huatai\datafoundry\scheduler\schedule\application\dto\CreateScheduleJobCommand.java)
- [ScheduleJobMapper](E:\huatai\datafoundry_java\data-foundry-scheduler-service\src\main\java\com\huatai\datafoundry\scheduler\schedule\infrastructure\persistence\mybatis\mapper\ScheduleJobMapper.java)

建议新增字段：

- `scheduleRuleId`
- `businessDate`
- `jobSource`
- `errorMessage`

## F. 对现有 `ScheduleJobCreatedHandler` 的定位

[ScheduleJobCreatedHandler](E:\huatai\datafoundry_java\data-foundry-scheduler-service\src\main\java\com\huatai\datafoundry\scheduler\schedule\application\handler\ScheduleJobCreatedHandler.java) 建议继续保留，用于：

- task 级执行
- task_group 级执行
- 重跑执行

但不建议让它直接承担“月频/年频规则调度分发”的职责。

原因：

- 月频/年频先要创建业务 `task_group/fetch_tasks`。
- 当前这个 handler 假设的是“已经有 task 或 task_group，要去执行”。
- 它不适合承担规则编排。

## 7.2 backend-service 设计清单

## A. 规则领域

### 新增领域模型

- `com.huatai.datafoundry.backend.schedule.domain.model.ScheduleRule`

字段建议：

- `id`
- `requirementId`
- `wideTableId`
- `ruleName`
- `ruleCode`
- `frequency`
- `cronExpression`
- `businessDateMode`
- `enabled`
- `xxlJobHandler`
- `xxlJobId`
- `lastTriggerTime`
- `lastSuccessTime`
- `lastTriggerStatus`

### 新增仓储接口

- `com.huatai.datafoundry.backend.schedule.domain.repository.ScheduleRuleRepository`

方法建议：

- `ScheduleRule getById(String id)`
- `List<ScheduleRule> list(...)`
- `void save(ScheduleRule rule)`
- `void update(ScheduleRule rule)`
- `void updateLastTrigger(...)`

## B. 调度日志领域

### 新增领域模型

- `com.huatai.datafoundry.backend.schedule.domain.model.ScheduleTriggerLog`

### 新增仓储接口

- `com.huatai.datafoundry.backend.schedule.domain.repository.ScheduleTriggerLogRepository`

方法建议：

- `String createRunningLog(...)`
- `void markSuccess(...)`
- `void markFailed(...)`
- `void markSkipped(...)`
- `List<ScheduleTriggerLog> list(...)`

## C. 调度命令层

### 新增命令

- `com.huatai.datafoundry.backend.schedule.application.command.ScheduleRuleDispatchCommand`

字段建议：

- `triggerType`
- `triggerSource`
- `frequency`
- `businessDate`
- `businessDateMode`
- `scheduleJobId`
- `operator`
- `xxlJobParam`

### 新增命令

- `com.huatai.datafoundry.backend.schedule.application.command.ManualTriggerScheduleRuleCommand`

用途：

- 给对外手工触发、补采接口使用。

## D. 业务日期解析服务

### 新增领域服务

- `com.huatai.datafoundry.backend.schedule.domain.service.BusinessDateResolver`

方法建议：

- `String resolve(ScheduleRule rule, ScheduleRuleDispatchCommand command)`

规则建议：

- `MONTHLY + PREVIOUS_PERIOD` -> 上一个 `YearMonth`
- `YEARLY + PREVIOUS_PERIOD` -> 上一年
- 手工触发时如果显式传 `businessDate`，优先使用传入值

## E. 调度编排服务

### 新增应用服务

- `com.huatai.datafoundry.backend.schedule.application.service.ScheduleRuleDispatchAppService`

职责：

1. 读取调度规则。
2. 校验规则是否启用。
3. 计算 `business_date`。
4. 创建触发日志。
5. 基于 `schedule_rule_id + business_date` 做幂等校验。
6. 创建 `task_group`。
7. 生成 `fetch_tasks`。
8. 调用现有任务执行链路。
9. 回写触发日志和规则状态。

建议内部方法拆分：

- `dispatch(ruleId, command)`
- `resolveOrCreateTaskGroup(...)`
- `triggerTaskGroupExecution(...)`
- `handleSkip(...)`

## F. TaskGroup 构造器

### 新增领域服务

- `com.huatai.datafoundry.backend.schedule.domain.service.ScheduleTaskGroupBuilder`

职责：

- 根据规则 + 业务日期构建 `TaskGroup`。
- 填充 `schedule_rule_id`、`frequency`、`source_type`、`business_date`、`triggered_by` 等字段。

## G. FetchTask 生成能力复用

建议优先复用：

- `TaskPlanAppService`

原因：

- 现有 backend 已经掌握任务实例生成与 prompt 快照刷新。

建议新增入口：

- `ensureFetchTasksForScheduledTaskGroup(TaskGroup group)`

## H. 规则管理应用服务

### 新增应用服务

- `com.huatai.datafoundry.backend.schedule.application.service.ScheduleRuleAppService`

职责：

- 规则 CRUD。
- 启用/停用。
- 手工触发/补采。

## I. Controller 层

### 新增对外 Controller

- `com.huatai.datafoundry.backend.schedule.interfaces.web.ScheduleRuleController`

职责：

- 对外提供规则管理接口。

### 新增对外 Controller

- `com.huatai.datafoundry.backend.schedule.interfaces.web.ScheduleTriggerLogController`

职责：

- 对外提供调度日志查询接口。

### 新增内部 Controller

- `com.huatai.datafoundry.backend.schedule.interfaces.web.internal.SchedulerRuleDispatchController`

职责：

- 接收 scheduler-service 的内部调度分发请求。
- 如开启内部 token，则校验 token。
- 调用 `ScheduleRuleDispatchAppService`。

## J. 基础设施层

### 新增 MyBatis Record / Mapper / Repository

建议新增以下包内容：

- `backend.schedule.infrastructure.persistence.mybatis.record.ScheduleRuleRecord`
- `backend.schedule.infrastructure.persistence.mybatis.record.ScheduleTriggerLogRecord`
- `backend.schedule.infrastructure.persistence.mybatis.mapper.ScheduleRuleMapper`
- `backend.schedule.infrastructure.persistence.mybatis.mapper.ScheduleTriggerLogMapper`
- `backend.schedule.infrastructure.repository.MybatisScheduleRuleRepository`
- `backend.schedule.infrastructure.repository.MybatisScheduleTriggerLogRepository`

## K. 现有类复用关系

| 现有类 | 复用方式 |
|---|---|
| `TaskAppService` | 复用实际任务执行触发能力 |
| `TaskPlanAppService` | 复用 fetch_task 生成能力 |
| `TaskGroupAggregateService` | 复用 task_group 聚合刷新 |
| `TaskExecutionCallbackAppService` | 复用 callback 后状态合并 |
| `CollectionResultAppService` | 复用结果落库和宽表回填 |

## 7.3 common-contract 设计变化

如果后续 scheduler-service 对外查询接口需要暴露更多调度字段，可以扩展：

- [com.huatai.datafoundry.contract.scheduler.ScheduleJob](E:\huatai\datafoundry_java\data-foundry-common-contract\src\main\java\com\huatai\datafoundry\contract\scheduler\ScheduleJob.java)

建议新增字段：

- `scheduleRuleId`
- `businessDate`
- `jobSource`
- `errorMessage`

第一阶段如果不需要展示这些字段，可以先不动。

---

## 8. 本地部署设计清单

## 8.1 本地 profile 文件

建议新增：

- `data-foundry-scheduler-service/src/main/resources/application-local.yml`
- `data-foundry-backend-service/src/main/resources/application-local.yml`
- `data-foundry-agent-service/src/main/resources/application-local.yml`

建议本地端口：

- `backend-service`: `8000`
- `agent-service`: `8100`
- `scheduler-service`: `8200`
- `xxl-job-admin`: `8080`
- `scheduler-service` 作为 executor 暴露端口：`9999`

## 8.2 scheduler-service 本地配置

建议在本地 profile 中增加：

```yaml
spring:
  profiles:
    active: local

xxl:
  job:
    admin:
      addresses: http://127.0.0.1:8080/xxl-job-admin
    accessToken: ""
    executor:
      appname: data-foundry-scheduler-local
      ip: 127.0.0.1
      port: 9999
      logpath: ./logs/xxl-job/jobhandler
      logretentiondays: 30
```

## 8.3 backend 内部安全控制

建议复用 `datafoundry.internal.callback.*` 这一套配置，统一保护以下内部接口：

- `/internal/scheduler/executions/callback`
- `/internal/scheduler/fetch-tasks/{taskId}/prompt`
- 新增 `/internal/scheduler/rules/{ruleId}/dispatch`

## 8.4 本地 XXL-JOB 任务配置样例

### 月频任务样例

- 执行器：`data-foundry-scheduler-local`
- Handler：`dataCollectJobHandler`
- Cron：`0 0 2 1 * ?`
- 参数：

```json
{
  "ruleId": "rule_monthly_auto_sales",
  "frequency": "MONTHLY",
  "triggerType": "SCHEDULE",
  "businessDateMode": "PREVIOUS_PERIOD",
  "operator": "system"
}
```

### 年频任务样例

- 执行器：`data-foundry-scheduler-local`
- Handler：`dataCollectJobHandler`
- Cron：`0 0 2 1 1 ?`
- 参数：

```json
{
  "ruleId": "rule_yearly_company_finance",
  "frequency": "YEARLY",
  "triggerType": "SCHEDULE",
  "businessDateMode": "PREVIOUS_PERIOD",
  "operator": "system"
}
```

### XXL-JOB 后台推荐选项

- 路由策略：`FIRST`
- 阻塞策略：`SERIAL_EXECUTION`
- 失败重试次数：`1 ~ 3`
- 超时时间：先保守配置，后续根据采集耗时调优

---

## 9. 分阶段实施清单

## 9.1 第一阶段：接入 XXL-JOB Executor

### scheduler-service

- 增加 `xxl-job-core` 依赖。
- 新增 `application-local.yml`。
- 新增 `XxlJobProperties`。
- 新增 `XxlJobExecutorConfig`。
- 新增 `ScheduleDispatchParam`。
- 新增 `DataCollectJobHandler`。
- 新增 `XxlJobDispatchAppService`。
- 扩展 `BackendGateway` / `BackendClient`，支持 `dispatchScheduleRule`。

### backend-service

- 新增内部接口 `SchedulerRuleDispatchController`。
- 新增最小可用版 `ScheduleRuleDispatchAppService`。
- 初期只要能校验规则存在并返回分发结果即可。

### 验收标准

- XXL-JOB Admin 能看到 executor 在线。
- 在 Admin 手工触发任务后，scheduler-service 能收到请求。
- scheduler-service 能成功调用 backend 内部 dispatch 接口。

## 9.2 第二阶段：规则与调度落库

### backend-service

- 增加 `schedule_rules`。
- 增加 `schedule_trigger_logs`。
- 补齐 `ScheduleRule`、`ScheduleTriggerLog`、仓储、服务、控制器。
- 增加 `BusinessDateResolver`。
- 加入 `task_groups(schedule_rule_id, business_date)` 幂等控制。

### 现有表改造

- 改造 `task_groups`。
- 改造 `fetch_tasks`。

### 验收标准

- 一条规则在一个业务周期内只能生成一个 `task_group`。
- 同一周期重复触发时会被跳过并留下日志。

## 9.3 第三阶段：自动采集执行

### backend-service

- 将规则调度分发服务与现有任务生成能力打通。
- 复用 `TaskPlanAppService` 生成任务。
- 创建任务组后调用现有执行链路。

### scheduler-service

- 可选扩展 `schedule_jobs`，保存 `schedule_rule_id` 与 `business_date`。

### 验收标准

- 月频/年频调度可以自动创建任务并触发采集。
- 结果仍通过现有 callback 链路回写。

## 9.4 第四阶段：接入稽核

- 增加 `audit_rules`。
- 增加 `audit_results`。
- 在任务组采集完成后触发稽核。

## 9.5 第五阶段：补齐运营与展示

- 补规则管理接口。
- 补调度日志查询接口。
- 补任务组失败重跑接口。
- 后续再接前端页面。

---

## 10. 文件级改造清单

## 10.1 scheduler-service 新增文件

- `src/main/java/com/huatai/datafoundry/scheduler/schedule/infrastructure/config/XxlJobProperties.java`
- `src/main/java/com/huatai/datafoundry/scheduler/schedule/infrastructure/config/XxlJobExecutorConfig.java`
- `src/main/java/com/huatai/datafoundry/scheduler/schedule/application/dto/ScheduleDispatchParam.java`
- `src/main/java/com/huatai/datafoundry/scheduler/schedule/application/dto/DispatchScheduleRuleCommand.java`
- `src/main/java/com/huatai/datafoundry/scheduler/schedule/application/service/XxlJobDispatchAppService.java`
- `src/main/java/com/huatai/datafoundry/scheduler/schedule/interfaces/job/DataCollectJobHandler.java`
- `src/main/resources/application-local.yml`
- `src/main/resources/db/migration/V003__alter_schedule_jobs_for_xxljob_runtime.sql`

## 10.2 scheduler-service 需要修改的现有文件

- `pom.xml`
- `src/main/resources/application.yml`
- `src/main/java/com/huatai/datafoundry/scheduler/schedule/domain/gateway/BackendGateway.java`
- `src/main/java/com/huatai/datafoundry/scheduler/schedule/infrastructure/client/BackendClient.java`
- `src/main/java/com/huatai/datafoundry/scheduler/schedule/domain/model/ScheduleJob.java`
- `src/main/java/com/huatai/datafoundry/scheduler/schedule/application/dto/CreateScheduleJobCommand.java`
- `src/main/java/com/huatai/datafoundry/scheduler/schedule/infrastructure/persistence/mybatis/mapper/ScheduleJobMapper.java`

## 10.3 backend-service 新增文件

- `src/main/java/com/huatai/datafoundry/backend/schedule/domain/model/ScheduleRule.java`
- `src/main/java/com/huatai/datafoundry/backend/schedule/domain/model/ScheduleTriggerLog.java`
- `src/main/java/com/huatai/datafoundry/backend/schedule/domain/repository/ScheduleRuleRepository.java`
- `src/main/java/com/huatai/datafoundry/backend/schedule/domain/repository/ScheduleTriggerLogRepository.java`
- `src/main/java/com/huatai/datafoundry/backend/schedule/domain/service/BusinessDateResolver.java`
- `src/main/java/com/huatai/datafoundry/backend/schedule/domain/service/ScheduleTaskGroupBuilder.java`
- `src/main/java/com/huatai/datafoundry/backend/schedule/application/command/ScheduleRuleDispatchCommand.java`
- `src/main/java/com/huatai/datafoundry/backend/schedule/application/command/ManualTriggerScheduleRuleCommand.java`
- `src/main/java/com/huatai/datafoundry/backend/schedule/application/service/ScheduleRuleAppService.java`
- `src/main/java/com/huatai/datafoundry/backend/schedule/application/service/ScheduleRuleDispatchAppService.java`
- `src/main/java/com/huatai/datafoundry/backend/schedule/interfaces/web/ScheduleRuleController.java`
- `src/main/java/com/huatai/datafoundry/backend/schedule/interfaces/web/ScheduleTriggerLogController.java`
- `src/main/java/com/huatai/datafoundry/backend/schedule/interfaces/web/internal/SchedulerRuleDispatchController.java`
- `src/main/java/com/huatai/datafoundry/backend/schedule/infrastructure/persistence/mybatis/record/ScheduleRuleRecord.java`
- `src/main/java/com/huatai/datafoundry/backend/schedule/infrastructure/persistence/mybatis/record/ScheduleTriggerLogRecord.java`
- `src/main/java/com/huatai/datafoundry/backend/schedule/infrastructure/persistence/mybatis/mapper/ScheduleRuleMapper.java`
- `src/main/java/com/huatai/datafoundry/backend/schedule/infrastructure/persistence/mybatis/mapper/ScheduleTriggerLogMapper.java`
- `src/main/java/com/huatai/datafoundry/backend/schedule/infrastructure/repository/MybatisScheduleRuleRepository.java`
- `src/main/java/com/huatai/datafoundry/backend/schedule/infrastructure/repository/MybatisScheduleTriggerLogRepository.java`
- `src/main/resources/application-local.yml`
- `src/main/resources/db/migration/V015__add_schedule_rules.sql`
- `src/main/resources/db/migration/V016__add_schedule_trigger_logs.sql`
- `src/main/resources/db/migration/V017__alter_task_groups_for_scheduler.sql`
- `src/main/resources/db/migration/V018__alter_fetch_tasks_for_scheduler.sql`
- `src/main/resources/db/migration/V019__add_task_group_rule_business_date_unique.sql`

## 10.4 backend-service 需要修改的现有文件

- `pom.xml`
- `src/main/resources/application.yml`
- `src/main/java/com/huatai/datafoundry/backend/task/application/service/TaskPlanAppService.java`
- `src/main/java/com/huatai/datafoundry/backend/task/application/service/TaskAppService.java`
- `src/main/java/com/huatai/datafoundry/backend/task/interfaces/web/internal/SchedulerExecutionCallbackController.java`
- `src/main/java/com/huatai/datafoundry/backend/task/interfaces/web/internal/SchedulerFetchTaskPromptController.java`
- `src/main/java/com/huatai/datafoundry/backend/task/infrastructure/config/InternalCallbackProperties.java`

---

## 11. 测试清单

## 11.1 单元测试

### scheduler-service

- `ScheduleDispatchParam` JSON 解析测试。
- `XxlJobDispatchAppService` 成功路径测试。
- `XxlJobDispatchAppService` 跳过路径测试。
- `XxlJobDispatchAppService` 失败路径测试。

### backend-service

- `BusinessDateResolver`：
  - 月频上一周期
  - 年频上一周期
  - 手工指定 `businessDate`
- `ScheduleRuleDispatchAppService`：
  - 规则未启用
  - 同周期重复触发
  - 成功创建任务组

## 11.2 集成测试

- backend 内部 dispatch 接口集成测试。
- scheduler-service 调 backend dispatch 的联调测试。
- 重复触发只创建一个 `task_group` 的幂等测试。

## 11.3 本地端到端冒烟测试

1. 启动本地 MySQL。
2. 启动 `xxl-job-admin`。
3. 启动 `backend-service`。
4. 启动 `agent-service`。
5. 启动 `scheduler-service`。
6. 在 backend 中准备一条月频规则。
7. 在 XXL-JOB Admin 中配置对应 `ruleId` 的任务。
8. 手动触发该任务。
9. 验证：
   - `schedule_trigger_logs` 已生成
   - `task_group` 已生成
   - `fetch_tasks` 已生成
   - `schedule_jobs` 状态已更新
   - callback 后任务状态已回写

---

## 12. 推荐实施顺序

如果现在开始开发，建议按以下顺序推进：

1. 在 `scheduler-service` 中补齐 XXL-JOB Executor 能力。
2. 在 `backend-service` 中补内部 dispatch 接口最小骨架。
3. 落 `schedule_rules` 与 `schedule_trigger_logs`。
4. 补 `BusinessDateResolver` 与 `task_group` 幂等创建。
5. 对接现有任务执行链路。
6. 补对外规则管理和手工触发接口。
7. 再补稽核联动。

这样可以尽量少改现有执行链路，也最容易逐步验收。

---

## 13. 最终建议

推荐的最终实现方式是：

- `scheduler-service` 保持轻量，只面向 XXL-JOB。
- `backend-service` 承担业务调度中心职责。
- 现有 `schedule_job -> agent -> callback -> result persistence` 主链路继续复用。
- 以 `schedule_rule_id + business_date` 作为月频、年频调度的硬幂等边界。

最终职责拆分可以稳定落成：

- XXL-JOB：负责触发时间。
- scheduler-service：负责触发适配。
- backend-service：负责业务调度编排。
- agent-service：负责采集执行。
