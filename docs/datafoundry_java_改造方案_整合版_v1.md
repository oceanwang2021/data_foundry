# datafoundry_java 改造方案（整合版）
# 对齐项目集开发规范 · DDD 最终实施蓝图

> 版本：整合版（基于 V1 + V2 + 评审意见优化）  
> 生成时间：2026-04-16（Asia/Shanghai）  
> 适用范围：`data-foundry-*-service`（Java 侧）+ `db/mysql/*` + 前端接口切换策略  
> 说明：以 V2 为主体框架，从 V1 补入完整接口矩阵，并依据评审意见修正 FetchTask 聚合归属、
>       api 注解约定、分层调用链、BeanCopier 链路、枚举放置、循环依赖处理、/health 豁免、
>       common-contract 迁移、Flyway 替代方案、前端交付物清单等关键问题。

---

## 0. 背景与目标

当前仓库已落地：

- 前端：`data-foundry-frontend/`（Next.js 13.5.11，App Router，`/api/*` 代理）
- 后端：Maven 多模块 + 3 个 Spring Boot 服务
  - `data-foundry-backend-service`（8000，`data_foundry_backend`）
  - `data-foundry-scheduler-service`（8200，`data_foundry_scheduler`）
  - `data-foundry-agent-service`（8100，无库，Mock Agent）
  - `data-foundry-common-contract`（共享 DTO）
- 数据库：MySQL 8.0+，脚本位于 `db/mysql/*`

**本次改造目标**：在保持"可联调、可演进"的前提下，将后端工程整体改造为符合
**项目集开发规范与规则**的 DDD 化服务与代码规范体系：

1. 严格满足包结构、命名、返回、DAO、日志、异常、注释规范
2. 所有 API 返回 `Response<T>`，异常统一走全局处理器
3. MyBatis 迁移到 XML + resultMap，参数/返回 DTO/DO 化
4. 数据库脚本统一为可复现、可迁移的版本化脚本
5. 逐步补齐单元测试与集成测试
6. 接口与数据库表改造不遗漏

---

## 1. 规范落地总基线（强约束）

### 1.1 技术栈与依赖管理

| 项目 | 要求 | 现状 | 是否符合 |
|---|---|---|---|
| Spring Boot | 2.x（2.7.18） | 2.7.18 | ✅ |
| MyBatis | XML + resultMap，禁注解 SQL | 注解 SQL | ❌ 需改 |
| 依赖版本 | 只在父 POM `dependencyManagement` 声明 | 子模块有显式版本 | ❌ 需改 |
| 日志 | 业务代码统一 `org.apache.commons.logging.LogFactory` | 无规范日志 | ❌ 需改 |

### 1.2 代码组织（必须）

顶层分层包必须存在（见第 3 节详述）：

```
api / api.impl / dao / dto / domain / service / service.impl
```

### 1.3 统一返回格式（必须）

所有对外 HTTP API **最终**必须返回 `Response<T>`（`/health` 接口豁免，见第 8.1 节说明）：

```java
public class Response<T> {
    private Integer code;
    private String message;
    private T data;
    // getter/setter
    public static <T> Response<T> success(String message, T data) { ... }
    public static <T> Response<T> failure(Integer code, String message) { ... }
}
```

---

## 2. 领域建模与聚合设计（DDD）

### 2.1 有界上下文（Bounded Context）划分

三服务与三上下文严格 1:1 映射，**禁止跨上下文直接写库**，服务间调用只通过 HTTP API：

| 上下文 | 服务 | 端口 | 数据库 | 职责 |
|---|---|---|---|---|
| Core | backend-service | 8000 | data_foundry_backend | 项目、需求、宽表、计划、任务、执行、规则 |
| Scheduling | scheduler-service | 8200 | data_foundry_scheduler | 调度作业创建、查询、状态流转 |
| Agent | agent-service | 8100 | 无库 | 采数执行（当前 Mock，可切换真实实现） |

### 2.2 聚合根与聚合边界（Core 上下文）

> 原则：聚合内强一致；跨聚合只用 ID 引用，通过应用服务编排。

#### A. Project 聚合

- **聚合根**：`Project`
- **值对象**：`DataSourcePolicy`（对应 `projects.data_source` JSON）
- **边界内规则**：Project 基本信息维护、data_source 格式校验
- **跨聚合引用**：Requirement 只存 `projectId`，不嵌套 Project 对象

#### B. Requirement 聚合

- **聚合根**：`Requirement`
- **值对象**：`CollectionPolicy`（对应 `collection_policy`）、`ProcessingRuleDrafts`（对应 `processing_rule_drafts`）
- **边界内规则（必须归属此域）**：
  1. `schema_locked=true` 时禁止"定义类字段"变更（允许状态流转）
  2. `status` 进入 `ready`：锁定 schema，触发"生成默认 TaskGroup"（跨聚合编排，由应用服务处理）
  3. phase/status/data_update_mode 枚举合法性与流转校验

#### C. WideTableDefinition 聚合

- **聚合根**：`WideTable`
- **值对象**：`WideTableSchema`、`WideTableScope`、`IndicatorGroupSet`、`ScheduleRuleSet`
- **边界内规则**：
  1. schema/scope/indicatorGroups/scheduleRules 的结构校验
  2. `schema_version` 递增策略（修改 schema 时 +1，仅改描述不 +1）
  3. 采集模式约束（semantic_time_axis 与 collection_coverage_mode 组合合法性）
- 更新前由应用服务从 Requirement 聚合读取 `schema_locked` 状态后校验

#### D. Plan 聚合

- **聚合根**：`TaskGroup`（执行调度最小批次单位）
- **实体**：
  - `TaskGroup`（对应 `task_groups`）
  - `FetchTask`（对应 `fetch_tasks`，TaskGroup 的子实体，**归属 Plan 聚合**）
  - `CollectionBatch`（对应 `collection_batches`，V1 暂不开放 API，但需纳入迁移）
- **边界内规则**：
  1. 计划版本（plan_version）单调递增，旧计划可通过 status/invalidated_reason 标记失效
  2. 生成规则：`FetchTask = WideTableRow × IndicatorGroup`（lazy 生成，规则集中在 PlanService）
  3. TaskGroup 状态聚合：`total/completed/failed_tasks` 的一致性更新

#### E. Execution 聚合

> **【修正 V2 错误】**：`FetchTask` 属于 Plan 聚合，不在 Execution 聚合中重复出现。
> Execution 聚合的聚合根是 `ExecutionRecord`，每次执行尝试对应一条记录。

- **聚合根**：`ExecutionRecord`（对应 `execution_records`，每次 execute 操作生成一条）
- **实体**：`RetrievalTask`（对应 `retrieval_tasks`，单指标检索执行产物）
- **边界内规则（必须归属此域）**：
  1. 状态机：`pending -> running -> completed/failed`（重试回到 pending，记录原因）
  2. ExecutionRecord 生成策略：**每次 execute 操作生成一条，幂等策略由应用服务控制**
  3. `can_rerun` 与重试次数策略（后续引入时在此域扩展）
- **FetchTask 状态更新**：ExecutionRecord 完成后，由应用服务编排回写 FetchTask.status（跨聚合只传 ID）
- **跨聚合引用**：Execution 只更新 ExecutionRecord/RetrievalTask，禁止改 WideTableDefinition

#### F. Governance 聚合（规则/配置）

三个独立聚合根：`KnowledgeBase`、`PreprocessRule`、`AuditRule`，各自维护 enabled 语义与 JSON 配置字段的结构校验。

### 2.3 关键业务规则归属一览表（"谁负责"一锤定音）

| 规则/行为 | 归属层 | 说明 |
|---|---|---|
| Requirement schema_locked 校验 | Requirement Domain Service | 定义变更前必须检查 |
| WideTable 定义更新（schema/scope/...） | WideTable Domain Service | 结构校验 + schema_version 策略 |
| status=ready 触发默认 TaskGroup | Requirement Application Service | 跨聚合编排：Requirement → Plan |
| TaskGroup/FetchTask 生成 | Plan Domain Service | 统一生成规则，禁止在 Controller/DAO 里生成 |
| ExecutionRecord 生成（execute/retry） | Execution Domain Service | 状态机集中化，每次 execute 生成一条记录 |
| FetchTask 状态回写 | Execution Application Service | ExecutionRecord 完成后编排回写 |
| backend 调 scheduler 创建 ScheduleJob | Application Service + SchedulerClient | 失败映射为 BizException |
| /api/admin/seed/reset | Admin Application Service | 必须受权限控制 |

---

## 3. 分层架构与包结构

### 3.1 分层调用链（从上到下，禁止越层）

```
HTTP 请求
   ↓
api（接口定义，Spring MVC 注解写在此层）
   ↓
api.impl（Controller 实现，不含业务逻辑，只做参数校验 + 调用 Service）
   ↓
service（应用服务接口）
   ↓
service.impl（应用服务实现，编排领域服务，DO↔Domain↔DTO 转换）
   ↓
domain（领域模型 + 领域服务，不依赖 DAO）
   ↑
dao（MyBatis Mapper，只返回 DO，不向上渗透到 service 以上）
```

**禁止事项**：
- Controller（api.impl）直接调用 Mapper（dao）
- Domain 层直接依赖 dao
- DAO 返回 DTO 给 API 层

### 3.2 @RequestMapping 注解放置规则（强制，新增补充）

`api` 包的接口方法上**统一声明** `@RequestMapping` 系列注解（`@GetMapping`/`@PostMapping`/`@PutMapping` 等）。`api.impl` 实现类**禁止重复声明路径注解**，只实现接口方法即可。Spring MVC 会自动继承接口上的注解。

违反此规则可能导致路径二义性或 Spring 扫描冲突，在代码 Review 阶段应作为强制卡点。

### 3.3 backend-service 包结构蓝图

根包示例：`com.htsc.datafoundry.core`（如必须使用 `com.htsc.demo`，整体替换根包前缀即可）

```text
com.htsc.datafoundry.core
├─ api/
│  ├─ project/ProjectApi.java
│  ├─ requirement/RequirementApi.java
│  ├─ widetable/WideTableApi.java
│  ├─ plan/WideTablePlanApi.java
│  ├─ task/TaskQueryApi.java
│  ├─ execution/ExecutionApi.java
│  ├─ scheduling/ScheduleJobApi.java
│  ├─ governance/GovernanceApi.java
│  ├─ ops/OpsApi.java
│  ├─ admin/AdminApi.java
│  └─ health/HealthApi.java
├─ api/impl/（与 api 同子包结构，XXXApiImpl 实现接口，不重复写路径注解）
├─ dto/（同子包结构，XXXDTO：RequestDTO/ResponseDTO）
├─ service/（同子包结构，XXXService 接口）
├─ service/impl/（XXXServiceImpl，应用服务 + 领域编排）
├─ domain/
│  ├─ project/（实体/VO/领域服务）
│  ├─ requirement/
│  ├─ widetable/
│  ├─ plan/
│  ├─ execution/
│  └─ governance/
└─ dao/
   ├─ project/ProjectMapper.java
   ├─ requirement/RequirementMapper.java
   └─ ...（各子域 DO + Mapper 接口）
```

MyBatis XML 位于资源目录：

```text
src/main/resources/mapper/<subdomain>/XXXMapper.xml
```

scheduler-service、agent-service 同理，包名分别为：
- `com.htsc.datafoundry.scheduling`
- `com.htsc.datafoundry.agent`

### 3.4 枚举放置规则（新增补充）

| 枚举类型 | 放置位置 | 示例 |
|---|---|---|
| 只在 backend-service 内使用 | `domain/<subdomain>/` | `RequirementStatus`、`TaskStatus`、`FetchTaskStatus` |
| 跨服务传递（API 契约的一部分） | `common-contract` | `ScheduleJobStatus`、`TriggerType` |
| 禁止放置位置 | `dto` 包 | DTO 是数据载体，枚举是类型定义，必须分离 |

---

## 4. Maven 模块结构

### 4.1 模块划分

```text
datafoundry_java（根 pom.xml）
├─ data-foundry-common-core（新增）
│   Response<T>、ErrorCode、BizException、GlobalExceptionHandler、
│   BeanCopierUtils、TypeHandler（JSON/Enum/Time）、SecurityInterceptor 基础能力
├─ data-foundry-common-contract（保留，仅跨服务 DTO）
│   ScheduleJobDTO、CreateScheduleJobDTO、AgentExecutionRequestDTO、AgentExecutionResponseDTO
├─ data-foundry-backend-service
├─ data-foundry-scheduler-service
└─ data-foundry-agent-service
```

### 4.2 common-contract 现有内容迁移表（新增补充）

| 现有类 | 迁移去向 | 说明 |
|---|---|---|
| `AgentExecutionRequestDTO` | 保留 common-contract | 跨服务（backend/scheduler → agent） |
| `AgentExecutionResponseDTO` | 保留 common-contract | 同上 |
| `ScheduleJobDTO` | 保留 common-contract | backend facade 与 scheduler 共享 |
| `CreateScheduleJobDTO` | 保留 common-contract | 同上 |
| 其他只在 backend 内部使用的 DTO | 迁移到 backend-service 的 `dto` 包 | 避免 contract 膨胀 |
| Response/BizException 等基础组件（如有） | 迁移到 common-core | contract 只放契约 DTO |

### 4.3 父 POM 依赖管理规范

- 根 `pom.xml` import Spring Boot BOM 锁定基础版本
- 所有"非 BOM 管控"依赖版本（如 mybatis-spring-boot-starter）收入 `dependencyManagement`
- 子模块引用任何依赖**禁止写版本号**，版本只在父 POM 一处声明
- 遵循最小化引入原则：TypeHandler 若某服务不需要 JSON 处理，可在该服务的 pom.xml 中排除 common-core 中 jackson 的传递依赖，或将 TypeHandler 拆为可选模块

---

## 5. 核心公共组件（common-core）

### 5.1 Response 统一

```java
public class Response<T> {
    private Integer code;
    private String message;
    private T data;

    public static <T> Response<T> success(String message, T data) {
        Response<T> r = new Response<>();
        r.code = 0; r.message = message; r.data = data;
        return r;
    }

    public static <T> Response<T> failure(Integer code, String message) {
        Response<T> r = new Response<>();
        r.code = code; r.message = message; r.data = null;
        return r;
    }
    // getter/setter
}
```

### 5.2 错误码体系（ErrorCode 枚举，禁止魔法数字）

```java
public enum ErrorCode {
    SUCCESS(0, "成功"),
    // 通用错误
    PARAM_INVALID(400000, "参数校验失败"),
    UNAUTHORIZED(401000, "未认证或 Token 缺失"),
    FORBIDDEN(403000, "无权限"),
    NOT_FOUND(404000, "资源不存在"),
    CONFLICT(409000, "资源冲突"),
    SYSTEM_ERROR(500000, "系统异常"),
    // 业务细分（示例，按需扩展）
    PROJECT_NOT_FOUND(404101, "Project 不存在"),
    REQUIREMENT_NOT_FOUND(404201, "Requirement 不存在"),
    REQ_SCHEMA_LOCKED(409201, "Requirement schema 已锁定，禁止修改定义"),
    WIDE_TABLE_NOT_FOUND(404301, "WideTable 不存在"),
    TASK_GROUP_NOT_FOUND(404401, "TaskGroup 不存在"),
    FETCH_TASK_NOT_FOUND(404402, "FetchTask 不存在"),
    SCHEDULER_UNAVAILABLE(503001, "Scheduler 服务不可用"),
    AGENT_UNAVAILABLE(503002, "Agent 服务不可用");

    private final int code;
    private final String defaultMessage;
    // constructor + getter
}
```

### 5.3 BizException + GlobalExceptionHandler

```java
public class BizException extends RuntimeException {
    private final ErrorCode errorCode;
    private final String message;
    // constructor + getter
}

@RestControllerAdvice
public class GlobalExceptionHandler {
    private static final Log log = LogFactory.getLog(GlobalExceptionHandler.class);

    @ExceptionHandler(BizException.class)
    public Response<Void> handleBizException(BizException e) {
        log.error("BizException: code=" + e.getErrorCode().getCode() + " message=" + e.getMessage());
        return Response.failure(e.getErrorCode().getCode(), e.getMessage());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public Response<Void> handleValidation(MethodArgumentNotValidException e) {
        String msg = e.getBindingResult().getFieldErrors().stream()
            .map(f -> f.getField() + ": " + f.getDefaultMessage())
            .collect(Collectors.joining("; "));
        return Response.failure(ErrorCode.PARAM_INVALID.getCode(), msg);
    }

    @ExceptionHandler(Exception.class)
    public Response<Void> handleUnexpected(Exception e) {
        log.error("Unexpected exception", e);
        return Response.failure(ErrorCode.SYSTEM_ERROR.getCode(), "系统异常，请联系管理员");
    }
}
```

### 5.4 BeanCopierUtils

```java
public class BeanCopierUtils {
    // 缓存 BeanCopier，key：sourceClass + "->" + targetClass
    private static final ConcurrentHashMap<String, BeanCopier> CACHE = new ConcurrentHashMap<>();

    public static <T> T copy(Object source, Class<T> targetClass) {
        String key = source.getClass().getName() + "->" + targetClass.getName();
        BeanCopier copier = CACHE.computeIfAbsent(key,
            k -> BeanCopier.create(source.getClass(), targetClass, false));
        try {
            T target = targetClass.getDeclaredConstructor().newInstance();
            copier.copy(source, target, null);
            return target;
        } catch (Exception e) {
            throw new RuntimeException("BeanCopier copy failed", e);
        }
    }
}
```

**适用范围（重要约束）**：

BeanCopier 只适用于**字段同名、同类型、无嵌套 JSON 的简单对象**（例如 `ScheduleJobDO → ScheduleJobDTO`）。当 DO 中存在 JSON 列强类型字段时，必须使用 Assembler（见第 7 节）。

### 5.5 TypeHandler（MyBatis，注册于 common-core）

#### JSON TypeHandler（Jackson）

```java
public class JacksonJsonTypeHandler<T> extends BaseTypeHandler<T> {
    private final Class<T> type;
    // 构造器接收 type 参数
    // setNonNullParameter：序列化对象为 JSON 字符串写入 PS
    // getNullableResult：反序列化 JSON 字符串为强类型对象
}
```

#### Enum TypeHandler

```java
public class EnumCodeTypeHandler<E extends Enum<E> & CodeEnum>
    extends BaseTypeHandler<E> {
    // DB 存 varchar/int code，映射到枚举的 getCode() 值
}
// CodeEnum 接口：String getCode();
```

#### 时间字段 TypeHandler

- 推荐 DB 存 `DATETIME`，Java 用 `java.time.LocalDateTime`
- 若 scheduler 保留 varchar ISO8601，提供 `IsoLocalDateTimeStringTypeHandler`

在 `application.yml` 中全局注册：

```yaml
mybatis:
  type-handlers-package: com.htsc.datafoundry.common.core.typehandler
```

---

## 6. 依赖注入规范

### 6.1 基线规则（强制）

- ServiceImpl / Client / Assembler：**只允许构造器注入**（构造器上加 `@Autowired`，满足规范要求且保持可测试性）
- Controller（api.impl）：允许构造器注入（推荐）
- 禁止 `new XxxServiceImpl()` 手工创建

示例（ServiceImpl）：

```java
@Service
public class RequirementServiceImpl implements RequirementService {
    private final RequirementMapper requirementMapper;
    private final WideTableMapper wideTableMapper;
    private final TaskPlanService taskPlanService;

    @Autowired
    public RequirementServiceImpl(RequirementMapper requirementMapper,
                                  WideTableMapper wideTableMapper,
                                  TaskPlanService taskPlanService) {
        this.requirementMapper = requirementMapper;
        this.wideTableMapper = wideTableMapper;
        this.taskPlanService = taskPlanService;
    }
}
```

### 6.2 循环依赖处理规则（新增补充）

Spring Boot 2.6+ 默认禁用循环依赖自动解决；构造器注入能在启动时立即暴露循环依赖（这是优点）。

**若出现构造器循环依赖，唯一合法解决方式是重构依赖关系**：

- 将两个 Service 共同依赖的逻辑抽提为第三个 Service/Domain Service
- 通过 Spring 事件机制（`ApplicationEventPublisher`）解耦调用链

**禁止的规避方式**：
- 改为字段注入来绕过循环依赖检测
- 使用 `@Lazy` 注解延迟注入

---

## 7. 对象转换策略（DO → Domain → DTO 完整链路）

### 7.1 分层对象命名（统一）

| 对象 | 命名规则 | 位置 | 职责 |
|---|---|---|---|
| DTO | `XXXDTO` | `dto/<subdomain>/` | API 入参/出参，禁止承载业务规则 |
| DO | `XXXDO` | `dao/<subdomain>/` | MyBatis 映射对象，禁止直接暴露给 API |
| Domain/Entity | `XXX`（无后缀） | `domain/<subdomain>/` | 业务语义，禁止直接暴露给 API |

### 7.2 转换策略（三种场景）

**场景 1：字段同名同类型、无嵌套 JSON**
→ 使用 `BeanCopierUtils.copy()`（例如 `ScheduleJobDO → ScheduleJobDTO`）

**场景 2：包含嵌套 JSON 字段、字段改名、多表组合**
→ 使用 Assembler（`XxxAssembler`，位于 `service/impl` 或 `domain/*/assembler`）

**场景 3：DO 中 JSON 列反序列化为强类型**
→ 由 MyBatis TypeHandler 在 DAO 查询时自动处理（DO 字段已是强类型，无需手工反序列化）

### 7.3 完整链路示例（WideTable，含 JSON 字段）

```java
// ① DAO 层：TypeHandler 在查询时自动将 JSON 列反序列化
// WideTableDO.schemaJson 字段类型为 WideTableSchemaDO（TypeHandler 处理）
WideTableDO wideTableDO = wideTableMapper.selectById(wideTableId);

// ② Service.impl：DO → Domain（简单字段用 BeanCopier，JSON 字段手工组合）
// WideTableAssembler 负责：BeanCopier 复制基础字段 + 手工映射 schemaJson 等复杂字段
WideTable wideTable = WideTableAssembler.toDomain(wideTableDO);

// ③ 业务校验（Domain Service）
wideTableDomainService.validateSchemaUpdate(wideTable, updateDTO);

// ④ Domain → DTO（Assembler 输出 API 响应）
WideTableDTO dto = WideTableAssembler.toDTO(wideTable);
return Response.success("更新成功", dto);
```

### 7.4 JSON 字段强类型化清单（禁止 Object/Map<String,Object> 作为 API 入参）

| 数据库字段 | DO 字段类型 | DTO 字段类型 | TypeHandler |
|---|---|---|---|
| `projects.data_source` | `DataSourcePolicyDO` | `DataSourcePolicyDTO` | JacksonJsonTypeHandler |
| `requirements.collection_policy` | `CollectionPolicyDO` | `CollectionPolicyDTO` | JacksonJsonTypeHandler |
| `requirements.processing_rule_drafts` | `ProcessingRuleDraftsDO` | `ProcessingRuleDraftsDTO` | JacksonJsonTypeHandler |
| `wide_tables.schema_json` | `WideTableSchemaDO` | `WideTableSchemaDTO` | JacksonJsonTypeHandler |
| `wide_tables.scope_json` | `WideTableScopeDO` | `WideTableScopeDTO` | JacksonJsonTypeHandler |
| `wide_tables.indicator_groups_json` | `List<IndicatorGroupDO>` | `List<IndicatorGroupDTO>` | JacksonJsonTypeHandler |
| `wide_tables.schedule_rules_json` | `List<ScheduleRuleDO>` | `List<ScheduleRuleDTO>` | JacksonJsonTypeHandler |
| `fetch_tasks.indicator_keys_json` | `List<String>` | `List<String>` | JacksonJsonTypeHandler |
| `fetch_tasks.dimension_values_json` | `Map<String,String>` | `Map<String,String>` | JacksonJsonTypeHandler |
| `retrieval_tasks.narrow_row_json` | `NarrowIndicatorRowDO` | `NarrowIndicatorRowDTO` | JacksonJsonTypeHandler |
| `preprocess_rules.*_json` | 对应 DO | 对应 DTO | JacksonJsonTypeHandler |

---

## 8. 接口改造方案（完整，不遗漏）

### 8.1 /health 接口豁免规则（新增补充）

自定义 `GET /health` **豁免** `Response<T>` 包装要求，**继续返回简单格式**：

```json
{ "status": "ok" }
```

原因：探活/负载均衡/监控系统通常对 body 格式有硬解析，改为 `Response<T>` 格式会破坏集成。

Spring Actuator 的 `/actuator/health` 为标准格式（`{"status":"UP"}`），与自定义 `/health` 独立共存。在 `application.yml` 中控制 Actuator 暴露范围，避免生产环境敏感端点泄露。

### 8.2 接口完整矩阵（三服务，不遗漏）

#### 8.2.1 backend-service（8000）

| 方法 | 路径 | 目标 API 接口（api 包） | 请求 DTO | 响应 data 类型 | 所属子域 |
|---|---|---|---|---|---|
| GET | `/health` | `HealthApi.health()` | — | 简单 JSON（豁免 Response） | platform |
| GET | `/api/projects` | `ProjectApi.listProjects()` | — | `List<ProjectDTO>` | project |
| GET | `/api/projects/{projectId}` | `ProjectApi.getProject(String projectId)` | — | `ProjectDTO` | project |
| GET | `/api/projects/{projectId}/requirements` | `RequirementApi.listByProject(String projectId)` | — | `List<RequirementWithWideTableDTO>` | requirement |
| POST | `/api/projects/{projectId}/requirements` | `RequirementApi.create(String projectId, @RequestBody @Valid RequirementCreateDTO)` | `RequirementCreateDTO` | `RequirementWithWideTableDTO` | requirement |
| GET | `/api/projects/{projectId}/requirements/{requirementId}` | `RequirementApi.get(String projectId, String requirementId)` | — | `RequirementWithWideTableDTO` | requirement |
| PUT | `/api/projects/{projectId}/requirements/{requirementId}` | `RequirementApi.update(String projectId, String requirementId, @RequestBody @Valid RequirementUpdateDTO)` | `RequirementUpdateDTO` | `RequirementWithWideTableDTO` | requirement/plan |
| PUT | `/api/requirements/{requirementId}/wide-tables/{wideTableId}` | `WideTableApi.update(String requirementId, String wideTableId, @RequestBody @Valid WideTableUpdateDTO)` | `WideTableUpdateDTO` | `WideTableDTO` | widetable |
| POST | `/api/requirements/{requirementId}/wide-tables/{wideTableId}/preview` | `WideTablePlanApi.persistPreview(String requirementId, String wideTableId, @RequestBody WideTablePreviewPersistDTO)` | `WideTablePreviewPersistDTO` | `OkDTO` | plan |
| POST | `/api/requirements/{requirementId}/wide-tables/{wideTableId}/plan` | `WideTablePlanApi.persistPlan(String requirementId, String wideTableId, @RequestBody @Valid WideTablePlanPersistDTO)` | `WideTablePlanPersistDTO` | `PlanPersistResultDTO` | plan |
| GET | `/api/projects/{projectId}/requirements/{requirementId}/task-groups` | `TaskQueryApi.listTaskGroups(String projectId, String requirementId)` | — | `List<TaskGroupDTO>` | task |
| GET | `/api/projects/{projectId}/requirements/{requirementId}/tasks` | `TaskQueryApi.listFetchTasks(String projectId, String requirementId)` | — | `List<FetchTaskDTO>` | task |
| POST | `/api/task-groups/{taskGroupId}/ensure-tasks` | `ExecutionApi.ensureTasks(String taskGroupId)` | — | `EnsureTasksResultDTO` | execution |
| POST | `/api/task-groups/{taskGroupId}/execute` | `ExecutionApi.executeTaskGroup(String taskGroupId, @RequestBody ExecuteTaskGroupDTO)` | `ExecuteTaskGroupDTO` | `ExecutionResultDTO` | execution |
| POST | `/api/tasks/{taskId}/execute` | `ExecutionApi.executeTask(String taskId)` | — | `ExecutionResultDTO` | execution |
| POST | `/api/tasks/{taskId}/retry` | `ExecutionApi.retryTask(String taskId)` | — | `ExecutionResultDTO` | execution |
| GET | `/api/schedule-jobs` | `ScheduleJobApi.list(@RequestParam String triggerType, @RequestParam String status)` | — | `List<ScheduleJobDTO>` | scheduling |
| POST | `/api/schedule-jobs` | `ScheduleJobApi.create(@RequestBody @Valid CreateScheduleJobDTO)` | `CreateScheduleJobDTO` | `ScheduleJobDTO` | scheduling |
| GET | `/api/knowledge-bases` | `GovernanceApi.listKnowledgeBases()` | — | `List<KnowledgeBaseDTO>` | governance |
| GET | `/api/preprocess-rules` | `GovernanceApi.listPreprocessRules()` | — | `List<PreprocessRuleDTO>` | governance |
| GET | `/api/audit-rules` | `GovernanceApi.listAuditRules()` | — | `List<AuditRuleDTO>` | governance |
| GET | `/api/acceptance-tickets` | `OpsApi.listAcceptanceTickets()` | — | `List<AcceptanceTicketDTO>` | ops |
| GET | `/api/dashboard/metrics` | `OpsApi.dashboardMetrics()` | — | `DashboardMetricsDTO` | ops |
| GET | `/api/ops/overview` | `OpsApi.overview()` | — | `List<OpsOverviewDTO>` | ops |
| GET | `/api/ops/task-status-counts` | `OpsApi.taskStatusCounts()` | — | `List<TaskStatusCountDTO>` | ops |
| GET | `/api/ops/data-status-counts` | `OpsApi.dataStatusCounts()` | — | `List<DataStatusCountDTO>` | ops |
| POST | `/api/admin/seed` | `AdminApi.seed()` | — | `AdminResultDTO` | admin |
| POST | `/api/admin/reset` | `AdminApi.reset()` | — | `AdminResultDTO` | admin |

#### 8.2.2 scheduler-service（8200）

| 方法 | 路径 | 目标 API 接口 | 请求 DTO | 响应 data 类型 |
|---|---|---|---|---|
| GET | `/health` | `HealthApi.health()` | — | 简单 JSON（豁免 Response） |
| GET | `/api/schedule-jobs` | `ScheduleJobApi.list(String triggerType, String status)` | — | `List<ScheduleJobDTO>` |
| GET | `/api/schedule-jobs/{jobId}` | `ScheduleJobApi.get(String jobId)` | — | `ScheduleJobDTO` |
| POST | `/api/schedule-jobs` | `ScheduleJobApi.create(@RequestBody @Valid CreateScheduleJobDTO)` | `CreateScheduleJobDTO` | `ScheduleJobDTO` |
| POST | `/api/admin/seed` | `AdminApi.seed()` | — | `AdminResultDTO` |
| POST | `/api/admin/reset` | `AdminApi.reset()` | — | `AdminResultDTO` |

#### 8.2.3 agent-service（8100）

| 方法 | 路径 | 目标 API 接口 | 请求 DTO | 响应 data 类型 |
|---|---|---|---|---|
| GET | `/health` | `HealthApi.health()` | — | 简单 JSON（豁免 Response） |
| POST | `/agent/executions` | `AgentExecutionApi.execute(@RequestBody @Valid AgentExecutionRequestDTO)` | `AgentExecutionRequestDTO`（common-contract） | `AgentExecutionResponseDTO` |

### 8.3 关键接口改造说明

**Requirement 创建/更新**：
- 禁止 Controller 里拼 JSON 或捕获异常后吞掉
- `status=ready` 的跨聚合编排（锁定 schema + 生成默认 TaskGroup）必须在 Service 层处理
- schema_locked 冲突：抛 `BizException(ErrorCode.REQ_SCHEMA_LOCKED)`

**WideTable 更新**：
- `WideTableUpdateDTO` 中 schema/scope/indicatorGroups/scheduleRules 必须为强类型（对应 7.4 中的 DTO）

**执行/重试**：
- 每次 execute 操作生成一条 `ExecutionRecord`（由 ExecutionService 负责）
- FetchTask 状态由 ExecutionRecord 完成后回写（应用服务编排）

**Dashboard/Ops 统计**：
- 禁止用 `Map<String, Object>` 承载统计结果
- 必须定义专用 DO（DAO 返回）+ DTO（API 返回）

**Scheduler Facade（backend → scheduler）**：
- 引入 `SchedulerClient`（基础设施层，封装 RestTemplate 调用、超时、错误码映射）
- 调用失败抛 `BizException(ErrorCode.SCHEDULER_UNAVAILABLE)`

---

## 9. 统一响应与前后端兼容策略

### 9.1 前后端兼容迁移策略（双栈并存）

现状前端 `lib/api-client.ts` 多数期望"裸数据数组/对象"。采用以下平滑方案：

- **v1**：`/api/*`（现有路径，暂保持裸数据返回，仅做必要 bugfix）
- **v2**：`/api/v2/*`（新增前缀，全量返回 `Response<T>`）
- 前端通过环境变量切换：`NEXT_PUBLIC_API_VERSION=v1|v2`（默认 `v1`）
- v2 client 统一解包 `response.data`，并处理 `code/message`

**切换里程碑**：
- Phase 1（后端）：双栈并存（v1/v2 同时上线）
- Phase 2（前端）：api-client 实现 v2 解包，默认切换到 `v2`
- Phase 3（下线）：v1 下线或保留为只读兼容层

### 9.2 错误映射规则（强制）

| 触发场景 | 抛出异常 |
|---|---|
| DAO 查不到资源 | `BizException(ErrorCode.XXX_NOT_FOUND)` |
| schema_locked 冲突 | `BizException(ErrorCode.REQ_SCHEMA_LOCKED)` |
| 外部 scheduler 不可用 | `BizException(ErrorCode.SCHEDULER_UNAVAILABLE)` |
| 外部 agent 不可用 | `BizException(ErrorCode.AGENT_UNAVAILABLE)` |
| Token 缺失/无效 | `BizException(ErrorCode.UNAUTHORIZED)` |
| 无权限执行 | `BizException(ErrorCode.FORBIDDEN)` |

---

## 10. MyBatis XML 规范（必须）

### 10.1 基本规则

- Mapper 接口：`XXXMapper`（位于 `dao/<subdomain>/`）
- XML：`mapper/<subdomain>/XXXMapper.xml`
- **每个查询必须有 `<resultMap>`，禁止 `resultType` 直接映射复杂对象**
- 参数必须明确：单参数用 `parameterType`，多参数用 `@Param` + XML 引用
- **禁止 `parameterType="java.lang.Object"` 或 `Map<String,Object>` 参数**

### 10.2 resultMap 示例（含 TypeHandler）

```xml
<resultMap id="WideTableResultMap" type="com.htsc.datafoundry.core.dao.widetable.WideTableDO">
    <id column="id" property="id" jdbcType="VARCHAR"/>
    <result column="requirement_id" property="requirementId" jdbcType="VARCHAR"/>
    <result column="schema_json" property="schemaJson"
            typeHandler="com.htsc.datafoundry.common.core.typehandler.JacksonJsonTypeHandler"/>
    <result column="scope_json" property="scopeJson"
            typeHandler="com.htsc.datafoundry.common.core.typehandler.JacksonJsonTypeHandler"/>
    <result column="status" property="status"
            typeHandler="com.htsc.datafoundry.common.core.typehandler.EnumCodeTypeHandler"/>
    <result column="created_at" property="createdAt" jdbcType="TIMESTAMP"/>
    <result column="updated_at" property="updatedAt" jdbcType="TIMESTAMP"/>
</resultMap>
```

### 10.3 统计/聚合查询对象（强制）

- `/api/dashboard/metrics`、ops 统计等必须定义专用 DO（`DashboardMetricsDO`）+ DTO
- resultMap 中用 `<result column="别名" property="字段名"/>` 显式映射聚合字段

---

## 11. 数据库改造方案

### 11.1 基线选择

- Core 库：以 `db/mysql/backend/002_full_schema.sql` 的 14 张表为**目标基线**（注意 002 含 DROP，不可直接作为迁移脚本，必须拆解为 V1 init 脚本）
- Scheduling 库：以 `db/mysql/scheduler/001_schema.sql` 为基线

### 11.2 迁移工具（Flyway 定稿 + 替代方案）

**V2 定稿：引入 Flyway**（Spring Boot 2.7 原生支持）：

```yaml
# application.yml
spring:
  flyway:
    enabled: true
    baseline-on-migrate: true   # 支持老库升级
    locations: classpath:db/migration/${spring.flyway.table-suffix}
```

**若项目集基础设施层审批 Flyway 引入受阻，替代方案**：
- 使用 `db/mysql/backend/V1__init.sql`、`V2__...sql` 命名的手工版本脚本
- 发布流程中由 DBA/运维在部署前执行对应版本的 SQL 脚本
- 在各服务 README 中维护"当前 DB 版本号"，与代码版本一一对应

两种方案交付物差异：Flyway 方案由 Spring 启动自动执行；手工脚本方案需要发布 SOP 文档约束执行流程，不得遗漏。

### 11.3 Core 库迁移顺序（按外键依赖，14 张表）

```
V1__init.sql 建表顺序（禁止颠倒）：
 1. projects
 2. requirements
 3. wide_tables
 4. collection_batches
 5. wide_table_rows
 6. wide_table_row_snapshots
 7. backfill_requests
 8. task_groups
 9. fetch_tasks
10. retrieval_tasks
11. execution_records
12. knowledge_bases
13. preprocess_rules
14. audit_rules
```

### 11.4 Scheduling 库迁移

```
V1__init.sql：schedule_jobs（1 张表）
V2__schedule_jobs_time_to_datetime.sql（可选）：
    将 started_at/ended_at 从 varchar(64) 迁移为 DATETIME
```

`started_at/ended_at` 迁移脚本需包含老数据转换（`STR_TO_DATE` + 容错默认值）：

```sql
-- 示例
ALTER TABLE schedule_jobs
    ADD COLUMN started_at_new DATETIME NULL,
    ADD COLUMN ended_at_new DATETIME NULL;

UPDATE schedule_jobs
SET started_at_new = STR_TO_DATE(started_at, '%Y-%m-%dT%H:%i:%sZ')
WHERE started_at IS NOT NULL AND started_at != '';

ALTER TABLE schedule_jobs
    DROP COLUMN started_at,
    DROP COLUMN ended_at,
    CHANGE started_at_new started_at DATETIME NULL,
    CHANGE ended_at_new ended_at DATETIME NULL;
```

### 11.5 老库升级策略

- **开发/测试环境**：允许重建库，直接执行 V1 init 脚本
- **生产环境（若存在旧库）**：使用 `baseline-on-migrate=true` + 专项增量迁移脚本（由 DBA 在发布窗口执行）
- **禁止应用运行时 ALTER**：`DemoDataService.ensureSchemaColumns()` 必须在 Phase 1 完成后立即删除（DemoDataService 的 seed/reset 逻辑可保留到 Phase 6，但 schema 漂移逻辑必须最先清除）

### 11.6 关键索引补充建议（全量表）

| 表 | 建议索引 | 原因 |
|---|---|---|
| `requirements` | `idx_project_id(project_id)` | 按项目查询需求列表 |
| `wide_tables` | `idx_requirement_id(requirement_id)` | 按需求查宽表 |
| `wide_table_rows` | `idx_row_binding_key(row_binding_key)` | 定位/去重 |
| `collection_batches` | `idx_wide_table_is_current(wide_table_id, is_current)` | 当前批次快速定位 |
| `task_groups` | `idx_requirement_status(requirement_id, status)` | 任务组列表/筛选 |
| `task_groups` | `idx_wide_table_batch(wide_table_id, batch_id)` | 按批次查询 |
| `fetch_tasks` | `idx_task_group_status(task_group_id, status)` | 任务组内查询 |
| `retrieval_tasks` | `idx_parent_task_id(parent_task_id)` | 按任务聚合检索 |
| `execution_records` | `idx_task_started(task_id, started_at)` | 执行历史 |
| `backfill_requests` | `idx_req_table_status(requirement_id, wide_table_id, status)` | 按需求+状态筛选 |
| `schedule_jobs` | `idx_status_created(status, created_at)` | 按状态+时间筛选 |

---

## 12. 安全与权限控制

### 12.1 受控接口清单（必须鉴权）

**backend-service**（写操作/敏感操作）：
- `POST /api/admin/seed`、`POST /api/admin/reset`
- `PUT /api/requirements/{requirementId}/wide-tables/{wideTableId}`
- `POST /api/requirements/{requirementId}/wide-tables/{wideTableId}/plan`
- `POST /api/task-groups/{taskGroupId}/ensure-tasks`
- `POST /api/task-groups/{taskGroupId}/execute`
- `POST /api/tasks/{taskId}/execute`
- `POST /api/tasks/{taskId}/retry`
- `POST /api/schedule-jobs`

**scheduler-service**：`POST /api/schedule-jobs`、`POST /api/admin/seed`、`POST /api/admin/reset`

**agent-service**：`POST /agent/executions`（外网环境必须受控）

**可放开（只读）**：所有 `GET /api/projects*`、`GET /api/requirements*`、`GET /api/schedule-jobs*`、`GET /api/knowledge-bases`、`GET /api/preprocess-rules`、`GET /api/audit-rules`、`GET /api/ops/*`、`GET /api/dashboard/metrics`、`/health`

### 12.2 最小可落地控制方案

采用"X-DF-Token Header + 环境差异化配置"：

```yaml
# application.yml
datafoundry:
  security:
    mode: off         # off（开发）| token（测试/生产，必须）
    token: ${DF_TOKEN:dev-token}
    admin-token: ${DF_ADMIN_TOKEN:dev-admin-token}
```

实现：`SecurityInterceptor`（`common-core` 提供，三服务复用）
- 匹配受控路径 → 校验 `X-DF-Token` Header → 不通过抛 `BizException(UNAUTHORIZED/FORBIDDEN)`
- Admin 接口需校验 `admin-token`，普通写入接口校验 `token`

### 12.3 最小审计日志（受控写接口必须）

在对应 ServiceImpl 记录 INFO，包含：
- `operator`（来自 Header `X-DF-Operator`，无则记 `unknown`）
- 资源 ID（projectId/requirementId/taskId 等）
- 动作类型（seed/reset/updateSchema/plan/execute/retry/createJob）

---

## 13. 日志规范

每个 ServiceImpl 声明：

```java
private static final Log log = LogFactory.getLog(XxxServiceImpl.class);
```

必须记录 INFO 的关键路径（含关键 ID 参数）：
- 创建需求、更新需求、锁定 schema
- 宽表 schema/scope/indicator 更新
- 计划落地（plan persist）、生成 TaskGroup/FetchTask
- 执行/重试任务（含 operator）
- 创建 ScheduleJob（含 scheduler 响应）

必须记录 ERROR 的场景：
- 外部服务调用失败（scheduler/agent）
- DAO 操作异常（含参数）
- 非预期 RuntimeException

---

## 14. 注释与 JavaDoc 规范

`api` 包的每个接口方法必须提供 JavaDoc：

```java
/**
 * 更新宽表定义（schema/scope/指标组/调度规则等）。
 * <p>schema 已锁定时（Requirement.schema_locked=true）将拒绝变更并返回 409。</p>
 *
 * @param requirementId 需求 ID（路径参数，非空）
 * @param wideTableId   宽表 ID（路径参数，非空）
 * @param dto           宽表更新请求体，schema/scope 等字段为强类型
 * @return Response&lt;WideTableDTO&gt; 更新后的宽表定义
 */
@PutMapping("/api/requirements/{requirementId}/wide-tables/{wideTableId}")
Response<WideTableDTO> update(
    @PathVariable String requirementId,
    @PathVariable String wideTableId,
    @RequestBody @Valid WideTableUpdateDTO dto
);
```

复杂业务逻辑（TaskPlan 生成规则、schema_version 递增策略等）必须在方法体内补充说明"为什么这么做"，不只是"做了什么"。

---

## 15. 迁移实施步骤（6 个 Phase，每阶段可独立运行与回归）

### Phase 1：规范底座（DemoDataService schema 漂移清除）

- 新增 `data-foundry-common-core` 模块
- 实现 `Response<T>`、`ErrorCode`、`BizException`、`GlobalExceptionHandler`、`BeanCopierUtils`
- 各服务引入 common-core，确保编译通过
- **立即清除** `DemoDataService.ensureSchemaColumns()` 的运行时 ALTER 逻辑
- 统一日志 API（全局替换为 `LogFactory.getLog()`）
- 父 POM 依赖版本统一化（子模块去除显式版本）

### Phase 2：DAO 迁移到 MyBatis XML + TypeHandler

- backend：ProjectMapper、RequirementMapper、WideTableMapper、TaskGroupMapper、FetchTaskMapper 全部改为 XML + resultMap
- scheduler：ScheduleJobMapper 改为 XML + resultMap
- 引入 JSON/Enum/Time TypeHandler，DO 字段强类型化
- 完成 `common-contract` 内容迁移（按第 4.2 节迁移表执行）

### Phase 3：Service 层接口化 + Controller 退耦

- Controller 只做参数校验（`@Valid`）+ 调用 Service，禁止直接调 Mapper
- 补齐 Service 接口/实现（全部"接口 + impl"结构）
- DO/DTO 转换统一走 BeanCopierUtils + Assembler（按第 7 节策略）
- 按业务规则归属表（第 2.3 节）归位各业务规则到对应 Service/Domain Service
- 消除 Controller 中的 `ResponseStatusException` 和 try/catch 吞异常

### Phase 4：接口契约稳定 + 前后端联调回归

- 新增 `/api/v2/*` 接口（全量返回 `Response<T>`），保留 `/api/*` v1 不动
- 前端新增 v2 client 解包逻辑（`NEXT_PUBLIC_API_VERSION` 切换能力）
- **更新前端 Vitest mock 数据为 v2 格式**（`{code:0, message:"...", data:{...}}`）
- 回归关键页面流程：projects → requirement → plan → tasks → execute → scheduling/ops

### Phase 5：数据库脚本版本化 + Flyway/手工脚本上线

- 以 `002_full_schema.sql` 为蓝本，生成 `V1__init.sql`（无 DROP，CREATE TABLE IF NOT EXISTS）
- 按第 11.3 节顺序验证 14 张表可正常初始化
- scheduler `V2__schedule_jobs_time_to_datetime.sql`（时间字段规范化）
- 启用 Flyway（或发布 SOP 文档），保证 dev/test/prod 环境 schema 一致

### Phase 6：安全开关 + 测试补齐 + 前端切 v2

- SecurityInterceptor 上线（测试环境 `mode: token`，生产必须）
- Service 单测：核心流程正常/异常覆盖（Mockito Mock DAO）
- 关键多模块集成测试（requirement → plan → execute 全链路）
- 前端默认切换到 `NEXT_PUBLIC_API_VERSION=v2`
- v1 接口评估下线计划（或保留只读兼容层）

---

## 16. 交付物清单（完整版）

### 16.1 代码交付物

**common-core**：
- `Response<T>`
- `ErrorCode`（枚举 + 注释文档）
- `BizException`
- `GlobalExceptionHandler`
- `BeanCopierUtils`
- TypeHandler：`JacksonJsonTypeHandler<T>`、`EnumCodeTypeHandler<E>`、时间类型 Handler
- `SecurityInterceptor`（可配置 mode: off|token）

**三服务（backend/scheduler/agent）**：
- 领域化包结构落地（`api/api.impl/dao/dto/domain/service/service.impl` + 子域）
- v2 API（`/api/v2/*`）全覆盖，全量返回 `Response<T>`
- MyBatis XML + resultMap 全覆盖（禁注解 SQL）
- Service 接口 + Impl 全覆盖（Controller 不直连 Mapper）
- 关键路径日志（INFO）+ 受控接口审计日志
- api 包 JavaDoc 全覆盖

### 16.2 数据库交付物

- **Core 库**：`V1__init.sql`（14 张表，无 DROP）、后续 `V2__...sql` 增量
- **Scheduling 库**：`V1__init.sql`（schedule_jobs）、可选 `V2__schedule_jobs_time_to_datetime.sql`
- 删除/禁用 `DemoDataService` 中的 schema 漂移代码
- 索引补充脚本（按第 11.6 节清单）

### 16.3 前端交付物（完整版，新增补充）

- `NEXT_PUBLIC_API_VERSION=v1|v2` 环境变量切换能力
- `lib/api-client.ts` v2 模式：所有接口调用适配 `response.data` 解包，统一处理 `code/message`
- 错误处理统一：`code !== 0` 时解析 `message` 展示错误提示（替换原有散落的错误处理）
- Vitest 单测 mock 数据更新：将 mock 返回结构从裸数据改为 `Response<T>` 格式
- `app/api/[...path]/route.ts` 代理层确认 v2 路径 `/api/v2/*` 正确透传

### 16.4 文档交付物

- 本文档（整合版改造方案）
- ErrorCode 枚举文档（code 含义说明，供前端/联调参考）
- DB 迁移操作手册（Flyway 模式 or 手工脚本模式，含回滚方案）
- 安全配置说明（`X-DF-Token` 使用方式，各环境配置模板）

---

## 17. 风险与注意事项

| 风险点 | 影响 | 缓解措施 |
|---|---|---|
| `/api/v2/*` 切换时前端 mock 未同步更新 | Phase 4 联调失败 | Phase 4 启动前必须先更新 Vitest mock 数据（见 16.3） |
| MyBatis 注解转 XML 后字段映射错误（snake_case/camelCase） | 数据错误/NPE | Phase 2 完成后对每个 Mapper 做 CRUD 单测回归 |
| DemoDataService schema 漂移未及时清除 | Flyway 与运行时 alter 冲突导致启动失败 | Phase 1 最高优先级任务：先删漂移逻辑，再引入 Flyway |
| schedule_jobs 时间字段迁移时脏数据 | 迁移脚本报错 | 脚本需加 `WHERE started_at IS NOT NULL AND LENGTH(started_at)>0`，容错后 UPDATE |
| 循环依赖导致 Spring 启动失败 | Phase 3 阻塞 | 优先重构依赖关系，禁止用 @Lazy/字段注入规避（见第 6.2 节） |
| 项目集 Flyway 引入审批受阻 | Phase 5 阻塞 | 提前确认，有替代方案（手工版本脚本 + 发布 SOP，见第 11.2 节） |
| api 接口注解重复声明 | Spring 路径二义性 | api.impl 实现类 code review 必须检查是否重复声明了路径注解 |
| FetchTask.status 回写逻辑遗漏 | 执行后任务状态不更新 | Phase 3 中必须实现 Execution Application Service 中的回写编排（见第 2.2 节 E） |
