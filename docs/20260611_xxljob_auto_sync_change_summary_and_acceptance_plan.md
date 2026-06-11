# XXL-JOB 自动同步功能变更总结与下一阶段验收计划

> 文档日期：2026-06-11  
> 适用仓库：`E:\huatai\datafoundry_java`  
> 验收范围：`schedule_rules` 与 XXL-JOB Admin 的自动同步控制面  
> 对应关系：一个指标组 ↔ 一条 `schedule_rule` ↔ 一条 XXL-JOB 任务

## 1. 文档目的

本文档用于：

1. 总结 2026-06-11 完成的调度规则自动同步功能。
2. 说明 backend、scheduler-service 与 XXL-JOB Admin 之间的职责边界。
3. 说明新增同步字段、状态流转和任务幂等关系。
4. 给出下一阶段真实环境验收的测试步骤、测试数据和核验 SQL。
5. 给出更新、禁用、Admin 不可用及恢复重试场景的验收标准。

本文档不执行实际验收动作。

---

## 2. 今日变更后的总体链路

```text
需求录入页面
  -> 保存 wide_tables.schedule_rules_json
  -> 在“采集提示词管理”点击“生成/重建任务组”
  -> 按指标组物化 schedule_rules
  -> 规则进入 PENDING_SYNC
  -> scheduler-service 领取待同步规则
  -> 登录 XXL-JOB Admin
  -> 创建、更新、启动或停止 XXL-JOB 任务
  -> 回写 schedule_rules 的 Admin 任务信息和同步状态
```

规则同步成功后，运行时触发链路保持不变：

```text
XXL-JOB Admin
  -> dataCollectJobHandler
  -> scheduler-service 创建 RULE_DISPATCH 运行记录
  -> backend 规则分发接口
  -> 命中已经生成且到期的 task_group
  -> 按 fetch_tasks 粒度执行采集
```

本次新增的是“规则控制面同步”，没有改变 `task_group` 和 `fetch_tasks` 的生成时机。

---

## 3. 今日完成的功能变更

## 3.1 建立一对一同步模型

保留并落实以下模型：

```text
一个指标组
  -> 一条 schedule_rules
  -> 一条 XXL-JOB Admin 任务
```

一条 `schedule_rule` 可以关联多个业务周期的 `task_group`：

```text
schedule_rule
  -> task_group(2026-06)
  -> task_group(2026-07)
  -> task_group(2026-08)
```

每个 `task_group` 下可以包含多条 `fetch_tasks`。

本次没有采用“多条同频规则共享一个频率扫描任务”的方案。

## 3.2 增加同步状态和配置指纹

在 `data_foundry_backend.schedule_rules` 增加：

| 字段 | 含义 |
|---|---|
| `xxl_sync_status` | 当前规则与 XXL-JOB Admin 的同步状态 |
| `xxl_sync_hash` | 参与同步的规则配置 SHA-256 指纹 |
| `xxl_last_sync_time` | 最近一次同步结果落库时间 |
| `xxl_last_error_message` | 最近一次同步失败原因 |
| `xxl_sync_retry_count` | 连续同步失败和重试次数 |

新增索引：

```text
idx_schedule_rules_xxl_sync(
  xxl_sync_status,
  enabled,
  updated_at
)
```

配置指纹包含：

- `rule_name`
- `rule_code`
- `frequency`
- `cron_expression`
- `business_date_mode`
- `business_date_offset_days`
- `xxl_job_handler`
- `enabled`

规则配置发生变化时：

```text
旧 xxl_sync_hash != 新 xxl_sync_hash
  -> xxl_sync_status = PENDING_SYNC
  -> xxl_last_error_message = NULL
  -> xxl_sync_retry_count = 0
```

配置没有变化时，不重复创建同步任务。

## 3.3 建立同步状态机

当前状态流转如下：

```text
PENDING_SYNC
  -> SYNCING
  -> SYNCED

PENDING_SYNC
  -> SYNCING
  -> SYNC_FAILED
  -> SYNCING
  -> SYNCED

PENDING_SYNC
  -> SYNCING
  -> DISABLED
```

| 状态 | 含义 |
|---|---|
| `PENDING_SYNC` | 规则新增或配置变化，等待同步 |
| `SYNCING` | 已被某个 scheduler 实例原子领取 |
| `SYNCED` | Admin 任务已创建或更新并启动 |
| `SYNC_FAILED` | Admin 调用失败，等待重试 |
| `DISABLED` | 规则已禁用，对应 Admin 任务已停止 |

`markXxlSyncing` 使用条件更新，避免多个 scheduler 实例重复处理同一条规则。

同步结果回写时会校验 `xxl_sync_hash`。如果规则在同步过程中再次修改，旧请求结果不能覆盖新配置。

## 3.4 新增 backend 同步内部接口

新增接口：

```http
POST /internal/scheduler/rules/xxl-sync/claim?limit=50
POST /internal/scheduler/rules/xxl-sync/result
```

接口职责：

| 接口 | 职责 |
|---|---|
| `/claim` | 查询 `PENDING_SYNC/SYNC_FAILED` 规则并原子改为 `SYNCING` |
| `/result` | 回写 `SYNCED/SYNC_FAILED/DISABLED` 结果 |

如果启用了内部令牌校验，两个接口均要求：

```http
X-Internal-Token: <shared-token>
```

## 3.5 新增 scheduler-service Admin 客户端

scheduler-service 已支持本地 XXL-JOB `3.4.1-SNAPSHOT` 的管理端接口：

1. 调用 `/auth/doLogin` 完成 SSO 登录。
2. 保存登录返回的 Session Cookie。
3. 按 Executor AppName 查询执行器组。
4. 执行器组不存在时自动创建。
5. 按规则稳定标识查询 Admin 任务。
6. 任务不存在时创建。
7. 任务存在时原 ID 更新。
8. 启用规则时启动 Admin 任务。
9. 禁用规则时停止 Admin 任务。
10. 查询并回写下一次触发时间。

Admin 任务稳定标识：

```text
[DF_RULE:{schedule_rule_id}]
```

任务描述示例：

```text
[DF_RULE:sr_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx] 核心经营指标组 scheduled collection
```

查找任务时优先使用已有 `xxl_job_id`，同时使用任务描述中的稳定标识兜底，避免规则更新时重复创建任务。

## 3.6 自动生成 Admin 任务配置

自动同步后的任务配置为：

| Admin 字段 | 值或来源 |
|---|---|
| Executor | `data-foundry-scheduler-local` |
| JobHandler | `dataCollectJobHandler` |
| Schedule Type | `CRON` |
| CRON | `schedule_rules.cron_expression` |
| Misfire Strategy | `DO_NOTHING` |
| Route Strategy | `FIRST` |
| Block Strategy | `SERIAL_EXECUTION` |
| Glue Type | `BEAN` |
| Author | 本地默认 `data-foundry-local` |

Job Param 示例：

```json
{
  "ruleId": "sr_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "frequency": "MONTHLY",
  "triggerType": "SCHEDULED",
  "businessDateMode": "PREVIOUS_PERIOD",
  "operator": "xxl-job-auto-sync"
}
```

注意：

- `businessDate` 不在任务配置中写死。
- 每次触发时由 backend 根据规则和当前时间解析业务周期。
- `business_date_offset_days` 已参与同步哈希和任务更新时间判断，但真正的到期时间仍由 `task_groups.scheduled_at` 控制。

## 3.7 明确 CRON 与业务频率的关系

当前 `schedule_rules.cron_expression` 是每日唤醒 CRON：

```text
trigger_time = 09:00:00
cron_expression = 0 0 9 * * ?
```

无论业务频率是：

- `DAILY`
- `WEEKLY`
- `MONTHLY`
- `QUARTERLY`
- `YEARLY`

XXL-JOB 都按规则的 `trigger_time` 每日唤醒。

真正是否执行某个业务周期，以 `task_groups.scheduled_at` 为准：

```text
业务周期结束时间
  + business_date_offset_days
  + trigger_time
  -> task_groups.scheduled_at
```

例如：

```text
frequency = MONTHLY
business_date = 2026-06
offset = 3
trigger_time = 09:00
scheduled_at = 2026-07-03 09:00:00
```

因此验收时不能把月频规则期待为“每月执行一次”的 Admin CRON。

## 3.8 增加定时补偿和手动同步入口

自动同步配置：

```yaml
xxl:
  job:
    sync:
      enabled: false
      batch-size: 50
      fixed-delay-ms: 30000
      initial-delay-ms: 10000
```

本地默认关闭，避免启动 scheduler 后意外修改 Admin。

启用方式：

```powershell
$env:XXL_JOB_SYNC_ENABLED='true'
```

启用后 scheduler：

- 启动 10 秒后执行第一次扫描。
- 此后每 30 秒扫描一次。
- 每批最多处理 50 条规则。

新增手动入口：

```http
POST http://127.0.0.1:8200/internal/xxl-job/rules/sync?limit=50
```

返回示例：

```json
{
  "processed": 1
}
```

建议验收阶段保持自动扫描关闭，优先使用手动入口，避免测试过程中状态被定时任务提前消费。

## 3.9 增加自动同步配置

本地配置支持：

```yaml
xxl:
  job:
    admin:
      addresses: http://127.0.0.1:8080
      username: ${XXL_JOB_ADMIN_USERNAME:admin}
      password: ${XXL_JOB_ADMIN_PASSWORD:123456}
```

可使用环境变量覆盖：

```powershell
$env:XXL_JOB_ADMIN_USERNAME='admin'
$env:XXL_JOB_ADMIN_PASSWORD='实际密码'
```

## 3.10 修复 backend 启动问题

修复 `ScheduleRuleMapper` 动态 SQL 中 `<>` 被 MyBatis 当作 XML 标签解析的问题。

修复方式：

```text
<> 改为 !=
```

新增 Mapper 注解解析回归测试，保证动态 `<script>` SQL 会在单元测试阶段被 MyBatis 实际解析。

同时增强 `start-backend.cmd`：

- backend 已健康运行时提示“已运行”，不再重复启动。
- 端口 `8000` 被其他程序占用时给出明确提示。
- 避免重复双击被误判为代码启动失败。

修复后已验证：

```text
GET http://127.0.0.1:8000/actuator/health
{"status":"UP"}
```

---

## 4. 今日变更的验证结果

已完成：

| 验证项 | 结果 |
|---|---|
| backend 编译 | 通过 |
| scheduler-service 编译 | 通过 |
| scheduler-service 全量测试 | 19 项通过 |
| backend 同步状态测试 | 6 项通过 |
| Mapper 注解解析测试 | 通过 |
| 本地 Admin SSO 登录 | 返回 `200` |
| 本地 Executor Group 查询 | 返回 `200` |
| backend 健康检查 | `UP` |

尚未执行：

- 使用真实业务规则在 Admin 自动创建任务。
- 真实规则更新后的原任务更新。
- 真实规则禁用后的任务停止。
- Admin 不可用后的失败记录与恢复重试。

这些内容属于下一阶段验收范围。

---

## 5. 下一阶段验收目标

证明以下闭环成立：

```text
真实指标组规则
  -> schedule_rules.PENDING_SYNC
  -> scheduler 领取
  -> Admin 创建或更新唯一任务
  -> schedule_rules.SYNCED
```

并证明：

1. 首次同步只创建一条任务。
2. 规则修改时更新原任务，不重复创建。
3. 规则禁用时停止原任务。
4. Admin 不可用时记录失败。
5. Admin 恢复后可以重试成功。
6. 数据库状态、Admin 状态和规则配置保持一致。

---

## 6. 验收环境

## 6.1 服务清单

| 服务 | 地址 | 要求 |
|---|---|---|
| backend-service | `http://127.0.0.1:8000` | 健康检查返回 `UP` |
| scheduler-service | `http://127.0.0.1:8200` | local profile 启动 |
| XXL-JOB Admin | `http://127.0.0.1:8080` | 可以登录 |
| XXL-JOB Executor | `http://127.0.0.1:9999` | Admin 显示在线 |
| MySQL | 当前项目配置地址 | 三个 schema 可访问 |

涉及 schema：

| Schema | 用途 |
|---|---|
| `data_foundry_backend` | `schedule_rules` 和业务任务 |
| `data_foundry_scheduler` | `schedule_jobs` |
| `xxl_job` | Admin 任务和执行器数据 |

## 6.2 启动配置

验收前半段建议关闭自动同步：

```powershell
$env:SPRING_PROFILES_ACTIVE='local'
$env:XXL_JOB_SYNC_ENABLED='false'
$env:XXL_JOB_ADMIN_USERNAME='admin'
$env:XXL_JOB_ADMIN_PASSWORD='123456'
```

这样可以在每一步查询数据库后，再手动触发同步。

最后单独验证自动重试时，再改为：

```powershell
$env:XXL_JOB_SYNC_ENABLED='true'
```

## 6.3 V021 前置核验

在 `data_foundry_backend` 执行：

```sql
SELECT column_name, column_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'data_foundry_backend'
  AND table_name = 'schedule_rules'
  AND column_name IN (
    'xxl_sync_status',
    'xxl_sync_hash',
    'xxl_last_sync_time',
    'xxl_last_error_message',
    'xxl_sync_retry_count'
  )
ORDER BY ordinal_position;
```

预期返回 5 行。

核验索引：

```sql
SHOW INDEX FROM data_foundry_backend.schedule_rules
WHERE Key_name = 'idx_schedule_rules_xxl_sync';
```

---

## 7. 测试数据设计

## 7.1 业务测试数据

优先复用平台中真实存在、尚未同步到 Admin 的月频指标组规则。

推荐配置：

| 配置项 | 测试值 |
|---|---|
| 定期更新 | 是 |
| 更新模式 | 增量更新或全量更新均可 |
| 频率 | `MONTHLY` |
| 时间偏移量 | `3` |
| 触发时间 | `09:00` |
| 指标组 | 任意一条真实且可识别的指标组 |
| enabled | `true` |

选择月频是为了便于人工理解，但自动同步能力与五种业务频率无关。

## 7.2 测试规则生成方式

必须通过真实业务操作生成：

```text
需求管理
  -> 保存定期更新配置
  -> 采集任务管理
  -> 采集提示词管理
  -> 点击“生成/重建任务组”
```

该操作会：

- 读取 `wide_tables.schedule_rules_json`
- 读取 `wide_tables.indicator_groups_json`
- 为每个指标组生成一条稳定 ID 的 `schedule_rule`
- 生成或重建 `task_groups`
- 直接生成 `fetch_tasks`

不要通过手工 INSERT 创建孤立 `schedule_rules`，否则无法代表真实业务链路。

## 7.3 选择测试规则

```sql
USE data_foundry_backend;

SELECT
  id,
  requirement_id,
  wide_table_id,
  indicator_group_id,
  rule_name,
  frequency,
  cron_expression,
  business_date_mode,
  business_date_offset_days,
  trigger_time,
  enabled,
  xxl_job_id,
  xxl_job_group,
  xxl_executor_name,
  xxl_sync_status,
  xxl_sync_hash,
  xxl_last_sync_time,
  xxl_last_error_message,
  xxl_sync_retry_count,
  next_trigger_time,
  updated_at
FROM schedule_rules
WHERE enabled = 1
  AND frequency = 'MONTHLY'
ORDER BY
  CASE WHEN xxl_job_id IS NULL THEN 0 ELSE 1 END,
  updated_at DESC;
```

优先选择：

```text
enabled = 1
xxl_job_id IS NULL
xxl_sync_status = PENDING_SYNC
```

记录以下测试变量：

```text
TEST_RULE_ID=
TEST_REQUIREMENT_ID=
TEST_WIDE_TABLE_ID=
TEST_INDICATOR_GROUP_ID=
ORIGINAL_TRIGGER_TIME=
ORIGINAL_CRON=
ORIGINAL_OFFSET_DAYS=
ORIGINAL_ENABLED=
ORIGINAL_SYNC_HASH=
```

## 7.4 Admin 侧基线数据

在 Admin 页面按以下内容搜索：

```text
[DF_RULE:{TEST_RULE_ID}]
```

也可执行只读 SQL：

```sql
USE xxl_job;

SELECT
  id,
  job_group,
  job_desc,
  schedule_type,
  schedule_conf,
  executor_handler,
  executor_param,
  trigger_status,
  trigger_next_time,
  update_time
FROM xxl_job_info
WHERE job_desc LIKE CONCAT('%[DF_RULE:', '<TEST_RULE_ID>', ']%');
```

首次同步前预期返回 0 行。

如果已经存在对应任务，应换一条未同步规则；不要直接删除无法确认归属的 Admin 任务。

---

## 8. 场景一：首次自动同步

## 8.1 前置条件

- backend 健康。
- scheduler 健康。
- Admin 可以登录。
- Executor `data-foundry-scheduler-local` 在线。
- 选中规则为 `PENDING_SYNC`。
- Admin 不存在对应 `[DF_RULE:{TEST_RULE_ID}]` 任务。

## 8.2 触发方式

使用手动同步接口：

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri 'http://127.0.0.1:8200/internal/xxl-job/rules/sync?limit=1'
```

如果启用了内部令牌：

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri 'http://127.0.0.1:8200/internal/xxl-job/rules/sync?limit=1' `
  -Headers @{ 'X-Internal-Token' = '<shared-token>' }
```

预期：

```json
{
  "processed": 1
}
```

## 8.3 核验 schedule_rules

```sql
SELECT
  id,
  xxl_job_id,
  xxl_job_group,
  xxl_executor_name,
  xxl_sync_status,
  xxl_sync_hash,
  xxl_last_sync_time,
  xxl_last_error_message,
  xxl_sync_retry_count,
  next_trigger_time
FROM data_foundry_backend.schedule_rules
WHERE id = '<TEST_RULE_ID>';
```

预期：

| 字段 | 预期 |
|---|---|
| `xxl_job_id` | 非空 |
| `xxl_job_group` | 非空 |
| `xxl_executor_name` | `data-foundry-scheduler-local` |
| `xxl_sync_status` | `SYNCED` |
| `xxl_sync_hash` | 与触发前一致 |
| `xxl_last_sync_time` | 非空且为本次时间 |
| `xxl_last_error_message` | `NULL` |
| `xxl_sync_retry_count` | `0` |
| `next_trigger_time` | 非空且晚于当前时间 |

记录：

```text
FIRST_XXL_JOB_ID=
FIRST_SYNC_TIME=
FIRST_NEXT_TRIGGER_TIME=
```

## 8.4 核验 Admin 任务

在 Admin 页面核验：

| 配置项 | 预期 |
|---|---|
| 任务描述 | 包含 `[DF_RULE:{TEST_RULE_ID}]` |
| 执行器 | `data-foundry-scheduler-local` |
| 运行模式 | `BEAN` |
| JobHandler | `dataCollectJobHandler` |
| 调度类型 | `CRON` |
| CRON | 等于 `schedule_rules.cron_expression` |
| 路由策略 | 第一个 `FIRST` |
| 阻塞策略 | 单机串行 `SERIAL_EXECUTION` |
| 调度过期策略 | 忽略 `DO_NOTHING` |
| 状态 | 启动 |

执行参数预期：

```json
{
  "ruleId": "<TEST_RULE_ID>",
  "frequency": "MONTHLY",
  "triggerType": "SCHEDULED",
  "businessDateMode": "PREVIOUS_PERIOD",
  "operator": "xxl-job-auto-sync"
}
```

## 8.5 核验 Admin 数据库

```sql
SELECT
  id,
  job_group,
  job_desc,
  schedule_type,
  schedule_conf,
  executor_handler,
  executor_param,
  executor_route_strategy,
  executor_block_strategy,
  misfire_strategy,
  glue_type,
  trigger_status,
  trigger_next_time
FROM xxl_job.xxl_job_info
WHERE id = <FIRST_XXL_JOB_ID>;
```

验收标准：

- 只存在一条对应任务。
- `id` 等于 backend 回写的 `xxl_job_id`。
- `trigger_status = 1`。
- Handler、CRON 和执行参数正确。

---

## 9. 场景二：规则修改后更新原任务

## 9.1 修改测试数据

在需求录入页面将触发时间从：

```text
09:00
```

改为：

```text
09:05
```

保存需求后，在“采集提示词管理”再次点击：

```text
生成/重建任务组
```

该操作用于重新物化 `schedule_rules`，不是直接修改数据库。

## 9.2 同步前核验

```sql
SELECT
  id,
  trigger_time,
  cron_expression,
  xxl_job_id,
  xxl_sync_status,
  xxl_sync_hash,
  xxl_sync_retry_count
FROM data_foundry_backend.schedule_rules
WHERE id = '<TEST_RULE_ID>';
```

预期：

| 字段 | 预期 |
|---|---|
| `id` | 与首次同步相同 |
| `trigger_time` | `09:05:00` |
| `cron_expression` | `0 5 9 * * ?` |
| `xxl_job_id` | 仍为 `FIRST_XXL_JOB_ID` |
| `xxl_sync_status` | `PENDING_SYNC` |
| `xxl_sync_hash` | 与 `ORIGINAL_SYNC_HASH` 不同 |
| `xxl_sync_retry_count` | `0` |

## 9.3 执行同步

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri 'http://127.0.0.1:8200/internal/xxl-job/rules/sync?limit=1'
```

## 9.4 核验结果

backend：

```sql
SELECT
  id,
  xxl_job_id,
  cron_expression,
  xxl_sync_status,
  xxl_last_sync_time,
  next_trigger_time
FROM data_foundry_backend.schedule_rules
WHERE id = '<TEST_RULE_ID>';
```

Admin：

```sql
SELECT
  id,
  job_desc,
  schedule_conf,
  trigger_status,
  update_time
FROM xxl_job.xxl_job_info
WHERE job_desc LIKE CONCAT('%[DF_RULE:', '<TEST_RULE_ID>', ']%');
```

验收标准：

- Admin 只返回一行。
- Admin 任务 ID 仍等于 `FIRST_XXL_JOB_ID`。
- `schedule_conf` 更新为 `0 5 9 * * ?`。
- `schedule_rules.xxl_sync_status = SYNCED`。
- 没有新增第二条相同 `[DF_RULE:{TEST_RULE_ID}]` 的任务。

---

## 10. 场景三：规则禁用后停止 Admin 任务

## 10.1 禁用测试数据

在需求录入页面关闭该定期更新规则，或将规则 `enabled` 设为 `false`。

保存后再次点击：

```text
生成/重建任务组
```

## 10.2 同步前核验

```sql
SELECT
  id,
  enabled,
  xxl_job_id,
  xxl_sync_status,
  xxl_sync_hash
FROM data_foundry_backend.schedule_rules
WHERE id = '<TEST_RULE_ID>';
```

预期：

```text
enabled = 0
xxl_job_id = FIRST_XXL_JOB_ID
xxl_sync_status = PENDING_SYNC
```

## 10.3 执行同步

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri 'http://127.0.0.1:8200/internal/xxl-job/rules/sync?limit=1'
```

## 10.4 核验结果

```sql
SELECT
  id,
  enabled,
  xxl_job_id,
  xxl_sync_status,
  next_trigger_time,
  xxl_last_error_message,
  xxl_sync_retry_count
FROM data_foundry_backend.schedule_rules
WHERE id = '<TEST_RULE_ID>';
```

预期：

```text
enabled = 0
xxl_job_id = FIRST_XXL_JOB_ID
xxl_sync_status = DISABLED
next_trigger_time IS NULL
xxl_last_error_message IS NULL
xxl_sync_retry_count = 0
```

Admin：

```sql
SELECT id, trigger_status, trigger_next_time
FROM xxl_job.xxl_job_info
WHERE id = <FIRST_XXL_JOB_ID>;
```

预期：

```text
trigger_status = 0
trigger_next_time = 0
```

验收标准：

- 任务被停止但没有被删除。
- Admin 任务 ID 保持不变。
- 重新启用后可以复用同一任务。

---

## 11. 场景四：Admin 不可用时记录同步失败

## 11.1 恢复规则为启用并制造新配置

将规则恢复为启用，并将触发时间修改为：

```text
09:10
```

保存后点击“生成/重建任务组”。

同步前核验：

```sql
SELECT
  id,
  enabled,
  cron_expression,
  xxl_job_id,
  xxl_sync_status,
  xxl_sync_hash
FROM data_foundry_backend.schedule_rules
WHERE id = '<TEST_RULE_ID>';
```

预期：

```text
enabled = 1
cron_expression = 0 10 9 * * ?
xxl_job_id = FIRST_XXL_JOB_ID
xxl_sync_status = PENDING_SYNC
```

## 11.2 模拟 Admin 不可用

停止 IDEA 中的 `XxlJobAdminApplication`。

确认：

```powershell
Test-NetConnection 127.0.0.1 -Port 8080
```

预期：

```text
TcpTestSucceeded = False
```

## 11.3 触发同步

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri 'http://127.0.0.1:8200/internal/xxl-job/rules/sync?limit=1'
```

该接口可能仍返回：

```json
{
  "processed": 1
}
```

`processed` 表示已处理一条规则，不表示 Admin 同步成功。

## 11.4 核验失败记录

```sql
SELECT
  id,
  xxl_job_id,
  xxl_sync_status,
  xxl_last_sync_time,
  xxl_last_error_message,
  xxl_sync_retry_count,
  next_trigger_time
FROM data_foundry_backend.schedule_rules
WHERE id = '<TEST_RULE_ID>';
```

预期：

| 字段 | 预期 |
|---|---|
| `xxl_job_id` | 保留 `FIRST_XXL_JOB_ID` |
| `xxl_sync_status` | `SYNC_FAILED` |
| `xxl_last_sync_time` | 更新为失败时间 |
| `xxl_last_error_message` | 包含连接失败或 Admin 请求失败信息 |
| `xxl_sync_retry_count` | 大于等于 `1` |

验收标准：

- Admin 不可用不会导致规则数据丢失。
- 原 `xxl_job_id` 不会被清空。
- 失败原因可排查。
- 规则可以被后续扫描再次领取。

---

## 12. 场景五：Admin 恢复后的手动重试

## 12.1 恢复 Admin

在 IDEA 重新启动 `XxlJobAdminApplication`。

确认：

```powershell
Invoke-WebRequest `
  -UseBasicParsing `
  -Uri 'http://127.0.0.1:8080/' `
  -TimeoutSec 5
```

并确认 Executor `data-foundry-scheduler-local` 在线。

## 12.2 执行重试

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri 'http://127.0.0.1:8200/internal/xxl-job/rules/sync?limit=1'
```

## 12.3 核验结果

```sql
SELECT
  id,
  xxl_job_id,
  xxl_sync_status,
  xxl_last_sync_time,
  xxl_last_error_message,
  xxl_sync_retry_count,
  next_trigger_time
FROM data_foundry_backend.schedule_rules
WHERE id = '<TEST_RULE_ID>';
```

预期：

```text
xxl_job_id = FIRST_XXL_JOB_ID
xxl_sync_status = SYNCED
xxl_last_error_message IS NULL
xxl_sync_retry_count = 0
next_trigger_time IS NOT NULL
```

Admin：

```sql
SELECT
  id,
  schedule_conf,
  trigger_status,
  trigger_next_time,
  update_time
FROM xxl_job.xxl_job_info
WHERE job_desc LIKE CONCAT('%[DF_RULE:', '<TEST_RULE_ID>', ']%');
```

预期：

```text
只返回一行
id = FIRST_XXL_JOB_ID
schedule_conf = 0 10 9 * * ?
trigger_status = 1
```

---

## 13. 场景六：自动扫描和自动恢复重试

该场景用于验证定时补偿，不与前五个确定性场景混在一起。

## 13.1 启用自动同步

停止 scheduler-service，在 IDEA 启动配置中增加：

```text
SPRING_PROFILES_ACTIVE=local
XXL_JOB_SYNC_ENABLED=true
XXL_JOB_ADMIN_USERNAME=admin
XXL_JOB_ADMIN_PASSWORD=123456
```

重新启动 scheduler-service。

## 13.2 准备自动重试数据

修改测试规则触发时间为：

```text
09:15
```

保存并点击“生成/重建任务组”。

确认：

```sql
SELECT id, cron_expression, xxl_sync_status, xxl_sync_retry_count
FROM data_foundry_backend.schedule_rules
WHERE id = '<TEST_RULE_ID>';
```

预期：

```text
cron_expression = 0 15 9 * * ?
xxl_sync_status = PENDING_SYNC
```

## 13.3 自动成功场景

保持 Admin 在线，不调用手动同步接口。

等待：

```text
initial-delay 10 秒 + 一个轮询周期
```

建议最长观察 45 秒。

预期：

```text
PENDING_SYNC -> SYNCING -> SYNCED
```

## 13.4 自动失败恢复场景

1. 停止 Admin。
2. 将触发时间改为 `09:20`。
3. 保存并重建任务组。
4. 等待 45 秒。
5. 核验状态变为 `SYNC_FAILED`。
6. 重新启动 Admin。
7. 不调用手动接口。
8. 再等待 45 秒。

预期：

```text
PENDING_SYNC
  -> SYNC_FAILED
  -> SYNCED
```

并且：

- `xxl_job_id` 始终不变。
- Admin 始终只有一条该规则任务。
- 恢复成功后重试次数清零。

---

## 14. 幂等性与重复任务排查 SQL

## 14.1 检查单规则是否存在多个 Admin 任务

```sql
SELECT
  job_desc,
  COUNT(*) AS task_count,
  GROUP_CONCAT(id ORDER BY id) AS job_ids
FROM xxl_job.xxl_job_info
WHERE job_desc LIKE '%[DF_RULE:%'
GROUP BY job_desc
HAVING COUNT(*) > 1;
```

预期返回 0 行。

针对测试规则：

```sql
SELECT COUNT(*) AS task_count
FROM xxl_job.xxl_job_info
WHERE job_desc LIKE CONCAT('%[DF_RULE:', '<TEST_RULE_ID>', ']%');
```

预期：

```text
task_count = 1
```

## 14.2 检查已同步规则是否缺失 Admin ID

```sql
SELECT id, rule_name, xxl_sync_status, xxl_job_id
FROM data_foundry_backend.schedule_rules
WHERE xxl_sync_status = 'SYNCED'
  AND (xxl_job_id IS NULL OR xxl_job_id = '');
```

预期返回 0 行。

## 14.3 检查失败规则

```sql
SELECT
  id,
  rule_name,
  xxl_sync_status,
  xxl_sync_retry_count,
  xxl_last_sync_time,
  xxl_last_error_message
FROM data_foundry_backend.schedule_rules
WHERE xxl_sync_status = 'SYNC_FAILED'
ORDER BY xxl_last_sync_time DESC;
```

## 14.4 检查长时间停留在 SYNCING 的规则

```sql
SELECT
  id,
  rule_name,
  xxl_sync_status,
  updated_at
FROM data_foundry_backend.schedule_rules
WHERE xxl_sync_status = 'SYNCING'
  AND updated_at < NOW() - INTERVAL 5 MINUTE;
```

当前代码尚未实现 `SYNCING` 租约自动回收。若该 SQL 返回数据，需要人工核查 scheduler 是否在领取后异常退出。

---

## 15. 测试数据恢复

全部场景完成后，将测试需求恢复为原始配置：

```text
trigger_time = ORIGINAL_TRIGGER_TIME
business_date_offset_days = ORIGINAL_OFFSET_DAYS
enabled = ORIGINAL_ENABLED
```

保存需求并再次点击：

```text
生成/重建任务组
```

然后执行一次同步，确认：

```text
schedule_rules.xxl_sync_status = SYNCED
Admin 任务 ID = FIRST_XXL_JOB_ID
Admin 任务配置与恢复后的业务配置一致
```

如果测试规则原本不应启用自动调度，则最终应恢复为：

```text
enabled = 0
xxl_sync_status = DISABLED
Admin trigger_status = 0
```

不要直接删除真实规则对应的 Admin 任务。

---

## 16. 验收证据清单

每个场景至少保留：

1. `schedule_rules` 查询结果截图或导出。
2. Admin 任务详情截图。
3. `xxl_job_info` 查询结果。
4. scheduler 日志中规则同步成功或失败记录。
5. backend 日志中 `/claim` 和 `/result` 调用记录。
6. 首次同步、更新、禁用、失败、恢复对应的时间点。
7. `FIRST_XXL_JOB_ID` 在全部场景中的一致性记录。

建议记录表：

| 场景 | rule_id | xxl_job_id | 同步前状态 | 同步后状态 | Admin 状态 | 结果 |
|---|---|---|---|---|---|---|
| 首次同步 |  |  | `PENDING_SYNC` | `SYNCED` | 启动 |  |
| 规则更新 |  |  | `PENDING_SYNC` | `SYNCED` | 原 ID 更新 |  |
| 规则禁用 |  |  | `PENDING_SYNC` | `DISABLED` | 停止 |  |
| Admin 不可用 |  |  | `PENDING_SYNC` | `SYNC_FAILED` | 不可访问 |  |
| Admin 恢复 |  |  | `SYNC_FAILED` | `SYNCED` | 原 ID 启动 |  |
| 自动重试 |  |  | `SYNC_FAILED` | `SYNCED` | 原 ID 更新 |  |

---

## 17. 总体验收标准

全部满足时，本阶段通过：

- Executor `data-foundry-scheduler-local` 稳定在线。
- 一条真实指标组规则只对应一条 Admin 任务。
- 首次同步自动创建并启动任务。
- Handler 固定为 `dataCollectJobHandler`。
- Admin CRON 与 `schedule_rules.cron_expression` 一致。
- Job Param 中的 `ruleId`、`frequency` 和 `businessDateMode` 正确。
- `schedule_rules.xxl_job_id` 与 `xxl_job_info.id` 一致。
- `xxl_sync_status` 可以正确流转。
- 修改规则后复用原 `xxl_job_id`。
- 禁用规则后停止任务而不是删除任务。
- Admin 不可用时记录 `SYNC_FAILED`、错误原因和重试次数。
- Admin 恢复后可以回到 `SYNCED`。
- 同一 `[DF_RULE:{ruleId}]` 在 Admin 中不存在重复任务。

---

## 18. 本轮验收之后的建议改造

真实验收通过后，建议继续建设：

1. 为 `SYNCING` 增加租约超时回收。
2. 增加 Admin 与 `schedule_rules` 的定期对账。
3. 检测 Admin 任务被人工删除、改名或停用后的漂移。
4. 增加按 `ruleId` 单条立即重试接口。
5. 增加同步成功率、失败数、重试次数和同步耗时指标。
6. 对 Admin 密码和内部令牌使用安全配置中心管理。
7. 增加同步操作审计日志。
8. 将真实联调场景固化为可重复执行的集成测试。
