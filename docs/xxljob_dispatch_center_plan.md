# 基于 XXL-JOB 的 AI 采集平台调度中心建设方案

## 1. 背景与目标

当前平台已具备 AI 数据采集、结果格式化、目标表落库等能力。平台通过调用同事提供的采集接口完成数据获取，并将采集结果按照宽表或目标表结构入库。后续需要建设调度中心，使月频、年频等周期性数据采集任务能够自动触发、执行、记录状态，并与后续稽核、验收、发布流程衔接。

XXL-JOB 是一个分布式任务调度平台，官方定位为轻量级、易扩展、开箱即用的分布式任务调度框架。官方文档中说明，Spring Boot 执行器项目可以直接作为参考，也可以将现有业务项目改造成 XXL-JOB 执行器。`xxl-job-core` 是业务执行器侧需要引入的核心依赖。

参考资料：

- XXL-JOB 官方文档：https://github.com/xuxueli/xxl-job/blob/master/doc/XXL-JOB%E5%AE%98%E6%96%B9%E6%96%87%E6%A1%A3.md
- XXL-JOB GitHub 仓库：https://github.com/xuxueli/xxl-job
- xxl-job-core Maven Central：https://mvnrepository.com/artifact/com.xuxueli/xxl-job-core

本方案目标是使用 XXL-JOB 作为调度触发中心，平台后端作为业务执行器，实现以下能力：

1. 支持月频、年频、手动补采等任务触发。
2. 支持任务自动生成、执行、状态流转。
3. 支持调用采集接口、格式化结果、落目标表。
4. 支持任务日志、失败重试、手动重跑。
5. 支持采集完成后自动触发数据稽核。
6. 支持与验收、发布流程衔接。
7. 支持后续迁移到公司虚拟机及 GoldenDB 环境。

---

## 2. 总体建设思路

调度中心不应该直接写死采集逻辑，而应该只负责“按规则触发任务”。具体业务执行仍然由平台后端完成。

推荐分层如下：

```text
XXL-JOB Admin
  负责配置 cron、触发任务、失败重试、查看调度日志

scheduler-service / backend-service
  作为 XXL-JOB 执行器
  提供 JobHandler
  接收调度触发

任务编排层
  创建 task_group
  创建 fetch_tasks
  计算 business_date
  控制任务状态流转

采集执行层
  调用外部采集接口
  格式化采集结果
  写入目标表

稽核层
  执行范围校验、变化率校验等规则
  生成 audit_results

验收发布层
  人工确认异常数据
  通过、驳回、发布
```

核心原则：

```text
XXL-JOB 负责什么时候执行
平台后端负责执行什么业务
数据库负责保存任务状态和业务结果
稽核模块负责判断采集结果是否异常
验收模块负责决定是否发布
```

---

## 3. 推荐架构

### 3.1 部署架构

```text
                         ┌────────────────────┐
                         │    XXL-JOB Admin    │
                         │  调度中心管理后台   │
                         └─────────┬──────────┘
                                   │ 调度触发
                                   │
                         ┌─────────▼──────────┐
                         │ data-foundry-backend│
                         │ 或 scheduler-service│
                         │ XXL-JOB Executor    │
                         └─────────┬──────────┘
                                   │
                ┌──────────────────┼──────────────────┐
                │                  │                  │
        ┌───────▼───────┐  ┌───────▼───────┐  ┌───────▼───────┐
        │ 任务编排服务   │  │ 采集执行服务   │  │ 数据稽核服务   │
        └───────┬───────┘  └───────┬───────┘  └───────┬───────┘
                │                  │                  │
                └──────────────────┼──────────────────┘
                                   │
                         ┌─────────▼──────────┐
                         │ MySQL / GoldenDB    │
                         │ 业务库              │
                         └────────────────────┘
```

### 3.2 服务拆分建议

如果目前平台规模较小，可以先不独立拆出 `scheduler-service`，直接在现有后端服务中集成 XXL-JOB 执行器。

第一阶段推荐：

```text
data-foundry-backend-service
  集成 xxl-job-core
  提供 JobHandler
  内部调用 ScheduleDispatchService
```

后续平台稳定后，可以拆分为：

```text
data-foundry-scheduler-service
  只负责调度接入和任务编排

data-foundry-backend-service
  负责需求、宽表、验收、发布等业务接口

data-foundry-agent-service
  负责 AI 采集接口调用和结果处理
```

---

## 4. XXL-JOB 方案中的核心角色

### 4.1 XXL-JOB Admin

XXL-JOB Admin 是调度管理后台，负责：

1. 管理执行器。
2. 配置任务 cron。
3. 配置 JobHandler 名称。
4. 手动触发任务。
5. 查看调度日志。
6. 配置失败重试。
7. 配置阻塞处理策略。
8. 启停任务。

### 4.2 执行器 Executor

你的平台后端服务作为执行器，负责接收 XXL-JOB Admin 的调度请求。

执行器需要：

1. 引入 `xxl-job-core` 依赖。
2. 配置 `XxlJobSpringExecutor` Bean。
3. 暴露执行器端口。
4. 编写 `@XxlJob` 标注的 JobHandler。
5. 在 XXL-JOB Admin 后台注册执行器。

### 4.3 JobHandler

JobHandler 是业务调度入口。

建议只写非常薄的一层：

```text
JobHandler
  接收 XXL-JOB 参数
  解析 ruleId / frequency / triggerType
  调用 ScheduleDispatchService
  写入 XXL-JOB 日志
```

不要把采集、稽核、落库等业务逻辑直接写进 JobHandler。

---

## 5. 依赖项

### 5.1 XXL-JOB 执行器依赖

建议使用和公司部署的 XXL-JOB Admin 一致的版本。Maven Central 中 `com.xuxueli:xxl-job-core` 已存在多个版本，例如 3.4.0、3.1.0、3.0.0、2.5.0 等。实际项目中版本号必须与 Admin 版本保持一致或经过兼容性验证。

```xml
<dependency>
    <groupId>com.xuxueli</groupId>
    <artifactId>xxl-job-core</artifactId>
    <version>${xxl-job.version}</version>
</dependency>
```

示例：

```xml
<properties>
    <xxl-job.version>3.4.0</xxl-job.version>
</properties>
```

如果公司已有统一 XXL-JOB 平台，直接询问平台版本，并使用相同版本。

### 5.2 Spring Boot 依赖

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-web</artifactId>
</dependency>
```

### 5.3 数据库依赖

如果当前仍是 MySQL：

```xml
<dependency>
    <groupId>com.mysql</groupId>
    <artifactId>mysql-connector-j</artifactId>
</dependency>
```

如果迁移到 GoldenDB 且 GoldenDB 使用 MySQL 兼容模式，大概率仍可使用 MySQL Connector/J。最终以公司 DBA 提供的连接方式为准。

### 5.4 MyBatis 依赖

```xml
<dependency>
    <groupId>org.mybatis.spring.boot</groupId>
    <artifactId>mybatis-spring-boot-starter</artifactId>
    <version>3.0.3</version>
</dependency>
```

如果项目使用 MyBatis-Plus，则保留现有 MyBatis-Plus 依赖。

### 5.5 HTTP 调用采集接口依赖

如果使用 `RestTemplate`，`spring-boot-starter-web` 已经足够。

如果使用 `WebClient`：

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-webflux</artifactId>
</dependency>
```

如果使用 OpenFeign：

```xml
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-openfeign</artifactId>
</dependency>
```

### 5.6 JSON 处理依赖

Spring Boot 默认会集成 Jackson。若项目中没有显式依赖，可使用：

```xml
<dependency>
    <groupId>com.fasterxml.jackson.core</groupId>
    <artifactId>jackson-databind</artifactId>
</dependency>
```

---

## 6. XXL-JOB 执行器配置

### 6.1 application.yml

```yaml
xxl:
  job:
    admin:
      addresses: http://xxl-job-admin-host:8080/xxl-job-admin
    accessToken: ${XXL_JOB_ACCESS_TOKEN:}
    executor:
      appname: data-foundry-scheduler
      address:
      ip:
      port: 9999
      logpath: ./logs/xxl-job/jobhandler
      logretentiondays: 30
```

说明：

| 配置项 | 说明 |
|---|---|
| `xxl.job.admin.addresses` | XXL-JOB Admin 地址 |
| `xxl.job.accessToken` | 调度中心和执行器之间的访问 token |
| `xxl.job.executor.appname` | 执行器名称，必须和 Admin 后台配置一致 |
| `xxl.job.executor.ip` | 执行器 IP，可为空自动识别 |
| `xxl.job.executor.port` | 执行器暴露给 Admin 调用的端口 |
| `xxl.job.executor.logpath` | JobHandler 日志保存路径 |
| `xxl.job.executor.logretentiondays` | 日志保留天数 |

### 6.2 多环境配置

建议区分本地、测试、生产。

```yaml
spring:
  profiles:
    active: dev
```

本地环境：

```yaml
xxl:
  job:
    admin:
      addresses: http://localhost:8080/xxl-job-admin
    executor:
      appname: data-foundry-scheduler-dev
      port: 9999
```

生产环境：

```yaml
xxl:
  job:
    admin:
      addresses: http://prod-xxl-job-admin:8080/xxl-job-admin
    executor:
      appname: data-foundry-scheduler-prod
      port: 9999
```

建议不同环境使用不同执行器名称，避免测试任务误触发生产服务。

---

## 7. 执行器 Bean 配置

```java
@Configuration
public class XxlJobConfig {

    @Value("${xxl.job.admin.addresses}")
    private String adminAddresses;

    @Value("${xxl.job.accessToken:}")
    private String accessToken;

    @Value("${xxl.job.executor.appname}")
    private String appname;

    @Value("${xxl.job.executor.address:}")
    private String address;

    @Value("${xxl.job.executor.ip:}")
    private String ip;

    @Value("${xxl.job.executor.port}")
    private int port;

    @Value("${xxl.job.executor.logpath}")
    private String logPath;

    @Value("${xxl.job.executor.logretentiondays}")
    private int logRetentionDays;

    @Bean
    public XxlJobSpringExecutor xxlJobExecutor() {
        XxlJobSpringExecutor executor = new XxlJobSpringExecutor();
        executor.setAdminAddresses(adminAddresses);
        executor.setAppname(appname);
        executor.setAddress(address);
        executor.setIp(ip);
        executor.setPort(port);
        executor.setAccessToken(accessToken);
        executor.setLogPath(logPath);
        executor.setLogRetentionDays(logRetentionDays);
        return executor;
    }
}
```

注意：

1. 执行器端口需要在虚拟机防火墙中开放。
2. XXL-JOB Admin 必须能够访问该端口。
3. 如果服务部署在容器或虚拟机中，建议明确配置 `ip` 或 `address`，避免自动识别到错误网卡。

---

## 8. JobHandler 设计

### 8.1 通用采集调度 Handler

建议只保留一个通用 Handler，通过参数区分具体调度规则。

```java
@Component
public class DataCollectJobHandler {

    @Resource
    private ScheduleDispatchService scheduleDispatchService;

    @XxlJob("dataCollectJobHandler")
    public void dataCollectJobHandler() throws Exception {
        String param = XxlJobHelper.getJobParam();
        XxlJobHelper.log("开始执行 AI 数据采集调度，参数：{}", param);

        try {
            ScheduleDispatchParam dispatchParam = parseParam(param);
            scheduleDispatchService.dispatch(dispatchParam);
            XxlJobHelper.log("AI 数据采集调度执行完成");
        } catch (Exception e) {
            XxlJobHelper.log("AI 数据采集调度执行失败：{}", e.getMessage());
            throw e;
        }
    }

    private ScheduleDispatchParam parseParam(String param) {
        return JsonUtils.fromJson(param, ScheduleDispatchParam.class);
    }
}
```

### 8.2 Job 参数设计

XXL-JOB 后台任务参数建议使用 JSON。

月频任务参数：

```json
{
  "ruleId": "rule_monthly_auto_sales",
  "frequency": "MONTHLY",
  "triggerType": "SCHEDULE",
  "businessDateMode": "PREVIOUS_PERIOD"
}
```

年频任务参数：

```json
{
  "ruleId": "rule_yearly_company_finance",
  "frequency": "YEARLY",
  "triggerType": "SCHEDULE",
  "businessDateMode": "PREVIOUS_PERIOD"
}
```

手动补采参数：

```json
{
  "ruleId": "rule_monthly_auto_sales",
  "frequency": "MONTHLY",
  "triggerType": "MANUAL",
  "businessDate": "2026-05"
}
```

### 8.3 参数对象

```java
@Data
public class ScheduleDispatchParam {
    private String ruleId;
    private String frequency;
    private String triggerType;
    private String businessDate;
    private String businessDateMode;
}
```

---

## 9. XXL-JOB Admin 后台配置

### 9.1 新增执行器

在 XXL-JOB Admin 中新增执行器：

| 配置项 | 示例 |
|---|---|
| AppName | `data-foundry-scheduler` |
| 名称 | `AI采集平台调度执行器` |
| 注册方式 | 自动注册，或手动录入地址 |
| 机器地址 | 自动注册时可为空 |

### 9.2 新增月频采集任务

| 配置项 | 示例 |
|---|---|
| 执行器 | `data-foundry-scheduler` |
| 任务描述 | `月频AI采集任务` |
| 调度类型 | CRON |
| Cron | `0 0 2 1 * ?` |
| 运行模式 | BEAN |
| JobHandler | `dataCollectJobHandler` |
| 路由策略 | 第一个 / 轮询 / 故障转移 |
| 阻塞处理策略 | 单机串行 |
| 失败重试次数 | 1 到 3 |
| 任务参数 | `{"ruleId":"xxx","frequency":"MONTHLY"}` |

### 9.3 新增年频采集任务

| 配置项 | 示例 |
|---|---|
| Cron | `0 0 2 1 1 ?` |
| JobHandler | `dataCollectJobHandler` |
| 任务参数 | `{"ruleId":"xxx","frequency":"YEARLY"}` |

### 9.4 cron 示例

| 频率 | cron | 含义 |
|---|---|---|
| 月频 | `0 0 2 1 * ?` | 每月 1 日 02:00 执行 |
| 月频 | `0 30 3 5 * ?` | 每月 5 日 03:30 执行 |
| 年频 | `0 0 2 1 1 ?` | 每年 1 月 1 日 02:00 执行 |
| 年频 | `0 0 2 1 4 ?` | 每年 4 月 1 日 02:00 执行 |
| 每天 | `0 0 2 * * ?` | 每天 02:00 执行 |

---

## 10. 业务数据库表设计

XXL-JOB 自身有调度管理表，但这些表只保存调度平台的信息。你的平台仍然需要保存业务调度规则、任务组、任务明细、执行日志、稽核结果。

### 10.1 调度规则表 schedule_rules

```sql
CREATE TABLE schedule_rules (
    id VARCHAR(64) PRIMARY KEY,
    requirement_id VARCHAR(64) NOT NULL COMMENT '需求ID',
    wide_table_id VARCHAR(64) NOT NULL COMMENT '宽表ID',

    rule_name VARCHAR(255) NOT NULL COMMENT '调度规则名称',
    frequency VARCHAR(32) NOT NULL COMMENT 'MONTHLY, YEARLY, MANUAL',
    cron_expression VARCHAR(128) DEFAULT NULL COMMENT 'cron表达式',

    xxl_job_id VARCHAR(64) DEFAULT NULL COMMENT 'XXL-JOB后台任务ID，可选',
    xxl_job_handler VARCHAR(128) DEFAULT 'dataCollectJobHandler' COMMENT 'JobHandler名称',

    enabled TINYINT NOT NULL DEFAULT 1 COMMENT '是否启用',

    business_date_mode VARCHAR(64) DEFAULT 'PREVIOUS_PERIOD' COMMENT '业务日期计算方式',
    last_trigger_time DATETIME DEFAULT NULL COMMENT '最近触发时间',
    next_trigger_time DATETIME DEFAULT NULL COMMENT '下次触发时间',

    created_by VARCHAR(128) DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) COMMENT='调度规则表';
```

说明：

1. `schedule_rules` 是平台自己的规则表。
2. `xxl_job_id` 可以保存 XXL-JOB 后台任务 ID，便于后续做平台内同步管理。
3. 第一阶段也可以不做 XXL-JOB API 联动，直接在 XXL-JOB 后台手动配置任务。

### 10.2 任务组表 task_groups

```sql
CREATE TABLE task_groups (
    id VARCHAR(64) PRIMARY KEY,
    sort_order INT NOT NULL DEFAULT 0,

    requirement_id VARCHAR(64) NOT NULL,
    wide_table_id VARCHAR(64) NOT NULL,
    schedule_rule_id VARCHAR(64) DEFAULT NULL,

    batch_id VARCHAR(64) NOT NULL COMMENT '批次ID',
    business_date VARCHAR(32) DEFAULT NULL COMMENT '业务日期，例如2026-05或2025',
    frequency VARCHAR(32) DEFAULT NULL COMMENT 'MONTHLY, YEARLY',

    source_type VARCHAR(32) DEFAULT 'SCHEDULE' COMMENT 'SCHEDULE, MANUAL, BACKFILL',
    status VARCHAR(32) NOT NULL DEFAULT 'pending' COMMENT 'pending, running, success, failed, partial_success',

    total_tasks INT NOT NULL DEFAULT 0,
    completed_tasks INT NOT NULL DEFAULT 0,
    failed_tasks INT NOT NULL DEFAULT 0,

    audit_status VARCHAR(32) DEFAULT 'PENDING' COMMENT 'PENDING, PASS, WARNING, ERROR',
    acceptance_status VARCHAR(32) DEFAULT 'PENDING' COMMENT 'PENDING, ACCEPTED, REJECTED',
    publish_status VARCHAR(32) DEFAULT 'UNPUBLISHED' COMMENT 'UNPUBLISHED, PUBLISHED',

    triggered_by VARCHAR(128) DEFAULT NULL,
    start_time DATETIME DEFAULT NULL,
    end_time DATETIME DEFAULT NULL,
    error_message TEXT DEFAULT NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) COMMENT='采集任务组表';
```

### 10.3 采集任务明细表 fetch_tasks

```sql
CREATE TABLE fetch_tasks (
    id VARCHAR(128) PRIMARY KEY,
    sort_order INT NOT NULL DEFAULT 0,

    requirement_id VARCHAR(64) NOT NULL,
    wide_table_id VARCHAR(64) NOT NULL,
    task_group_id VARCHAR(64) DEFAULT NULL,
    batch_id VARCHAR(64) DEFAULT NULL,

    row_id INT DEFAULT NULL,
    indicator_group_id VARCHAR(64) DEFAULT NULL,
    indicator_group_name VARCHAR(255) DEFAULT NULL,

    name VARCHAR(512) DEFAULT NULL,
    schema_version INT NOT NULL DEFAULT 1,
    execution_mode VARCHAR(32) DEFAULT NULL,

    indicator_keys_json LONGTEXT DEFAULT NULL COMMENT '指标key快照，GoldenDB兼容性不明确时建议用LONGTEXT',
    dimension_values_json LONGTEXT DEFAULT NULL COMMENT '维度值快照',
    request_payload_json LONGTEXT DEFAULT NULL COMMENT '采集请求快照',
    response_payload_json LONGTEXT DEFAULT NULL COMMENT '采集响应快照',

    rendered_prompt_text LONGTEXT DEFAULT NULL,
    prompt_template_snapshot LONGTEXT DEFAULT NULL,

    business_date VARCHAR(32) DEFAULT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'pending' COMMENT 'pending, running, collect_success, failed',
    audit_status VARCHAR(32) DEFAULT 'PENDING' COMMENT 'PENDING, PASS, WARNING, ERROR',

    retry_count INT NOT NULL DEFAULT 0,
    can_rerun TINYINT NOT NULL DEFAULT 1,
    invalidated_reason TEXT DEFAULT NULL,
    owner VARCHAR(255) DEFAULT NULL,

    start_time DATETIME DEFAULT NULL,
    end_time DATETIME DEFAULT NULL,
    error_message TEXT DEFAULT NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) COMMENT='采集任务明细表';
```

说明：

如果继续使用 MySQL，可以把部分 `LONGTEXT` 改为 `JSON`。如果要迁移 GoldenDB，建议先使用 `LONGTEXT` 保存 JSON 字符串，以降低数据库兼容风险。

### 10.4 调度执行日志表 schedule_trigger_logs

```sql
CREATE TABLE schedule_trigger_logs (
    id VARCHAR(64) PRIMARY KEY,
    schedule_rule_id VARCHAR(64) DEFAULT NULL,
    task_group_id VARCHAR(64) DEFAULT NULL,
    xxl_job_id VARCHAR(64) DEFAULT NULL,

    trigger_type VARCHAR(32) DEFAULT NULL COMMENT 'SCHEDULE, MANUAL, BACKFILL',
    trigger_param LONGTEXT DEFAULT NULL,
    trigger_status VARCHAR(32) NOT NULL DEFAULT 'RUNNING' COMMENT 'RUNNING, SUCCESS, FAILED',

    business_date VARCHAR(32) DEFAULT NULL,
    start_time DATETIME DEFAULT NULL,
    end_time DATETIME DEFAULT NULL,
    error_message TEXT DEFAULT NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) COMMENT='调度触发日志表';
```

### 10.5 稽核规则表 audit_rules

```sql
CREATE TABLE audit_rules (
    id VARCHAR(64) PRIMARY KEY,
    wide_table_id VARCHAR(64) NOT NULL,
    field_name VARCHAR(128) NOT NULL,
    field_label VARCHAR(255) DEFAULT NULL,

    rule_type VARCHAR(64) NOT NULL COMMENT 'RANGE, CHANGE_RATE, NOT_NULL, ENUM, LENGTH',
    min_value DECIMAL(30, 8) DEFAULT NULL,
    max_value DECIMAL(30, 8) DEFAULT NULL,
    threshold_value DECIMAL(30, 8) DEFAULT NULL,
    compare_period_type VARCHAR(32) DEFAULT NULL COMMENT 'PREVIOUS_PERIOD, PREVIOUS_YEAR',

    enabled TINYINT NOT NULL DEFAULT 1,
    severity VARCHAR(32) DEFAULT 'WARNING' COMMENT 'WARNING, ERROR',

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) COMMENT='数据稽核规则表';
```

### 10.6 稽核结果表 audit_results

```sql
CREATE TABLE audit_results (
    id VARCHAR(64) PRIMARY KEY,

    task_group_id VARCHAR(64) DEFAULT NULL,
    fetch_task_id VARCHAR(128) DEFAULT NULL,
    wide_table_id VARCHAR(64) NOT NULL,

    target_table_name VARCHAR(128) DEFAULT NULL,
    row_id VARCHAR(128) DEFAULT NULL,

    field_name VARCHAR(128) NOT NULL,
    field_label VARCHAR(255) DEFAULT NULL,

    rule_id VARCHAR(64) DEFAULT NULL,
    rule_type VARCHAR(64) NOT NULL,

    current_value VARCHAR(4000) DEFAULT NULL,
    previous_value VARCHAR(4000) DEFAULT NULL,

    change_rate DECIMAL(30, 8) DEFAULT NULL,
    threshold_value DECIMAL(30, 8) DEFAULT NULL,

    audit_status VARCHAR(32) NOT NULL COMMENT 'PASS, WARNING, ERROR',
    abnormal_reason TEXT DEFAULT NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) COMMENT='数据稽核结果表';
```

---

## 11. 调度执行主流程

### 11.1 主流程图

```text
XXL-JOB 到点触发
        ↓
执行 dataCollectJobHandler
        ↓
解析调度参数 ruleId / frequency / businessDate
        ↓
创建 schedule_trigger_logs
        ↓
读取 schedule_rules
        ↓
计算 business_date
        ↓
创建 task_group
        ↓
根据需求配置生成 fetch_tasks
        ↓
逐个或并发执行 fetch_task
        ↓
调用采集接口
        ↓
格式化采集结果
        ↓
落目标表
        ↓
更新 fetch_task 状态
        ↓
刷新 task_group 状态
        ↓
触发 auditService
        ↓
写入 audit_results
        ↓
更新 audit_status
        ↓
进入验收流程
```

### 11.2 ScheduleDispatchService

```java
@Service
public class ScheduleDispatchService {

    @Resource
    private ScheduleRuleMapper scheduleRuleMapper;

    @Resource
    private TaskGroupService taskGroupService;

    @Resource
    private FetchTaskService fetchTaskService;

    @Resource
    private CollectExecutorService collectExecutorService;

    @Resource
    private AuditService auditService;

    @Resource
    private ScheduleTriggerLogService triggerLogService;

    public void dispatch(ScheduleDispatchParam param) {
        String logId = triggerLogService.start(param);

        try {
            ScheduleRule rule = scheduleRuleMapper.selectById(param.getRuleId());
            if (rule == null) {
                throw new IllegalArgumentException("调度规则不存在：" + param.getRuleId());
            }
            if (rule.getEnabled() == 0) {
                triggerLogService.success(logId, null, "调度规则未启用，跳过执行");
                return;
            }

            String businessDate = resolveBusinessDate(rule, param);
            String batchId = IdUtils.uuid();

            TaskGroup group = taskGroupService.createFromScheduleRule(rule, batchId, businessDate, param);
            List<FetchTask> tasks = fetchTaskService.createTasks(rule, group, businessDate);

            taskGroupService.markRunning(group.getId(), tasks.size());

            for (FetchTask task : tasks) {
                collectExecutorService.execute(task);
            }

            taskGroupService.refreshStatus(group.getId());
            auditService.auditTaskGroup(group.getId());
            taskGroupService.refreshAuditStatus(group.getId());

            triggerLogService.success(logId, group.getId(), "调度执行完成");
        } catch (Exception e) {
            triggerLogService.failed(logId, e.getMessage());
            throw e;
        }
    }

    private String resolveBusinessDate(ScheduleRule rule, ScheduleDispatchParam param) {
        if (param.getBusinessDate() != null && !param.getBusinessDate().isBlank()) {
            return param.getBusinessDate();
        }

        LocalDate now = LocalDate.now();
        if ("MONTHLY".equals(rule.getFrequency())) {
            return YearMonth.from(now).minusMonths(1).toString();
        }
        if ("YEARLY".equals(rule.getFrequency())) {
            return String.valueOf(now.minusYears(1).getYear());
        }

        throw new IllegalArgumentException("不支持的调度频率：" + rule.getFrequency());
    }
}
```

---

## 12. 采集执行流程

### 12.1 CollectExecutorService

```java
@Service
public class CollectExecutorService {

    @Resource
    private FetchTaskMapper fetchTaskMapper;

    @Resource
    private CollectClient collectClient;

    @Resource
    private ResultFormatService resultFormatService;

    @Resource
    private TargetTableWriteService targetTableWriteService;

    public void execute(FetchTask task) {
        try {
            markRunning(task.getId());

            CollectRequest request = buildRequest(task);
            CollectResponse response = collectClient.collect(request);

            List<RowData> rows = resultFormatService.format(task, response);
            targetTableWriteService.write(task.getWideTableId(), rows);

            markSuccess(task.getId(), response);
        } catch (Exception e) {
            markFailed(task.getId(), e.getMessage());
        }
    }

    private void markRunning(String taskId) {
        fetchTaskMapper.updateStatus(taskId, "running", LocalDateTime.now(), null);
    }

    private void markSuccess(String taskId, CollectResponse response) {
        fetchTaskMapper.updateSuccess(taskId, JsonUtils.toJson(response), LocalDateTime.now());
    }

    private void markFailed(String taskId, String errorMessage) {
        fetchTaskMapper.updateFailed(taskId, errorMessage, LocalDateTime.now());
    }
}
```

### 12.2 是否并发执行

第一阶段建议先串行执行，保证链路稳定。

后续可以按任务组并发：

```java
ExecutorService executor = Executors.newFixedThreadPool(5);
for (FetchTask task : tasks) {
    executor.submit(() -> collectExecutorService.execute(task));
}
```

并发执行时要注意：

1. 采集接口是否支持并发。
2. 目标表是否存在写入冲突。
3. 同一行数据是否可能被多个任务重复写入。
4. 事务边界要控制在单个任务内。
5. 批量落库要限制批次大小。

---

## 13. 状态流转设计

### 13.1 fetch_tasks 状态

| 状态 | 含义 |
|---|---|
| `pending` | 已生成，等待执行 |
| `running` | 正在执行 |
| `collect_success` | 采集和落库成功 |
| `failed` | 采集或落库失败 |

### 13.2 task_groups 状态

| 状态 | 含义 |
|---|---|
| `pending` | 任务组已创建 |
| `running` | 任务组执行中 |
| `success` | 所有任务成功 |
| `failed` | 所有任务失败 |
| `partial_success` | 部分成功，部分失败 |

### 13.3 audit_status 状态

| 状态 | 含义 |
|---|---|
| `PENDING` | 未稽核 |
| `PASS` | 稽核通过 |
| `WARNING` | 有可疑数据 |
| `ERROR` | 有严重异常 |

### 13.4 推荐流转

```text
fetch_task:
pending → running → collect_success / failed

成功后：
collect_success → audit pending → audit pass / warning / error

task_group:
pending → running → success / failed / partial_success

验收发布：
WAIT_ACCEPTANCE → ACCEPTED / REJECTED → PUBLISHED
```

建议不要把所有状态都塞进一个 `status` 字段，可以拆成：

```text
status
  采集执行状态

audit_status
  稽核状态

acceptance_status
  验收状态

publish_status
  发布状态
```

---

## 14. 稽核衔接设计

调度本身不负责稽核逻辑，但调度执行完成后应该自动触发稽核。

```text
采集任务完成
  ↓
落库完成
  ↓
触发 auditService.auditTaskGroup(taskGroupId)
  ↓
读取 audit_rules
  ↓
读取本期数据
  ↓
读取上期数据
  ↓
执行范围校验、变化率校验
  ↓
写入 audit_results
  ↓
更新 task_group.audit_status
```

### 14.1 AuditService 示例

```java
@Service
public class AuditService {

    @Resource
    private AuditRuleMapper auditRuleMapper;

    @Resource
    private TargetDataService targetDataService;

    @Resource
    private AuditResultMapper auditResultMapper;

    public void auditTaskGroup(String taskGroupId) {
        TaskGroup group = taskGroupMapper.selectById(taskGroupId);
        List<AuditRule> rules = auditRuleMapper.selectEnabledRules(group.getWideTableId());

        List<RowData> currentRows = targetDataService.queryRows(
                group.getWideTableId(),
                group.getBusinessDate()
        );

        for (RowData row : currentRows) {
            for (AuditRule rule : rules) {
                AuditResult result = applyRule(group, row, rule);
                if (result != null) {
                    auditResultMapper.insert(result);
                }
            }
        }
    }
}
```

### 14.2 调度与稽核的关系

```text
调度中心负责自动触发采集
稽核模块负责判断采集结果是否异常
调度完成后自动调用稽核
但稽核规则不写进 JobHandler
```

---

## 15. 失败重试设计

XXL-JOB 本身支持失败重试，但业务层也应该有自己的重跑能力。

### 15.1 调度级失败

例如：

1. JobHandler 启动失败。
2. 业务服务不可用。
3. 参数解析失败。
4. 规则不存在。

这类失败由 XXL-JOB 失败重试处理。

### 15.2 任务级失败

例如：

1. 某一个采集接口调用失败。
2. 某一个指标结果格式化失败。
3. 某一批数据落库失败。

这类失败应记录到 `fetch_tasks`，并支持平台内手动重跑。

### 15.3 重试策略建议

| 层级 | 策略 |
|---|---|
| XXL-JOB 调度级 | 失败重试 1 到 3 次 |
| fetch_task 业务级 | 记录失败，允许手动重跑 |
| 采集接口调用 | 可做 2 到 3 次短重试 |
| 落库失败 | 不建议无限重试，记录失败原因 |

### 15.4 手动重跑接口

```http
POST /api/fetch-tasks/{taskId}/rerun
POST /api/task-groups/{taskGroupId}/rerun-failed
POST /api/schedule-rules/{ruleId}/trigger?businessDate=2026-05
```

---

## 16. 日志设计

需要同时保留两类日志。

### 16.1 XXL-JOB 调度日志

用于查看：

1. XXL-JOB 是否触发。
2. 触发是否成功。
3. JobHandler 是否报错。
4. 调度参数是什么。

使用方式：

```java
XxlJobHelper.log("开始执行调度，ruleId={}", ruleId);
XxlJobHelper.log("生成任务组成功，taskGroupId={}", taskGroupId);
XxlJobHelper.log("调度执行失败，error={}", errorMessage);
```

### 16.2 平台业务日志

保存到 `schedule_trigger_logs`、`task_groups`、`fetch_tasks`、`audit_results`。

业务日志用于平台页面展示：

```text
本次调度是否执行
生成了多少任务
成功多少
失败多少
异常多少
失败原因是什么
```

---

## 17. 阻塞处理策略

月频、年频任务通常不应该并发重复执行。

建议在 XXL-JOB 后台配置：

```text
阻塞处理策略：单机串行
```

含义：同一个任务上一次还没跑完时，下一次触发不会并发执行同一个 Handler。

同时业务层也建议做幂等控制。

### 17.1 业务幂等键

建议使用：

```text
schedule_rule_id + business_date
```

例如：

```text
rule_monthly_auto_sales + 2026-05
```

在 `task_groups` 上增加唯一索引：

```sql
ALTER TABLE task_groups
ADD UNIQUE KEY uk_rule_business_date (schedule_rule_id, business_date);
```

这样可以避免同一个业务周期重复生成任务组。

### 17.2 重复触发处理

如果重复触发：

```text
如果已有成功任务组：直接跳过
如果已有 running 任务组：直接跳过
如果已有 failed 任务组：根据参数决定是否重跑
```

---

## 18. 与 GoldenDB 迁移的关系

如果平台迁移到公司虚拟机，且数据库从 MySQL 变为 GoldenDB，需要注意：

1. XXL-JOB Admin 自身需要数据库，是否也部署在 GoldenDB 上要和 DBA 确认。
2. 业务库中的调度表、任务表、稽核表需要验证 GoldenDB 兼容性。
3. 如果 GoldenDB 是 MySQL 兼容模式，大部分 JDBC/MyBatis 代码可复用。
4. 建表语句中的 `JSON` 字段建议优先改为 `LONGTEXT` 保存 JSON 字符串。
5. 大批量落库需要控制批次大小。
6. 调度任务、采集任务、稽核任务不要放在一个长事务里。
7. 使用业务幂等键防止重复调度，比依赖数据库锁更稳定。

建议 GoldenDB 环境先验证以下 SQL：

```sql
CREATE TABLE schedule_rules (...);
CREATE TABLE task_groups (...);
CREATE TABLE fetch_tasks (...);
CREATE TABLE schedule_trigger_logs (...);
CREATE TABLE audit_rules (...);
CREATE TABLE audit_results (...);
```

如果 GoldenDB 不支持某些 MySQL 特性，优先调整 DDL 和 Mapper XML，不要大规模改业务逻辑。

---

## 19. 后端接口设计

### 19.1 调度规则接口

```http
GET    /api/schedule-rules
GET    /api/schedule-rules/{id}
POST   /api/schedule-rules
PUT    /api/schedule-rules/{id}
DELETE /api/schedule-rules/{id}
POST   /api/schedule-rules/{id}/enable
POST   /api/schedule-rules/{id}/disable
```

### 19.2 手动触发接口

```http
POST /api/schedule-rules/{id}/trigger
```

请求体：

```json
{
  "businessDate": "2026-05",
  "triggerType": "MANUAL"
}
```

### 19.3 任务组接口

```http
GET  /api/task-groups
GET  /api/task-groups/{id}
GET  /api/task-groups/{id}/tasks
POST /api/task-groups/{id}/rerun-failed
```

### 19.4 任务明细接口

```http
GET  /api/fetch-tasks/{id}
POST /api/fetch-tasks/{id}/rerun
```

### 19.5 稽核接口

```http
GET  /api/audit/results?taskGroupId=xxx
GET  /api/audit/summary?taskGroupId=xxx
POST /api/audit/run/task-group/{taskGroupId}
```

---

## 20. 前端页面建设建议

### 20.1 调度规则管理页

字段：

| 字段 | 说明 |
|---|---|
| 规则名称 | 例如：汽车销量月频采集 |
| 需求 | 对应 requirement |
| 宽表 | 对应 wide_table |
| 频率 | 月频 / 年频 |
| cron | 自动生成或手动输入 |
| 是否启用 | 启用 / 停用 |
| 最近执行时间 | `last_trigger_time` |
| 最近执行状态 | 成功 / 失败 |
| 操作 | 编辑、启停、立即执行 |

### 20.2 调度执行记录页

展示：

| 字段 | 说明 |
|---|---|
| 调度规则 | 规则名称 |
| 业务日期 | 2026-05 / 2025 |
| 触发类型 | 自动 / 手动 / 补采 |
| 状态 | 成功 / 失败 / 执行中 |
| 任务数 | 总数、成功数、失败数 |
| 稽核状态 | 通过 / 异常 |
| 开始时间 | 调度开始时间 |
| 结束时间 | 调度结束时间 |

### 20.3 任务明细页

展示每个 `fetch_task`：

| 字段 | 说明 |
|---|---|
| 任务名称 | 指标组 / 行任务名称 |
| 状态 | pending / running / success / failed |
| 采集接口 | 调用接口名称 |
| 失败原因 | 错误信息 |
| 稽核状态 | PASS / WARNING / ERROR |
| 操作 | 重跑、查看响应、查看稽核 |

### 20.4 稽核结果页

展示：

| 字段 | 说明 |
|---|---|
| 行ID | 目标数据行 |
| 字段 | 异常字段 |
| 本期值 | current_value |
| 上期值 | previous_value |
| 变化率 | change_rate |
| 阈值 | threshold_value |
| 异常原因 | abnormal_reason |
| 状态 | WARNING / ERROR |

---

## 21. 分阶段实施计划

### 21.1 第一阶段：XXL-JOB 基础接入

目标：打通 XXL-JOB 到平台后端的调度链路。

任务：

1. 部署 XXL-JOB Admin。
2. 后端引入 `xxl-job-core`。
3. 配置 `XxlJobSpringExecutor`。
4. 编写 `dataCollectJobHandler`。
5. 在 XXL-JOB Admin 中注册执行器。
6. 配置一个测试 cron 任务。
7. 验证 JobHandler 能被成功触发。

验收标准：

```text
XXL-JOB Admin 可以看到执行器在线
手动触发任务成功
后端日志能打印调度参数
XXL-JOB 调度日志显示成功
```

### 21.2 第二阶段：任务编排落库

目标：调度触发后能创建平台任务。

任务：

1. 新增 `schedule_rules` 表。
2. 新增 `schedule_trigger_logs` 表。
3. 改造 `task_groups` 表。
4. 改造 `fetch_tasks` 表。
5. 实现 `ScheduleDispatchService`。
6. 根据调度规则生成任务组和任务明细。

验收标准：

```text
XXL-JOB 触发后自动创建 task_group
自动创建 fetch_tasks
任务状态正确流转
调度日志可在平台查看
```

### 21.3 第三阶段：采集执行和落库

目标：调度触发后能自动完成采集。

任务：

1. 实现 `CollectExecutorService`。
2. 对接外部采集接口。
3. 实现采集结果格式化。
4. 实现目标表写入。
5. 实现失败记录。
6. 实现失败任务手动重跑。

验收标准：

```text
自动调用采集接口
采集结果成功落库
失败任务能记录错误原因
失败任务能手动重跑
```

### 21.4 第四阶段：稽核联动

目标：采集完成后自动执行稽核。

任务：

1. 新增 `audit_rules` 表。
2. 新增 `audit_results` 表。
3. 支持范围校验。
4. 支持本期较上期变化率校验。
5. 采集完成后自动执行稽核。
6. 前端展示异常数据。

验收标准：

```text
采集完成后自动生成 audit_results
异常字段可在前端高亮展示
task_group.audit_status 能正确更新
```

### 21.5 第五阶段：验收发布闭环

目标：调度、采集、稽核、验收、发布形成完整闭环。

任务：

1. 验收页面展示稽核异常。
2. 支持异常数据人工通过。
3. 支持异常数据驳回。
4. 发布时根据 audit_status 做校验。
5. 支持部分通过、部分驳回。

验收标准：

```text
异常数据可人工处理
ERROR 数据默认不能直接发布
WARNING 数据可人工确认后发布
发布状态正确记录
```

---

## 22. 关键风险与解决方案

| 风险 | 说明 | 解决方案 |
|---|---|---|
| XXL-JOB Admin 无法访问执行器 | 网络、防火墙、IP 自动识别问题 | 明确配置 executor ip/address，开放端口 |
| 任务重复执行 | 手动触发和自动触发重复 | 使用 `schedule_rule_id + business_date` 幂等键 |
| JobHandler 逻辑过重 | 调度入口混入大量业务代码 | JobHandler 只调用 Service |
| 采集接口失败 | 外部接口不稳定 | 任务级失败记录和手动重跑 |
| 批量落库失败 | SQL 太大或数据格式异常 | 分批落库，单批 300 到 1000 条 |
| JSON 字段迁移失败 | GoldenDB JSON 兼容不确定 | 使用 LONGTEXT 存 JSON 字符串 |
| 事务过长 | 采集、落库、稽核放在一个事务中 | 拆成多个短事务 |
| 稽核误判 | 上期数据缺失或阈值不合理 | 规则支持 WARNING/ERROR 分级，人工验收兜底 |

---

## 23. 推荐最终技术选型

```text
调度平台：XXL-JOB
执行器：Spring Boot 后端服务
调度入口：@XxlJob JobHandler
数据库访问：MyBatis / MyBatis-Plus
数据库：MySQL 或 GoldenDB MySQL 兼容模式
任务状态：task_groups + fetch_tasks
调度日志：schedule_trigger_logs
稽核规则：audit_rules
稽核结果：audit_results
JSON 快照：优先 LONGTEXT，降低 GoldenDB 迁移风险
```

---

## 24. 最终结论

基于 XXL-JOB 建设调度中心是可行的，推荐采用“XXL-JOB 负责触发，平台后端负责任务编排和业务执行”的方案。

最终架构应保持职责清晰：

```text
XXL-JOB Admin
  负责 cron、触发、失败重试、调度日志

JobHandler
  负责接收调度请求和解析参数

ScheduleDispatchService
  负责创建任务组、生成任务、控制流程

CollectExecutorService
  负责调用采集接口、格式化、落库

AuditService
  负责执行稽核规则、标注异常

Acceptance / Publish Service
  负责人工验收和发布
```

一句话总结：

> XXL-JOB 不替代你的业务调度中心，而是作为外部触发器；真正的任务状态、采集过程、稽核结果和验收发布闭环，仍然应该沉淀在你的平台业务表和后端服务中。
