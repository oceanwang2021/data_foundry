# XXL-JOB 调度中心改造记录与后续计划

> 文档日期：2026-06-08  
> 适用仓库：`E:\huatai\datafoundry_java`  
> 涉及服务：`xxl-job-admin`、`data-foundry-scheduler-service`、`data-foundry-backend-service`、`data-foundry-agent-service`

## 1. 文档目的

本文档用于记录 2026 年 6 月 8 日已经完成的 XXL-JOB 调度中心改造，并作为后续联调、验收和继续开发的执行依据。

本文重点说明：

1. 今天已经完成的功能和代码变更。
2. XXL-JOB、scheduler、backend、采集任务之间的职责边界。
3. 调度相关数据库表、字段含义及跨表对应关系。
4. 一次定时调度从触发到采集完成的完整逻辑。
5. 本地运行所依赖的外部服务、数据库和配置。
6. 如何在 IDEA 中启动 `scheduler-service`。
7. 当前未完成事项和下一阶段改造计划。

---

## 2. 总体架构与职责边界

当前方案遵循以下原则：

```text
XXL-JOB Admin
  负责 cron、触发时间、失败重试、阻塞策略和调度日志

scheduler-service
  作为 XXL-JOB Executor 接收触发
  记录 scheduler 侧运行记录
  将规则调度请求转发给 backend
  继续承载原有 task/task_group 到 agent 的执行桥接链路

backend-service
  保存平台业务调度规则
  解析 business_date
  按指标组进行周期幂等控制
  创建 task_group 和 fetch_tasks
  触发现有采集执行链路
  接收执行回调并聚合业务状态

agent-service
  执行具体采集任务
  返回采集结果
```

核心边界是：XXL-JOB 决定“何时触发”，backend 决定“生成哪些业务任务”，scheduler 负责“适配触发和桥接执行”，agent 负责“真正采集”。

---

## 3. 今日完成的改造概览

### 3.1 第一阶段：scheduler 接入 XXL-JOB Executor

对应提交：`21a6f6a`

已完成：

- 在父工程中增加 `xxl-job-core 2.4.2` 版本管理。
- 在 scheduler 模块增加 `xxl-job-core` 依赖。
- 增加可开关的 XXL-JOB Executor 配置。
- 增加本地 `local` profile 配置。
- 增加统一的 `dataCollectJobHandler`。
- 增加调度参数对象和调度应用服务骨架。
- scheduler 可使用 `data-foundry-scheduler-local` 注册到本地 XXL-JOB Admin。
- 已验证本地 Executor 注册能力。

关键文件：

- `data-foundry-scheduler-service/pom.xml`
- `schedule/infrastructure/config/XxlJobProperties.java`
- `schedule/infrastructure/config/XxlJobExecutorConfig.java`
- `schedule/interfaces/job/DataCollectJobHandler.java`
- `schedule/application/dto/ScheduleDispatchParam.java`
- `schedule/application/service/XxlJobDispatchAppService.java`
- `src/main/resources/application-local.yml`

### 3.2 第二阶段：backend 增加规则分发和调度持久化

对应提交：`c6c6f2f`

已完成：

- 增加 `schedule_rules` 业务调度规则表。
- 增加 `schedule_trigger_logs` 调度触发日志表。
- 扩展 `task_groups` 的调度规则、指标组和频率字段。
- 扩展 `fetch_tasks` 的重试次数和失败原因字段。
- 增加 backend 内部规则分发接口。
- 增加 `BusinessDateResolver`。
- 增加基于业务周期的幂等控制。
- 调度分发后自动创建 `task_group` 和 `fetch_tasks`。
- scheduler 通过 HTTP 调用 backend 内部接口。

内部接口：

```http
POST /internal/scheduler/rules/{ruleId}/dispatch
X-Idempotency-Key: xxl-job:{jobId}:{logFileName}
X-Internal-Token: <可选>
```

### 3.3 第三阶段：打通指标组级自动采集闭环

对应提交：`9e3364d`

已完成：

- 明确“一条调度规则只绑定一个指标组”。
- 同一个采集需求中的不同指标组分别建立调度规则。
- 定时任务只生成当前规则所绑定指标组的 `fetch_tasks`。
- 校验指标组必须属于规则对应的宽表。
- 已存在其他指标组任务时阻止错误复用。
- 调度产生的 `task_group` 使用 `group_kind=scheduled`。
- 任务执行完成后，将 task group 的终态同步回：
  - `schedule_rules.last_trigger_status`
  - `schedule_rules.last_success_time`
  - `schedule_trigger_logs.trigger_status`
- 支持 `COMPLETED`、`FAILED`、`PARTIAL`、`CANCELLED`、`INVALIDATED` 等终态。

### 3.4 scheduler 运行记录补充阶段

对应提交：`038dae9`

已完成：

- 扩展 scheduler 的 `schedule_jobs` 表和模型。
- XXL-JOB 规则触发时，先创建一条 `RULE_DISPATCH` 运行记录。
- 保存规则 ID、业务日期、原始请求和失败原因。
- backend 返回后回写 task group、business date 和状态。
- 增加 `task_group_id`、`schedule_rule_id`、`job_source` 查询条件。
- `RULE_DISPATCH` 不再发布原有 `ScheduleJobCreatedEvent`。
- `ScheduleJobCreatedHandler` 增加防御判断，避免规则分发记录误调用 agent。
- 新增和完善单元测试。

验证结果：

```text
mvn -pl data-foundry-scheduler-service -am test
Tests run: 11, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
```

---

## 4. 数据库 schema 归属

本地目前涉及三个独立 schema：

| Schema | 所属服务 | 主要表 |
|---|---|---|
| `xxl_job` | XXL-JOB Admin | `xxl_job_info`、`xxl_job_group`、`xxl_job_log` 等 |
| `data_foundry_scheduler` | scheduler-service | `schedule_jobs` |
| `data_foundry_backend` | backend-service | `schedule_rules`、`schedule_trigger_logs`、`task_groups`、`fetch_tasks` |

SQL 执行归属：

| 脚本 | 执行 schema |
|---|---|
| backend `V015` 至 `V019` | `data_foundry_backend` |
| scheduler `V003` | `data_foundry_scheduler` |
| XXL-JOB 官方初始化 SQL | `xxl_job` |

重要说明：

- 两个业务服务的 `application.yml` 当前均配置了 `spring.flyway.enabled=false`。
- 因此不能假设启动服务后迁移脚本会自动执行。
- 已手工执行的 `V015` 至 `V019` 不需要重复执行。
- 启动 scheduler 前，需要确认 `data_foundry_scheduler.schedule_jobs` 已执行 `V003__alter_schedule_jobs_for_xxljob_runtime.sql`。
- 如果希望临时让 Flyway 执行，必须显式设置 `spring.flyway.enabled=true`，但在已有库上启用前应先检查 `flyway_schema_history`，避免重复迁移或版本基线冲突。
- 当前更稳妥的本地方式是手工执行 V003，并保持 Flyway 关闭。

---

## 5. 调度相关表及字段说明

## 5.1 XXL-JOB Admin 侧任务

XXL-JOB Admin 自己的表位于 `xxl_job` schema。平台业务代码不直接操作这些表。

主要概念：

| XXL-JOB 概念 | 含义 | 与平台字段的关系 |
|---|---|---|
| Executor AppName | 执行器标识 | 本地为 `data-foundry-scheduler-local` |
| JobHandler | Java Handler 名称 | 固定为 `dataCollectJobHandler` |
| Job ID | XXL-JOB 后台任务 ID | scheduler 用于生成日志引用和幂等键 |
| Job Param | 触发参数 JSON | 原样保存到 `schedule_jobs.request_payload` 和 `schedule_trigger_logs.trigger_param_json` |
| Job Log | 每次触发日志 | 与平台业务日志互补，不替代业务表 |

XXL-JOB 的一条任务配置应对应 backend 的一条 `schedule_rules` 记录。当前不要求由平台自动创建 XXL-JOB 任务，可先在 Admin 中人工维护。

## 5.2 `data_foundry_scheduler.schedule_jobs`

该表是 scheduler-service 的运行记录表，既记录原有任务执行，也记录 XXL-JOB 规则分发。

| 字段 | 含义 | RULE_DISPATCH 场景的来源 |
|---|---|---|
| `id` | scheduler 运行记录 ID | 根据 XXL-JOB 幂等键生成的确定性 UUID |
| `task_group_id` | backend 创建的任务组 ID | backend dispatch 响应中的 `task_group_id` |
| `task_id` | 单个采集任务 ID | 规则分发阶段为空；原任务执行链路可使用 |
| `job_source` | 运行记录来源 | 规则分发为 `RULE_DISPATCH`；原执行为 `TASK_EXECUTION` |
| `schedule_rule_id` | backend 调度规则 ID | XXL-JOB 参数中的 `ruleId` |
| `business_date` | 本次业务周期 | 显式参数或 backend 解析结果 |
| `request_payload` | 原始请求快照 | XXL-JOB Job Param 原文 |
| `error_message` | scheduler 分发失败原因 | backend 异常或不支持的返回状态 |
| `trigger_type` | 触发类型 | `SCHEDULE`、`MANUAL`、`BACKFILL` 等 |
| `status` | scheduler 侧状态 | `RUNNING`、`DISPATCHED`、`SKIPPED`、`FAILED` |
| `started_at` | scheduler 开始处理时间 | 接收 XXL-JOB 触发时生成 |
| `ended_at` | scheduler 分发结束时间 | backend 调用结束后生成 |
| `operator` | 操作人或系统标识 | Job Param 中的 `operator`，默认 `system` |
| `log_ref` | 调度日志引用 | `xxl-job://{jobId}` |
| `created_at` | 记录创建时间 | 数据库默认时间 |

新增索引：

```text
idx_schedule_jobs_rule_created_at(schedule_rule_id, created_at)
idx_schedule_jobs_source_created_at(job_source, created_at)
```

scheduler 运行记录 ID 生成逻辑：

```text
XXL-JOB 幂等键
  = "xxl-job:" + jobId + ":" + jobLogFileName

schedule_jobs.id
  = UUID.nameUUIDFromBytes("rule-dispatch:" + 幂等键)
```

同一次 XXL-JOB 执行重入时会命中同一个 scheduler 记录，不会重复插入。

## 5.3 `data_foundry_backend.schedule_rules`

该表保存平台业务调度规则。当前约束是一条指标组对应一条规则，不支持同一指标组配置多条规则。

| 字段 | 含义 | 对应关系 |
|---|---|---|
| `id` | 调度规则 ID | XXL-JOB 参数 `ruleId`、scheduler `schedule_rule_id` |
| `requirement_id` | 采集需求 ID | 归属某个采集需求 |
| `wide_table_id` | 宽表 ID | 规则生成任务时读取宽表规划 |
| `indicator_group_id` | 指标组 ID | 决定本规则只生成哪个指标组的任务 |
| `rule_name` | 规则名称 | 也用于 task group 的分区展示名称 |
| `rule_code` | 可选业务编码 | 全局唯一，便于配置和外部引用 |
| `frequency` | 周期类型 | 当前代码支持 `MONTHLY`、`YEARLY` |
| `cron_expression` | cron 表达式 | 业务配置快照；实际触发 cron 当前仍维护在 XXL-JOB Admin |
| `business_date_mode` | 业务日期计算模式 | 当前支持 `PREVIOUS_PERIOD`、`CURRENT_PERIOD` |
| `xxl_job_group` | XXL-JOB 分组信息 | 预留字段 |
| `xxl_executor_name` | XXL-JOB 执行器名 | 通常为 `data-foundry-scheduler-local` 或环境对应值 |
| `xxl_job_handler` | Handler 名称 | 默认 `dataCollectJobHandler` |
| `xxl_job_id` | XXL-JOB 后台任务 ID | 当前可人工维护，尚未自动同步 |
| `enabled` | 是否启用 | 0 时分发结果为 `SKIPPED_DISABLED` |
| `last_trigger_time` | 最近触发时间 | 每次规则分发时更新 |
| `last_success_time` | 最近完整执行成功时间 | task group 最终完成后更新 |
| `last_trigger_status` | 最近状态 | `DISPATCHED`、`SKIPPED_*` 或最终执行状态 |
| `next_trigger_time` | 下次触发时间 | 当前为预留字段，尚未与 Admin 自动同步 |
| `created_by/updated_by` | 创建人、更新人 | 审计字段 |
| `created_at/updated_at` | 创建和更新时间 | 审计字段 |

规则唯一约束：

```sql
UNIQUE KEY uk_schedule_rules_indicator_group (
  requirement_id,
  wide_table_id,
  indicator_group_id
)
```

它表达的是：同一采集需求、同一宽表、同一指标组只允许存在一条调度规则。

## 5.4 `data_foundry_backend.schedule_trigger_logs`

该表记录每一次业务规则触发。它与 XXL-JOB 日志不同，属于平台业务日志。

| 字段 | 含义 | 来源 |
|---|---|---|
| `id` | 触发日志 ID | backend 生成，格式 `stl_...` |
| `schedule_rule_id` | 调度规则 ID | `schedule_rules.id` |
| `schedule_job_id` | scheduler 运行记录 ID | `schedule_jobs.id` |
| `task_group_id` | 本次创建或命中的任务组 ID | `task_groups.id` |
| `trigger_type` | 触发类型 | scheduler 请求，默认 `SCHEDULE` |
| `trigger_source` | 触发来源 | XXL-JOB 场景为 `XXL_JOB` |
| `business_date` | 本次业务周期 | backend 解析后的值 |
| `trigger_param_json` | 原始触发参数 | XXL-JOB Job Param |
| `trigger_status` | 业务触发/执行状态 | `RUNNING`、`DISPATCHED`、`SKIPPED`、`FAILED` 或任务组终态 |
| `skip_reason` | 跳过原因 | 规则禁用、同周期任务已存在等 |
| `error_message` | 失败原因 | 分发或后续执行失败信息 |
| `started_at/ended_at` | 开始和结束时间 | backend 记录 |
| `created_at` | 创建时间 | 数据库默认时间 |

每一次 XXL-JOB 触发都应产生一条日志，包括被跳过的触发。

## 5.5 `data_foundry_backend.task_groups`

`task_groups` 是一次业务采集批次。在当前设计下，一条规则只绑定一个指标组，因此一次规则周期触发生成一个指标组级 task group。

关键调度字段：

| 字段 | 含义 | 来源 |
|---|---|---|
| `id` | 任务组 ID | 根据 `schedule_rule_id + business_date` 生成稳定 ID |
| `requirement_id` | 采集需求 ID | `schedule_rules.requirement_id` |
| `wide_table_id` | 宽表 ID | `schedule_rules.wide_table_id` |
| `schedule_rule_id` | 调度规则 ID | `schedule_rules.id` |
| `indicator_group_id` | 指标组 ID | `schedule_rules.indicator_group_id` |
| `business_date` | 业务周期 | `BusinessDateResolver` 的结果 |
| `frequency` | 调度频率 | command 优先，否则使用规则 frequency |
| `source_type` | 来源类型 | `SCHEDULE`、`MANUAL`、`BACKFILL` |
| `triggered_by` | 触发人 | command.operator，默认 `system` |
| `group_kind` | 任务组类型 | 定时规则生成时为 `scheduled` |
| `partition_type` | 分区类型 | 定时规则生成时为 `indicator_group` |
| `partition_key` | 分区键 | 指标组 ID |
| `partition_label` | 分区显示名 | 规则名称或指标组名称 |
| `status` | 任务组聚合状态 | `pending` 到最终执行状态 |

任务组 ID 生成逻辑：

```text
task_groups.id
  = "tg_sr_" + UUID.nameUUIDFromBytes(
      "schedule-rule:" + ruleId + ":" + businessDate
    )
```

周期幂等唯一索引：

```sql
CREATE UNIQUE INDEX uk_tg_rule_period_group
ON task_groups (
  schedule_rule_id,
  business_date,
  indicator_group_id
);
```

唯一索引的业务含义：

- 同一条调度规则；
- 同一个业务周期；
- 同一个指标组；
- 只能生成一个 task group。

虽然当前规则本身已经唯一绑定指标组，索引仍显式包含 `indicator_group_id`，用于准确表达幂等边界并避免历史数据或后续模型变化引起歧义。

## 5.6 `data_foundry_backend.fetch_tasks`

`fetch_tasks` 是真正执行采集的任务实例。一个 task group 可以根据指标组、维度和参数行生成多个 fetch task。

调度相关字段：

| 字段 | 含义 |
|---|---|
| `task_group_id` | 所属任务组 |
| `indicator_group_id` | 所属指标组，必须与定时规则绑定指标组一致 |
| `business_date` | 从 task group 继承的业务周期 |
| `collection_task_id` | 外部采集任务 ID，用于识别过期回调 |
| `rendered_prompt_text` | 执行前固化的 prompt |
| `can_rerun` | 是否允许重跑 |
| `retry_count` | 已重试次数 |
| `error_message` | 采集任务失败原因 |
| `status` | 单个采集任务执行状态 |

生成逻辑：

1. 根据 task group 的 requirement 和 wide table 读取规划数据。
2. 找到规则绑定的指标组。
3. 校验指标组确实属于该宽表。
4. 只为该指标组生成任务，不生成同一需求中的其他指标组任务。
5. 根据 scope、参数行、维度和业务日期生成一个或多个 fetch task。
6. 如果 task group 已经存在任务，则校验所有已有任务均属于同一指标组。

---

## 6. 跨服务字段对应关系

| 业务概念 | XXL-JOB | scheduler | backend |
|---|---|---|---|
| 调度配置 | `xxl_job_info.id` | 无 | `schedule_rules.xxl_job_id` |
| 规则标识 | Job Param `ruleId` | `schedule_jobs.schedule_rule_id` | `schedule_rules.id` |
| 单次触发 | Job Log | `schedule_jobs.id` | `schedule_trigger_logs.schedule_job_id` |
| 业务周期 | Job Param 可选 `businessDate` | `schedule_jobs.business_date` | trigger log、task group、fetch task 的 `business_date` |
| 指标组 | 不感知 | 不解析 | `schedule_rules.indicator_group_id` |
| 业务任务组 | 不感知 | `schedule_jobs.task_group_id` | `task_groups.id` |
| 采集任务实例 | 不感知 | 原执行链路使用 `task_id` | `fetch_tasks.id` |
| 原始参数 | Job Param | `request_payload` | `trigger_param_json` |
| 调度日志 | XXL-JOB 调度日志 | scheduler 运行状态 | backend 业务触发日志 |

推荐排查顺序：

```text
XXL-JOB Job Log
  -> schedule_jobs.id
  -> schedule_trigger_logs.schedule_job_id
  -> schedule_trigger_logs.task_group_id
  -> task_groups.id
  -> fetch_tasks.task_group_id
```

---

## 7. Job 参数与业务日期逻辑

### 7.1 推荐参数

月频：

```json
{
  "ruleId": "rule_monthly_example",
  "frequency": "MONTHLY",
  "triggerType": "SCHEDULE",
  "businessDateMode": "PREVIOUS_PERIOD",
  "operator": "system"
}
```

年频：

```json
{
  "ruleId": "rule_yearly_example",
  "frequency": "YEARLY",
  "triggerType": "SCHEDULE",
  "businessDateMode": "PREVIOUS_PERIOD",
  "operator": "system"
}
```

显式指定业务日期：

```json
{
  "ruleId": "rule_monthly_example",
  "frequency": "MONTHLY",
  "triggerType": "BACKFILL",
  "businessDate": "2026-05",
  "businessDateMode": "PREVIOUS_PERIOD",
  "operator": "local-user"
}
```

参数兼容 camelCase 和 snake_case，例如 `ruleId/rule_id`、`businessDate/business_date`。

### 7.2 默认值

| 参数 | 默认值 |
|---|---|
| `frequency` | `MONTHLY` |
| `triggerType` | `SCHEDULE` |
| `businessDateMode` | `PREVIOUS_PERIOD` |
| `operator` | `system` |

`ruleId` 必填。

### 7.3 显式 businessDate

显式 `businessDate` 是指调用方直接给出本次采集所属的业务周期。只要该字段非空，backend 就优先使用它，不再按当前日期和 frequency 自动推算。

当前代码没有对显式值做严格格式校验，因此调用方必须保证格式与 frequency 一致：

| frequency | 推荐格式 | 示例 |
|---|---|---|
| `MONTHLY` | `yyyy-MM` | `2026-05` |
| `YEARLY` | `yyyy` | `2025` |

### 7.4 当前自动解析能力

当前 `BusinessDateResolver` 仅支持：

| frequency | `PREVIOUS_PERIOD` | `CURRENT_PERIOD` |
|---|---|---|
| `MONTHLY` | 上一个自然月 | 当前自然月 |
| `YEARLY` | 上一个自然年 | 当前自然年 |

其他 frequency 在未显式传 `businessDate` 时会抛出：

```text
Unsupported schedule frequency
```

### 7.5 后续支持日频和季频

XXL-JOB 本身可以通过 cron 配置日频和季频触发，但 backend 目前缺少对应的 business date 解析。

新增日频需要：

- `BusinessDateResolver` 增加 `DAILY`。
- 约定格式为 `yyyy-MM-dd`。
- `PREVIOUS_PERIOD` 返回前一天。
- `CURRENT_PERIOD` 返回当天。
- 增加跨月、跨年和闰日测试。

新增季频需要：

- `BusinessDateResolver` 增加 `QUARTERLY`。
- 约定统一格式，例如 `yyyy-Qn`。
- 实现当前季度、上一季度以及跨年计算。
- 检查任务规划中 scope frequency 和参数行对季度格式的兼容性。
- 增加 Q1 上一周期为上一年 Q4 的测试。

scheduler 的参数对象当前不会限制 frequency 枚举，因此主要改动位于 backend；同时需要增加规则创建校验、数据库历史值治理和 XXL-JOB cron 配置样例。

---

## 8. 完整调度逻辑

### 8.1 触发与规则分发

```text
1. XXL-JOB Admin 按 cron 或人工操作触发任务
2. Admin 调用 scheduler Executor 端口 9999
3. DataCollectJobHandler 读取 Job Param
4. 参数解析为 ScheduleDispatchParam
5. 构造 X-Idempotency-Key
6. scheduler 创建 RULE_DISPATCH 类型 schedule_jobs 记录
7. scheduler 调用 backend 内部 dispatch 接口
```

### 8.2 backend 业务编排

```text
1. 根据 ruleId 查询 schedule_rules
2. 校验规则存在并包含 indicator_group_id
3. 解析 business_date
4. 创建 RUNNING 状态 schedule_trigger_logs
5. 如果规则未启用，返回 SKIPPED_DISABLED
6. 按 rule + business_date + indicator_group 查询已有 task_group
7. 已存在则返回 SKIPPED_ALREADY_EXISTS
8. 不存在则构建 scheduled task_group
9. insertIfAbsent 和数据库唯一索引共同处理并发
10. 只为规则绑定指标组生成 fetch_tasks
11. 调用现有 TaskAppService 执行 task group
12. 返回 DISPATCHED
```

### 8.3 scheduler 状态回写

backend 响应到 scheduler 的状态映射：

| backend status | schedule_jobs.status |
|---|---|
| `DISPATCHED` | `DISPATCHED` |
| `SKIPPED_DISABLED` | `SKIPPED` |
| `SKIPPED_ALREADY_EXISTS` | `SKIPPED` |
| 其他值或空值 | `FAILED` |
| HTTP/网络异常 | `FAILED` |

同时回写：

- `task_group_id`
- `business_date`
- `ended_at`
- `error_message`

### 8.4 原任务执行链路

规则分发与任务执行是两条不同路径：

```text
RULE_DISPATCH
  只调用 backend 进行业务编排
  不直接调用 agent

TASK_EXECUTION
  发布 ScheduleJobCreatedEvent
  ScheduleJobCreatedHandler 调用 agent
  执行完成后回调 backend
```

`ScheduleJobAppService` 和 `ScheduleJobCreatedHandler` 都包含 `RULE_DISPATCH` 隔离判断，避免一条规则分发记录被误当作采集任务执行。

### 8.5 执行结果聚合

agent 执行结果通过 scheduler 回调 backend 后：

1. backend 更新单个 `fetch_tasks` 状态。
2. 保存并处理采集结果。
3. 聚合刷新 `task_groups` 状态。
4. 如果 task group 达到终态，更新调度规则和触发日志。

终态映射包括：

- `COMPLETED`
- `FAILED`
- `PARTIAL`
- `CANCELLED`
- `INVALIDATED`

只有 `COMPLETED` 会更新 `schedule_rules.last_success_time`。

---

## 9. scheduler 查询能力

当前接口：

```http
GET /api/schedule-jobs
GET /api/schedule-jobs/{jobId}
POST /api/schedule-jobs
```

列表支持以下查询参数：

| 参数 | 对应字段 |
|---|---|
| `trigger_type` | `trigger_type` |
| `status` | `status` |
| `task_group_id` | `task_group_id` |
| `schedule_rule_id` | `schedule_rule_id` |
| `job_source` | `job_source` |

示例：

```http
GET http://127.0.0.1:8200/api/schedule-jobs?job_source=RULE_DISPATCH
```

```http
GET http://127.0.0.1:8200/api/schedule-jobs?schedule_rule_id=rule_monthly_example
```

---

## 10. 外部依赖和启动前置条件

## 10.1 软件依赖

| 依赖 | 当前要求 |
|---|---|
| JDK | Java 8 |
| Maven | 能正常解析本地/远程 Maven 依赖 |
| Spring Boot | 2.7.18 |
| XXL-JOB Core | 2.4.2 |
| XXL-JOB Admin | 当前本地运行版本为 3.4.1-SNAPSHOT，需要继续做兼容性验证 |
| MySQL | 可访问业务库和 XXL-JOB 库 |

注意：Admin `3.4.1-SNAPSHOT` 与 Executor Core `2.4.2` 版本并不一致。当前已经能够注册，但完整触发、回调和日志兼容性仍需通过端到端测试确认。正式环境建议 Admin 与 Core 使用相同版本或使用经过完整验证的固定版本组合。

## 10.2 网络和端口

| 服务 | 默认地址/端口 | 是否为 scheduler 启动必需 |
|---|---|---|
| XXL-JOB Admin | `http://127.0.0.1:8080` | Executor 注册必需 |
| scheduler HTTP | `http://127.0.0.1:8200` | 本服务 |
| scheduler Executor | `127.0.0.1:9999` | XXL-JOB 调用必需 |
| backend | `http://127.0.0.1:8000` | 规则分发必需 |
| agent | `http://127.0.0.1:8100` | 完整采集执行必需 |
| scheduler DB | 当前配置的 MySQL `data_foundry_scheduler` | scheduler 启动必需 |
| backend DB | 当前配置的 MySQL `data_foundry_backend` | backend 启动必需 |

仅验证 Executor 注册时，可以暂不启动 backend 和 agent。  
验证规则分发时，必须启动 backend。  
验证从规则触发到采集回调的完整闭环时，必须启动 backend、scheduler、agent 和 XXL-JOB Admin。

## 10.3 Access Token

本地 scheduler 配置：

```yaml
xxl:
  job:
    accessToken: default_token
```

该值必须与 XXL-JOB Admin 的 `xxl.job.accessToken` 一致，否则 Executor 注册或触发会失败。

## 10.4 backend 内部接口 Token

backend 当前默认：

```yaml
datafoundry:
  internal:
    callback:
      require-token: false
      token: ""
```

因此本地默认不要求 `X-Internal-Token`。

如果后续启用：

```yaml
datafoundry.internal.callback.require-token=true
```

则 scheduler 的以下配置必须与 backend token 完全一致：

```yaml
data-foundry:
  backend:
    callback-token: "<same-token>"
```

---

## 11. 在 IDEA 中启动 scheduler-service

## 11.1 启动前检查

启动前确认：

1. XXL-JOB Admin 已在 IDEA 中启动。
2. 浏览器可以访问 `http://127.0.0.1:8080`。
3. Admin access token 为 `default_token`，或同步修改 scheduler 本地配置。
4. `9999` 端口未被其他 Executor 占用。
5. `8200` 端口未被其他 scheduler 进程占用。
6. scheduler 数据库连接可用。
7. `data_foundry_scheduler.schedule_jobs` 已执行 V003。
8. 如需触发真实规则，backend 已在 `8000` 启动且规则数据存在。

可以用以下 SQL 检查 scheduler 表字段：

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'data_foundry_scheduler'
  AND table_name = 'schedule_jobs'
ORDER BY ordinal_position;
```

应至少包含：

```text
job_source
schedule_rule_id
business_date
request_payload
error_message
```

## 11.2 创建 IDEA Run Configuration

1. 在 IDEA 打开整个 `E:\huatai\datafoundry_java` Maven 工程。
2. 等待 Maven 模块导入完成。
3. 打开：

```text
data-foundry-scheduler-service
  src/main/java
    com.huatai.datafoundry.scheduler
      DataFoundrySchedulerApplication
```

4. 右键 `DataFoundrySchedulerApplication.main()`，选择 `Modify Run Configuration`。
5. 建议创建名称：

```text
DataFoundrySchedulerApplication-local
```

6. 配置项如下：

| IDEA 配置项 | 推荐值 |
|---|---|
| Main class | `com.huatai.datafoundry.scheduler.DataFoundrySchedulerApplication` |
| Use classpath of module | `data-foundry-scheduler-service` |
| JRE | Java 8 |
| Working directory | `E:\huatai\datafoundry_java` |
| Active profiles | `local` |

激活 profile 可以任选一种方式，不要重复配置：

方式一，IDEA 的 Active profiles：

```text
local
```

方式二，Environment variables：

```text
SPRING_PROFILES_ACTIVE=local
```

方式三，Program arguments：

```text
--spring.profiles.active=local
```

推荐使用 IDEA 的 Active profiles 或环境变量。

## 11.3 可选环境变量

如果本地配置与默认值不同，可增加：

```text
SPRING_PROFILES_ACTIVE=local
```

如果不想直接修改配置文件，也可以使用 Spring Boot 环境变量覆盖：

```text
XXL_JOB_ADMIN_ADDRESSES=http://127.0.0.1:8080
XXL_JOB_ACCESS_TOKEN=default_token
XXL_JOB_EXECUTOR_IP=127.0.0.1
XXL_JOB_EXECUTOR_PORT=9999
```

是否能按上述名称自动绑定取决于 Spring Boot relaxed binding；在 IDEA 中更推荐直接使用 `application-local.yml` 或明确的 `--属性名=值` Program arguments。

例如：

```text
--spring.profiles.active=local
--xxl.job.admin.addresses=http://127.0.0.1:8080
--xxl.job.accessToken=default_token
--xxl.job.executor.ip=127.0.0.1
--xxl.job.executor.port=9999
```

## 11.4 启动成功标志

控制台应出现类似日志：

```text
Initializing XXL-JOB executor:
appname=data-foundry-scheduler-local
adminAddresses=http://127.0.0.1:8080
port=9999
```

以及：

```text
Started DataFoundrySchedulerApplication
```

验证 HTTP 服务：

```http
GET http://127.0.0.1:8200/health
```

验证 Executor：

1. 打开 XXL-JOB Admin。
2. 进入“执行器管理”。
3. 找到 `data-foundry-scheduler-local`。
4. 确认在线机器地址包含 `127.0.0.1:9999`。

如果执行器数量仍为 0，优先检查：

- 是否激活 `local` profile。
- `xxl.job.executor.enabled` 是否为 `true`。
- Admin 地址是否错误地写成 `/xxl-job-admin`。当前本地 Admin context path 为 `/`，所以地址应为 `http://127.0.0.1:8080`。
- access token 是否一致。
- `9999` 是否被占用。
- Admin 与 scheduler 是否在同一台机器且能访问 `127.0.0.1`。

## 11.5 启动顺序

仅验证注册：

```text
1. MySQL
2. XXL-JOB Admin
3. scheduler-service
```

验证规则分发：

```text
1. MySQL
2. XXL-JOB Admin
3. backend-service
4. scheduler-service
```

验证完整采集闭环：

```text
1. MySQL
2. XXL-JOB Admin
3. backend-service
4. agent-service
5. scheduler-service
6. 在 XXL-JOB Admin 手工触发任务
```

---

## 12. 本地端到端验证步骤

### 12.1 准备规则

在 `data_foundry_backend.schedule_rules` 中准备一条规则，确保：

- `requirement_id` 存在。
- `wide_table_id` 存在并属于该需求。
- `indicator_group_id` 存在于宽表的指标组 JSON 中。
- `enabled=1`。
- `frequency` 当前使用 `MONTHLY` 或 `YEARLY`。
- 同一 requirement、wide table、indicator group 没有重复规则。

### 12.2 配置 XXL-JOB 任务

推荐配置：

| 配置项 | 值 |
|---|---|
| 执行器 | `data-foundry-scheduler-local` |
| 运行模式 | BEAN |
| JobHandler | `dataCollectJobHandler` |
| 路由策略 | FIRST |
| 阻塞策略 | SERIAL_EXECUTION |
| 失败重试次数 | 初期建议 0 或 1 |

Job Param：

```json
{
  "ruleId": "<schedule_rules.id>",
  "frequency": "MONTHLY",
  "triggerType": "SCHEDULE",
  "businessDateMode": "PREVIOUS_PERIOD",
  "operator": "system"
}
```

### 12.3 手工触发和检查

在 XXL-JOB Admin 点击“执行一次”后依次检查：

```sql
-- 1. scheduler 是否收到并记录规则分发
SELECT *
FROM data_foundry_scheduler.schedule_jobs
WHERE job_source = 'RULE_DISPATCH'
ORDER BY created_at DESC
LIMIT 10;

-- 2. backend 是否记录业务触发
SELECT *
FROM data_foundry_backend.schedule_trigger_logs
ORDER BY created_at DESC
LIMIT 10;

-- 3. 是否创建指标组级任务组
SELECT id, schedule_rule_id, indicator_group_id, business_date,
       frequency, source_type, status, triggered_by
FROM data_foundry_backend.task_groups
WHERE schedule_rule_id = '<ruleId>'
ORDER BY id DESC;

-- 4. 是否只生成当前指标组的任务实例
SELECT id, task_group_id, indicator_group_id, business_date,
       status, retry_count, error_message
FROM data_foundry_backend.fetch_tasks
WHERE task_group_id = '<taskGroupId>'
ORDER BY sort_order;
```

### 12.4 重复触发验证

使用同一个 rule 和 business date 再触发一次，预期：

- 不新增 task group。
- backend 返回 `SKIPPED_ALREADY_EXISTS`。
- scheduler `schedule_jobs.status=SKIPPED`。
- backend 新增一条 `schedule_trigger_logs`，状态为 `SKIPPED`。
- `skip_reason` 说明同周期任务组已存在。

---

## 13. 当前限制与风险

### 13.1 Admin 与 Core 版本不一致

当前 Admin 是 `3.4.1-SNAPSHOT`，scheduler 使用 `xxl-job-core 2.4.2`。注册已验证，但仍应完成触发、日志、回调、失败重试和停止场景测试。

### 13.2 Flyway 默认关闭

迁移不会随服务启动自动执行。新增环境或新库必须有明确的数据库执行清单，避免代码已上线但字段未创建。

### 13.3 规则与 XXL-JOB 任务尚未自动同步

`schedule_rules.cron_expression`、`xxl_job_id`、`next_trigger_time` 当前主要是业务记录或预留字段，平台尚未调用 XXL-JOB Admin API 自动创建、更新和删除任务。

### 13.4 当前只自动解析月频和年频

日频、季频需要扩展 backend 的日期解析、格式校验和测试。显式传入 business date 虽可绕过自动解析，但不应作为长期替代方案。

### 13.5 显式 businessDate 缺少格式校验

当前只检查非空，不校验是否符合 frequency 对应格式。错误格式可能进入 task group 和后续任务规划。

### 13.6 scheduler 与 backend 状态粒度不同

`schedule_jobs.DISPATCHED` 只表示 backend 已成功创建并提交业务任务，不表示采集最终成功。最终成功应查看：

- `task_groups.status`
- `fetch_tasks.status`
- `schedule_trigger_logs.trigger_status`
- `schedule_rules.last_trigger_status`

### 13.7 内部接口默认未开启 token 校验

本地便于联调，但测试和生产环境应启用 `X-Internal-Token`，并限制内部接口网络访问范围。

---

## 14. 接下来的变更计划

## 14.1 下一阶段一：完成本地端到端验收

目标：证明当前代码可以完成“XXL-JOB 触发 -> 指标组任务生成 -> agent 执行 -> backend 回调聚合”的闭环。

执行项：

1. 在 `data_foundry_scheduler` 执行并核验 V003。
2. 准备一条真实可执行的月频 schedule rule。
3. 在 XXL-JOB Admin 配置对应任务。
4. 启动 backend、agent、scheduler。
5. 执行一次成功触发。
6. 执行一次同周期重复触发。
7. 执行一次禁用规则触发。
8. 模拟 backend 不可用，验证 scheduler FAILED 记录。
9. 验证 task group 最终状态回写到规则和触发日志。
10. 固化端到端测试记录和排障 SQL。

验收标准：

- Executor 稳定在线。
- 成功触发只生成绑定指标组的任务。
- 重复触发不重复创建 task group。
- 跳过和失败均有业务日志。
- scheduler 运行记录可以关联到 trigger log 和 task group。
- 最终任务状态可以回写到规则和触发日志。

## 14.2 下一阶段二：补齐规则管理能力

目标：避免调度规则长期依赖人工 SQL 维护。

计划新增：

- `ScheduleRuleController`
- `ScheduleRuleAppService`
- 规则新增、修改、查询、启用、停用接口。
- 规则创建时校验 requirement、wide table 和 indicator group 的归属。
- frequency 和 business date mode 枚举校验。
- 一指标组一规则冲突提示。
- 手工触发/补采接口。
- 调度触发日志查询接口。

建议接口：

```http
GET    /api/schedule-rules
GET    /api/schedule-rules/{id}
POST   /api/schedule-rules
PUT    /api/schedule-rules/{id}
POST   /api/schedule-rules/{id}/enable
POST   /api/schedule-rules/{id}/disable
POST   /api/schedule-rules/{id}/trigger
GET    /api/schedule-trigger-logs
GET    /api/schedule-trigger-logs/{id}
```

## 14.3 下一阶段三：支持日频和季频

目标：让业务频率不局限于月频和年频。

计划改造：

- 新增统一 frequency 枚举。
- `BusinessDateResolver` 支持 `DAILY`、`QUARTERLY`。
- 增加显式 business date 格式校验。
- 更新规则接口校验。
- 验证任务规划对日、季度参数的兼容性。
- 增加日频和季频 cron 示例。
- 增加跨日、跨月、跨季度、跨年测试。

建议业务日期格式：

```text
DAILY      -> yyyy-MM-dd
MONTHLY    -> yyyy-MM
QUARTERLY  -> yyyy-Qn
YEARLY     -> yyyy
```

## 14.4 下一阶段四：XXL-JOB Admin 配置同步

目标：在平台维护规则时同步维护 XXL-JOB 任务，减少双边人工配置。

计划内容：

- 封装 XXL-JOB Admin API Client。
- 创建规则时创建 XXL-JOB 任务。
- 修改 cron 时更新 XXL-JOB 任务。
- 启用/停用规则时同步任务状态。
- 删除规则时按策略删除或停用 XXL-JOB 任务。
- 回写 `xxl_job_id` 和 `next_trigger_time`。
- 处理 Admin API 调用失败时的补偿和状态不一致。

该阶段需要先确认 Admin 版本和 API 稳定性，不建议直接依赖 `3.4.1-SNAPSHOT` 的未固定接口。

## 14.5 下一阶段五：安全、可观测性和运维能力

计划内容：

- 测试和生产环境启用内部 token。
- 将数据库密码、access token 移出仓库配置。
- 增加调度分发耗时、成功率、跳过率、失败率指标。
- 增加 scheduler 和 backend 的结构化关联日志。
- 增加失败任务重跑接口。
- 明确 XXL-JOB 重试与业务重跑的边界。
- 增加历史调度记录清理策略。
- 增加 Executor 多实例路由和部署验证。

## 14.6 下一阶段六：数据库迁移治理

计划内容：

- 明确开发、测试、生产环境 Flyway 策略。
- 为手工执行过 V015-V019 的库建立一致的 `flyway_schema_history` 处理方案。
- 新环境统一自动迁移或统一发布前执行 SQL，避免两种模式混用。
- 增加迁移前检查、备份、执行、验证和回滚 SOP。
- 验证 GoldenDB MySQL 兼容性。

---

## 15. 推荐的近期执行顺序

```text
1. 确认 scheduler V003 已执行
2. IDEA 启动 backend、agent、scheduler
3. XXL-JOB Admin 配置真实规则任务
4. 完成成功、重复、禁用、异常四类联调
5. 修复端到端联调发现的问题
6. 开发规则 CRUD、手工触发和日志查询
7. 增加 DAILY、QUARTERLY
8. 再评估 XXL-JOB Admin API 自动同步
9. 补安全、监控和数据库迁移治理
```

当前最优先事项不是继续扩展更多表，而是完成一次真实端到端联调，确认当前四个阶段在本地环境中形成稳定闭环。

