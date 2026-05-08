# DDD分层架构与数据流详解

> 本文档详细讲解Data Foundry项目中TaskGroup数据查询的完整链路和DDD分层架构设计。

---

## 1. 数据查询完整链路

### 1.1 完整数据流图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           前端页面 (CollectionTasksPage)                      │
│  - app/collection-tasks/page.tsx                                            │
│  - 调用 fetchTaskGroups(projectId, requirementId)                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ↓ HTTP请求
┌─────────────────────────────────────────────────────────────────────────────┐
│                        前端API客户端 (api-client.ts)                         │
│  - async function fetchTaskGroups(projectId, requirementId)                │
│  - apiGet(`/api/projects/${projectId}/requirements/${requirementId}/...`)  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                      后端Controller层 (Controller)                           │
│  - RequirementTaskLegacyController                                          │
│  - @GetMapping("/task-groups")                                              │
│  - @GetMapping("/tasks")                                                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                    后端Application层 (AppService)                            │
│  - RequirementQueryService                                                  │
│  - listTaskGroups(projectId, requirementId)                                 │
│  - listFetchTasks(projectId, requirementId)                                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                      后端Domain层 (Repository)                               │
│  - TaskGroupRepository (接口)                                               │
│  - MybatisTaskGroupRepository (实现)                                        │
│  - FetchTaskRepository (接口)                                               │
│  - MybatisFetchTaskRepository (实现)                                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                     后端Infrastructure层 (Mapper)                            │
│  - TaskGroupMapper (MyBatis接口)                                            │
│  - FetchTaskMapper (MyBatis接口)                                            │
│  - @Select注解定义SQL                                                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Record层 (数据库记录实体)                               │
│  - TaskGroupRecord                                                          │
│  - FetchTaskRecord                                                          │
│  - 与数据库表结构一一对应                                                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                          数据库层 (MySQL)                                    │
│  - task_groups 表                                                           │
│  - fetch_tasks 表                                                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 TaskGroup数据查询详细流程

#### 步骤1: 前端发起请求

**文件**: `data-foundry-frontend/app/collection-tasks/page.tsx`

```typescript
const tgArrays = await Promise.all(
  ps.flatMap((p) => reqs.filter((r) => r.projectId === p.id)
    .map((r) => fetchTaskGroups(p.id, r.id)))
);
setTaskGroups(tgArrays.flat());
```

#### 步骤2: 前端API客户端

**文件**: `data-foundry-frontend/lib/api-client.ts`

```typescript
export async function fetchTaskGroups(
  projectId: string,
  requirementId: string,
): Promise<TaskGroup[]> {
  const raw = await apiGet<any[]>(
    `/api/projects/${projectId}/requirements/${requirementId}/task-groups`,
  );
  return raw.map(mapTaskGroup);
}
```

#### 步骤3: Controller层

**文件**: `RequirementTaskLegacyController.java`

```java
@RestController
@RequestMapping("/api/projects/{projectId}/requirements/{requirementId}")
public class RequirementTaskLegacyController {
  
  @GetMapping("/task-groups")
  public List<TaskGroupReadDto> listTaskGroups(
      @PathVariable("projectId") String projectId,
      @PathVariable("requirementId") String requirementId) {
    return requirementQueryService.listTaskGroups(projectId, requirementId);
  }
}
```

#### 步骤4: Application层

**文件**: `RequirementQueryService.java`

```java
public List<TaskGroupReadDto> listTaskGroups(String projectId, String requirementId) {
  assertRequirementExists(projectId, requirementId);
  List<TaskGroup> records = taskGroupRepository.listByRequirement(requirementId);
  List<TaskGroupReadDto> out = new ArrayList<TaskGroupReadDto>();
  for (TaskGroup record : records) {
    if (record == null) continue;
    TaskGroupReadDto dto = new TaskGroupReadDto();
    dto.setId(record.getId());
    dto.setSortOrder(record.getSortOrder());
    dto.setRequirementId(record.getRequirementId());
    dto.setWideTableId(record.getWideTableId());
    dto.setBatchId(record.getBatchId());
    dto.setBusinessDate(record.getBusinessDate());
    dto.setSourceType(record.getSourceType());
    dto.setStatus(record.getStatus());
    dto.setScheduleRuleId(record.getScheduleRuleId());
    dto.setBackfillRequestId(record.getBackfillRequestId());
    dto.setPlanVersion(record.getPlanVersion());
    dto.setGroupKind(record.getGroupKind());
    dto.setPartitionType(record.getPartitionType());
    dto.setPartitionKey(record.getPartitionKey());
    dto.setPartitionLabel(record.getPartitionLabel());
    dto.setTotalTasks(record.getTotalTasks());
    dto.setCompletedTasks(record.getCompletedTasks());
    dto.setFailedTasks(record.getFailedTasks());
    dto.setTriggeredBy(record.getTriggeredBy());
    dto.setCreatedAt(record.getCreatedAt());
    dto.setUpdatedAt(record.getUpdatedAt());
    out.add(dto);
  }
  return out;
}
```

#### 步骤5: Domain层 - Repository接口

**文件**: `TaskGroupRepository.java`

```java
public interface TaskGroupRepository {
  List<TaskGroup> listByRequirement(String requirementId);
}
```

#### 步骤6: Domain层 - Repository实现

**文件**: `MybatisTaskGroupRepository.java`

```java
@Repository
public class MybatisTaskGroupRepository implements TaskGroupRepository {
  
  @Override
  public List<TaskGroup> listByRequirement(String requirementId) {
    List<TaskGroupRecord> records = taskGroupMapper.listByRequirement(requirementId);
    return toDomainList(records);
  }
  
  private static List<TaskGroup> toDomainList(List<TaskGroupRecord> records) {
    if (records == null) return new ArrayList<TaskGroup>();
    List<TaskGroup> out = new ArrayList<TaskGroup>(records.size());
    for (TaskGroupRecord record : records) {
      if (record == null) continue;
      out.add(toDomain(record));
    }
    return out;
  }
  
  private static TaskGroup toDomain(TaskGroupRecord record) {
    TaskGroup tg = new TaskGroup();
    tg.setId(record.getId());
    tg.setSortOrder(record.getSortOrder());
    tg.setRequirementId(record.getRequirementId());
    tg.setWideTableId(record.getWideTableId());
    tg.setBatchId(record.getBatchId());
    tg.setBusinessDate(record.getBusinessDate());
    tg.setSourceType(record.getSourceType());
    tg.setStatus(record.getStatus());
    tg.setScheduleRuleId(record.getScheduleRuleId());
    tg.setBackfillRequestId(record.getBackfillRequestId());
    tg.setPlanVersion(record.getPlanVersion());
    tg.setGroupKind(record.getGroupKind());
    tg.setPartitionType(record.getPartitionType());
    tg.setPartitionKey(record.getPartitionKey());
    tg.setPartitionLabel(record.getPartitionLabel());
    tg.setTotalTasks(record.getTotalTasks());
    tg.setCompletedTasks(record.getCompletedTasks());
    tg.setFailedTasks(record.getFailedTasks());
    tg.setTriggeredBy(record.getTriggeredBy());
    tg.setCreatedAt(record.getCreatedAt());
    tg.setUpdatedAt(record.getUpdatedAt());
    return tg;
  }
}
```

#### 步骤7: Infrastructure层 - Mapper接口

**文件**: `TaskGroupMapper.java`

```java
@Mapper
public interface TaskGroupMapper {
  
  @Select(
      "select "
          + "id, sort_order, requirement_id, wide_table_id, batch_id, business_date, source_type, status, "
          + "schedule_rule_id, backfill_request_id, plan_version, group_kind, partition_type, partition_key, "
          + "partition_label, total_tasks, completed_tasks, failed_tasks, triggered_by, created_at, updated_at "
          + "from task_groups "
          + "where requirement_id = #{requirementId} "
          + "order by sort_order asc")
  List<TaskGroupRecord> listByRequirement(@Param("requirementId") String requirementId);
}
```

#### 步骤8: Record层 - 数据库记录实体

**文件**: `TaskGroupRecord.java`

```java
public class TaskGroupRecord {
  private String id;
  private Integer sortOrder;
  private String requirementId;
  private String wideTableId;
  private String batchId;
  private String businessDate;
  private String sourceType;
  private String status;
  private String scheduleRuleId;
  private String backfillRequestId;
  private Integer planVersion;
  private String groupKind;
  private String partitionType;
  private String partitionKey;
  private String partitionLabel;
  private Integer totalTasks;
  private Integer completedTasks;
  private Integer failedTasks;
  private String triggeredBy;
  private LocalDateTime createdAt;
  private LocalDateTime updatedAt;
  
  // getter和setter方法...
}
```

#### 步骤9: 数据库层

**文件**: `db/mysql/backend/001_schema.sql`

```sql
CREATE TABLE IF NOT EXISTS task_groups (
  id                 VARCHAR(64)  NOT NULL PRIMARY KEY,
  sort_order          INT          NOT NULL DEFAULT 0,
  requirement_id      VARCHAR(64)  NOT NULL,
  wide_table_id       VARCHAR(64)  NOT NULL,
  batch_id            VARCHAR(64)  NULL,
  business_date       VARCHAR(32)  NULL,
  source_type         VARCHAR(32)  NULL,
  status              VARCHAR(32)  NOT NULL DEFAULT 'pending',
  schedule_rule_id    VARCHAR(64)  NULL,
  backfill_request_id VARCHAR(64)  NULL,
  plan_version        INT          NOT NULL DEFAULT 1,
  group_kind          VARCHAR(32)  NULL,
  partition_type      VARCHAR(32)  NULL,
  partition_key       VARCHAR(255) NULL,
  partition_label     VARCHAR(255) NULL,
  total_tasks         INT          NOT NULL DEFAULT 0,
  completed_tasks     INT          NOT NULL DEFAULT 0,
  failed_tasks        INT          NOT NULL DEFAULT 0,
  triggered_by        VARCHAR(64)  NULL,
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_tg_requirement_id (requirement_id),
  INDEX idx_tg_requirement_sort (requirement_id, sort_order),
  INDEX idx_tg_requirement_wide_table_sort (requirement_id, wide_table_id, sort_order),
  INDEX idx_tg_wide_table_id (wide_table_id),
  INDEX idx_tg_batch_id (batch_id),
  INDEX idx_tg_business_date (business_date),
  INDEX idx_tg_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

## 2. DDD分层架构详解

### 2.1 四层架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                    interfaces (接口层)                        │
│  - Controller: 处理HTTP请求/响应                            │
│  - DTO: 数据传输对象                                         │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    application (应用层)                       │
│  - AppService: 用例编排、事务边界                            │
│  - Command/Query: 输入参数                                   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                      domain (领域层)                         │
│  - Model: 聚合/实体/值对象                                   │
│  - Service: 领域服务                                         │
│  - Repository: 领域端口接口                                  │
│  - Event: 领域事件                                           │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                 infrastructure (基础设施层)                   │
│  - Mapper/Record: MyBatis数据访问                            │
│  - RepositoryImpl: 领域端口实现                              │
│  - Client: 外部服务调用                                      │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 各层详细职责

#### 2.2.1 interfaces层（接口层/表现层）

**职责**: 处理HTTP入站请求，是系统的入口

**核心组件**:
- **Controller**: 接收HTTP请求，调用Application层
- **DTO**: 定义请求/响应的数据结构
- **Assemblers**: DTO与Domain Model之间的转换器

**约束**:
- 只能依赖`application`层
- **禁止**直接注入MyBatis的`Mapper/Record`
- 不包含业务逻辑，只做参数解析和响应封装

**示例**: `RequirementFacadeController`

```java
@RestController
@RequestMapping("/api/requirements")
public class RequirementFacadeController {
  private final RequirementAppService requirementAppService;
  private final RequirementQueryService requirementQueryService;

  public RequirementFacadeController(
      RequirementAppService requirementAppService,
      RequirementQueryService requirementQueryService) {
    this.requirementAppService = requirementAppService;
    this.requirementQueryService = requirementQueryService;
  }

  @GetMapping
  public List<RequirementReadDto> list(@RequestParam("project_id") String projectId) {
    return requirementQueryService.listByProject(projectId);
  }

  @PostMapping
  public RequirementReadDto create(
      @RequestParam("project_id") String projectId,
      @RequestBody RequirementCreateCommand request) {
    String requirementId = RequirementAppService.buildRequirementId();
    String wideTableId = buildWideTableId();
    requirementAppService.createRequirement(projectId, requirementId, wideTableId, request);

    RequirementReadDto refreshed = requirementQueryService.getByProjectAndId(projectId, requirementId);
    WideTableReadDto primary = requirementQueryService.getPrimaryWideTableByRequirement(requirementId);
    refreshed.setWideTable(primary);
    return refreshed;
  }
}
```

#### 2.2.2 application层（应用层）

**职责**: 用例编排、事务管理、协调领域对象

**核心组件**:
- **AppService**: 实现业务用例，编排领域对象
- **Command**: 写操作的输入参数
- **Query**: 读操作的输入参数
- **DTO**: 应用层的数据传输对象

**约束**:
- 只能依赖`domain`层（以及domain中定义的端口）
- **禁止**直接依赖`Mapper/SQL/contract DTO`
- 负责事务边界管理（`@Transactional`）
- 发布领域事件

**示例**: `RequirementAppService`

```java
@Service
public class RequirementAppService {
  private final RequirementRepository requirementRepository;
  private final ObjectMapper objectMapper;
  private final ApplicationEventPublisher eventPublisher;
  private final TaskPlanAppService taskPlanAppService;

  @Transactional
  public void createRequirement(
      String projectId, String requirementId, String wideTableId, RequirementCreateCommand command) {
    if (command == null || command.getTitle() == null || command.getTitle().trim().isEmpty()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Requirement title is required");
    }

    Requirement record = new Requirement();
    record.setId(requirementId);
    record.setProjectId(projectId);
    record.setTitle(command.getTitle().trim());
    record.setPhase(command.getPhase() != null ? command.getPhase() : "production");
    record.setStatus("draft");
    record.setSchemaLocked(Boolean.FALSE);
    record.setOwner(command.getOwner());
    record.setAssignee(command.getAssignee());
    record.setBusinessGoal(command.getBusinessGoal());
    record.setBackgroundKnowledge(command.getBackgroundKnowledge());
    record.setDeliveryScope(command.getDeliveryScope());
    record.setDataUpdateEnabled(command.getDataUpdateEnabled());
    record.setDataUpdateMode(command.getDataUpdateMode());
    record.setCollectionPolicyJson(writeJson(command.getCollectionPolicy()));

    WideTable wideTableBase = toWideTableBase(command.getWideTable());
    WideTable primaryWideTable =
        buildPrimaryWideTableRecord(requirementId, record.getTitle(), wideTableId, wideTableBase);
    ensurePrimaryWideTableDefaults(primaryWideTable);

    requirementRepository.insertRequirement(record);
    requirementRepository.insertWideTable(primaryWideTable);
  }
}
```

#### 2.2.3 domain层（领域层）

**职责**: 核心业务逻辑、业务规则、领域模型

**核心组件**:
- **Model**: 聚合根、实体、值对象
- **Repository**: 领域端口接口（定义但不实现）
- **Service**: 领域服务（当规则无法归属聚合时）
- **Event**: 领域事件
- **Exception**: 领域异常

**约束**:
- 尽量纯Java，不依赖框架
- 包含所有业务规则和验证逻辑
- 定义端口（接口），由infrastructure层实现

**示例**: `TaskExecutionDomainService` - 状态迁移规则

```java
@Service
public class TaskExecutionDomainService {
  public void assertCanExecuteTaskGroup(String currentStatus) {
    if (TaskStatus.isInvalidated(currentStatus)) {
      throw new ResponseStatusException(HttpStatus.CONFLICT, "TaskGroup is invalidated");
    }
  }

  public boolean isTaskGroupTerminal(String currentStatus) {
    return TaskStatus.isTerminal(currentStatus);
  }

  public void assertCanExecuteTask(String currentStatus) {
    if (TaskStatus.isInvalidated(currentStatus)) {
      throw new ResponseStatusException(HttpStatus.CONFLICT, "Task is invalidated");
    }
  }

  public boolean isTaskTerminal(String currentStatus) {
    return TaskStatus.isTerminal(currentStatus);
  }

  public String nextStatusOnStart(String currentStatus) {
    if (TaskStatus.isTerminal(currentStatus)) {
      return null;
    }
    return TaskStatus.RUNNING;
  }

  public String nextStatusOnComplete(String currentStatus) {
    if (TaskStatus.isTerminal(currentStatus)) {
      return null;
    }
    return TaskStatus.COMPLETED;
  }

  public String mergeStatusOnCallback(String currentStatus, String callbackStatus) {
    if (callbackStatus == null || callbackStatus.trim().isEmpty()) {
      return null;
    }
    if (TaskStatus.isInvalidated(currentStatus)) {
      return null;
    }
    String merged = TaskStatus.preferMoreAdvanced(currentStatus, callbackStatus);
    if (merged == null || merged.equalsIgnoreCase(currentStatus)) {
      return null;
    }
    return merged;
  }

  public String nextStatusOnRetry(String currentStatus) {
    if (TaskStatus.isInvalidated(currentStatus)) {
      throw new ResponseStatusException(HttpStatus.CONFLICT, "Task is invalidated");
    }
    return TaskStatus.PENDING;
  }
}
```

**示例**: `TaskGroup` 聚合模型

```java
public class TaskGroup {
  private String id;
  private Integer sortOrder;
  private String requirementId;
  private String wideTableId;
  private String batchId;
  private String businessDate;
  private String sourceType;
  private String status;
  private String scheduleRuleId;
  private String backfillRequestId;
  private Integer planVersion;
  private String groupKind;
  private String partitionType;
  private String partitionKey;
  private String partitionLabel;
  private Integer totalTasks;
  private Integer completedTasks;
  private Integer failedTasks;
  private String triggeredBy;
  private LocalDateTime createdAt;
  private LocalDateTime updatedAt;
  
  // getter和setter方法...
}
```

#### 2.2.4 infrastructure层（基础设施层）

**职责**: 实现domain层定义的端口，提供技术实现

**核心组件**:
- **Mapper**: MyBatis Mapper接口
- **Record**: 数据库记录实体（与表结构对应）
- **RepositoryImpl**: 领域端口的实现
- **Client**: 外部服务调用（HTTP Client）
- **Config**: 配置类

**约束**:
- 可以依赖所有框架和技术
- 实现domain层定义的接口
- 负责对象转换（Record ↔ Domain Model）

**示例**: `MybatisTaskGroupRepository`

```java
@Repository
public class MybatisTaskGroupRepository implements TaskGroupRepository {
  private final TaskGroupMapper taskGroupMapper;

  public MybatisTaskGroupRepository(TaskGroupMapper taskGroupMapper) {
    this.taskGroupMapper = taskGroupMapper;
  }

  @Override
  public int countByRequirement(String requirementId) {
    return taskGroupMapper.countByRequirement(requirementId);
  }

  @Override
  public TaskGroup getById(String taskGroupId) {
    TaskGroupRecord record = taskGroupMapper.getById(taskGroupId);
    return record != null ? toDomain(record) : null;
  }

  @Override
  public List<TaskGroup> listByRequirement(String requirementId) {
    List<TaskGroupRecord> records = taskGroupMapper.listByRequirement(requirementId);
    return toDomainList(records);
  }

  @Override
  public List<TaskGroup> listByRequirementAndWideTable(String requirementId, String wideTableId) {
    List<TaskGroupRecord> records = taskGroupMapper.listByRequirementAndWideTable(requirementId, wideTableId);
    return toDomainList(records);
  }

  @Override
  public int upsert(TaskGroup taskGroup) {
    return taskGroupMapper.upsert(toRecord(taskGroup));
  }

  @Override
  public int upsertBatch(List<TaskGroup> taskGroups) {
    if (taskGroups == null) return 0;
    List<TaskGroupRecord> records = new ArrayList<TaskGroupRecord>(taskGroups.size());
    for (TaskGroup tg : taskGroups) {
      if (tg == null) continue;
      records.add(toRecord(tg));
    }
    return taskGroupMapper.upsertBatch(records);
  }

  @Override
  public int updateStatus(String taskGroupId, String status) {
    return taskGroupMapper.updateStatus(taskGroupId, status);
  }

  @Override
  public int updateStatusByIds(List<String> taskGroupIds, String status) {
    return taskGroupMapper.updateStatusByIds(taskGroupIds, status);
  }

  private static List<TaskGroup> toDomainList(List<TaskGroupRecord> records) {
    if (records == null) return new ArrayList<TaskGroup>();
    List<TaskGroup> out = new ArrayList<TaskGroup>(records.size());
    for (TaskGroupRecord record : records) {
      if (record == null) continue;
      out.add(toDomain(record));
    }
    return out;
  }

  private static TaskGroup toDomain(TaskGroupRecord record) {
    TaskGroup tg = new TaskGroup();
    tg.setId(record.getId());
    tg.setSortOrder(record.getSortOrder());
    tg.setRequirementId(record.getRequirementId());
    tg.setWideTableId(record.getWideTableId());
    tg.setBatchId(record.getBatchId());
    tg.setBusinessDate(record.getBusinessDate());
    tg.setSourceType(record.getSourceType());
    tg.setStatus(record.getStatus());
    tg.setScheduleRuleId(record.getScheduleRuleId());
    tg.setBackfillRequestId(record.getBackfillRequestId());
    tg.setPlanVersion(record.getPlanVersion());
    tg.setGroupKind(record.getGroupKind());
    tg.setPartitionType(record.getPartitionType());
    tg.setPartitionKey(record.getPartitionKey());
    tg.setPartitionLabel(record.getPartitionLabel());
    tg.setTotalTasks(record.getTotalTasks());
    tg.setCompletedTasks(record.getCompletedTasks());
    tg.setFailedTasks(record.getFailedTasks());
    tg.setTriggeredBy(record.getTriggeredBy());
    tg.setCreatedAt(record.getCreatedAt());
    tg.setUpdatedAt(record.getUpdatedAt());
    return tg;
  }

  private static TaskGroupRecord toRecord(TaskGroup taskGroup) {
    if (taskGroup == null) return null;
    TaskGroupRecord record = new TaskGroupRecord();
    record.setId(taskGroup.getId());
    record.setSortOrder(taskGroup.getSortOrder());
    record.setRequirementId(taskGroup.getRequirementId());
    record.setWideTableId(taskGroup.getWideTableId());
    record.setBatchId(taskGroup.getBatchId());
    record.setBusinessDate(taskGroup.getBusinessDate());
    record.setSourceType(taskGroup.getSourceType());
    record.setStatus(taskGroup.getStatus());
    record.setScheduleRuleId(taskGroup.getScheduleRuleId());
    record.setBackfillRequestId(taskGroup.getBackfillRequestId());
    record.setPlanVersion(taskGroup.getPlanVersion());
    record.setGroupKind(taskGroup.getGroupKind());
    record.setPartitionType(taskGroup.getPartitionType());
    record.setPartitionKey(taskGroup.getPartitionKey());
    record.setPartitionLabel(taskGroup.getPartitionLabel());
    record.setTotalTasks(taskGroup.getTotalTasks());
    record.setCompletedTasks(taskGroup.getCompletedTasks());
    record.setFailedTasks(taskGroup.getFailedTasks());
    record.setTriggeredBy(taskGroup.getTriggeredBy());
    return record;
  }
}
```

**示例**: `TaskGroupMapper` - MyBatis接口

```java
@Mapper
public interface TaskGroupMapper {

  @Select(
      "select "
          + "id, sort_order, requirement_id, wide_table_id, batch_id, business_date, source_type, status, "
          + "schedule_rule_id, backfill_request_id, plan_version, group_kind, partition_type, partition_key, "
          + "partition_label, total_tasks, completed_tasks, failed_tasks, triggered_by, created_at, updated_at "
          + "from task_groups "
          + "where requirement_id = #{requirementId} "
          + "order by sort_order asc")
  List<TaskGroupRecord> listByRequirement(@Param("requirementId") String requirementId);

  @Select(
      "select "
          + "id, sort_order, requirement_id, wide_table_id, batch_id, business_date, source_type, status, "
          + "schedule_rule_id, backfill_request_id, plan_version, group_kind, partition_type, partition_key, "
          + "partition_label, total_tasks, completed_tasks, failed_tasks, triggered_by, created_at, updated_at "
          + "from task_groups "
          + "where requirement_id = #{requirementId} and wide_table_id = #{wideTableId} "
          + "order by sort_order asc")
  List<TaskGroupRecord> listByRequirementAndWideTable(
      @Param("requirementId") String requirementId,
      @Param("wideTableId") String wideTableId);

  @Select(
      "select "
          + "id, sort_order, requirement_id, wide_table_id, batch_id, business_date, source_type, status, "
          + "schedule_rule_id, backfill_request_id, plan_version, group_kind, partition_type, partition_key, "
          + "partition_label, total_tasks, completed_tasks, failed_tasks, triggered_by, created_at, updated_at "
          + "from task_groups where id = #{id} limit 1")
  TaskGroupRecord getById(@Param("id") String id);

  @Select({
      "<script>",
      "select ",
      "  id, sort_order, requirement_id, wide_table_id, batch_id, business_date, source_type, status, ",
      "  schedule_rule_id, backfill_request_id, plan_version, group_kind, partition_type, partition_key, ",
      "  partition_label, total_tasks, completed_tasks, failed_tasks, triggered_by, created_at, updated_at ",
      "from task_groups ",
      "where id in ",
      "  <foreach collection='ids' item='id' open='(' separator=',' close=')'>",
      "    #{id}",
      "  </foreach>",
      "</script>",
  })
  List<TaskGroupRecord> listByIds(@Param("ids") List<String> ids);

  @Select("select count(1) from task_groups where requirement_id = #{requirementId}")
  int countByRequirement(@Param("requirementId") String requirementId);

  @Insert({
      "insert into task_groups (",
      "  id, sort_order, requirement_id, wide_table_id, batch_id, business_date, source_type, status,",
      "  schedule_rule_id, backfill_request_id, plan_version, group_kind, partition_type, partition_key,",
      "  partition_label, total_tasks, completed_tasks, failed_tasks, triggered_by",
      ") values (",
      "  #{id}, #{sortOrder}, #{requirementId}, #{wideTableId}, #{batchId}, #{businessDate}, #{sourceType}, #{status},",
      "  #{scheduleRuleId}, #{backfillRequestId}, #{planVersion}, #{groupKind}, #{partitionType}, #{partitionKey},",
      "  #{partitionLabel}, #{totalTasks}, #{completedTasks}, #{failedTasks}, #{triggeredBy}",
      ") on duplicate key update ",
      "  sort_order = values(sort_order),",
      "  batch_id = values(batch_id),",
      "  business_date = values(business_date),",
      "  source_type = values(source_type),",
      "  status = values(status),",
      "  schedule_rule_id = values(schedule_rule_id),",
      "  backfill_request_id = values(backfill_request_id),",
      "  plan_version = values(plan_version),",
      "  group_kind = values(group_kind),",
      "  partition_type = values(partition_type),",
      "  partition_key = values(partition_key),",
      "  partition_label = values(partition_label),",
      "  total_tasks = values(total_tasks),",
      "  completed_tasks = values(completed_tasks),",
      "  failed_tasks = values(failed_tasks),",
      "  triggered_by = values(triggered_by),",
      "  updated_at = current_timestamp",
  })
  int upsert(TaskGroupRecord record);

  @Insert({
      "<script>",
      "insert into task_groups (",
      "  id, sort_order, requirement_id, wide_table_id, batch_id, business_date, source_type, status,",
      "  schedule_rule_id, backfill_request_id, plan_version, group_kind, partition_type, partition_key,",
      "  partition_label, total_tasks, completed_tasks, failed_tasks, triggered_by",
      ") values ",
      "  <foreach collection='records' item='r' separator=','>",
      "    (#{r.id}, #{r.sortOrder}, #{r.requirementId}, #{r.wideTableId}, #{r.batchId}, #{r.businessDate}, #{r.sourceType}, #{r.status},",
      "     #{r.scheduleRuleId}, #{r.backfillRequestId}, #{r.planVersion}, #{r.groupKind}, #{r.partitionType}, #{r.partitionKey},",
      "     #{r.partitionLabel}, #{r.totalTasks}, #{r.completedTasks}, #{r.failedTasks}, #{r.triggeredBy})",
      "  </foreach>",
      "on duplicate key update ",
      "  sort_order = values(sort_order),",
      "  batch_id = values(batch_id),",
      "  business_date = values(business_date),",
      "  source_type = values(source_type),",
      "  status = values(status),",
      "  schedule_rule_id = values(schedule_rule_id),",
      "  backfill_request_id = values(backfill_request_id),",
      "  plan_version = values(plan_version),",
      "  group_kind = values(group_kind),",
      "  partition_type = values(partition_type),",
      "  partition_key = values(partition_key),",
      "  partition_label = values(partition_label),",
      "  total_tasks = values(total_tasks),",
      "  completed_tasks = values(completed_tasks),",
      "  failed_tasks = values(failed_tasks),",
      "  triggered_by = values(triggered_by),",
      "  updated_at = current_timestamp",
      "</script>",
  })
  int upsertBatch(@Param("records") List<TaskGroupRecord> records);

  @Update("update task_groups set status = #{status}, updated_at = current_timestamp where id = #{id}")
  int updateStatus(@Param("id") String id, @Param("status") String status);

  @Update({
      "<script>",
      "update task_groups",
      "set status = #{status}, updated_at = current_timestamp",
      "where id in ",
      "  <foreach collection='ids' item='id' open='(' separator=',' close=')'>",
      "    #{id}",
      "  </foreach>",
      "</script>",
  })
  int updateStatusByIds(@Param("ids") List<String> ids, @Param("status") String status);
}
```

### 2.3 依赖方向规则

```
interfaces -> application -> domain <- infrastructure
```

**关键规则**:
1. **Controller只能依赖Application**
2. **Application只能依赖Domain**（以及domain中定义的端口）
3. **Domain层定义端口**，**Infrastructure层实现端口**
4. **禁止跨层依赖**（如Controller直接调用Repository）

### 2.4 聚合设计（Aggregate Design）

Data Foundry项目定义了多个**限界上下文（Bounded Context）**和**聚合根（Aggregate Root）**：

| Bounded Context | 聚合根 | 说明 |
|----------------|--------|------|
| backend.project | `Project` | 项目管理 |
| backend.requirement | `Requirement` | 需求管理 |
| backend.task | `TaskGroup` | 任务组管理 |
| backend.task | `FetchTask` | 采集任务管理 |

**聚合设计原则**:
- 聚合内强一致性，聚合间弱一致性
- 跨聚合通过事件或用例编排交互
- 避免聚合过大导致加载笨重

### 2.5 领域事件（Domain Event）

用于跨聚合或跨服务的异步通信：

```java
// 领域事件定义
public class TaskGroupExecuteRequestedEvent {
  private String taskGroupId;
  private String requestId;
}

// 应用服务发布事件
eventPublisher.publishEvent(new TaskGroupExecuteRequestedEvent(taskGroupId, requestId));

// 事件处理器
@Service
public class TaskExecutionAfterCommitHandler {
  @EventListener
  public void handle(TaskGroupExecuteRequestedEvent event) {
    // after commit动作
  }
}
```

### 2.6 端口与适配器模式（Ports & Adapters）

**端口（Port）**: 领域层定义的接口

```java
public interface ScheduleJobGateway {
  List<ScheduleJob> list(String triggerType, String status);
  ScheduleJob create(ScheduleJobCreateCommand command, String idempotencyKey);
}
```

**适配器（Adapter）**: Infrastructure层的实现

```java
@Component
public class SchedulerScheduleJobClient implements ScheduleJobGateway {
  private final RestTemplate restTemplate;
  private final String schedulerBaseUrl;

  public SchedulerScheduleJobClient(
      @Qualifier("schedulerRestTemplate") RestTemplate restTemplate,
      @Value("${data-foundry.scheduler.base-url:http://127.0.0.1:8200}") String schedulerBaseUrl) {
    this.restTemplate = restTemplate;
    this.schedulerBaseUrl = schedulerBaseUrl;
  }

  @Override
  public List<ScheduleJob> list(String triggerType, String status) {
    StringBuilder url = new StringBuilder(schedulerBaseUrl).append("/api/schedule-jobs");
    boolean hasQuery = false;
    if (triggerType != null && triggerType.trim().length() > 0) {
      url.append(hasQuery ? "&" : "?").append("trigger_type=").append(triggerType.trim());
      hasQuery = true;
    }
    if (status != null && status.trim().length() > 0) {
      url.append(hasQuery ? "&" : "?").append("status=").append(status.trim());
    }

    com.huatai.datafoundry.contract.scheduler.ScheduleJob[] jobs;
    try {
      jobs =
          withRetry(
              () ->
                  restTemplate.getForObject(
                      URI.create(url.toString()), com.huatai.datafoundry.contract.scheduler.ScheduleJob[].class));
    } catch (HttpStatusCodeException ex) {
      throw translateDownstream(ex);
    } catch (RestClientException ex) {
      throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Scheduler service unavailable", ex);
    }

    List<ScheduleJob> out = new ArrayList<ScheduleJob>();
    if (jobs == null) return out;
    for (com.huatai.datafoundry.contract.scheduler.ScheduleJob job : jobs) {
      out.add(toDomain(job));
    }
    return out;
  }

  @Override
  public ScheduleJob create(ScheduleJobCreateCommand command, String idempotencyKey) {
    if (command == null) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid schedule job request");
    }

    Map<String, Object> body = new HashMap<String, Object>();
    body.put("task_group_id", command.getTaskGroupId());
    body.put("task_id", command.getTaskId());
    body.put("trigger_type", command.getTriggerType());
    body.put("operator", command.getOperator());
    body.put("backfill_request_id", command.getBackfillRequestId());

    HttpHeaders headers = new HttpHeaders();
    headers.add("Content-Type", "application/json");
    if (idempotencyKey != null && idempotencyKey.trim().length() > 0) {
      headers.add("X-Idempotency-Key", idempotencyKey.trim());
    }

    try {
      ResponseEntity<com.huatai.datafoundry.contract.scheduler.ScheduleJob> response =
          withRetry(
              () ->
                  restTemplate.exchange(
                      URI.create(schedulerBaseUrl + "/api/schedule-jobs"),
                      HttpMethod.POST,
                      new HttpEntity<Object>(body, headers),
                      com.huatai.datafoundry.contract.scheduler.ScheduleJob.class));
      return toDomain(response.getBody());
    } catch (HttpStatusCodeException ex) {
      throw translateDownstream(ex);
    } catch (RestClientException ex) {
      throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Scheduler service unavailable", ex);
    }
  }

  private ResponseStatusException translateDownstream(HttpStatusCodeException ex) {
    HttpStatus status;
    try {
      status = HttpStatus.valueOf(ex.getRawStatusCode());
    } catch (Exception ignored) {
      status = HttpStatus.SERVICE_UNAVAILABLE;
    }
    String detail = safeSnippet(ex.getResponseBodyAsString());
    if (status.is4xxClientError()) {
      return new ResponseStatusException(status, "Scheduler request rejected" + detail);
    }
    return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Scheduler service unavailable" + detail);
  }

  private static String safeSnippet(String raw) {
    if (raw == null) return "";
    String s = raw.trim();
    if (s.isEmpty()) return "";
    if (s.length() > 200) {
      s = s.substring(0, 200) + "...";
    }
    return " (downstream=" + s + ")";
  }

  private static ScheduleJob toDomain(com.huatai.datafoundry.contract.scheduler.ScheduleJob job) {
    if (job == null) return null;
    ScheduleJob out = new ScheduleJob();
    out.setId(job.getId());
    out.setTaskGroupId(job.getTaskGroupId());
    out.setTaskId(job.getTaskId());
    out.setTriggerType(job.getTriggerType());
    out.setStatus(job.getStatus());
    out.setStartedAt(job.getStartedAt());
    out.setEndedAt(job.getEndedAt());
    out.setOperator(job.getOperator());
    out.setLogRef(job.getLogRef());
    return out;
  }

  private static <T> T withRetry(RetryableSupplier<T> supplier) {
    int attempts = 0;
    while (true) {
      attempts++;
      try {
        return supplier.get();
      } catch (RestClientException ex) {
        if (attempts >= 3) {
          throw ex;
        }
        sleepQuietly(attempts == 1 ? 100 : 300);
      }
    }
  }

  private static void sleepQuietly(long ms) {
    try {
      Thread.sleep(ms);
    } catch (InterruptedException ignored) {
      Thread.currentThread().interrupt();
    }
  }

  private interface RetryableSupplier<T> {
    T get();
  }
}
```

### 2.7 事务边界设计

**原则**: 一个用例 ≈ 一个本地事务边界

```java
@Service
public class RequirementAppService {
  @Transactional  // 事务边界
  public void createRequirement(...) {
    // 1. 创建Requirement
    requirementRepository.insertRequirement(record);
    // 2. 创建WideTable
    requirementRepository.insertWideTable(wideTable);
    // 3. 如果任何一步失败，整个事务回滚
  }
}
```

**跨服务事务**: 采用"本地提交 + 事件/Outbox + 重试/补偿"

### 2.8 对象转换链路

```
Database (MySQL)
    ↓
Record (TaskGroupRecord) - 数据库记录
    ↓
Mapper (TaskGroupMapper) - SQL映射
    ↓
Domain Model (TaskGroup) - 领域模型
    ↓
DTO (TaskGroupReadDto) - 传输对象
    ↓
Response (JSON) - HTTP响应
```

---

## 3. DDD分层架构的优势

1. **业务隔离**: 核心业务逻辑与技术实现分离
2. **可测试性**: 领域层纯Java，易于单元测试
3. **可维护性**: 清晰的分层结构，易于理解和修改
4. **可扩展性**: 端口适配模式，易于替换技术实现
5. **领域聚焦**: 代码围绕业务概念组织，而非技术概念

---

## 4. 实际案例：TaskGroup查询流程

```
前端请求: GET /api/projects/{projectId}/requirements/{requirementId}/task-groups
    ↓
RequirementTaskLegacyController.listTaskGroups()
    ↓
RequirementQueryService.listTaskGroups()
    ↓
TaskGroupRepository.listByRequirement()
    ↓
MybatisTaskGroupRepository.listByRequirement()
    ↓
TaskGroupMapper.listByRequirement() → SQL查询
    ↓
TaskGroupRecord列表
    ↓
MybatisTaskGroupRepository.toDomainList() → Record转Domain
    ↓
RequirementQueryService.mapTaskGroup() → Domain转DTO
    ↓
Controller返回DTO列表
    ↓
前端接收JSON响应
```

---

## 5. 包结构规范

### 5.1 统一包命名规范

```
com.huatai.datafoundry.<service>.<context>.<layer>...
```

- `<service>`: `backend` / `scheduler` / `agent`
- `<context>`: `requirement`、`project`、`task`、`schedule`、`ops`
- `<layer>`: `interfaces` / `application` / `domain` / `infrastructure`

### 5.2 各层目录结构

#### 5.2.1 interfaces层

```
com.huatai.datafoundry.backend.requirement.interfaces.web
├── RequirementFacadeController.java
├── TaskFacadeController.java
├── legacy/
│   ├── RequirementTaskLegacyController.java
│   └── TaskExecutionLegacyController.java
└── dto/
    ├── RequirementReadDto.java
    ├── TaskGroupReadDto.java
    └── FetchTaskReadDto.java
```

#### 5.2.2 application层

```
com.huatai.datafoundry.backend.requirement.application
├── service/
│   └── RequirementAppService.java
├── query/
│   └── service/
│       └── RequirementQueryService.java
├── command/
│   ├── RequirementCreateCommand.java
│   └── RequirementUpdateCommand.java
└── query/
    └── dto/
        ├── RequirementReadDto.java
        ├── TaskGroupReadDto.java
        └── FetchTaskReadDto.java
```

#### 5.2.3 domain层

```
com.huatai.datafoundry.backend.requirement.domain
├── model/
│   ├── Requirement.java
│   └── WideTable.java
├── repository/
│   └── RequirementRepository.java
└── service/
    └── RequirementDomainService.java (可选)
```

#### 5.2.4 infrastructure层

```
com.huatai.datafoundry.backend.requirement.infrastructure
├── persistence/
│   └── mybatis/
│       ├── mapper/
│       │   ├── RequirementMapper.java
│       │   └── WideTableMapper.java
│       └── record/
│           ├── RequirementRecord.java
│           └── WideTableRecord.java
└── repository/
    └── MybatisRequirementRepository.java
```

---

## 6. 关键设计模式

### 6.1 分层架构模式

- **Controller**: 处理HTTP请求
- **Service**: 业务逻辑编排
- **Repository**: 数据访问抽象
- **Domain Model**: 领域对象

### 6.2 依赖注入模式

- Spring自动注入依赖
- 构造器注入（推荐）
- 接口依赖（端口）

### 6.3 对象转换模式

- Record ↔ Domain Model
- Domain Model ↔ DTO
- DTO ↔ Request/Response

### 6.4 端口适配器模式

- 领域层定义端口（接口）
- 基础设施层实现端口
- 解耦领域逻辑与技术实现

### 6.5 事务脚本模式

- Application层管理事务边界
- 本地事务保证一致性
- 跨服务采用事件驱动

---

## 7. 最佳实践

### 7.1 代码组织

- 严格遵循分层架构
- 避免跨层依赖
- 保持各层职责单一

### 7.2 事务管理

- Application层使用`@Transactional`
- 避免在Domain层使用事务
- 跨服务采用事件驱动

### 7.3 错误处理

- Domain层抛出领域异常
- Application层转换为HTTP异常
- Controller层统一异常处理

### 7.4 测试策略

- Domain层单元测试（纯Java）
- Application层集成测试
- Controller层Mock测试

---

## 8. 总结

Data Foundry项目通过严格的DDD分层架构，实现了：

1. **清晰的职责划分**: 每层都有明确的职责和约束
2. **高内聚低耦合**: 领域逻辑与技术实现分离
3. **易于测试和维护**: 纯Java的领域层易于单元测试
4. **可扩展和可替换**: 端口适配模式支持技术栈替换
5. **业务聚焦**: 代码围绕业务概念组织，而非技术概念

这种架构模式特别适合中大型项目，能够有效应对业务复杂度的增长，保持代码的可维护性和可扩展性。
