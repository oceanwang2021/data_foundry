# 调度规则数据来源、落库字段与写入时机分析

## 1. 结论

当前调度数据分为三个层次：

1. `wide_tables.schedule_rules_json`：需求录入阶段保存的调度配置。
2. `schedule_rules`、`task_groups`：生成或重建任务组后形成的可执行调度计划。
3. `schedule_trigger_logs`、`schedule_jobs`：XXL-JOB 实际触发后产生的运行记录。

因此，保存但尚未提交的需求只有 `wide_tables.schedule_rules_json` 中存在调度配置，而 `schedule_rules`、`schedule_trigger_logs` 和 XXL-JOB Admin 中没有对应数据，符合当前代码的写入流程。

其中：

- `schedule_rules` 不是在保存或提交需求时生成，而是在“生成/重建任务组”时物化。
- `schedule_trigger_logs` 是触发历史，不是规则配置，只有实际调度时才产生。
- 当前系统只实现了 XXL-JOB Executor 注册，没有实现 XXL-JOB Admin 任务的自动创建和同步。

## 2. 涉及的数据表

| Schema / 表 | 关键字段 | 数据来源 | 写入时机 |
|---|---|---|---|
| `data_foundry_backend.requirements` | `data_update_enabled`、`data_update_mode`、`status` | 前端“定期更新/一次性交付”“全量/增量”配置 | 创建或保存需求 |
| `data_foundry_backend.wide_tables` | `schedule_rules_json` | 前端频率、时间偏移量、触发时间、启用状态 | 点击保存需求 |
| `data_foundry_backend.wide_tables` | `scope_json` | 数据范围中的日、周、月、季、年时间粒度 | 点击保存需求 |
| `data_foundry_backend.wide_tables` | `indicator_groups_json` | 前端指标分组配置 | 保存指标分组或生成任务组前 |
| `data_foundry_backend.schedule_rules` | 物理调度规则字段 | `schedule_rules_json` 和 `indicator_groups_json` | 点击“生成/重建任务组” |
| `data_foundry_backend.task_groups` | `schedule_rule_id`、`business_date`、`scheduled_at` 等 | 业务周期、频率、偏移量、指标组 | 点击“生成/重建任务组” |
| `data_foundry_backend.schedule_trigger_logs` | 调度触发流水 | Scheduler 调用 Backend dispatch 接口 | 每次实际触发时 |
| `data_foundry_scheduler.schedule_jobs` | Scheduler 本地运行记录 | XXL-JOB Handler 收到触发参数 | 每次实际触发时 |
| `xxl_job.xxl_job_info` | XXL-JOB Admin 任务配置 | 当前由用户手工配置 | 在 Admin 创建任务后 |

## 3. 需求级更新配置

`requirements` 中以下字段决定需求是否需要持续更新：

| 字段 | 含义 |
|---|---|
| `data_update_enabled` | 是否定期更新 |
| `data_update_mode` | 全量更新或增量更新 |
| `status` | 草稿、已提交等需求状态 |

这些字段只表达需求是否持续更新以及更新模式，不包含具体的执行日期、业务周期和触发时间。

保存需求时会更新这些字段。提交需求主要更新需求状态并锁定 Schema，不会直接生成物理调度规则、调度任务组或 XXL-JOB Admin 任务。

## 4. `wide_tables.schedule_rules_json`

### 4.1 字段定位

`wide_tables.schedule_rules_json` 是前端调度配置的直接落库位置，是调度规则的配置来源。

典型内容如下：

```json
[
  {
    "id": "rule-config-id",
    "frequency": "MONTHLY",
    "trigger_time": "09:00",
    "business_date_offset_days": 3,
    "enabled": true
  }
]
```

字段含义：

| JSON 字段 | 含义 |
|---|---|
| `id` | 前端调度配置项标识，不是最终的 `schedule_rules.id` |
| `frequency` | `DAILY`、`WEEKLY`、`MONTHLY`、`QUARTERLY`、`YEARLY` |
| `business_date_offset_days` | 当前业务周期结束后延迟多少天执行 |
| `trigger_time` | 到达执行日期后具体的触发时间 |
| `enabled` | 调度配置是否启用 |

例如月频、偏移量为 3、触发时间为 `09:00`：

```text
业务周期：2026-06
业务周期结束：2026-06-30
计划执行时间：2026-07-03 09:00
```

### 4.2 数据来源

数据来源于需求录入页面“数据更新”区域：

- 是否定期更新。
- 全量更新或增量更新。
- 调度频率。
- 时间偏移量。
- 触发时间。

数据范围中的时间粒度同时保存在 `wide_tables.scope_json` 中。调度频率应与时间粒度保持一致。

### 4.3 写入时机

只有用户点击“保存需求”后，前端配置才会通过需求宽表更新接口写入数据库。

如果用户只修改了时间偏移量但尚未点击保存，修改内容仅存在于前端页面状态中。

保存草稿和已提交后的配置更新都可以更新 `schedule_rules_json`；但这一步仅保存配置模板，不会生成 `schedule_rules`。

## 5. `schedule_rules`

### 5.1 表的职责

`schedule_rules` 是从宽表 JSON 配置物化出来的运行规则。

当前模型遵循：

```text
一个指标组对应一条物理调度规则
```

目前不支持同一个指标组配置多条调度规则。

### 5.2 主要字段和来源

| 字段 | 数据来源或含义 |
|---|---|
| `id` | 根据需求、宽表和指标组稳定生成 |
| `requirement_id` | 当前需求 ID |
| `wide_table_id` | 当前宽表 ID |
| `indicator_group_id` | 当前指标组 ID |
| `rule_name` | 根据宽表、指标组等信息生成 |
| `rule_code` | 物理规则唯一编码 |
| `frequency` | `schedule_rules_json.frequency` |
| `business_date_offset_days` | 前端设置的时间偏移量 |
| `trigger_time` | 前端设置的触发时间 |
| `cron_expression` | 根据触发时间生成的每日唤醒 Cron |
| `business_date_mode` | 当前使用 `PREVIOUS_PERIOD` |
| `xxl_job_group` | 预留的 XXL-JOB 执行器组关联字段 |
| `xxl_executor_name` | 预留的 Executor 名称 |
| `xxl_job_handler` | 当前为 `dataCollectJobHandler` |
| `xxl_job_id` | 预留的 XXL-JOB Admin 任务 ID |
| `enabled` | 来自 JSON 的启用状态 |
| `last_trigger_time` | 最近一次触发时间 |
| `last_trigger_status` | 最近一次触发状态 |
| `last_success_time` | 最近一次成功时间 |
| `next_trigger_time` | 预留的下一次触发时间 |

当前 `cron_expression` 的职责是定时唤醒规则，而具体任务是否到期，以 `task_groups.scheduled_at` 为准。

### 5.3 规则数量

`schedule_rules_json` 当前相当于宽表级共享调度模板。

物化时会读取指标分组：

```text
一份调度模板
  + N 个指标组
  -> N 条 schedule_rules
```

如果没有指标分组或没有有效调度配置，已有物理规则会被禁用。

### 5.4 写入时机

当前 `schedule_rules` 不是在以下操作中写入：

- 保存需求。
- 提交需求。
- 单独保存指标分组。

它是在以下页面操作后生成或更新：

```text
任务
  -> 采集任务管理
  -> 采集提示词管理
  -> 生成/重建任务组
```

该操作会调用任务规划持久化流程，先根据 `schedule_rules_json` 和 `indicator_groups_json` 同步物理规则，再生成任务组。

## 6. `task_groups`

### 6.1 表的职责

`task_groups` 表示某个指标组在某个具体业务周期下的采集任务组，也是调度计划落实到业务周期后的执行管理单元。

### 6.2 主要调度字段

| 字段 | 含义 |
|---|---|
| `schedule_rule_id` | 关联当前指标组的物理调度规则 |
| `indicator_group_id` | 指标组 ID |
| `frequency` | 日、周、月、季、年频率 |
| `business_date` | 业务周期，如 `2026-06` |
| `scheduled_at` | 周期结束时间加偏移天数和触发时间 |
| `source_type` | `SCHEDULED`、`BACKFILL` 等来源 |
| `triggered_by` | 调度或人工触发来源 |
| `status` | 任务组执行状态 |

### 6.3 数据来源

`task_groups.scheduled_at` 由以下数据共同计算：

```text
frequency
  + business_date
  + business_date_offset_days
  + trigger_time
  -> scheduled_at
```

当前时间之前的历史周期通常作为人工补采任务，不关联自动调度规则。

当前或未来周期会关联对应的 `schedule_rule_id`，并计算 `scheduled_at`，等待调度系统到期执行。

### 6.4 写入时机

`task_groups` 只在用户点击“生成/重建任务组”后生成。

根据当前产品约定，提交需求不会自动生成任务组。用户必须先完成指标分组和提示词配置，再主动生成或重建任务组。

同一次操作还会直接生成对应的 `fetch_tasks`，不再等到打开或执行任务组时懒生成。

## 7. `schedule_trigger_logs`

### 7.1 表的职责

`schedule_trigger_logs` 是调度触发历史表，不是规则配置表。

它记录 Scheduler 对 Backend 发起的每一次规则分发请求，包括成功、跳过和失败。

### 7.2 主要字段

| 字段 | 含义 |
|---|---|
| `schedule_rule_id` | 本次触发的物理规则 |
| `schedule_job_id` | Scheduler 侧运行记录 ID |
| `task_group_id` | 本次命中的任务组 |
| `trigger_type` | 触发类型 |
| `trigger_source` | 触发来源 |
| `business_date` | 本次触发的业务日期 |
| `trigger_param_json` | 触发请求参数快照 |
| `trigger_status` | `DISPATCHED`、`SKIPPED`、`FAILED` 等 |
| `skip_reason` | 跳过原因 |
| `error_message` | 失败原因 |
| `started_at` | 触发开始时间 |
| `ended_at` | 触发结束时间 |

### 7.3 写入时机

只有实际执行以下链路时才会创建：

```text
XXL-JOB Admin
  -> scheduler-service 的 dataCollectJobHandler
  -> Backend 调度分发接口
  -> schedule_trigger_logs
```

以下操作都不会产生触发日志：

- 保存需求。
- 提交需求。
- 生成或重建任务组。
- 单独创建 `schedule_rules`。

因此，在尚未发生实际触发时查询不到当前需求的 `schedule_trigger_logs`，属于正常现象。

## 8. Scheduler 侧 `schedule_jobs`

`data_foundry_scheduler.schedule_jobs` 是 scheduler-service 的本地运行记录。

主要调度字段包括：

| 字段 | 含义 |
|---|---|
| `job_source` | 任务来源，规则分发使用 `RULE_DISPATCH` |
| `schedule_rule_id` | Backend 物理调度规则 ID |
| `business_date` | 业务日期 |
| `request_payload` | 调度请求快照 |
| `error_message` | 调度失败原因 |
| `task_group_id` | Backend 返回的任务组 ID |
| `status` | Scheduler 本地运行状态 |

该表同样是运行记录，不是需求配置表。

只有 XXL-JOB 调用 `dataCollectJobHandler` 后，scheduler-service 才会先创建本地 `schedule_jobs` 记录，再调用 Backend 分发接口并回写结果。

## 9. XXL-JOB Admin 数据

### 9.1 当前已实现能力

当前 scheduler-service 已实现：

- 引入 `xxl-job-core`。
- 配置并启动 XXL-JOB Executor。
- 向 XXL-JOB Admin 注册 Executor。
- 暴露 `dataCollectJobHandler`。
- 接收 XXL-JOB 任务参数并调用 Backend。

### 9.2 当前未实现能力

当前没有实现从 Backend 自动调用 XXL-JOB Admin 接口完成以下操作：

- 创建 XXL-JOB 任务。
- 更新 XXL-JOB Cron。
- 启用或停用 XXL-JOB 任务。
- 删除 XXL-JOB 任务。
- 回写 `schedule_rules.xxl_job_id`。
- 同步 `xxl_job_group`、`xxl_executor_name` 和 `next_trigger_time`。

因此：

- 保存需求不会在 XXL-JOB Admin 中创建任务。
- 提交需求不会在 XXL-JOB Admin 中创建任务。
- 生成或重建任务组也不会在 XXL-JOB Admin 中创建任务。
- 当前需要用户在 XXL-JOB Admin 中手工配置任务。

XXL-JOB Admin 中的任务通常保存在其自身 Schema 的 `xxl_job_info` 表中，执行器信息保存在 `xxl_job_group` 等表中。

## 10. 完整操作与落库时序

| 操作 | 写入或更新内容 | 不会写入的内容 |
|---|---|---|
| 创建需求 | `requirements`、`wide_tables` 基础信息 | 物理规则、任务组、触发记录、XXL-JOB 任务 |
| 保存需求草稿 | 更新 `schedule_rules_json`、`scope_json` 等配置 | `schedule_rules`、`schedule_trigger_logs`、XXL-JOB 任务 |
| 提交需求 | 更新 `requirements.status`，锁定 Schema | 不自动生成物理规则和任务组 |
| 保存指标分组 | 更新 `indicator_groups_json` | 不一定立即生成物理规则 |
| 生成/重建任务组 | 同步 `schedule_rules`，生成 `task_groups` 和 `fetch_tasks` | 不自动创建 XXL-JOB Admin 任务 |
| 手工配置 XXL-JOB | 写入 XXL-JOB Admin 自身的任务配置 | 当前不会自动回写 `xxl_job_id` |
| XXL-JOB 实际触发 | 创建 Scheduler `schedule_jobs` 和 Backend `schedule_trigger_logs` | 不重新生成指标分组 |
| 采集执行完成 | 更新 `fetch_tasks`、`task_groups` 和规则运行状态，保存原始采集结果 | 当前不要求标准化或宽表回写 |

## 11. 当前行为判断

当前保存需求后出现以下状态是符合实现的：

```text
wide_tables.schedule_rules_json：有数据
schedule_rules：无数据
task_groups：无数据或仍为旧计划
schedule_trigger_logs：无数据
data_foundry_scheduler.schedule_jobs：无数据
XXL-JOB Admin：无对应任务
```

点击“生成/重建任务组”后，预期状态变为：

```text
wide_tables.schedule_rules_json：有数据
schedule_rules：按指标组生成物理规则
task_groups：按指标组和业务周期生成
fetch_tasks：直接生成
schedule_trigger_logs：仍无数据，直到实际触发
XXL-JOB Admin：仍无对应任务，除非手工配置
```

实际触发后，预期状态变为：

```text
data_foundry_scheduler.schedule_jobs：产生 Scheduler 运行记录
schedule_trigger_logs：产生 Backend 触发流水
schedule_rules：更新最近触发时间和状态
task_groups / fetch_tasks：进入实际执行状态
```

## 12. 当前主要功能缺口

当前最明显的缺口不是 `schedule_trigger_logs` 没有提前生成，而是 `schedule_rules` 与 XXL-JOB Admin 之间缺少自动同步能力。

如果产品目标是“需求配置完成后自动进入可调度状态”，后续需要明确两个独立时点：

1. 物理规则创建时点：保存需求、提交需求，还是生成/重建任务组。
2. XXL-JOB 任务同步时点：物理规则创建后立即同步，还是任务组生成后同步。

结合当前“任务组必须由用户点击生成/重建”的产品约定，较合理的方案是：

- 保存和提交需求只保存配置，不生成 `task_groups`。
- 点击“生成/重建任务组”时物化 `schedule_rules`、`task_groups` 和 `fetch_tasks`。
- 物理规则同步成功后，自动创建或更新对应的 XXL-JOB Admin 任务。
- 禁用或删除物理规则时，同步停用对应的 XXL-JOB Admin 任务。
- `schedule_trigger_logs` 继续只记录实际触发，不提前创建占位数据。

