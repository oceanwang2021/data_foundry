# AI 采集平台 XXL-JOB 方案 2 技术方案：按频率自动同步 5 个到期任务扫描任务

## 1. 背景与目标

当前 AI 采集平台已经支持通过前端配置数据更新周期，并在后端完成采集任务的生成与执行。平台的核心流程包括：

1. 用户在平台前端配置数据更新周期。
2. 平台保存调度配置。
3. 用户生成或重建任务组。
4. 平台生成物理调度规则、任务组和采集任务实例。
5. 后续通过调度中心自动触发采集任务。

目前平台需要支持以下更新频率：

| 频率 | 说明 |
|---|---|
| 日频 | 每日数据更新 |
| 周频 | 每周数据更新 |
| 月频 | 每月数据更新 |
| 季频 | 每季度数据更新 |
| 年频 | 每年数据更新 |

同时，不同指标组可能存在不同的时间偏移量和触发时间。例如：

| 指标组 | 频率 | 时间偏移量 | 触发时间 | 说明 |
|---|---|---:|---|---|
| 指标组 A | 月频 | 1 天 | 09:00 | 上月结束后第 1 天 09:00 执行 |
| 指标组 B | 月频 | 5 天 | 09:00 | 上月结束后第 5 天 09:00 执行 |

因此，调度系统不能简单按“月频固定某一天执行”来处理，而应该根据平台内部计算出的 `task_groups.scheduled_at` 判断具体任务是否到期。

本方案目标是实现：

```text
用户在平台配置更新周期
  ↓
生成 schedule_rules、task_groups、fetch_tasks
  ↓
平台自动同步 XXL-JOB Admin 中的频率扫描任务
  ↓
XXL-JOB 按频率唤醒 scheduler-service
  ↓
平台扫描已到期 task_groups
  ↓
自动执行对应 fetch_tasks
```

最终用户不需要再手工登录 XXL-JOB Admin 配置任务。

---

## 2. 当前平台已有能力

根据当前平台设计，调度相关数据已经分为三个层次。

### 2.1 前端配置层

前端在需求录入阶段保存调度配置，主要落库到：

```text
data_foundry_backend.wide_tables.schedule_rules_json
```

典型配置内容：

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

| 字段 | 含义 |
|---|---|
| `frequency` | 调度频率，支持 DAILY、WEEKLY、MONTHLY、QUARTERLY、YEARLY |
| `trigger_time` | 触发时间，例如 09:00 |
| `business_date_offset_days` | 业务周期结束后偏移多少天执行 |
| `enabled` | 是否启用该调度配置 |

保存需求时只保存调度配置模板，不会立即生成物理调度规则和任务组。

### 2.2 可执行计划层

用户点击“生成/重建任务组”后，平台根据：

```text
wide_tables.schedule_rules_json
indicator_groups_json
```

生成：

```text
schedule_rules
task_groups
fetch_tasks
```

当前模型为：

```text
一份宽表级调度模板
  + N 个指标组
  -> N 条 schedule_rules
```

其中：

| 表 | 职责 |
|---|---|
| `schedule_rules` | 物理调度规则，当前基本是指标组级规则 |
| `task_groups` | 某个指标组在某个业务周期下的任务组 |
| `fetch_tasks` | 具体采集任务实例 |

`task_groups.scheduled_at` 由以下信息计算得到：

```text
frequency
business_date
business_date_offset_days
trigger_time
```

例如：

| 频率 | 业务周期 | 偏移量 | 触发时间 | scheduled_at 示例 |
|---|---|---:|---|---|
| 月频 | 2026-06 | 3 天 | 09:00 | 2026-07-03 09:00 |
| 年频 | 2026 | 10 天 | 09:00 | 2027-01-10 09:00 |

### 2.3 调度运行记录层

XXL-JOB 实际触发后，会产生运行记录：

| 表 | 说明 |
|---|---|
| `data_foundry_scheduler.schedule_jobs` | scheduler-service 本地运行记录 |
| `data_foundry_backend.schedule_trigger_logs` | Backend 调度触发流水 |

这两张表是运行记录，不是规则配置表。只有 XXL-JOB 实际触发后才会产生数据。

### 2.4 XXL-JOB Executor 接入情况

当前 scheduler-service 已经具备：

1. 引入 `xxl-job-core`。
2. 配置并启动 XXL-JOB Executor。
3. 向 XXL-JOB Admin 注册执行器。
4. 暴露 `dataCollectJobHandler`。
5. 接收 XXL-JOB 任务参数并调用 Backend。

但当前缺少：

1. 自动创建 XXL-JOB Admin 任务。
2. 自动更新 XXL-JOB Cron。
3. 自动启停 XXL-JOB 任务。
4. 自动保存 XXL-JOB Job ID。
5. 平台前端展示 XXL-JOB 同步状态。

---

## 3. 方案选择

### 3.1 不推荐的粒度

不建议在 XXL-JOB Admin 中按以下粒度配置任务。

#### 3.1.1 不建议按 fetch_task 粒度配置

`fetch_tasks` 是具体采集任务实例，数量多、生命周期短，不适合作为 XXL-JOB Admin 的任务配置粒度。

如果按 `fetch_task` 创建 XXL-JOB 任务，会导致：

1. XXL-JOB Admin 任务数量暴增。
2. 重建任务组后需要清理大量旧任务。
3. 状态同步复杂。
4. 失败重试容易重复执行已成功采集任务。

#### 3.1.2 不建议第一阶段按每条 schedule_rule 配置

每个指标组会生成一条 `schedule_rules`。如果每条规则都同步为 XXL-JOB 任务，会导致：

1. 指标组越多，XXL-JOB 任务越多。
2. 规则启用、停用、修改都要同步 XXL-JOB。
3. 需要维护 `schedule_rules.xxl_job_id`。
4. 实现成本和维护成本都较高。

因此，第一阶段不建议按指标组或 `schedule_rule` 粒度同步。

---

## 4. 采用方案 2：按频率自动同步 5 个 XXL-JOB 扫描任务

### 4.1 方案定义

方案 2 是指平台自动在 XXL-JOB Admin 中维护 5 个频率扫描任务：

| 频率 | XXL-JOB 任务 | 任务参数 |
|---|---|---|
| 日频 | 日频到期任务扫描 | `{"mode":"SCAN_DUE_TASKS","frequency":"DAILY"}` |
| 周频 | 周频到期任务扫描 | `{"mode":"SCAN_DUE_TASKS","frequency":"WEEKLY"}` |
| 月频 | 月频到期任务扫描 | `{"mode":"SCAN_DUE_TASKS","frequency":"MONTHLY"}` |
| 季频 | 季频到期任务扫描 | `{"mode":"SCAN_DUE_TASKS","frequency":"QUARTERLY"}` |
| 年频 | 年频到期任务扫描 | `{"mode":"SCAN_DUE_TASKS","frequency":"YEARLY"}` |

XXL-JOB Admin 的职责是：

```text
按频率定时唤醒 scheduler-service
```

平台后端的职责是：

```text
根据 frequency + scheduled_at 判断哪些 task_groups 到期
```

---

## 5. 方案 2 的目标架构

```text
平台前端
  ↓
保存调度配置到 schedule_rules_json
  ↓
生成/重建任务组
  ↓
Backend 生成 schedule_rules、task_groups、fetch_tasks
  ↓
Backend 自动同步 5 个 XXL-JOB 频率扫描任务
  ↓
XXL-JOB Admin 按 Cron 触发
  ↓
scheduler-service.dataCollectJobHandler
  ↓
按 frequency 调用 Backend 扫描到期 task_groups
  ↓
执行 fetch_tasks
  ↓
采集接口调用、格式化、落库、稽核
  ↓
更新任务状态与调度日志
```

---

## 6. 方案 2 的完整执行流程

### 6.1 平台侧配置流程

1. 用户在平台前端配置数据更新规则。
2. 用户选择频率：日频、周频、月频、季频或年频。
3. 用户配置时间偏移量。
4. 用户配置触发时间。
5. 用户点击保存需求。
6. 平台将配置保存到 `wide_tables.schedule_rules_json`。

这一步只保存配置模板，不立即创建 XXL-JOB 任务。

### 6.2 生成任务组流程

用户点击“生成/重建任务组”后：

```text
读取 schedule_rules_json
读取 indicator_groups_json
生成或更新 schedule_rules
生成 task_groups
生成 fetch_tasks
事务提交
触发 XXL-JOB 自动同步
```

### 6.3 XXL-JOB 自动同步流程

事务提交后，平台调用 `XxlJobSyncService`：

```text
检查 DUE_TASK_SCAN_DAILY 是否存在
  不存在则创建，存在则更新
检查 DUE_TASK_SCAN_WEEKLY 是否存在
  不存在则创建，存在则更新
检查 DUE_TASK_SCAN_MONTHLY 是否存在
  不存在则创建，存在则更新
检查 DUE_TASK_SCAN_QUARTERLY 是否存在
  不存在则创建，存在则更新
检查 DUE_TASK_SCAN_YEARLY 是否存在
  不存在则创建，存在则更新
启动或保持启用状态
记录同步状态
```

### 6.4 XXL-JOB 触发流程

例如月频扫描任务被触发：

```json
{"mode":"SCAN_DUE_TASKS","frequency":"MONTHLY"}
```

执行链路：

```text
XXL-JOB Admin
  ↓
scheduler-service.dataCollectJobHandler
  ↓
解析 frequency = MONTHLY
  ↓
创建 schedule_jobs 运行记录
  ↓
调用 Backend scanAndDispatchDueTaskGroups(MONTHLY)
  ↓
Backend 查询到期 task_groups
  ↓
抢占 task_group
  ↓
执行 fetch_tasks
  ↓
写 schedule_trigger_logs
  ↓
更新 schedule_jobs
```

---

## 7. 5 个 XXL-JOB 任务配置建议

### 7.1 基础配置

5 个任务使用相同执行器和 JobHandler。

| 配置项 | 值 |
|---|---|
| 执行器 | `data-foundry-scheduler` |
| 运行模式 | `BEAN` |
| JobHandler | `dataCollectJobHandler` |
| 路由策略 | `第一个` 或 `FIRST` |
| 阻塞处理策略 | `单机串行` |
| 失败重试次数 | 1 |
| Misfire 策略 | `DO_NOTHING` |

### 7.2 Cron 建议

第一版可以使用以下配置：

| 频率 | 任务名称 | Cron | 说明 |
|---|---|---|---|
| 日频 | 日频到期任务扫描 | `0 */10 * * * ?` | 每 10 分钟扫描 |
| 周频 | 周频到期任务扫描 | `0 */30 * * * ?` | 每 30 分钟扫描 |
| 月频 | 月频到期任务扫描 | `0 */30 * * * ?` | 每 30 分钟扫描 |
| 季频 | 季频到期任务扫描 | `0 0 * * * ?` | 每小时扫描 |
| 年频 | 年频到期任务扫描 | `0 0 * * * ?` | 每小时扫描 |

后续可以将 Cron 做成系统配置。

---

## 8. 数据库设计

### 8.1 新增 XXL-JOB 同步配置表

建议新增表：

```sql
CREATE TABLE xxl_job_sync_configs (
    id VARCHAR(64) PRIMARY KEY,
    sync_key VARCHAR(128) NOT NULL COMMENT '同步键，如 DUE_TASK_SCAN_MONTHLY',
    frequency VARCHAR(32) NOT NULL COMMENT 'DAILY, WEEKLY, MONTHLY, QUARTERLY, YEARLY',
    xxl_job_id INT DEFAULT NULL COMMENT 'XXL-JOB Admin 任务ID',

    job_desc VARCHAR(255) DEFAULT NULL COMMENT 'XXL-JOB任务描述',
    executor_appname VARCHAR(128) DEFAULT NULL COMMENT '执行器AppName',
    job_handler VARCHAR(128) DEFAULT NULL COMMENT 'JobHandler名称',

    schedule_type VARCHAR(32) DEFAULT 'CRON' COMMENT '调度类型',
    schedule_conf VARCHAR(128) DEFAULT NULL COMMENT 'Cron表达式',
    executor_param VARCHAR(1000) DEFAULT NULL COMMENT '任务参数',

    sync_status VARCHAR(32) DEFAULT 'PENDING_SYNC' COMMENT 'PENDING_SYNC, SYNCED, SYNC_FAILED, DISABLED',
    last_sync_time DATETIME DEFAULT NULL COMMENT '最近同步时间',
    last_error_message TEXT DEFAULT NULL COMMENT '最近同步失败原因',

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY uk_sync_key (sync_key)
) COMMENT='XXL-JOB任务同步配置表';
```

### 8.2 初始化数据

可以预置 5 条同步配置：

```sql
INSERT INTO xxl_job_sync_configs (
    id, sync_key, frequency, job_desc, executor_appname, job_handler,
    schedule_type, schedule_conf, executor_param, sync_status
) VALUES
('xxl_sync_daily', 'DUE_TASK_SCAN_DAILY', 'DAILY', '日频到期任务扫描', 'data-foundry-scheduler', 'dataCollectJobHandler', 'CRON', '0 */10 * * * ?', '{"mode":"SCAN_DUE_TASKS","frequency":"DAILY"}', 'PENDING_SYNC'),
('xxl_sync_weekly', 'DUE_TASK_SCAN_WEEKLY', 'WEEKLY', '周频到期任务扫描', 'data-foundry-scheduler', 'dataCollectJobHandler', 'CRON', '0 */30 * * * ?', '{"mode":"SCAN_DUE_TASKS","frequency":"WEEKLY"}', 'PENDING_SYNC'),
('xxl_sync_monthly', 'DUE_TASK_SCAN_MONTHLY', 'MONTHLY', '月频到期任务扫描', 'data-foundry-scheduler', 'dataCollectJobHandler', 'CRON', '0 */30 * * * ?', '{"mode":"SCAN_DUE_TASKS","frequency":"MONTHLY"}', 'PENDING_SYNC'),
('xxl_sync_quarterly', 'DUE_TASK_SCAN_QUARTERLY', 'QUARTERLY', '季频到期任务扫描', 'data-foundry-scheduler', 'dataCollectJobHandler', 'CRON', '0 0 * * * ?', '{"mode":"SCAN_DUE_TASKS","frequency":"QUARTERLY"}', 'PENDING_SYNC'),
('xxl_sync_yearly', 'DUE_TASK_SCAN_YEARLY', 'YEARLY', '年频到期任务扫描', 'data-foundry-scheduler', 'dataCollectJobHandler', 'CRON', '0 0 * * * ?', '{"mode":"SCAN_DUE_TASKS","frequency":"YEARLY"}', 'PENDING_SYNC');
```

---

## 9. 后端模块设计

### 9.1 XxlJobAdminClient

新增客户端类，封装 XXL-JOB Admin 调用。

职责：

```text
创建 XXL-JOB 任务
更新 XXL-JOB 任务
启动 XXL-JOB 任务
停止 XXL-JOB 任务
查询执行器 groupId
```

接口示例：

```java
public interface XxlJobAdminClient {

    Integer addJob(XxlJobSyncConfig config);

    void updateJob(Integer jobId, XxlJobSyncConfig config);

    void startJob(Integer jobId);

    void stopJob(Integer jobId);

    Integer findExecutorGroupId(String appname);
}
```

注意：不建议直接写 XXL-JOB 数据库表，优先通过 Admin 接口完成同步。

### 9.2 XxlJobSyncService

新增同步服务。

职责：

```text
读取 xxl_job_sync_configs
检查 XXL-JOB Admin 中是否已有任务
没有则创建
有则更新
确保任务启动
回写 xxl_job_id、sync_status、last_sync_time、last_error_message
```

伪代码：

```java
@Service
public class XxlJobSyncService {

    public void syncFrequencyScanJobs() {
        List<XxlJobSyncConfig> configs = syncConfigMapper.selectAllEnabled();

        for (XxlJobSyncConfig config : configs) {
            try {
                if (config.getXxlJobId() == null) {
                    Integer jobId = xxlJobAdminClient.addJob(config);
                    config.setXxlJobId(jobId);
                } else {
                    xxlJobAdminClient.updateJob(config.getXxlJobId(), config);
                }

                xxlJobAdminClient.startJob(config.getXxlJobId());
                markSynced(config);
            } catch (Exception e) {
                markSyncFailed(config, e);
            }
        }
    }
}
```

### 9.3 生成任务组后触发同步

在“生成/重建任务组”流程中：

```java
@Transactional
public void rebuildTaskGroups(...) {
    syncScheduleRules();
    generateTaskGroups();
    generateFetchTasks();
}
```

事务提交后调用：

```java
xxlJobSyncService.syncFrequencyScanJobs();
```

注意：调用 XXL-JOB Admin 的 HTTP 请求不要放在数据库事务内部。

---

## 10. dataCollectJobHandler 改造

当前 `dataCollectJobHandler` 需要增强为支持方案 2 的参数：

```json
{"mode":"SCAN_DUE_TASKS","frequency":"MONTHLY"}
```

示例代码：

```java
@Component
public class DataCollectJobHandler {

    @Resource
    private ScheduleDispatchService scheduleDispatchService;

    @XxlJob("dataCollectJobHandler")
    public void dataCollectJobHandler() {
        String param = XxlJobHelper.getJobParam();
        XxlJobHelper.log("收到 XXL-JOB 调度参数：{}", param);

        DispatchParam dispatchParam = JsonUtils.fromJson(param, DispatchParam.class);

        if ("SCAN_DUE_TASKS".equals(dispatchParam.getMode())) {
            scheduleDispatchService.scanAndDispatchDueTaskGroups(dispatchParam.getFrequency());
            return;
        }

        scheduleDispatchService.dispatch(param);
    }
}
```

---

## 11. 到期任务扫描逻辑

### 11.1 核心 SQL

Backend 需要根据频率扫描到期任务组：

```sql
SELECT tg.*
FROM task_groups tg
JOIN schedule_rules sr ON tg.schedule_rule_id = sr.id
WHERE sr.enabled = 1
  AND sr.frequency = #{frequency}
  AND tg.scheduled_at <= NOW()
  AND tg.status IN ('pending', 'scheduled')
ORDER BY tg.scheduled_at ASC
LIMIT 100;
```

### 11.2 状态抢占

执行前必须抢占任务组：

```sql
UPDATE task_groups
SET status = 'running',
    start_time = NOW(),
    triggered_by = 'XXL_JOB'
WHERE id = #{taskGroupId}
  AND status IN ('pending', 'scheduled');
```

只有影响行数为 1，才允许继续执行。

### 11.3 执行任务组

伪代码：

```java
public void scanAndDispatchDueTaskGroups(String frequency) {
    ScheduleJob job = scheduleJobService.createScanJob(frequency);

    List<TaskGroup> groups = taskGroupMapper.selectDueGroups(frequency, 100);

    for (TaskGroup group : groups) {
        try {
            boolean locked = taskGroupService.tryMarkRunning(group.getId());
            if (!locked) {
                continue;
            }

            scheduleTriggerLogService.createDispatchedLog(job, group);
            fetchTaskExecutor.executeGroup(group);
            taskGroupService.refreshGroupStatus(group.getId());
        } catch (Exception e) {
            taskGroupService.markFailed(group.getId(), e.getMessage());
            scheduleTriggerLogService.markFailed(job, group, e);
        }
    }

    scheduleJobService.markFinished(job);
}
```

---

## 12. fetch_tasks 自动执行流程

每个任务组下包含多个 `fetch_tasks`。执行流程：

```text
查询 task_group 下 pending / failed 的 fetch_tasks
  ↓
逐个或并发执行 fetch_task
  ↓
构造采集接口请求
  ↓
调用同事提供的采集接口
  ↓
保存原始响应
  ↓
格式化结果
  ↓
写入目标表
  ↓
执行稽核
  ↓
更新 fetch_task 状态
```

单个 `fetch_task` 执行伪代码：

```java
public void executeFetchTask(FetchTask task) {
    try {
        markRunning(task.getId());

        CollectRequest request = buildCollectRequest(task);
        CollectResponse response = collectClient.collect(request);

        saveRawResponse(task.getId(), response);

        List<RowData> rows = formatResult(response, task);
        targetTableService.upsertRows(task.getWideTableId(), rows);

        auditService.auditRows(task, rows);

        markSuccess(task.getId());
    } catch (Exception e) {
        markFailed(task.getId(), e.getMessage());
    }
}
```

---

## 13. 调度日志设计

### 13.1 schedule_jobs

一次 XXL-JOB 频率扫描对应一条 `schedule_jobs`。

建议语义：

| 字段 | 示例 |
|---|---|
| `job_source` | `FREQUENCY_SCAN` |
| `frequency` | `MONTHLY` |
| `request_payload` | `{"mode":"SCAN_DUE_TASKS","frequency":"MONTHLY"}` |
| `status` | `RUNNING / SUCCESS / FAILED` |

### 13.2 schedule_trigger_logs

一次扫描可能命中多个 `task_groups`。

建议：

```text
每命中一个 task_group，写一条 schedule_trigger_logs
```

字段语义：

| 字段 | 说明 |
|---|---|
| `schedule_job_id` | 关联本次频率扫描 |
| `schedule_rule_id` | 命中的调度规则 |
| `task_group_id` | 命中的任务组 |
| `business_date` | 业务周期 |
| `trigger_status` | `DISPATCHED / SKIPPED / FAILED` |
| `skip_reason` | 跳过原因 |
| `error_message` | 失败原因 |

---

## 14. 平台前端功能建议

方案 2 需要在平台前端补充 XXL-JOB 同步状态展示。

建议新增“XXL-JOB 同步状态”区域：

| 频率 | 同步状态 | XXL-JOB 任务ID | Cron | 最近同步时间 | 错误信息 |
|---|---|---:|---|---|---|
| 日频 | 已同步 | 101 | `0 */10 * * * ?` | 2026-06-11 10:00 | - |
| 周频 | 已同步 | 102 | `0 */30 * * * ?` | 2026-06-11 10:00 | - |
| 月频 | 同步失败 | - | `0 */30 * * * ?` | 2026-06-11 10:00 | Admin连接失败 |
| 季频 | 已同步 | 104 | `0 0 * * * ?` | 2026-06-11 10:00 | - |
| 年频 | 已同步 | 105 | `0 0 * * * ?` | 2026-06-11 10:00 | - |

建议增加按钮：

```text
重新同步 XXL-JOB
查看 XXL-JOB 任务
查看调度触发历史
```

---

## 15. 当前平台与方案 2 的功能缺口

| 能力项 | 当前平台 | 方案 2 目标 | 缺口 |
|---|---|---|---|
| 前端配置频率、偏移、触发时间 | 已有基础 | 支持日/周/月/季/年 | 需要确认 5 类频率完整支持 |
| 保存配置到 `schedule_rules_json` | 已有 | 保持 | 无主要缺口 |
| 生成 `schedule_rules` | 已有 | 保持 | 无主要缺口 |
| 生成 `task_groups` | 已有 | 保持 | 需要确保 `scheduled_at` 计算覆盖日/周/月/季/年 |
| 生成 `fetch_tasks` | 已有 | 保持 | 无主要缺口 |
| XXL-JOB Executor 注册 | 已有 | 保持 | 无主要缺口 |
| `dataCollectJobHandler` | 已有 | 支持 `SCAN_DUE_TASKS + frequency` | 需要改造参数解析和分支逻辑 |
| XXL-JOB Admin 任务创建 | 当前手工 | 平台自动创建 5 个扫描任务 | 需要新增自动同步能力 |
| XXL-JOB Admin 任务更新 | 无 | 自动更新 Cron、参数、Handler | 需要新增 |
| XXL-JOB Admin 任务启动 | 无 | 自动启动或保持启用 | 需要新增 |
| XXL-JOB Job ID 保存 | 无或预留 | 保存到 `xxl_job_sync_configs` | 需要新增表 |
| 按频率扫描到期任务 | 不完整 | 根据 `frequency + scheduled_at` 扫描 | 需要新增扫描逻辑 |
| 防重复执行 | 需要确认 | 状态抢占 | 需要强制实现 |
| 调度日志 | 已有基础 | 适配频率扫描一次命中多个任务组 | 需要补充日志语义 |
| 前端同步状态展示 | 无 | 展示 5 个扫描任务同步状态 | 需要新增页面能力 |

---

## 16. 关键可靠性设计

### 16.1 不把 HTTP 同步放在数据库事务里

生成任务组、生成 `fetch_tasks` 应该在数据库事务内完成。

XXL-JOB Admin 同步是远程 HTTP 调用，应该在事务提交后执行。

### 16.2 防重复执行

必须用状态抢占：

```text
pending / scheduled -> running
```

只有抢占成功才能执行。

### 16.3 控制扫描批次大小

每次扫描建议限制数量：

```text
LIMIT 100
```

防止一次扫描执行过多任务。

### 16.4 区分调度成功和业务失败

XXL-JOB 扫描成功不代表所有采集任务成功。

应分别看：

```text
schedule_jobs
schedule_trigger_logs
task_groups
fetch_tasks
```

### 16.5 保证采集落库幂等

同一个业务主键重复采集时，目标表应支持 upsert 或先删后写。

---

## 17. 推荐开发阶段

### 阶段一：完成按频率扫描执行

1. 改造 `dataCollectJobHandler`。
2. 支持 `mode=SCAN_DUE_TASKS`。
3. 支持 `frequency` 参数。
4. 实现 `scanAndDispatchDueTaskGroups(frequency)`。
5. 实现 task_group 状态抢占。
6. 跑通手动在 XXL-JOB Admin 配置 5 个任务后的执行链路。

### 阶段二：实现 XXL-JOB Admin 自动同步

1. 新增 `xxl_job_sync_configs` 表。
2. 新增 `XxlJobAdminClient`。
3. 新增 `XxlJobSyncService`。
4. 在生成/重建任务组事务提交后同步 5 个 XXL-JOB 任务。
5. 保存 `xxl_job_id`、同步状态、错误信息。

### 阶段三：完善前端调度中心

1. 展示 5 个扫描任务同步状态。
2. 展示 Cron、任务 ID、最近同步时间。
3. 支持手动重新同步。
4. 展示调度触发历史。

### 阶段四：增强稳定性

1. 同步失败重试。
2. XXL-JOB Admin 不可用时的降级处理。
3. 扫描分页和限流。
4. 并发执行控制。
5. 采集任务失败重跑。

---

## 18. Codex 开发指令参考

```text
请在现有 AI 采集平台调度中心中实现方案 2：按频率自动同步 5 个 XXL-JOB 到期任务扫描任务。

目标：
1. 平台支持日频、周频、月频、季频、年频调度。
2. 用户在平台配置更新周期、时间偏移量、触发时间并点击生成/重建任务组后，系统继续按现有逻辑生成 schedule_rules、task_groups、fetch_tasks。
3. 生成任务组事务提交后，自动同步 XXL-JOB Admin 中的 5 个任务：
   - DUE_TASK_SCAN_DAILY
   - DUE_TASK_SCAN_WEEKLY
   - DUE_TASK_SCAN_MONTHLY
   - DUE_TASK_SCAN_QUARTERLY
   - DUE_TASK_SCAN_YEARLY
4. 5 个任务均使用执行器 data-foundry-scheduler，运行模式 BEAN，JobHandler 为 dataCollectJobHandler。
5. 任务参数分别为：
   - {"mode":"SCAN_DUE_TASKS","frequency":"DAILY"}
   - {"mode":"SCAN_DUE_TASKS","frequency":"WEEKLY"}
   - {"mode":"SCAN_DUE_TASKS","frequency":"MONTHLY"}
   - {"mode":"SCAN_DUE_TASKS","frequency":"QUARTERLY"}
   - {"mode":"SCAN_DUE_TASKS","frequency":"YEARLY"}
6. 不要为每个 fetch_task 创建 XXL-JOB 任务，也不要为每个 task_group 创建 XXL-JOB 任务。
7. 新增 xxl_job_sync_configs 表，用于保存 sync_key、frequency、xxl_job_id、job_desc、executor_appname、job_handler、schedule_conf、executor_param、sync_status、last_sync_time、last_error_message。
8. 新增 XxlJobAdminClient，封装对 XXL-JOB Admin 的创建、更新、启动、停止接口调用。
9. 新增 XxlJobSyncService，负责确保 5 个频率扫描任务存在并启动。
10. dataCollectJobHandler 支持解析 {"mode":"SCAN_DUE_TASKS","frequency":"xxx"} 参数，并调用 scanAndDispatchDueTaskGroups(frequency)。
11. scanAndDispatchDueTaskGroups(frequency) 查询 task_groups.scheduled_at <= now 且 status in ('pending','scheduled') 且 schedule_rules.enabled=1 且 schedule_rules.frequency = frequency 的任务组。
12. 执行 task_group 前必须通过状态抢占将 pending/scheduled 更新为 running，防止重复执行。
13. 扫描执行结果需要写入 schedule_jobs 和 schedule_trigger_logs，并更新 task_groups、fetch_tasks、schedule_rules 状态。
14. 调用 XXL-JOB Admin 的 HTTP 请求不要放在数据库事务内，应在事务提交后执行。
15. application-local.yml 中新增 XXL-JOB 自动同步相关配置，包括 admin 地址、执行器 appname、job handler、5 个频率的 scan cron、是否启用自动同步。
```

---

## 19. 最终结论

方案 2 的核心是：

```text
XXL-JOB Admin 自动维护 5 个频率扫描任务
平台内部根据 task_groups.scheduled_at 判断具体任务是否到期
```

它不是把每个指标组或每个 `fetch_task` 都同步成 XXL-JOB 任务，而是把 XXL-JOB 用作“按频率唤醒调度系统”的入口。

最终效果：

```text
用户只在平台配置更新周期
  ↓
平台生成业务调度规则和任务实例
  ↓
平台自动同步 XXL-JOB 的日/周/月/季/年扫描任务
  ↓
XXL-JOB 自动唤醒
  ↓
平台自动执行到期采集任务
```

一句话总结：

**方案 2 通过自动同步 5 个频率扫描任务，把 XXL-JOB Admin 从“人工配置工具”变成平台调度能力的底层触发器，具体任务是否执行仍由平台内部的 `scheduled_at`、任务状态和业务规则决定。**
