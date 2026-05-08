# requirements、wide_tables、wide_table_rows 三表结构深度分析报告

> 报告日期：2026-04-23  
> 分析目标：评估三表结构合理性及数据流转方案，提出优化建议

---

## 一、现状分析

### 1.1 三表结构定义

#### 表1：requirements（需求聚合根）

| 字段 | 类型 | 说明 | 是否后端管理 | 用途 |
|------|------|------|-------------|------|
| id | VARCHAR(64) | 需求ID | ✅ | 主键 |
| project_id | VARCHAR(64) | 项目ID | ✅ | 关联项目 |
| title | VARCHAR(255) | 需求标题 | ✅ | 需求名称 |
| phase | VARCHAR(32) | 阶段 | ✅ | draft/demo/production |
| status | VARCHAR(32) | 状态 | ✅ | draft/active/archived |
| business_goal | TEXT | 业务目标 | ✅ | 业务描述 |
| collection_policy | JSON | 采集策略 | ✅ | 采集配置 |
| schema_locked | TINYINT(1) | 模式锁定 | ✅ | 锁定后不可修改 |
| created_at | DATETIME | 创建时间 | ✅ | 记录创建时间 |
| updated_at | DATETIME | 更新时间 | ✅ | 记录更新时间 |

**DDD归属**：backend.requirement  
** CRUD**：全量由 backend-service 管理

---

#### 表2：wide_tables（宽表定义）

| 字段 | 类型 | 说明 | 是否后端管理 | 用途 |
|------|------|------|-------------|------|
| id | VARCHAR(64) | 宽表ID | ✅ | 主键 |
| requirement_id | VARCHAR(64) | 关联需求ID | ✅ | 外键 |
| table_name | VARCHAR(255) | 目标物理表名 | ✅ | dwd_sales_daily |
| schema_version | INT | Schema版本 | ✅ | 版本控制 |
| schema_json | JSON | 字段定义 | ✅ | 维度+指标定义 |
| scope_json | JSON | 作用域配置 | ✅ | 时间+维度范围 |
| indicator_groups_json | JSON | 指标分组 | ✅ | 指标组织 |
| schedule_rules_json | JSON | 调度规则 | ✅ | 调度配置 |
| record_count | INT | 记录数统计 | ✅ | 运行时统计 |
| created_at | DATETIME | 创建时间 | ✅ | 记录创建时间 |
| updated_at | DATETIME | 更新时间 | ✅ | 记录更新时间 |

**DDD归属**：backend.requirement  
** CRUD**：全量由 backend-service 管理

---

#### 表3：wide_table_rows（宽表行记录）

| 字段 | 类型 | 说明 | 是否后端管理 | 用途 |
|------|------|------|-------------|------|
| wide_table_id | VARCHAR(64) | 宽表ID | ✅ | 外键 |
| row_id | INT | 行ID | ✅ | 组合主键 |
| requirement_id | VARCHAR(64) | 需求ID | ✅ | 外键 |
| plan_version | INT | 计划版本 | ✅ | 版本控制 |
| row_status | VARCHAR(32) | 行状态 | ✅ | initialized/completed |
| dimension_values_json | JSON | 维度值 | ✅ | 维度具体值 |
| business_date | VARCHAR(32) | 业务日期 | ✅ | YYYY-MM-DD |
| row_binding_key | VARCHAR(512) | 行绑定键 | ✅ | 主键组合 |
| indicator_values_json | JSON | 指标值 | ✅ | 指标预期值 |
| system_values_json | JSON | 系统值 | ✅ | 系统信息 |
| created_at | DATETIME | 创建时间 | ✅ | 记录创建时间 |
| updated_at | DATETIME | 更新时间 | ✅ | 记录更新时间 |

**DDD归属**：backend.requirement  
** CRUD**：全量由 backend-service 管理

**⚠️ 关键问题**：该表**未实现**将数据写入 target_tables 物理表的功能

---

### 1.2 三表之间的关联关系

```
requirements (1) ──── (*) wide_tables (1) ──── (*) wide_table_rows
   │                      │                       │
   │                      │                       │
   │                      ▼                       ▼
   │              wide_tables.table_name   wide_table_rows.dimension_values_json
   │              目标物理表名              (维度值)
   │                                      ↓
   │                                  应该写入?
   │                                      ↓
   │                              target_tables.* (目标物理表)
   │
   └───────────────────────────────────────┘
            requirement_id 外键关联
```

**关系说明**：

1. **requirements → wide_tables**：一对多关系
   - 一个需求可以定义多个宽表（按业务域拆分）
   - 通过 `requirement_id` 外键关联

2. **wide_tables → wide_table_rows**：一对多关系
   - 一个宽表definition 可以包含多行row定义
   - 通过 `wide_table_id` 外键关联
   - 每行有独立的 `row_id` 和 `row_binding_key`

3. **wide_table_rows → target_tables**：**未实现**的链路
   - `wide_table_rows.dimension_values_json` 是维度值
   - `wide_table_rows.indicator_values_json` 是指标值
   - `wide_tables.table_name` 是目标物理表名
   - **缺失环节**：没有代码将 wide_table_rows 数据写入 target_tables

---

## 二、后端代码分析

### 2.1 实体模型

#### Requirement.java
```java
// 位置：data-foundry-backend-service/src/main/java/.../requirement/domain/model/Requirement.java

public class Requirement {
  private String id;
  private String projectId;
  private String title;
  private String phase;
  private String status;
  private String businessGoal;
  private String collectionPolicyJson; // 采集策略
  // ... 其他字段
}
```

**特点**：
- 纯领域模型，无宽表定义
- `collection_policy_json` 包含采集策略配置
- **缺失**：没有 `WideTable` 列表

---

#### WideTable.java
```java
// 位置：data-foundry-backend-service/src/main/java/.../requirement/domain/model/WideTable.java

public class WideTable {
  private String id;
  private String requirementId;
  private String tableName; // 目标物理表名
  private String schemaJson;
  private String scopeJson;
  private String indicatorGroupsJson;
  private String scheduleRulesJson;
  // ... 其他字段
}
```

**特点**：
- 完整定义了目标表结构（schema）
- 缺少 **行数据** 的定义

---

### 2.2 Repository 层

#### RequirementRepository.java
```java
public interface RequirementRepository {
  List<Requirement> listByProject(String projectId);
  Requirement getById(String requirementId);
  WideTable getPrimaryWideTableByRequirement(String requirementId);
  List<WideTable> listPrimaryWideTablesByRequirementIds(List<String> requirementIds);
  WideTable getWideTableByIdForRequirement(String requirementId, String wideTableId);
  int insertWideTable(WideTable wideTable);
  int updateWideTableByIdAndRequirement(WideTable wideTablePatch);
}
```

**分析**：
- ✅ 支持 wide_tables 的 CRUD
- ❌ **没有** wide_table_rows 相关的 Repository 方法
- ❌ **没有** Row 的实体模型类

---

#### WideTableReadRepository.java
```java
public interface WideTableReadRepository {
  WideTablePlanSource getPrimaryByRequirement(String requirementId);
  WideTablePlanSource getByIdForRequirement(String requirementId, String wideTableId);
}
```

**WideTablePlanSource.java**：
```java
public class WideTablePlanSource {
  private String id;
  private String requirementId;
  private String schemaJson;
  private String scopeJson;
  private String indicatorGroupsJson;
  private String scheduleRulesJson;
  // 注意：没有 row 定义！
}
```

**分析**：
- 仅提供宽表**定义**的读取
- **不包含**行数据（rows）

---

### 2.3 任务规划链路

#### TaskPlanAppService.java
```java
public void ensureDefaultTaskGroupsOnSubmit(String requirementId) {
  WideTablePlanSource wideTable = wideTableReadRepository.getPrimaryByRequirement(requirementId);
  
  Scope scope = parseScope(wideTable.getScopeJson());
  List<String> businessDates = taskPlanDomainService.buildBusinessDates(scope);
  
  // 生成 task_groups
  for (String businessDate : businessDates) {
    TaskGroup tg = new TaskGroup();
    tg.setId(taskPlanDomainService.buildTaskGroupId(wideTableId, businessDate, null, planVersion));
    tg.setBusinessDate(businessDate);
    // ... 其他字段
  }
  
  // 生成 fetch_tasks
  for (FetchTaskDraft draft : drafts) {
    FetchTask ft = new FetchTask();
    ft.setRowId(draft.rowId);
    ft.setDimensionValuesJson(writeJson(draft.dimensionValues));
    ft.setRowBindingKey(draft.rowBindingKey);
    // ... 其他字段
  }
}
```

**关键发现**：

1. **任务规划**从 `scope_json` 提取维度组合
2. **FetchTask** 生成 `row_binding_key`（行绑定键）
3. **没有**从 `wide_table_rows` 表读取预定义的行数据

---

## 三、三表设计合理性评估

### 3.1 当前设计的问题

#### 问题1：wide_table_rows 表存在 but not used

**现象**：
- 表结构已定义
- 包含 `dimension_values_json`、`indicator_values_json`、`row_binding_key`
- **没有任何代码使用这个表**

**影响**：
1. 数据冗余：`wide_table_rows` 和 `fetch_tasks` 的维度信息重复
2. 概念混淆：开发者不清楚两者区别
3. 维护成本：需要额外维护未使用的表

**溯源分析**：
- 从 `wide_table_rows` 的 schema 看，它试图存储**计划行数据**
- 从 `fetch_tasks` 的 schema 看，它实际存储**执行任务**
- 这两个概念本应是：
  - `wide_table_rows`：计划（plan）
  - `fetch_tasks`：执行（execution）

**现实情况**：
- `wide_table_rows` 未被使用
- `fetch_tasks` 直接从 `scope_json` 动态生成
- `wide_table_rows` 成为"死代码"

---

#### 问题2：wide_tables.table_name 与 target_tables 的割裂

**设计意图**：
- `wide_tables.table_name` 定义目标物理表名
- `target_tables` 数据库存储实际物理表

**现实情况**：
- `target_tables` 数据库存在
- `TargetTableQueryService` 支持查询表和列信息
- **但是**：没有代码动态创建 `target_tables` 中的物理表

**证据**：
```java
// TargetTableFacadeController.java
@GetMapping("/{tableName}/columns")
public List<TargetTableColumnReadDto> listTargetTableColumns(@PathVariable String tableName) {
  // 只读查询 information_schema
}

// 但没有类似 createTargetTable() 的实现
```

**影响**：
1. 采集任务无法自动建表
2. 数据写入目标表失败
3. 整体采集流程无法闭环

---

#### 问题3：wide_table_rows 数据流向不清晰

**预期流程（设计意图）**：
```
1. 用户在 requirements 中配置需求
2. 在 wide_tables 中定义逻辑宽表
3. 在 wide_table_rows 中定义计划行数据
   ├─ dimension_values_json: {"date": "2024-12-01", "region": "SH"}
   ├─ indicator_values_json: {"sales": 1000, "count": 50}
   └─ row_binding_key: "2024-12-01|SH"
4. 系统根据 wide_table_rows 生成 fetch_tasks
5. 执行采集后，写入 target_tables.¡table_name¡
```

**现实流程（实际实现）**：
```
1. 用户在 requirements 中配置需求
2. 在 wide_tables 中定义逻辑宽表
   └─ scope_json 定义维度范围（如 date: ["2024-12-01", "2024-12-31"]）
3. 系统从 scope_json 动态生成所有行组合
4. 直接生成 fetch_tasks（不经过 wide_table_rows）
5. 执行采集后，写入 target_tables.¡table_name¡
```

**差距**：
- `wide_table_rows` 是"静态配置" → 实际使用的是"动态生成"
- 数据流向断链

---

### 3.2 三表关系照片段

#### 错误的关联关系

```
requirements
    │
    ├─→ wide_tables (1:1)
    │   ├─ table_name → 应该写入 target_tables
    │   └─ schema_json → 用于建表
    │
    └─→ wide_table_rows (1:N) ❌ 未使用
        └─→ 本应写入 target_tables，但未实现
```

#### 正确的关系应该是

```
requirements
    │
    ├─→ wide_tables (1:1)
    │   ├─ table_name → 目标物理表名
    │   ├─ schema_json → Schema定义
    │   └─ rows (1:N) ✅ 应该在 wide_tables 内嵌
    │       ├─ row_id
    │       ├─ dimension_values
    │       └─ indicator_values
    │
    └─→ wide_table_rows ❌ 删除（功能由 wide_tables.rows 替代）
```

---

## 四、优化方案

### 方案A：保留 wide_table_rows，完善数据流

#### 4.1 重构 wide_table_rows 的定位

**新的定位**：宽表行数据预定义（Plan-time Configuration）

**职责**：
1. 存储用户预定义的计划行数据
2. 为任务规划提供输入（替代/补充 scope_json 的动态生成）
3. 支持"部分行手动配置，部分行自动补全"的混合模式

**表结构优化**：
```sql
CREATE TABLE wide_table_rows (
  wide_table_id        VARCHAR(64) NOT NULL,
  row_id               INT NOT NULL,
  -- 原有字段
  sort_order           INT DEFAULT 0,
  requirement_id       VARCHAR(64) NOT NULL,
  schema_version       INT DEFAULT 1,
  row_status           VARCHAR(32) DEFAULT 'initialized',
  dimension_values_json JSON,
  business_date        VARCHAR(32),
  row_binding_key      VARCHAR(512),
  indicator_values_json JSON,
  -- 新增字段
  is_auto_generated    TINYINT(1) DEFAULT 0, -- 是否自动补全
  plan_version         INT NOT NULL DEFAULT 1,
  PRIMARY KEY (wide_table_id, row_id, plan_version),
  INDEX idx_wtr_requirement_id (requirement_id),
  INDEX idx_wtr_row_binding_key (row_binding_key),
  INDEX idx_wtr_business_date (business_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
COMMENT='宽表行数据预定义（Plan-time）';
```

**与 fetch_tasks 的关系**：
```
wide_table_rows (Plan)
    │
    └─→ TaskPlanAppService.planFetchTasks()
         │
         └─→ fetch_tasks (Execution)
```

**实现步骤**：

1. **新增 Repository 方法**：
```java
public interface RequirementRepository {
  // ... 现有方法
  
  // 新增：宽表行数据管理
  List<WideTableRow> listRowsByWideTable(String wideTableId, Integer planVersion);
  List<WideTableRow> listRowsByRequirement(String requirementId, Integer planVersion);
  int insertWideTableRow(WideTableRow row);
  int updateWideTableRow(WideTableRow row);
  int deleteWideTableRow(String wideTableId, Integer rowId, Integer planVersion);
}
```

2. **新增 Row 实体类**：
```java
public class WideTableRow {
  private String wideTableId;
  private Integer rowId;
  private Integer planVersion;
  private String rowStatus;
  private String dimensionValuesJson;
  private String indicatorValuesJson;
  private String rowBindingKey;
  private String businessDate;
  private Boolean isAutoGenerated;
  // ... getter and setter
}
```

3. **修改任务规划逻辑**：
```java
public class TaskPlanAppService {
  public void ensureFetchTasksForTaskGroup(TaskGroup taskGroup) {
    // 优先使用 wide_table_rows（如果有）
    List<WideTableRow> preDefinedRows = 
        requirementRepository.listRowsByWideTable(taskGroup.getWideTableId(), 
                                                  taskGroup.getPlanVersion());
    
    if (preDefinedRows != null && !preDefinedRows.isEmpty()) {
      // 使用预定义行生成 fetch tasks
      for (WideTableRow row : preDefinedRows) {
        FetchTaskDraft draft = new FetchTaskDraft();
        draft.dimensionValues = objectMapper.readValue(row.getDimensionValuesJson());
        draft.indicatorKeys = extractIndicatorKeys(row.getIndicatorValuesJson());
        draft.rowBindingKey = row.getRowBindingKey();
        draft.rowId = row.getRowId();
        // ...
      }
    } else {
      // 回退到 scope_json 动态生成
      Scope scope = parseScope(wideTable.getScopeJson());
      List<FetchTaskDraft> drafts = taskPlanDomainService.planFetchTasks(input);
    }
  }
}
```

4. **新增 API 接口**：
```java
@RestController
@RequestMapping("/requirements/{reqId}/wide-tables/{wtId}/rows")
public class WideTableRowController {
  
  @PostMapping
  public WideTableRow createRow(@PathVariable String reqId,
                               @PathVariable String wtId,
                               @RequestBody WideTableRow row) {
    // 创建行数据
  }
  
  @GetMapping
  public List<WideTableRow> listRows(@PathVariable String reqId,
                                    @PathVariable String wtId) {
    // 查询行数据
  }
  
  @PutMapping("/{rowId}")
  public WideTableRow updateRow(@PathVariable String reqId,
                               @PathVariable String wtId,
                               @PathVariable Integer rowId,
                               @RequestBody WideTableRow row) {
    // 更新行数据
  }
}
```

---

### 方案B：删除 wide_table_rows，合并到 wide_tables

#### 4.2 简化设计（推荐）

**理由**：
1. `wide_table_rows` 功能与 `scope_json` 重复
2. 增加了系统复杂度
3. 实际未被使用

**实现方案**：

1. **修改 wide_tables 表结构**：
```sql
ALTER TABLE wide_tables 
ADD COLUMN rows_json JSON NULL COMMENT '预定义行数据' AFTER schema_json;
```

2. **修改 WideTable 实体**：
```java
public class WideTable {
  // ... 现有字段
  
  // 新增：行数据定义
  private String rowsJson;
  
  // getter and setter
  public String getRowsJson() {
    return rowsJson;
  }
  
  public void setRowsJson(String rowsJson) {
    this.rowsJson = rowsJson;
  }
}
```

3. **rows_json 数据结构**：
```json
{
  "rows": [
    {
      "row_id": 1,
      "row_status": "initialized",
      "dimension_values": {
        "stat_date": "2024-12-01",
        "region_code": "SH"
      },
      "indicator_values": {
        "sales_amount": 1000.00,
        "order_count": 50
      },
      "row_binding_key": "2024-12-01|SH"
    },
    {
      "row_id": 2,
      "dimension_values": {
        "stat_date": "2024-12-02",
        "region_code": "BJ"
      },
      "indicator_values": {
        "sales_amount": 2000.00,
        "order_count": 80
      },
      "row_binding_key": "2024-12-02|BJ"
    }
  ]
}
```

4. **后台代码兼容处理**：
```java
public class WideTable {
  // ... 现有字段
  
  // 新增：行数据
  private String rowsJson;
  
  // 简化 API（向后兼容）
  public List<Map<String, Object>> getPreDefinedRows() {
    if (rowsJson == null) return Collections.emptyList();
    try {
      Map<String, Object> tmp = objectMapper.readValue(rowsJson, Map.class);
      List<Map<String, Object>> rows = (List<Map<String, Object>>) tmp.get("rows");
      return rows != null ? rows : Collections.emptyList();
    } catch (Exception ex) {
      return Collections.emptyList();
    }
  }
}
```

5. **删除 wide_table_rows 表**：
```sql
-- 确认无应用使用后执行
DROP TABLE wide_table_rows;
```

---

### 方案C：删除 wide_table_rows，仅用 scope_json 动态生成（最激进）

**适用场景**：
- 行数据数量巨大（百万级）
- 行数据经常变化
- 不需要预先配置

**缺点**：
- 无法支持"部分行手动配置"的需求
- 缺少"行级审批"的管控点

---

## 五、推荐方案（综合评估）

### 5.1 最佳方案：方案A + 完善 target_tables 链路

**理由**：
1. `wide_table_rows` 有其业务价值：支持预定义行数据
2. 但必须配套实现完整的数据流向
3. 需要完善 target_tables 的建表和写入功能

**实施步骤**：

### Step 1：完善 target_tables 动态建表

```java
@Component
public class TargetTableManager {
  
  private final JdbcTemplate jdbcTemplate;
  private final TargetTableQueryService targetTableQueryService;
  
  public void ensureTargetTable(WideTable wideTable) {
    String tableName = wideTable.getTableName();
    
    // 1. 检查表是否存在
    boolean exists = checkTableExists(tableName);
    
    if (!exists) {
      // 2. 创建新表
      createTable(tableName, wideTable);
    }
    // 注意：不自动更新表结构（避免数据风险）
  }
  
  private void createTable(String tableName, WideTable wideTable) {
    StringBuilder sql = new StringBuilder();
    sql.append("CREATE TABLE ").append(tableName).append(" (");
    
    // 1. 解析 schema_json 的字段定义
    List<ColumnDef> columns = parseSchema(wideTable.getSchemaJson());
    
    for (ColumnDef col : columns) {
      sql.append("  ").append(col.getName()).append(" ").append(mapType(col.getType()));
      if (col.isPk()) {
        sql.append(" NOT NULL");
      }
      sql.append(",\n");
    }
    
    // 2. 添加元数据字段
    sql.append("  _batch_id VARCHAR(64) NOT NULL COMMENT '批次标识',\n");
    sql.append("  _task_id VARCHAR(64) COMMENT '任务ID',\n");
    sql.append("  _fetch_task_id VARCHAR(128) COMMENT '采集子任务ID',\n");
    sql.append("  _collected_at DATETIME COMMENT '采集时间',\n");
    
    // 3. 定义主键
    List<String> pkColumns = columns.stream()
        .filter(ColumnDef::isPk)
        .map(ColumnDef::getName)
        .collect(Collectors.toList());
    
    sql.append("  PRIMARY KEY (");
    sql.append(String.join(", ", pkColumns));
    sql.append(", _batch_id)");
    
    // 4. 添加索引
    sql.append(",\n  INDEX idx_").append(tableName).append("_biz_date (");
    if (wideTable.getSemanticTimeAxis() != null) {
      sql.append(wideTable.getSemanticTimeAxis());
    } else {
      sql.append("stat_date"); // 默认时间字段
    }
    sql.append(")");
    
    sql.append("\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    
    jdbcTemplate.execute(sql.toString());
  }
  
  private boolean checkTableExists(String tableName) {
    try {
      Integer count = jdbcTemplate.queryForObject(
          "SELECT COUNT(1) FROM information_schema.tables " +
          "WHERE table_schema = ? AND table_name = ?",
          Integer.class, "target_tables", tableName);
      return count != null && count > 0;
    } catch (Exception ex) {
      return false;
    }
  }
}
```

---

### Step 2：完善 wide_table_rows 的 CRUD

```java
// 新增 Row 实体
public class WideTableRow {
  private String wideTableId;
  private Integer rowId;
  private Integer planVersion;
  private String rowStatus;
  private String dimensionValuesJson;
  private String indicatorValuesJson;
  private String rowBindingKey;
  private String businessDate;
  private Boolean isAutoGenerated;
  private LocalDateTime createdAt;
  private LocalDateTime updatedAt;
}

// 新增 Repository
public interface WideTableRowRepository {
  List<WideTableRow> listByWideTable(String wideTableId, Integer planVersion);
  WideTableRow getByWideTableAndRowId(String wideTableId, Integer rowId, Integer planVersion);
  int insert(WideTableRow row);
  int update(WideTableRow row);
  int delete(String wideTableId, Integer rowId, Integer planVersion);
}

// 新增 Service
@Service
public class WideTableRowService {
  
  public List<WideTableRow> listRows(String wideTableId, Integer planVersion) {
    return repository.listByWideTable(wideTableId, planVersion);
  }
  
  public WideTableRow createRow(WideTableRow row) {
    // 校验
    if (row.getRowBindingKey() == null) {
      row.setRowBindingKey(buildRowBindingKey(row.getDimensionValuesJson()));
    }
    // 插入
    repository.insert(row);
    return row;
  }
  
  public void deleteRow(String wideTableId, Integer rowId, Integer planVersion) {
    repository.delete(wideTableId, rowId, planVersion);
  }
  
  private String buildRowBindingKey(String dimensionValuesJson) {
    // 根据维度值生成 binding key
    // 例如：{"stat_date": "2024-12-01", "region_code": "SH"} 
    // → "2024-12-01|SH"
  }
}
```

---

### Step 3：修改任务规划逻辑

```java
@Service
public class TaskPlanAppService {
  
  public void ensureFetchTasksForTaskGroup(TaskGroup taskGroup) {
    // 1. 获取宽表定义
    WideTablePlanSource wideTable = ...;
    
    // 2. 尝试读取预定义行
    List<WideTableRow> preDefinedRows = 
        wideTableRowService.listRows(taskGroup.getWideTableId(), 
                                     taskGroup.getPlanVersion());
    
    List<FetchTaskDraft> drafts = new ArrayList<>();
    
    if (preDefinedRows != null && !preDefinedRows.isEmpty()) {
      // 使用预定义行
      for (WideTableRow row : preDefinedRows) {
        drafts.add(buildDraftFromRow(row, taskGroup));
      }
    } else {
      // 使用 scope_json 动态生成
      Scope scope = parseScope(wideTable.getScopeJson());
      drafts.addAll(taskPlanDomainService.planFetchTasks(...));
    }
    
    // 3. 批量插入 fetch_tasks
    fetchTaskRepository.upsertBatch(buildFetchTasks(drafts, taskGroup));
  }
}
```

---

### Step 4：完善数据写入 target_tables

```java
@Service
public class DataCollectorService {
  
  public void collect(FetchTask task, Map<String, Object> collectedData) {
    // 1. 获取宽表定义
    WideTable wideTable = wideTableRepository.getWideTableByIdForRequirement(
        task.getRequirementId(), task.getWideTableId());
    
    // 2. 解析物理表名
    String targetTableName = wideTable.getTableName();
    
    // 3. 构建 INSERT/UPSERT SQL
    String sql = buildUpsertSql(targetTableName, task, collectedData);
    
    // 4. 写入 target_tables
    jdbcTemplate.update(sql, params);
  }
  
  private String buildUpsertSql(String tableName, FetchTask task, 
                                Map<String, Object> data) {
    StringBuilder sql = new StringBuilder();
    sql.append("INSERT INTO ").append(tableName).append(" (");
    
    // 1. 维度字段
    Map<String, Object> dimValues = task.getDimensionValues();
    for (String key : dimValues.keySet()) {
      sql.append(key).append(", ");
    }
    
    // 2. 指标字段
    for (String indicator : task.getIndicatorKeys()) {
      sql.append(indicator).append(", ");
    }
    
    // 3. 元数据字段
    sql.append("_batch_id, _task_id, _fetch_task_id, _collected_at");
    sql.append(") VALUES (");
    
    // ... VALUES 部分
    sql.append(") ON DUPLICATE KEY UPDATE ");
    
    // 4. 更新逻辑
    for (String indicator : task.getIndicatorKeys()) {
      sql.append(indicator).append(" = VALUES(").append(indicator).append("), ");
    }
    sql.append("_fetch_task_id = VALUES(_fetch_task_id), ");
    sql.append("_collected_at = VALUES(_collected_at)");
    
    return sql.toString();
  }
}
```

---

## 六、实施建议

### 6.1 优先级评估

| 任务 | 优先级 | 原因 |
|------|--------|------|
| 完善 target_tables 动态建表 | P0 | 阻塞采集流程 |
| 完善 wide_table_rows CRUD | P1 | 支持预定义行数据需求 |
| 修改任务规划逻辑 | P1 | 关联 wide_table_rows 使用 |
| 数据写入 target_tables | P0 | 阻塞采集流程闭环 |
| 删除未使用表 wide_table_rows | P2 | 后续优化 |

### 6.2 代码迁移计划

#### Phase 1：基础能力（P0 - 1周）
- [ ] 实现 `TargetTableManager.ensureTargetTable()`
- [ ] 实现数据写入 `DataCollectorService`
- [ ] 验证 `target_tables` 功能

#### Phase 2：行数据管理（P1 - 2周）
- [ ] 实现 `WideTableRowRepository`
- [ ] 实现 `WideTableRowService`
- [ ] 修改任务规划逻辑支持预定义行
- [ ] 编写 API 接口测试

#### Phase 3：数据一致性（P2 - 1周）
- [ ] 迁移 legacy 数据（如有）
- [ ] 添加数据校验
- [ ] 性能优化

---

## 七、总结

### 7.1 当前问题总结

| 问题 | 描述 | 影响 |
|------|------|------|
| wide_table_rows 未使用 | 表存在但无代码操作 | 数据冗余，概念混淆 |
| target_tables 未建表 | 表名存在但无物理表 | 采集数据无法写入 |
| 数据流向断链 | wide_table_rows → target_tables 未实现 | 整体流程无法闭环 |

### 7.2 推荐方案

**采用方案A + 完善 target_tables**：

1. ✅ 保留 `wide_table_rows` 表（或合并到 `wide_tables.rows_json`）
2. ✅ 实现完整的 CRUD 和 API
3. ✅ 实现 `target_tables` 动态建表
4. ✅ 实现数据写入 `target_tables`
5. ✅ 修改任务规划逻辑支持预定义行

### 7.3 预期收益

| 指标 | 优化前 | 优化后 |
|------|--------|--------|
| 采集流程闭环 | ❌ 失败 | ✅ 成功 |
| 行数据配置 | ❌ 动态生成 | ✅ 支持预定义 |
| 数据写入 | ❌ 无目标表 | ✅ 自动建表 + 写入 |
| 可维护性 | ⚠️ 未使用表冗余 | ✅ 清晰数据流 |
| 灵活性 | ⚠️ 无法预定义 | ✅ 支持混合模式 |

---

## 八、附录

### A. 完整表结构对比

| 表名 | 用途 | 状态 | 优化建议 |
|------|------|------|----------|
| requirements | 需求聚合根 | ✅ 使用中 | 无需修改 |
| wide_tables | 宽表定义 | ✅ 使用中 | 可选：增加 rows_json |
| wide_table_rows | 预定义行数据 | ⚠️ 定义但未使用 | ✅ 保留或合并 |
| wide_table_row_snapshots | 行数据快照 | ✅ 使用中 | 保持现状 |
| target_tables.* | 物理目标表 | 🚫 未使用 | ✅ 实现动态建表 |
| task_groups | 任务组 | ✅ 使用中 | 无需修改 |
| fetch_tasks | 子任务 | ✅ 使用中 | 无需修改 |

### B. 关键字段对照表

| 概念 | requirements | wide_tables | wide_table_rows | target_tables |
|------|--------------|-------------|-----------------|---------------|
| 表名 | ❌ | ✅ `table_name` | ❌ | ✅ `wide_tables.table_name` |
| Schema | ❌ | ✅ `schema_json` | ❌ | ✅ 动态创建 |
| 行数据 | ❌ | ❌ | ✅ `dimension_values_json` | ✅ 实际写入 |
| 任务规划 | ❌ | ❌ | ❌ | ❌ |
| 采集执行 | ❌ | ❌ | ❌ | ❌ |

### C. 数据流对比

**当前流程（断裂）**：
```
requirements → wide_tables → target_tables (未实现)
     ↓
wide_table_rows (未使用)
```

**优化后流程**：
```
requirements → wide_tables → wide_table_rows → target_tables
     ↓                                    ↓
task_groups ←─────────────────────────────┘
     ↓
fetch_tasks
     ↓
target_tables (实际写入)
```

---

**文档版本**：v1.0  
**最后更新**：2026-04-23  
**作者**：System Analysis  
**审核**：待定
