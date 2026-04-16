# datafoundry_java 改造执行计划（文件级，不立即执行变更）

> 生成时间：2026-04-16（Asia/Shanghai）  
> 依据：`docs/datafoundry_java_改造方案_整合版.md`  
> 输出目标：把“迁移与实施步骤”细化到**每个代码文件如何修改/新增**，待评审确认后再按计划逐步落地。

---

## 0. 准备与边界确认（不改代码，只确认）

1) v2 根包：采用 `com.htsc.datafoundry.*`（v1 保留 `com.huatai.datafoundry.*` 直到下线）  
2) v2 API 前缀：`/api/v2/*`，并全量返回 `Response<T>`；`/health` 按整合版豁免（保持当前 `{status:"ok"}`）  
3) 依赖注入：允许构造器注入，构造器加 `@Autowired`（整合版定稿）  
4) 数据库迁移：以 Flyway 为主；`db/mysql/*` 继续保留作为“人工初始化/参考”  
5) 权限：最小落地 `X-DF-Token`，开发环境 `mode=off`，测试/生产 `mode=token`

---

## Phase 1：common-core 基座 + 错误码/Response/异常/转换/安全拦截器

### 1.1 Maven 聚合与依赖管理

- 修改 `E:\huatai\datafoundry_java\pom.xml`
  - 新增 `<module>data-foundry-common-core</module>`
  - 收敛版本到 `dependencyManagement`，子模块禁止显式版本（重点：MyBatis starter）
- 新增 `E:\huatai\datafoundry_java\data-foundry-common-core\pom.xml`
- 修改以下模块 POM，引入 `data-foundry-common-core`（新增依赖，不改业务代码）
  - `E:\huatai\datafoundry_java\data-foundry-backend-service\pom.xml`
  - `E:\huatai\datafoundry_java\data-foundry-scheduler-service\pom.xml`
  - `E:\huatai\datafoundry_java\data-foundry-agent-service\pom.xml`
  - `E:\huatai\datafoundry_java\data-foundry-common-contract\pom.xml`（若 contract 需要复用 Response/错误码/DTO 约束）

### 1.2 common-core 新增代码文件（全部新增）

目录：`E:\huatai\datafoundry_java\data-foundry-common-core\src\main\java\com\htsc\datafoundry\common\core\`

- `response\Response.java`：`Response<T>` + `success/failure`
- `error\ErrorCode.java`：错误码枚举（通用段 + 业务细分）
- `error\BizException.java`：业务异常
- `error\GlobalExceptionHandler.java`：`@RestControllerAdvice`，统一错误响应
- `convert\BeanCopierUtils.java`：BeanCopier 缓存与 copy/copyList
- `security\SecurityMode.java`：`OFF/TOKEN`
- `security\SecurityProperties.java`：`datafoundry.security.*`
- `security\SecurityInterceptor.java`：Header `X-DF-Token` 校验 + 受控接口清单匹配
- `security\SecurityWebMvcConfig.java`：注册拦截器
- `typehandler\JacksonJsonTypeHandler.java`：JSON 强类型 TypeHandler（Jackson）
- `typehandler\EnumCodeTypeHandler.java`：枚举 code 映射 TypeHandler
- `typehandler\IsoInstantStringTypeHandler.java`：ISO8601 字符串时间映射（若 scheduler 暂保留 varchar 时间）

### 1.3 必须的现有代码最小改动：去运行时 schema 漂移

- 修改 `E:\huatai\datafoundry_java\data-foundry-backend-service\src\main\java\com\huatai\datafoundry\backend\service\DemoDataService.java`
  - 删除/禁用 `ensureSchemaColumns()` 及所有 `alter table ...` 逻辑
  - `seed()` 仅做数据 upsert；若表缺失则让异常上抛（后续由 v2 全局异常处理接管；v1 可先保持返回 ok=false 的模式，但不再隐式变更 schema）

---

## Phase 2：MyBatis 注解 -> XML + resultMap + TypeHandler（v2 优先，v1 暂不动）

> 策略：v2 的 DAO 全走 XML；v1 仍可暂时使用注解 Mapper，待 v2 切换完成再清理 v1。

### 2.1 backend-service：新增 v2 DO/Mapper/XML（优先覆盖当前业务用到的表）

新增（优先落地）：

- `projects`
  - `E:\huatai\datafoundry_java\data-foundry-backend-service\src\main\java\com\htsc\datafoundry\core\domain\project\do\ProjectDO.java`
  - `E:\huatai\datafoundry_java\data-foundry-backend-service\src\main\java\com\htsc\datafoundry\core\dao\project\ProjectMapper.java`
  - `E:\huatai\datafoundry_java\data-foundry-backend-service\src\main\resources\mapper\project\ProjectMapper.xml`
- `requirements`
  - `...\core\domain\requirement\do\RequirementDO.java`
  - `...\core\dao\requirement\RequirementMapper.java`
  - `...\resources\mapper\requirement\RequirementMapper.xml`
- `wide_tables`
  - `...\core\domain\widetable\do\WideTableDO.java`
  - `...\core\dao\widetable\WideTableMapper.java`
  - `...\resources\mapper\widetable\WideTableMapper.xml`
- `task_groups`
  - `...\core\domain\plan\do\TaskGroupDO.java`
  - `...\core\dao\plan\TaskGroupMapper.java`
  - `...\resources\mapper\plan\TaskGroupMapper.xml`
- `fetch_tasks`
  - `...\core\domain\execution\do\FetchTaskDO.java`
  - `...\core\dao\execution\FetchTaskMapper.java`
  - `...\resources\mapper\execution\FetchTaskMapper.xml`

新增（骨架补齐，不遗漏 14 表要求：先提供 DO+Mapper+XML 的只读查询能力）：

- `wide_table_rows`
- `wide_table_row_snapshots`
- `backfill_requests`
- `collection_batches`
- `retrieval_tasks`
- `execution_records`
- `knowledge_bases`
- `preprocess_rules`
- `audit_rules`

每张表新增 3 类文件：`XXXDO.java`、`XXXMapper.java`、`XXXMapper.xml`。

### 2.2 scheduler-service：新增 v2 DO/Mapper/XML

- `E:\huatai\datafoundry_java\data-foundry-scheduler-service\src\main\java\com\htsc\datafoundry\scheduling\domain\do\ScheduleJobDO.java`
- `E:\huatai\datafoundry_java\data-foundry-scheduler-service\src\main\java\com\htsc\datafoundry\scheduling\dao\ScheduleJobMapper.java`
- `E:\huatai\datafoundry_java\data-foundry-scheduler-service\src\main\resources\mapper\ScheduleJobMapper.xml`

### 2.3 MyBatis 配置落地（application.yml）

- 修改 `E:\huatai\datafoundry_java\data-foundry-backend-service\src\main\resources\application.yml`
  - 增加：
    - `mybatis.mapper-locations: classpath*:mapper/**/*.xml`
    - `mybatis.type-handlers-package: com.htsc.datafoundry.common.core.typehandler`
- 修改 `E:\huatai\datafoundry_java\data-foundry-scheduler-service\src\main\resources\application.yml`
  - 同上

---

## Phase 3：v2 DDD 分层落地（API 接口定义 + impl + Service 接口/实现 + Assembler/DTO）

### 3.1 backend-service：v2 DTO/Assembler/枚举（新增为主）

新增 DTO（按子域）：

- `E:\huatai\datafoundry_java\data-foundry-backend-service\src\main\java\com\htsc\datafoundry\core\dto\common\OkDTO.java`
- `...\core\dto\common\HealthDTO.java`
- `...\core\dto\project\ProjectDTO.java`
- `...\core\dto\requirement\RequirementDTO.java`
- `...\core\dto\requirement\RequirementCreateDTO.java`
- `...\core\dto\requirement\RequirementUpdateDTO.java`
- `...\core\dto\widetable\WideTableDTO.java`
- `...\core\dto\widetable\WideTableUpdateDTO.java`
- `...\core\dto\plan\WideTablePreviewPersistDTO.java`
- `...\core\dto\plan\WideTablePlanPersistDTO.java`
- `...\core\dto\plan\TaskGroupDTO.java`
- `...\core\dto\execution\FetchTaskDTO.java`
- `...\core\dto\execution\ExecuteTaskGroupDTO.java`
- `...\core\dto\execution\ExecutionResultDTO.java`
- `...\core\dto\scheduling\ScheduleJobDTO.java`
- `...\core\dto\scheduling\CreateScheduleJobDTO.java`
- `...\core\dto\governance\KnowledgeBaseDTO.java`
- `...\core\dto\governance\PreprocessRuleDTO.java`
- `...\core\dto\governance\AuditRuleDTO.java`
- `...\core\dto\acceptance\AcceptanceTicketDTO.java`（允许先空实现，但 DTO 必须存在）
- `...\core\dto\ops\DashboardMetricsDTO.java`
- `...\core\dto\ops\OpsOverviewDTO.java`
- `...\core\dto\ops\TaskStatusCountDTO.java`
- `...\core\dto\ops\DataStatusCountDTO.java`
- JSON 强类型 DTO（禁止 Object/Map 入参）：
  - `...\core\dto\project\DataSourcePolicyDTO.java`
  - `...\core\dto\requirement\CollectionPolicyDTO.java`
  - `...\core\dto\requirement\ProcessingRuleDraftsDTO.java`
  - `...\core\dto\widetable\WideTableSchemaDTO.java`
  - `...\core\dto\widetable\WideTableScopeDTO.java`
  - `...\core\dto\widetable\IndicatorGroupDTO.java`
  - `...\core\dto\widetable\ScheduleRuleDTO.java`
  - `...\core\dto\execution\NarrowIndicatorRowDTO.java`

新增 Assembler（复杂转换）：

- `...\core\domain\project\assembler\ProjectAssembler.java`
- `...\core\domain\requirement\assembler\RequirementAssembler.java`
- `...\core\domain\widetable\assembler\WideTableAssembler.java`
- `...\core\domain\plan\assembler\TaskGroupAssembler.java`
- `...\core\domain\execution\assembler\FetchTaskAssembler.java`

### 3.2 backend-service：v2 Service 接口/实现（新增为主）

- `...\core\service\project\ProjectService.java`
- `...\core\service\project\impl\ProjectServiceImpl.java`
- `...\core\service\requirement\RequirementService.java`
- `...\core\service\requirement\impl\RequirementServiceImpl.java`
- `...\core\service\widetable\WideTableService.java`
- `...\core\service\widetable\impl\WideTableServiceImpl.java`
- `...\core\service\plan\PlanService.java`
- `...\core\service\plan\impl\PlanServiceImpl.java`（迁移 v1 `TaskPlanService` 的生成逻辑）
- `...\core\service\execution\ExecutionService.java`
- `...\core\service\execution\impl\ExecutionServiceImpl.java`（迁移 v1 `TaskExecutionController` 的状态流转与 ensure tasks）
- `...\core\service\governance\GovernanceService.java`
- `...\core\service\governance\impl\GovernanceServiceImpl.java`
- `...\core\service\ops\OpsService.java`
- `...\core\service\ops\impl\OpsServiceImpl.java`
- `...\core\service\admin\AdminService.java`
- `...\core\service\admin\impl\AdminServiceImpl.java`

### 3.3 backend-service：外部系统 Client（新增）

- 新增 v2 RestTemplate 配置（不改 v1 配置文件）：
  - `E:\huatai\datafoundry_java\data-foundry-backend-service\src\main\java\com\htsc\datafoundry\core\config\RestClientConfig.java`
- 新增 SchedulerClient：
  - `...\core\domain\scheduling\client\SchedulerClient.java`
  - `...\core\domain\scheduling\client\impl\SchedulerClientImpl.java`

### 3.4 backend-service：v2 API 接口定义 + impl（新增为主）

按整合版约束：**注解写在 api 接口**，impl 仅 `@RestController` 实现接口（避免路径注解重复）。

新增（与整合版接口矩阵逐条对齐，不遗漏）：

- `...\core\api\health\HealthApi.java` + `...\core\api\impl\health\HealthApiImpl.java`
- `...\core\api\project\ProjectApi.java` + `...\core\api\impl\project\ProjectApiImpl.java`
- `...\core\api\requirement\RequirementApi.java` + `...\core\api\impl\requirement\RequirementApiImpl.java`
- `...\core\api\widetable\WideTableApi.java` + `...\core\api\impl\widetable\WideTableApiImpl.java`
- `...\core\api\plan\WideTablePlanApi.java` + `...\core\api\impl\plan\WideTablePlanApiImpl.java`
- `...\core\api\task\TaskQueryApi.java` + `...\core\api\impl\task\TaskQueryApiImpl.java`
- `...\core\api\execution\ExecutionApi.java` + `...\core\api\impl\execution\ExecutionApiImpl.java`
- `...\core\api\scheduling\ScheduleJobApi.java` + `...\core\api\impl\scheduling\ScheduleJobApiImpl.java`
- `...\core\api\governance\GovernanceApi.java` + `...\core\api\impl\governance\GovernanceApiImpl.java`
- `...\core\api\ops\OpsApi.java` + `...\core\api\impl\ops\OpsApiImpl.java`
- `...\core\api\admin\AdminApi.java` + `...\core\api\impl\admin\AdminApiImpl.java`

### 3.5 scheduler-service：v2 Service + API（新增为主）

- Service：
  - `E:\huatai\datafoundry_java\data-foundry-scheduler-service\src\main\java\com\htsc\datafoundry\scheduling\service\ScheduleJobService.java`
  - `...\service\impl\ScheduleJobServiceImpl.java`
  - `...\service\AdminService.java` + impl
- API：
  - `...\api\HealthApi.java` + impl
  - `...\api\ScheduleJobApi.java` + impl
  - `...\api\AdminApi.java` + impl

### 3.6 agent-service：v2 Service + API（新增为主）

- Service：
  - `E:\huatai\datafoundry_java\data-foundry-agent-service\src\main\java\com\htsc\datafoundry\agent\service\AgentExecutionService.java`
  - `...\service\impl\AgentExecutionServiceImpl.java`（可内部复用现有 `MockAgentService`）
- API：
  - `...\api\HealthApi.java` + impl
  - `...\api\AgentExecutionApi.java` + impl

---

## Phase 4：v2 接口联调 + 前端切换（按整合版）

### 4.1 前端 v2 开关与 Response 解包

- 修改 `E:\huatai\datafoundry_java\data-foundry-frontend\.env.local`
  - 新增：`NEXT_PUBLIC_API_VERSION=v1|v2`
- 修改 `E:\huatai\datafoundry_java\data-foundry-frontend\lib\api-client.ts`
  - 新增统一请求封装：v2 模式解包 `{code,message,data}`，`code!=0` 统一抛错
- 确认代理层透传无需改：
  - `E:\huatai\datafoundry_java\data-foundry-frontend\app\api\[...path]\route.ts`

### 4.2 前端 Vitest mock 更新

- 修改 `E:\huatai\datafoundry_java\data-foundry-frontend\tests\*.test.ts`
  - 将 mock 返回结构从裸数据升级为 `Response<T>` 格式

---

## Phase 5：数据库脚本版本化 + Flyway 上线（按整合版）

### 5.1 引入 Flyway 依赖

- 修改 `E:\huatai\datafoundry_java\data-foundry-backend-service\pom.xml`：加入 `org.flywaydb:flyway-core`
- 修改 `E:\huatai\datafoundry_java\data-foundry-scheduler-service\pom.xml`：加入 `org.flywaydb:flyway-core`

### 5.2 backend-service Flyway 迁移脚本（14 表不遗漏）

- 新增 `E:\huatai\datafoundry_java\data-foundry-backend-service\src\main\resources\db\migration\backend\V1__init.sql`
  - 来源：`E:\huatai\datafoundry_java\db\mysql\backend\002_full_schema.sql`
  - 约束：去掉 DROP，使用 `CREATE TABLE IF NOT EXISTS`，补齐索引

### 5.3 scheduler-service Flyway 迁移脚本

- 新增 `E:\huatai\datafoundry_java\data-foundry-scheduler-service\src\main\resources\db\migration\scheduler\V1__init.sql`
  - 来源：`E:\huatai\datafoundry_java\db\mysql\scheduler\001_schema.sql`
- 可选新增：`...\V2__schedule_jobs_time_to_datetime.sql`（若决定时间字段迁移为 DATETIME）

### 5.4 Flyway 配置

- 修改 `E:\huatai\datafoundry_java\data-foundry-backend-service\src\main\resources\application.yml`
  - 增加 `spring.flyway.*`（enabled/locations/baseline-on-migrate 等）
- 修改 `E:\huatai\datafoundry_java\data-foundry-scheduler-service\src\main\resources\application.yml`
  - 同上

---

## Phase 6：安全开关 + 测试补齐 + v2 默认

### 6.1 三服务接入 SecurityInterceptor（配置化）

> 依赖 `common-core` 的 `SecurityInterceptor`。

- backend-service 新增：
  - `E:\huatai\datafoundry_java\data-foundry-backend-service\src\main\java\com\htsc\datafoundry\core\config\SecurityConfig.java`
- scheduler-service 新增：
  - `E:\huatai\datafoundry_java\data-foundry-scheduler-service\src\main\java\com\htsc\datafoundry\scheduling\config\SecurityConfig.java`
- agent-service 新增：
  - `E:\huatai\datafoundry_java\data-foundry-agent-service\src\main\java\com\htsc\datafoundry\agent\config\SecurityConfig.java`
- 修改各自 `application.yml`：增加 `datafoundry.security.mode/token`

### 6.2 Service 单测（新增）

backend-service：

- `E:\huatai\datafoundry_java\data-foundry-backend-service\src\test\java\com\htsc\datafoundry\core\service\requirement\RequirementServiceImplTest.java`
- `...\core\service\plan\PlanServiceImplTest.java`
- `...\core\service\execution\ExecutionServiceImplTest.java`

scheduler-service：

- `E:\huatai\datafoundry_java\data-foundry-scheduler-service\src\test\java\com\htsc\datafoundry\scheduling\service\ScheduleJobServiceImplTest.java`

agent-service：

- `E:\huatai\datafoundry_java\data-foundry-agent-service\src\test\java\com\htsc\datafoundry\agent\service\AgentExecutionServiceImplTest.java`

---

## Phase 7（收尾，可选）：下线 v1 / 清理旧包

> 在前端默认 v2 且验证稳定后执行，建议单独评审。

backend-service（v1 清理目标）：

- `E:\huatai\datafoundry_java\data-foundry-backend-service\src\main\java\com\huatai\datafoundry\backend\web\*.java`
- `E:\huatai\datafoundry_java\data-foundry-backend-service\src\main\java\com\huatai\datafoundry\backend\persistence\*.java`
- `E:\huatai\datafoundry_java\data-foundry-backend-service\src\main\java\com\huatai\datafoundry\backend\service\*.java`
- `E:\huatai\datafoundry_java\data-foundry-backend-service\src\main\java\com\huatai\datafoundry\backend\config\*.java`

scheduler-service（v1 清理目标）：

- `E:\huatai\datafoundry_java\data-foundry-scheduler-service\src\main\java\com\huatai\datafoundry\scheduler\**`

agent-service（v1 清理目标）：

- `E:\huatai\datafoundry_java\data-foundry-agent-service\src\main\java\com\huatai\datafoundry\agent\**`

---

## 待确认的关键决策点（确认后再执行）

1) v2 是否必须先全量覆盖接口矩阵再切前端，还是允许先覆盖核心链路  
2) `/health` 是否豁免 `Response<T>`  
3) scheduler `schedule_jobs.started_at/ended_at` 是否本次迁移为 `DATETIME`  
4) 是否接受 v1 保留不动、v2 并行新增的方式（计划默认如此）  
5) Flyway 是否允许引入到项目集发布流程  
6) 权限是否用 `X-DF-Token`（最小方案）还是复用已有网关鉴权

