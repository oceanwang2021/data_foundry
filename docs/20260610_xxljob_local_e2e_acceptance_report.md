# XXL-JOB 本地端到端验收报告

## 1. 验收信息

- 验收日期：2026-06-10
- 验收范围：需求数据准备、调度规则分发、指标组任务生成、Agent 执行、采集服务调用、Backend 回调聚合
- 验收链路：

```text
XXL-JOB Admin
  -> scheduler-service / dataCollectJobHandler
  -> backend /internal/scheduler/rules/{ruleId}/dispatch
  -> task_groups + fetch_tasks
  -> scheduler TASK_EXECUTION
  -> agent-service
  -> collection service
  -> backend callback / result aggregation
```

- 总体结论：**部分通过，完整闭环未通过**

当前实现已经证明 XXL-JOB Executor 注册、规则分发、频率与业务日期校验、指标组隔离、任务生成、周期幂等、禁用规则跳过和依赖故障记录等能力可用；但 scheduler 与 backend 的同步调用超时、执行粒度以及最终状态聚合仍存在阻断性问题。

## 2. 本地服务与外部依赖

| 服务 | 地址/端口 | 验收状态 | 说明 |
|---|---:|---|---|
| XXL-JOB Admin | `http://127.0.0.1:8080` | 正常 | 版本 `3.4.1-SNAPSHOT` |
| scheduler-service | `8200` | 正常 | Executor 端口 `9999` |
| backend-service | `8000` | 正常 | 恢复场景使用 `integration` 配置启动 |
| agent-service | `8100` | 正常 | 可接收 scheduler 执行请求 |
| collection stub | `http://127.0.0.1:8300` | 正常 | `/api/search` 返回立即完成的模拟任务 |
| MySQL | `101.132.178.81:3306` | 正常 | 使用三个独立 schema |

涉及数据库：

| Schema | 作用 | 关键表 |
|---|---|---|
| `xxl_job` | XXL-JOB 管理端数据 | `xxl_job_info`、`xxl_job_log`、`xxl_job_registry` |
| `data_foundry_scheduler` | scheduler 运行记录 | `schedule_jobs` |
| `data_foundry_backend` | 需求、规则、任务和回调数据 | `requirements`、`wide_tables`、`schedule_rules`、`schedule_trigger_logs`、`task_groups`、`fetch_tasks`、`collection_results` |

## 3. 数据库与 Executor 前置核验

验收前已核验：

1. `data_foundry_scheduler` 已包含 V003 引入的规则分发字段和索引。
2. `data_foundry_backend` 已包含 V015-V019 引入的调度规则、触发日志及任务关联字段。
3. `task_groups` 存在周期幂等索引：

```text
uk_tg_rule_period_group(schedule_rule_id, business_date, indicator_group_id)
```

4. Executor 已注册：

```text
appname: data-foundry-scheduler-local
address: http://127.0.0.1:9999/
handler: dataCollectJobHandler
```

5. XXL-JOB 测试任务：

```text
job_id: 6
job_desc: E2E-20260610 Manual Dispatcher
executor_group: 3
```

## 4. 测试数据

### 4.1 需求和频率

创建了五条隔离需求：

| Requirement ID | 频率 | 业务日期 |
|---|---|---|
| `REQ-E2E-20260610-DAILY` | `DAILY` | `2026-06-09` |
| `REQ-E2E-20260610-WEEKLY` | `WEEKLY` | `2026-W24` |
| `REQ-E2E-20260610-MONTHLY` | `MONTHLY` | `2026-05`、`2026-08` |
| `REQ-E2E-20260610-QUARTERLY` | `QUARTERLY` | `2026-Q2` |
| `REQ-E2E-20260610-YEARLY` | `YEARLY` | `2025` |

### 4.2 月频指标组

月频需求包含两个指标组：

| 指标组 | 规则 | 状态 | 参数行 |
|---|---|---|---:|
| `IG-E2E-20260610-CORE` | `SR-E2E-20260610-MONTHLY-CORE` | 启用 | 每周期 2 行 |
| `IG-E2E-20260610-CONTROL` | `SR-E2E-20260610-MONTHLY-CONTROL` | 禁用 | 对照组 |

月频 CORE 组用于验证“一条规则只生成绑定指标组任务”，其参数为 Alpha Corp 和 Beta Corp。

### 4.3 其他规则

| Rule ID | 频率 | 指标组 |
|---|---|---|
| `SR-E2E-20260610-DAILY` | `DAILY` | `IG-E2E-20260610-DAILY` |
| `SR-E2E-20260610-WEEKLY` | `WEEKLY` | `IG-E2E-20260610-WEEKLY` |
| `SR-E2E-20260610-QUARTERLY` | `QUARTERLY` | `IG-E2E-20260610-QUARTERLY` |
| `SR-E2E-20260610-YEARLY` | `YEARLY` | `IG-E2E-20260610-YEARLY` |

## 5. 场景执行结果

### 5.1 Executor 注册与手动触发

- XXL-JOB 能发现 `data-foundry-scheduler-local`。
- 手动触发能路由到 `http://127.0.0.1:9999/`。
- `dataCollectJobHandler` 能解析 JSON 参数并创建 `RULE_DISPATCH` 运行记录。

结论：**通过**。

### 5.2 月频规则首次触发

参数：

```json
{
  "ruleId": "SR-E2E-20260610-MONTHLY-CORE",
  "frequency": "MONTHLY",
  "triggerType": "SCHEDULE",
  "businessDate": "2026-05",
  "operator": "e2e-20260610"
}
```

实际结果：

- Backend 创建 task group：`tg_sr_dc6ec226fe343e2188dff33af13a38f4`。
- 只创建 CORE 指标组的 2 条 fetch task，没有创建 CONTROL 组任务。
- scheduler 的 `RULE_DISPATCH` 因 Backend 响应超过约 10 秒被记录为 `FAILED`。
- Backend 在 scheduler 超时后仍继续提交并完成事务。
- 两条 fetch task 最终为 `failed`，未生成 `collection_results`。

结论：

- 指标组隔离与任务生成：**通过**。
- scheduler 与 backend 状态一致性：**未通过**。
- 采集执行和结果聚合：**未通过**。

### 5.3 同周期重复触发

再次触发 `2026-05`：

- Backend 返回 `SKIPPED`。
- 跳过原因：`Task group already exists for business date`。
- scheduler 记录为 `SKIPPED`。
- 未重复创建 task group 和 fetch task。

关联记录：

- scheduler job：`261cd681-95b9-3056-b705-d139512b79e9`
- trigger log：`stl_b614e2242d954deab2dfe4d2991c40d0`

结论：**通过**。

### 5.4 禁用规则触发

触发禁用规则 `SR-E2E-20260610-MONTHLY-CONTROL`：

- scheduler 记录为 `SKIPPED`。
- Backend trigger log 记录为 `SKIPPED`。
- 跳过原因：`Schedule rule is disabled`。
- 未创建 task group。

关联记录：

- scheduler job：`548950eb-7825-3c80-ac4c-6130e8b72a03`
- trigger log：`stl_6a16142bfc704eb48cf84232d9295ca2`

结论：**通过**。

### 5.5 规则频率不匹配

使用月频规则传入：

```text
frequency=WEEKLY
businessDate=2026-W24
```

实际结果：

- Backend 拒绝请求。
- 未创建 task group 和 trigger log。
- scheduler 和 XXL-JOB 记录失败。
- scheduler 将业务校验异常统一转换成了 `503 SERVICE_UNAVAILABLE`，原始校验原因未保留。

结论：

- 频率一致性校验：**通过**。
- 错误语义和可观测性：**未通过**。

### 5.6 五种频率和业务日期格式

| 频率 | 输入 | task group | prompt 渲染 | 结果 |
|---|---|---|---|---|
| `DAILY` | `2026-06-09` | 已创建 | 保留 `2026-06-09` | 通过 |
| `WEEKLY` | `2026-W24` | 已创建 | 保留 `2026-W24` | 通过 |
| `MONTHLY` | `2026-05` | 已创建 | 保留 `2026-05` | 通过 |
| `QUARTERLY` | `2026-Q2` | 已创建 | 保留 `2026-Q2` | 通过 |
| `YEARLY` | `2025` | 已创建 | 保留 `2025` | 通过 |

结论：频率枚举、business date 格式和任务规划兼容性 **通过**。

### 5.7 Backend 不可用

停止 Backend 后触发月频 `2026-07`：

- scheduler job：`05774f1a-aaad-3e08-bc3d-b61c3637d767`
- scheduler 状态：`FAILED`
- 错误包含 `Connection refused`
- XXL-JOB handle code：`500`
- Backend 未创建 task group 和 trigger log

结论：**通过**。

### 5.8 Backend 恢复后触发

Backend 使用以下本地参数恢复：

```text
--spring.profiles.active=integration
--data-foundry.collection.base-url=http://127.0.0.1:8300
```

触发业务日期 `2026-08`。

#### XXL-JOB

```text
log_id: 11
trigger_code: 200
handle_code: 500
```

Executor 成功收到任务，但 handler 因 scheduler 等待 Backend 超时而失败。

#### scheduler

规则分发记录：

```text
id: 09f79912-6147-39f2-900b-dd11b173c14c
job_source: RULE_DISPATCH
business_date: 2026-08
status: FAILED
reason: Backend read timed out
```

任务执行记录：

```text
id: 7b0622ed-31a4-3b1c-b002-2bc3efb659b2
job_source: TASK_EXECUTION
task_group_id: tg_sr_60442f5fa0403c62973347a550a7a339
task_id: NULL
status: completed
```

#### Backend

```text
task_group_id: tg_sr_60442f5fa0403c62973347a550a7a339
business_date: 2026-08
total_tasks: 2
running_tasks: 2
completed_tasks: 0
failed_tasks: 0
task_group.status: completed
```

Fetch task：

```text
CORE_3 -> running -> stub_d1202d006199800fd48ab785
CORE_4 -> running -> stub_a5cc92943814bd45470d68ad
```

本地 stub：

```text
status: ok
task_count: 2
```

Trigger log：

```text
id: stl_126cef23e9094d548cc395898cadd6c7
trigger_status: COMPLETED
```

`collection_results`：0 条。

结论：

- Backend 恢复后能够重新生成任务：**通过**。
- Backend 能调用本地采集服务：**通过**。
- 采集任务完成状态回写：**未通过**。
- task group/trigger log 最终聚合：**未通过**。
- scheduler 和 Backend 状态一致性：**未通过**。

## 6. 验收标准对照

| 验收标准 | 结果 | 说明 |
|---|---|---|
| Executor 稳定在线 | 通过 | Admin 能发现并路由到 `9999` |
| 成功触发只生成绑定指标组任务 | 通过 | 月频 CORE 规则只生成 CORE 组两条任务 |
| 重复触发不重复创建 task group | 通过 | 同规则、周期、指标组被唯一索引和业务逻辑拦截 |
| 跳过和失败均有业务日志 | 通过 | `schedule_jobs` 和 `schedule_trigger_logs` 可查询 |
| scheduler 记录可关联 trigger log 和 task group | 部分通过 | trigger log 保存 scheduler job ID；scheduler 首次超时时未取得 task group ID |
| Agent 能调用采集服务 | 通过 | 恢复场景 stub 收到两条任务 |
| Fetch task 能完成并落 collection result | 未通过 | fetch task 持续 `running`，结果表为空 |
| 最终任务状态回写到规则和触发日志 | 未通过 | 回写发生过早，状态与子任务计数矛盾 |
| XXL-JOB、scheduler、backend 最终状态一致 | 未通过 | XXL/scheduler 为失败，backend 为完成 |

## 7. 主要问题

### P0：Task group 被提前标记完成

`TASK_EXECUTION` 当前以 task group 为粒度，`task_id` 为 `NULL`。Agent 调用结束后，Backend 回调直接将 task group 和 trigger log 标记为完成，没有等待全部 fetch task 完成。

直接表现：

```text
task_group.status = completed
running_tasks = 2
completed_tasks = 0
```

这会导致 schedule rule 的 `last_trigger_status` 和 `last_success_time` 产生假成功。

### P0：Fetch task 缺少完成轮询或结果回调闭环

collection stub 返回的任务已经是 `completed`，但 Backend 中对应 fetch task 长时间保持 `running`，且 `collection_results` 没有记录。

需要明确并实现以下任一闭环：

1. Agent 提交外部任务后轮询 `/api/task/{id}/status` 和 `/result`，再逐任务回调 Backend。
2. 外部采集服务主动回调 Backend，Backend 按 `fetch_task_id` 更新状态和结果。
3. Backend 独立轮询外部任务，但必须以 fetch task 为聚合单位。

### P1：Scheduler 调 Backend 的同步超时短于 Backend 实际处理时间

Scheduler 约 10 秒后产生 read timeout，但 Backend 随后仍提交 task group、fetch task 和 trigger log。

直接后果：

- XXL-JOB 显示失败。
- scheduler `RULE_DISPATCH` 显示失败。
- Backend 实际已创建任务并显示完成。
- 重试时只能依赖 Backend 幂等返回 `SKIPPED` 修复表象。

建议：

1. Backend dispatch 接口只负责校验、幂等占位和创建任务，快速返回 `DISPATCHED`。
2. 后续 Agent 调用和任务执行改为异步。
3. 如暂时保持同步，需要统一 HTTP timeout、XXL executor timeout 和 Backend 最大处理时间，但这不是长期方案。

### P1：调度执行粒度与数据模型不一致

当前 scheduler 只生成一条 group 级 `TASK_EXECUTION`：

```text
task_group_id != NULL
task_id = NULL
```

但业务状态、外部任务 ID、重试和结果均位于 fetch task 粒度。应改为每条 fetch task 创建独立执行记录，或引入明确的 group orchestrator，不能用一次 group 回调代表所有子任务完成。

### P2：业务异常被错误翻译为服务不可用

频率不匹配等 4xx 业务校验错误被 scheduler 统一记录为：

```text
503 SERVICE_UNAVAILABLE "Backend service unavailable"
```

应区分：

- `400/409/422`：参数、规则状态、幂等或业务校验失败。
- 网络异常和 `5xx`：Backend 不可用。

### P2：时间偏移量尚未成为正式规则字段

测试数据中的 `business_date_offset_days=3` 仍位于 `wide_tables.schedule_rules_json`，尚未与正式 `schedule_rules` 字段、Cron 生成及 XXL-JOB 任务维护形成完整映射。

## 8. 建议修复顺序

1. 将执行和回调改为 fetch task 粒度，保证每个外部任务都有独立状态和结果。
2. 仅在全部 fetch task 达到终态后聚合 task group。
3. 聚合完成后再更新 `schedule_trigger_logs` 和 `schedule_rules.last_trigger_status`。
4. 将 Backend dispatch 改为快速返回，消除 scheduler read timeout 和事务提交后的状态分裂。
5. 补充 HTTP 错误分类，保留 Backend 返回的业务错误码和原因。
6. 将时间偏移量正式映射到 schedule rule 和 XXL-JOB Cron 管理。
7. 增加上述场景的自动化集成测试和数据库一致性断言。

## 9. 验收文件

测试目录：

```text
tmp/e2e-xxljob-20260610/
```

主要文件：

| 文件 | 用途 |
|---|---|
| `seed-backend.sql` | 创建隔离需求、五频规则和参数数据 |
| `seed-xxl.sql` | 创建 XXL-JOB 测试任务 |
| `verify-backend.sql` | 核验规则、任务组、fetch task、触发日志和结果 |
| `verify-scheduler.sql` | 核验 scheduler 运行记录 |
| `verify-recovery.sql` | 聚焦核验 `2026-08` 恢复场景 |
| `check-registry.sql` | 核验 Executor 注册 |
| `check-xxl-log.sql` | 核验 XXL-JOB 执行日志 |
| `collection-stub.js` | 本地采集服务模拟器 |
| `cleanup-backend.sql` | 清理 Backend 测试数据 |
| `cleanup-scheduler.sql` | 清理 scheduler 测试数据 |
| `cleanup-xxl.sql` | 清理 XXL-JOB 测试任务和日志 |

测试数据当前保留，用于问题修复后的复验。执行清理脚本前应先保存需要的日志和数据库快照。

## 10. 最终结论

当前代码可以完成：

```text
XXL-JOB 触发
  -> 规则校验
  -> 指标组隔离
  -> task group / fetch task 生成
  -> Agent 提交外部采集任务
```

但尚不能可靠完成：

```text
外部任务完成
  -> fetch task 结果回写
  -> task group 正确聚合
  -> trigger log / schedule rule 最终状态更新
  -> XXL-JOB、scheduler、backend 状态一致
```

因此本次端到端验收结论为：**规则调度与任务生成能力通过，采集结果回调聚合闭环未通过，不建议按“完整调度链路已完成”进入生产验收。**
