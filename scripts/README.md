# Smoke scripts

## `smoke-m6.ps1`

最小冒烟回归（用于 M6：canonical/legacy 路由并存阶段）。

## 启动服务（本机联调）

为了避免沙盒环境对 `C:\\Users\\...\\.m2` 的写入限制，建议统一加 `--% -Dmaven.repo.local=E:\\huatai\\datafoundry_java\\tmp\\.m2`。

- backend-service（`8000`）：
  - `cd E:\\huatai\\datafoundry_java\\data-foundry-backend-service; mvn --% -Dmaven.repo.local=E:\\huatai\\datafoundry_java\\tmp\\.m2 spring-boot:run`
- scheduler-service（`8200`）：
  - `cd E:\\huatai\\datafoundry_java\\data-foundry-scheduler-service; mvn --% -Dmaven.repo.local=E:\\huatai\\datafoundry_java\\tmp\\.m2 spring-boot:run`
- agent-service（`8100`）：
  - `cd E:\\huatai\\datafoundry_java\\data-foundry-agent-service; mvn --% -Dmaven.repo.local=E:\\huatai\\datafoundry_java\\tmp\\.m2 spring-boot:run`

前置条件：
- backend-service 已启动（默认 `http://127.0.0.1:8000`）
- backend DB 已初始化且存在至少 1 个项目
  - 可选：启用 admin 端点并灌入 demo 数据：启动参数加 `--datafoundry.admin.enabled=true`，再调用 `POST /api/admin/seed`
- 可选：scheduler-service/agent-service 已启动（否则可加 `-SkipScheduler`）

执行示例：
- `powershell -ExecutionPolicy Bypass -File scripts/smoke-m6.ps1`
- `powershell -ExecutionPolicy Bypass -File scripts/smoke-m6.ps1 -ProjectId PROJ-2026-XXXX`
- `powershell -ExecutionPolicy Bypass -File scripts/smoke-m6.ps1 -SkipScheduler`
