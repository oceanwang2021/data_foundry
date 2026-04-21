# 执行回写闭环联调（scheduler → agent → backend）

> 目标：关闭 backend 的“占位立即完成”，改为由 scheduler/agent 的执行结果**回写驱动** `task_groups/fetch_tasks` 状态。

## 1) 启动顺序与配置

### backend-service（8000）

方式 A：使用 integration profile（推荐）
- 环境变量：`SPRING_PROFILES_ACTIVE=integration`
- 启动：
  - `cd E:\huatai\datafoundry_java\data-foundry-backend-service`
  - `mvn --% -Dmaven.repo.local=E:\huatai\datafoundry_java\tmp\.m2 spring-boot:run`

方式 B：单独关开关
- 环境变量：`DATAFOUNDRY_TASK_EXECUTION_PLACEHOLDER_COMPLETE=false`

### scheduler-service（8200）
- 确保 `data-foundry.backend.base-url` 指向 backend（默认 `http://127.0.0.1:8000`）
- 启动：
  - `cd E:\huatai\datafoundry_java\data-foundry-scheduler-service`
  - `mvn --% -Dmaven.repo.local=E:\huatai\datafoundry_java\tmp\.m2 spring-boot:run`

### agent-service（8100）
- 启动：
  - `cd E:\huatai\datafoundry_java\data-foundry-agent-service`
  - `mvn --% -Dmaven.repo.local=E:\huatai\datafoundry_java\tmp\.m2 spring-boot:run`

> 说明：为了规避沙盒环境对 `C:\Users\...\ .m2` 的写入限制，建议统一使用 `-Dmaven.repo.local=E:\huatai\datafoundry_java\tmp\.m2`。

## 2) 触发链路（最小用例）

推荐直接复用 smoke 脚本（会创建 requirement、落 plan、ensure-tasks、执行 task_group，并等待 callback）：

- `powershell -ExecutionPolicy Bypass -File scripts\smoke-m6.ps1 -WaitCallback -CallbackTimeoutSec 20`

> 注意：当 `placeholder-complete=false` 时，backend 的 `execute task_group/task` 不会“立即 completed”，会先置为 `running`，再等待 scheduler 回写 `completed/failed`。

## 3) 内部回写接口（backend）

- `POST /internal/scheduler/executions/callback`
  - body 关键字段：`schedule_job_id`、`task_group_id`、`task_id`、`status`、`ended_at`
  - 回写合并规则：单调合并（允许 `failed -> completed`，不允许 `completed -> failed`）

## 4) 可选：为 internal callback 启用 token 鉴权（建议非本机联调开启）

backend-service：
- `datafoundry.internal.callback.require-token=true`
- `datafoundry.internal.callback.token=YOUR_TOKEN`

scheduler-service：
- `data-foundry.backend.callback-token=YOUR_TOKEN`

HTTP 头：
- scheduler 调 backend 会携带 `X-Internal-Token: YOUR_TOKEN`
- backend 校验失败返回 `401`

## 5) 安全提示

内部回写接口默认用于本机联调（默认不强制 token）。生产化建议至少开启：
- 内部 token（Header）校验
- 网关/网络隔离（仅 scheduler 可访问）
- callback 审计日志与监控指标（成功/失败/拒绝次数）

