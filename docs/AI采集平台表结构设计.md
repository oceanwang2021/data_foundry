# AI采集平台表结构设计方案

> 本文档基于AI采集数据平台化需求，支持多规格药品采集场景，实现按预定义表结构入库、跨期主键对比功能。

---

## 一、业务场景分析

### 1.1 核心场景

**多规格药品采集**：一个药品存在多个规格，需要一次性采集，但输出到不同的指标行。

```
┌─────────────────────────────────────────────────────────────────────┐
│                        采集请求（单个药品）                           │
├─────────────────────────────────────────────────────────────────────┤
│  药品名称: 阿莫西林胶囊                                               │
│  采集维度:                                                           │
│    - 时间: 2024年12月                                                │
│    - 地区: 全国                                                       │
├─────────────────────────────────────────────────────────────────────┤
│                          AI采集输出                                   │
├─────────────────────────────────────────────────────────────────────┤
│  规格1: 0.25g×24粒                                                   │
│    ├─ 销量: 10000盒                                                   │
│    ├─ 销售额: 50000元                                                 │
│    └─ 价格: 5元/盒                                                    │
│                                                                      │
│  规格2: 0.5g×12粒                                                    │
│    ├─ 销量: 8000盒                                                    │
│    ├─ 销售额: 64000元                                                 │
│    └─ 价格: 8元/盒                                                    │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 核心约束

1. **metric_id 唯一性**：一次采集的组合 metric_id 必须唯一，通过【指标名 + 时间】关联区分
2. **JSON 输出格式**：AI Agent 返回标准化 JSON Schema
3. **主键对比**：支持按预定义主键与上期数据对比
4. **表结构预定义**：目标表结构由用户在采集前定义

---

## 二、整体架构设计

### 2.1 架构分层

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           应用层（Application）                               │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  需求管理   │  │  宽表设计   │  │  任务调度   │  │    数据对比分析      │  │
│  │ Requirement │  │ Wide Table  │  │  Scheduler  │  │   Comparison        │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           领域层（Domain）                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────────┐     │
│  │                        数据采集引擎                                   │     │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │     │
│  │  │   Schema    │  │   Parser    │  │  Validator  │  │  Writer    │ │     │
│  │  │   解析器     │  │   数据解析   │  │  数据校验   │  │  数据写入  │ │     │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └────────────┘ │     │
│  └─────────────────────────────────────────────────────────────────────┘     │
│  ┌─────────────────────────────────────────────────────────────────────┐     │
│  │                        数据对比引擎                                   │     │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │     │
│  │  │    Diff     │  │   Merger    │  │  Analyzer   │  │  Reporter  │ │     │
│  │  │   差异计算   │  │   数据合并   │  │  变化分析   │  │  报告生成  │ │     │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └────────────┘ │     │
│  └─────────────────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          基础设施层（Infrastructure）                         │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐    │
│  │  元数据存储  │  │  采集数据存储│  │  任务队列   │  │   AI Agent      │    │
│  │  MySQL      │  │  MySQL/ClickHouse│  │  RabbitMQ │  │   Interface     │    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 数据流架构

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              数据采集流程                                        │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  步骤1: 需求定义                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐     │
│  │  用户定义采集需求                                                          │     │
│  │  ├── 药品名称: 阿莫西林胶囊                                                 │     │
│  │  ├── 采集维度: 时间(2024-12)、地区(全国)                                    │     │
│  │  └── 目标指标: 销量、销售额、价格                                           │     │
│  └─────────────────────────────────────────────────────────────────────────┘     │
│                                   │                                              │
│                                   ▼                                              │
│  步骤2: 宽表/目标表设计                                                          │
│  ┌─────────────────────────────────────────────────────────────────────────┐     │
│  │  定义目标表结构 (wide_tables)                                              │     │
│  │  ├── table_name: "dwd_drug_sales_daily"                                    │     │
│  │  ├── schema_json: [                                                         │     │
│  │  │   {"name": "stat_date", "type": "date", "is_pk": true},                  │     │
│  │  │   {"name": "region_code", "type": "string", "is_pk": true},             │     │
│  │  │   {"name": "drug_name", "type": "string", "is_pk": true},                 │     │
│  │  │   {"name": "specification", "type": "string", "is_pk": true},              │     │
│  │  │   {"name": "sales_volume", "type": "int"},                                   │     │
│  │  │   {"name": "sales_amount", "type": "decimal"},                               │     │
│  │  │   {"name": "avg_price", "type": "decimal"}                                   │     │
│  │  │ ]                                                                             │     │
│  │  └── description: "药品销售日报"                                                  │     │
│  └─────────────────────────────────────────────────────────────────────────┘     │
│                                   │                                              │
│                                   ▼                                              │
│  步骤3: 生成采集任务                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐     │
│  │  为每个规格生成 FetchTask                                                   │     │
│  │                                                                           │     │
│  │  Task 1: 规格 "0.25g×24粒"                                                  │     │
│  │  ├── fetch_task_id: "ft_001"                                                │     │
│  │  ├── batch_id: "batch_202412_001"                                           │     │
│  │  ├── dimension_values: {                                                    │     │
│  │  │   "stat_date": "2024-12-01",                                             │     │
│  │  │   "region_code": "NATIONWIDE",                                           │     │
│  │  │   "drug_name": "阿莫西林胶囊",                                            │     │
│  │  │   "specification": "0.25g×24粒"                                            │     │
│  │  │ }                                                                          │     │
│  │  └── indicator_keys: ["sales_volume", "sales_amount", "avg_price"]          │     │
│  │                                                                              │     │
│  │  Task 2: 规格 "0.5g×12粒" （结构同上，dimension_values不同）                  │     │
│  │                                                                              │     │
│  └─────────────────────────────────────────────────────────────────────────┘     │
│                                   │                                              │
│                                   ▼                                              │
│  步骤4: AI Agent 采集                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐     │
│  │  AI Agent 执行任务，返回标准化 JSON 格式                                     │     │
│  │                                                                          │     │
│  │  输入参数:                                                               │     │
│  │  {                                                                       │     │
│  │    "drug_name": "阿莫西林胶囊",                                           │     │
│  │    "specification": "0.25g×24粒",                                         │     │
│  │    "region": "全国",                                                      │     │
│  │    "time_range": "2024-12"                                                │     │
│  │  }                                                                        │     │
│  │                                                                          │     │
│  │  返回结果:                                                               │     │
│  │  {                                                                       │     │
│  │    "metric_id": "drug_sales_202412_amxl_025",                               │     │
│  │    "dimensions": {                                                         │     │
│  │      "stat_date": "2024-12-01",                                            │     │
│  │      "region_code": "NATIONWIDE",                                          │     │
│  │      "drug_name": "阿莫西林胶囊",                                           │     │
│  │      "specification": "0.25g×24粒"                                          │     │
│  │    },                                                                      │     │
│  │    "indicators": {                                                         │     │
│  │      "sales_volume": 10000,                                                │     │
│  │      "sales_amount": 50000.00,                                               │     │
│  │      "avg_price": 5.00                                                      │     │
│  │    },                                                                      │     │
│  │    "confidence": 0.95,                                                      │     │
│  │    "collect_time": "2024-12-15T10:30:00Z"                                   │     │
│  │  }                                                                        │     │
│  │                                                                          │     │
│  └─────────────────────────────────────────────────────────────────────────┘     │
│                                   │                                              │
│                                   ▼                                              │
│  步骤5: 数据写入与对比                                                            │
│  ┌─────────────────────────────────────────────────────────────────────────┐     │
│  │  a) 解析并写入目标表                                                       │     │
│  │     - 解析 dimensions → 维度字段                                           │     │
│  │     - 解析 indicators → 指标字段                                           │     │
│  │     - 写入 dwd_drug_sales_daily                                            │     │
│  │                                                                          │     │
│  │  b) 与上期数据对比                                                         │     │
│  │     - 查询上期批次数据（stat_date + specification 为主键）                    │     │
│  │     - 计算 sales_volume、sales_amount 变化                                  │     │
│  │     - 生成对比报告                                                          │     │
│  │                                                                          │     │
│  └─────────────────────────────────────────────────────────────────────────┘     │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 三、完整表结构设计

### 3.1 元数据层（Metadata）

#### 3.1.1 项目表（projects）

```sql
CREATE TABLE projects (
  id VARCHAR(64) NOT NULL PRIMARY KEY COMMENT '项目ID',
  name VARCHAR(255) NOT NULL COMMENT '项目名称',
  business_background TEXT COMMENT '业务背景',
  description TEXT COMMENT '项目描述',
  status VARCHAR(32) NOT NULL DEFAULT 'active' COMMENT '状态: active/archived',
  owner_team VARCHAR(255) NOT NULL DEFAULT '' COMMENT '负责团队',
  data_source JSON COMMENT '数据源配置',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_projects_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='项目主表';
```

**承载信息**：数据工程项目的元数据，一个项目可包含多个采集需求。

---

#### 3.1.2 需求表（requirements）

```sql
CREATE TABLE requirements (
  id VARCHAR(64) NOT NULL PRIMARY KEY COMMENT '需求ID',
  project_id VARCHAR(64) NOT NULL COMMENT '所属项目ID',
  title VARCHAR(255) NOT NULL COMMENT '需求标题',
  phase VARCHAR(32) NOT NULL DEFAULT 'demo' COMMENT '阶段: demo/production',
  status VARCHAR(32) NOT NULL DEFAULT 'draft' COMMENT '状态: draft/active/completed',
  schema_locked TINYINT(1) NULL COMMENT 'schema是否锁定',
  owner VARCHAR(255) NULL COMMENT '负责人',
  assignee VARCHAR(255) NULL COMMENT '执行人',
  business_goal TEXT NULL COMMENT '业务目标',
  background_knowledge TEXT NULL COMMENT '背景知识',
  business_boundary TEXT NULL COMMENT '业务边界',
  delivery_scope TEXT NULL COMMENT '交付范围',
  processing_rule_drafts JSON NULL COMMENT '处理规则草稿',
  collection_policy JSON NULL COMMENT '采集策略配置',
  data_update_enabled TINYINT(1) NULL COMMENT '是否启用数据更新',
  data_update_mode VARCHAR(32) NULL COMMENT '更新模式: full/incremental',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_requirements_project_id (project_id),
  INDEX idx_requirements_created_at (created_at),
  INDEX idx_requirements_project_created_at (project_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='需求表';
```

**承载信息**：采集需求的全生命周期管理，一个需求对应一个宽表（目标表）。

---

#### 3.1.3 宽表定义表（wide_tables）

```sql
CREATE TABLE wide_tables (
  id VARCHAR(64) NOT NULL PRIMARY KEY COMMENT '宽表ID',
  sort_order INT NOT NULL DEFAULT 0 COMMENT '排序序号',
  requirement_id VARCHAR(64) NOT NULL COMMENT '所属需求ID',
  title VARCHAR(255) NOT NULL COMMENT '宽表标题',
  description TEXT NULL COMMENT '宽表描述',
  table_name VARCHAR(255) NOT NULL COMMENT '目标物理表名（如 dwd_drug_sales_daily）',
  schema_version INT NOT NULL DEFAULT 1 COMMENT 'Schema版本号',
  schema_json JSON NULL COMMENT '字段定义Schema（维度+指标）',
  scope_json JSON NULL COMMENT '作用域配置',
  indicator_groups_json JSON NULL COMMENT '指标分组定义',
  schedule_rules_json JSON NULL COMMENT '调度规则',
  semantic_time_axis VARCHAR(32) NULL COMMENT '语义时间轴',
  collection_coverage_mode VARCHAR(64) NULL COMMENT '采集覆盖模式',
  status VARCHAR(32) NOT NULL DEFAULT 'active' COMMENT '状态: active/archived',
  record_count INT NOT NULL DEFAULT 0 COMMENT '记录数统计',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_wide_tables_requirement_id (requirement_id),
  INDEX idx_wide_tables_sort_order (sort_order),
  INDEX idx_wide_tables_requirement_sort (requirement_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='宽表定义表';
```

**承载信息**：目标采集表的结构定义，包括维度字段和指标字段的Schema。

**schema_json 示例**：
```json
[
  {
    "field_id": "dim_date",
    "field_name": "stat_date",
    "field_type": "date",
    "field_desc": "统计日期",
    "is_dimension": true,
    "is_pk": true,
    "required": true
  },
  {
    "field_id": "dim_region",
    "field_name": "region_code",
    "field_type": "string",
    "field_desc": "地区编码",
    "is_dimension": true,
    "is_pk": true,
    "required": true
  },
  {
    "field_id": "dim_drug",
    "field_name": "drug_name",
    "field_type": "string",
    "field_desc": "药品名称",
    "is_dimension": true,
    "is_pk": true,
    "required": true
  },
  {
    "field_id": "dim_spec",
    "field_name": "specification",
    "field_type": "string",
    "field_desc": "规格",
    "is_dimension": true,
    "is_pk": true,
    "required": true
  },
  {
    "field_id": "ind_sales_vol",
    "field_name": "sales_volume",
    "field_type": "int",
    "field_desc": "销量（盒）",
    "is_dimension": false,
    "is_pk": false,
    "required": true,
    "unit": "盒"
  },
  {
    "field_id": "ind_sales_amt",
    "field_name": "sales_amount",
    "field_type": "decimal",
    "field_desc": "销售额（元）",
    "is_dimension": false,
    "is_pk": false,
    "required": true,
    "unit": "元",
    "precision": 18,
    "scale": 2
  },
  {
    "field_id": "ind_price",
    "field_name": "avg_price",
    "field_type": "decimal",
    "field_desc": "平均价格（元）",
    "is_dimension": false,
    "is_pk": false,
    "required": true,
    "unit": "元",
    "precision": 18,
    "scale": 2
  }
]
```

---

### 3.1.4 任务组表（task_groups）

```sql
CREATE TABLE task_groups (
  id VARCHAR(64) NOT NULL PRIMARY KEY COMMENT '任务组ID',
  sort_order INT NOT NULL DEFAULT 0 COMMENT '排序序号',
  requirement_id VARCHAR(64) NOT NULL COMMENT '所属需求ID',
  wide_table_id VARCHAR(64) NOT NULL COMMENT '所属宽表ID',
  batch_id VARCHAR(64) NULL COMMENT '批次ID（用于对比的唯一标识）',
  business_date VARCHAR(32) NULL COMMENT '业务日期（如 2024-12-01）',
  source_type VARCHAR(32) NULL COMMENT '数据源类型',
  status VARCHAR(32) NOT NULL DEFAULT 'pending' COMMENT '状态: pending/running/completed/failed',
  schedule_rule_id VARCHAR(64) NULL COMMENT '调度规则ID',
  backfill_request_id VARCHAR(64) NULL COMMENT '回填请求ID',
  plan_version INT NOT NULL DEFAULT 1 COMMENT '计划版本',
  group_kind VARCHAR(32) NULL COMMENT '任务组类型',
  partition_type VARCHAR(32) NULL COMMENT '分区类型',
  partition_key VARCHAR(255) NULL COMMENT '分区键',
  partition_label VARCHAR(255) NULL COMMENT '分区标签',
  total_tasks INT NOT NULL DEFAULT 0 COMMENT '总任务数',
  completed_tasks INT NOT NULL DEFAULT 0 COMMENT '已完成任务数',
  failed_tasks INT NOT NULL DEFAULT 0 COMMENT '失败任务数',
  triggered_by VARCHAR(64) NULL COMMENT '触发者',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_tg_requirement_id (requirement_id),
  INDEX idx_tg_requirement_sort (requirement_id, sort_order),
  INDEX idx_tg_requirement_wide_table_sort (requirement_id, wide_table_id, sort_order),
  INDEX idx_tg_wide_table_id (wide_table_id),
  INDEX idx_tg_business_date (business_date),
  INDEX idx_tg_batch_id (batch_id),
  INDEX idx_tg_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='任务组表';
```

**承载信息**：一次采集计划的批次管理，一个任务组包含多个采集任务（每个规格对应一个任务）。

---

### 3.1.5 采集任务表（fetch_tasks）

```sql
CREATE TABLE fetch_tasks (
  id VARCHAR(128) NOT NULL PRIMARY KEY COMMENT '任务ID',
  sort_order INT NOT NULL DEFAULT 0 COMMENT '排序序号',
  requirement_id VARCHAR(64) NOT NULL COMMENT '所属需求ID',
  wide_table_id VARCHAR(64) NOT NULL COMMENT '所属宽表ID',
  task_group_id VARCHAR(64) NULL COMMENT '所属任务组ID',
  batch_id VARCHAR(64) NULL COMMENT '批次ID',
  row_id INT NULL COMMENT '行号（在组内序号）',
  indicator_group_id VARCHAR(64) NULL COMMENT '指标组ID',
  indicator_group_name VARCHAR(255) NULL COMMENT '指标组名称（如规格描述）',
  name VARCHAR(512) NULL COMMENT '任务名称',
  schema_version INT NOT NULL DEFAULT 1 COMMENT 'Schema版本',
  execution_mode VARCHAR(32) NULL COMMENT '执行模式: realtime/batch',
  indicator_keys_json JSON NULL COMMENT '指标字段列表',
  dimension_values_json JSON NULL COMMENT '维度值（构成主键部分）',
  business_date VARCHAR(32) NULL COMMENT '业务日期',
  status VARCHAR(32) NOT NULL DEFAULT 'pending' COMMENT '状态: pending/running/completed/failed/cancelled',
  can_rerun TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否可重跑',
  invalidated_reason TEXT NULL COMMENT '失效原因',
  owner VARCHAR(255) NULL COMMENT '执行者',
  confidence DECIMAL(5,2) NULL COMMENT '置信度（AI返回）',
  plan_version INT NOT NULL DEFAULT 1 COMMENT '计划版本',
  row_binding_key VARCHAR(512) NULL COMMENT '行级绑定键（用于主键对比）',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ft_requirement_id (requirement_id),
  INDEX idx_ft_requirement_sort (requirement_id, sort_order),
  INDEX idx_ft_wide_table_id (wide_table_id),
  INDEX idx_ft_task_group_id (task_group_id),
  INDEX idx_ft_task_group_sort (task_group_id, sort_order),
  INDEX idx_ft_batch_id (batch_id),
  INDEX idx_ft_status (status),
  INDEX idx_ft_row_binding_key (row_binding_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='采集任务表';
```

**承载信息**：最细粒度的采集任务，每个规格对应一个 FetchTask。

**关键字段说明**：
- `dimension_values_json`：维度值（如日期、地区、药品名、规格）
- `indicator_keys_json`：要采集的指标字段
- `row_binding_key`：行级唯一键（如 "2024-12|阿莫西林|0.25g"）
- `batch_id`：批次标识（用于区分不同采集周期）

---

### 3.1.6 采集结果表（collection_results）【新增】

```sql
CREATE TABLE collection_results (
  id VARCHAR(128) NOT NULL PRIMARY KEY COMMENT '结果ID',
  fetch_task_id VARCHAR(128) NOT NULL COMMENT '所属采集任务ID',
  batch_id VARCHAR(64) NOT NULL COMMENT '批次ID',
  wide_table_id VARCHAR(64) NOT NULL COMMENT '宽表ID',
  metric_id VARCHAR(128) NOT NULL COMMENT '指标唯一标识（AI返回）',
  dimensions_json JSON NOT NULL COMMENT '维度值（完整）',
  indicators_json JSON NOT NULL COMMENT '指标值（完整）',
  raw_data_json JSON NULL COMMENT 'AI返回的原始数据（保留）',
  confidence DECIMAL(5,2) NULL COMMENT '置信度（0-1）',
  collect_time DATETIME NULL COMMENT 'AI采集时间',
  status VARCHAR(32) NOT NULL DEFAULT 'success' COMMENT '状态: success/partial/failed',
  error_msg TEXT NULL COMMENT '错误信息',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_cr_fetch_task_id (fetch_task_id),
  INDEX idx_cr_batch_id (batch_id),
  INDEX idx_cr_wide_table_id (wide_table_id),
  INDEX idx_cr_metric_id (metric_id),
  INDEX idx_cr_collect_time (collect_time),
  INDEX idx_cr_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='采集结果表';
```

**承载信息**：存储 AI Agent 返回的原始采集结果，作为数据追溯和审计的依据。

---

### 3.1.7 目标数据存储表（动态创建）

基于 `wide_tables` 定义动态创建的物理表。

**命名规范**：`dwd_<业务域>_<周期>_<维度>`

**示例**：`dwd_drug_sales_daily`

```sql
-- 动态创建的示例表结构
CREATE TABLE dwd_drug_sales_daily (
  -- 维度字段（来自 schema_json 中 is_dimension=true & is_pk=true）
  stat_date DATE NOT NULL COMMENT '统计日期',
  region_code VARCHAR(32) NOT NULL COMMENT '地区编码',
  drug_name VARCHAR(255) NOT NULL COMMENT '药品名称',
  specification VARCHAR(255) NOT NULL COMMENT '规格',
  
  -- 指标字段（来自 schema_json 中 is_dimension=false）
  sales_volume INT COMMENT '销量（盒）',
  sales_amount DECIMAL(18,2) COMMENT '销售额（元）',
  avg_price DECIMAL(18,2) COMMENT '平均价格（元）',
  
  -- 元数据字段（系统生成，用于追溯和对比）
  _batch_id VARCHAR(64) NOT NULL COMMENT '批次ID（用于区分采集周期）',
  _fetch_task_id VARCHAR(128) COMMENT '采集任务ID',
  _metric_id VARCHAR(128) COMMENT '指标唯一标识',
  _confidence DECIMAL(5,2) COMMENT '置信度',
  _collected_at DATETIME COMMENT '采集时间',
  _created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '入库时间',
  
  -- 主键：维度字段 + _batch_id（支持多版本存储）
  PRIMARY KEY (stat_date, region_code, drug_name, specification, _batch_id),
  
  -- 索引
  KEY idx_batch_id (_batch_id),
  KEY idx_metric_id (_metric_id),
  KEY idx_collected_at (_collected_at),
  KEY idx_drug_spec (drug_name, specification)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='药品销售日报表';
```

---

## 四、核心流程时序图

### 4.1 采集流程

```
┌─────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  用户   │     │  需求管理   │     │  宽表设计   │     │  任务调度   │     │  AI Agent   │
└────┬────┘     └──────┬──────┘     └──────┬──────┘     └──────┬──────┘     └──────┬──────┘
     │                 │                   │                   │                   │
     │ 1.创建需求      │                   │                   │                   │
     │────────────────>│                   │                   │                   │
     │                 │                   │                   │                   │
     │                 │ 2.定义宽表结构     │                   │                   │
     │                 │──────────────────>│                   │                   │
     │                 │                   │                   │                   │
     │                 │                   │ 3.生成采集任务     │                   │
     │                 │                   │──────────────────>│                   │
     │                 │                   │                   │                   │
     │                 │                   │                   │ 4.执行采集        │
     │                 │                   │                   │─────────────────>│
     │                 │                   │                   │                   │
     │                 │                   │                   │ 5.返回JSON结果    │
     │                 │                   │                   │<─────────────────│
     │                 │                   │                   │                   │
     │                 │                   │                   │ 6.写入目标表      │
     │                 │                   │                   │────┬─────────────>│
     │                 │                   │                   │    │             │
     │                 │                   │                   │<───┘             │
     │                 │                   │                   │                   │
     │                 │                   │ 7.完成            │                   │
     │                 │                   │<──────────────────│                   │
```

### 4.2 对比流程

```
┌─────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────────┐
│  用户   │     │  对比服务   │     │  目标数据表  │     │  对比结果存储    │
└────┬────┘     └──────┬──────┘     └──────┬──────┘     └────────┬────────┘
     │                 │                   │                     │
     │ 1.发起对比请求   │                   │                     │
     │ (本期vs上期)    │                   │                     │
     │────────────────>│                   │                     │
     │                 │                   │                     │
     │                 │ 2.查询本期数据     │                     │
     │                 │ (batch_id=本期)  │                     │
     │                 │──────────────────>│                     │
     │                 │                   │                     │
     │                 │ 3.返回本期数据     │                     │
     │                 │<──────────────────│                     │
     │                 │                   │                     │
     │                 │ 4.查询上期数据     │                     │
     │                 │ (batch_id=上期)  │                     │
     │                 │──────────────────>│                     │
     │                 │                   │                     │
     │                 │ 5.返回上期数据     │                     │
     │                 │<──────────────────│                     │
     │                 │                   │                     │
     │                 │ 6.执行对比计算     │                     │
     │                 │ (新增/删除/变化)  │                     │
     │                 │────┬──────────────┘                     │
     │                 │    │                                   │
     │                 │<───┘                                   │
     │                 │                                       │
     │                 │ 7.保存对比结果         │                     │
     │                 │───────────────────────>│                     │
     │                 │                                       │
     │ 8.返回对比报告   │                                       │
     │<────────────────│                                       │
     │                 │                                       │
```

---

## 五、关键设计决策

### 5.1 多规格采集模型

**挑战**：一个药品有多个规格，需要同时采集，但输出到不同行。

**解决方案**：

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        多规格采集模型                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  采集请求（单药品）                                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐     │
│  │  药品: 阿莫西林胶囊                                                    │     │
│  │  规格列表: ["0.25g×24粒", "0.5g×12粒", "1g×6粒"]                        │     │
│  └─────────────────────────────────────────────────────────────────────┘     │
│                                   │                                          │
│                                   ▼                                          │
│  生成任务组（TaskGroup）                                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐     │
│  │  batch_id: "batch_202412_amxl_001"                                     │     │
│  │  drug_name: "阿莫西林胶囊"                                             │     │
│  └─────────────────────────────────────────────────────────────────────┘     │
│                                   │                                          │
│                                   ▼                                          │
│  为每个规格生成 FetchTask（3个）                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐     │
│  │                                                                      │     │
│  │  Task 1: 0.25g×24粒                                                   │     │
│  │  ├─ fetch_task_id: "ft_amxl_001_025"                                    │     │
│  │  ├─ dimension_values: {                                                │     │
│  │  │   "drug_name": "阿莫西林胶囊",                                       │     │
│  │  │   "specification": "0.25g×24粒",                                    │     │
│  │  │   "stat_date": "2024-12-01"                                        │     │
│  │  │ }                                                                   │     │
│  │  └─ indicator_keys: ["sales_volume", "sales_amount", "avg_price"]      │     │
│  │                                                                      │     │
│  │  Task 2: 0.5g×12粒（类似结构）                                         │     │
│  │                                                                      │     │
│  │  Task 3: 1g×6粒（类似结构）                                            │     │
│  │                                                                      │     │
│  └─────────────────────────────────────────────────────────────────────┘     │
│                                   │                                          │
│                                   ▼                                          │
│  AI Agent 执行采集                                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐     │
│  │  每个 Task 独立调用 AI Agent，返回 JSON 格式数据                         │     │
│  └─────────────────────────────────────────────────────────────────────┘     │
│                                   │                                          │
│                                   ▼                                          │
│  数据写入目标表                                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐     │
│  │  dwd_drug_sales_daily                                                │     │
│  │  ├─ (2024-12-01, NATIONWIDE, 阿莫西林胶囊, 0.25g×24粒, 10000, 50000, 5) │     │
│  │  ├─ (2024-12-01, NATIONWIDE, 阿莫西林胶囊, 0.5g×12粒, 8000, 64000, 8)  │     │
│  │  └─ (2024-12-01, NATIONWIDE, 阿莫西林胶囊, 1g×6粒, 5000, 50000, 10)     │     │
│  └─────────────────────────────────────────────────────────────────────┘     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 指标唯一标识设计

**核心约束**：metric_id 在单次采集中必须唯一，通过【指标名 + 时间】关联区分。

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     metric_id 生成规则                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  格式: {business_type}_{time}_{drug_code}_{spec_code}_{indicator}            │
│                                                                              │
│  示例:                                                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐     │
│  │  业务类型: drug_sales (药品销售)                                      │     │
│  │  时间: 202412 (2024年12月)                                            │     │
│  │  药品编码: amxl (阿莫西林)                                            │     │
│  │  规格编码: 025 (0.25g)                                                │     │
│  │  指标: volume (销量)                                                  │     │
│  ├─────────────────────────────────────────────────────────────────────┤     │
│  │  metric_id: drug_sales_202412_amxl_025_volume                         │     │
│  └─────────────────────────────────────────────────────────────────────┘     │
│                                                                              │
│  数据库索引:                                                                 │
│  - 唯一索引: (batch_id, metric_id) - 确保单次采集内 metric_id 唯一           │
│  - 普通索引: (metric_id, collect_time) - 用于跨期对比查询                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.3 主键对比模型

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      跨期主键对比模型                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  主键定义（来自 wide_tables.schema_json）                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐     │
│  │  维度字段组合成主键                                                  │     │
│  │  ├── stat_date (日期)                                                │     │
│  │  ├── region_code (地区)                                              │     │
│  │  ├── drug_name (药品名)                                                │     │
│  │  └── specification (规格)                                               │     │
│  └─────────────────────────────────────────────────────────────────────┘     │
│                                   │                                          │
│                                   ▼                                          │
│  对比逻辑                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐     │
│  │                                                                      │     │
│  │  上期数据 (batch_202411)          本期数据 (batch_202412)              │     │
│  │  ┌─────────────────────────┐      ┌─────────────────────────┐          │     │
│  │  │ (2024-11, 全国, 阿莫西林 │      │ (2024-12, 全国, 阿莫西林 │          │     │
│  │  │  胶囊, 0.25g, 9000, 45000 │      │  胶囊, 0.25g, 10000, 50000│ ← 变化   │     │
│  │  │  , 5)                   │      │  , 5)                   │          │     │
│  │  ├─────────────────────────┤      ├─────────────────────────┤          │     │
│  │  │ (2024-11, 全国, 阿莫西林 │      │ (2024-12, 全国, 阿莫西林 │          │     │
│  │  │  胶囊, 0.5g, 7500, 60000 │      │  胶囊, 0.5g, 8000, 64000) │ ← 变化   │     │
│  │  │  , 8)                   │      │                         │          │     │
│  │  ├─────────────────────────┤      ├─────────────────────────┤          │     │
│  │  │ (2024-11, 全国, 阿莫西林 │      │ (2024-12, 全国, 阿莫西林 │          │     │
│  │  │  胶囊, 1g, 4500, 45000  │      │  胶囊, 1g, 5000, 50000) │ ← 变化   │     │
│  │  │  , 10)                  │      │                         │          │     │
│  │  ├─────────────────────────┤      ├─────────────────────────┤          │     │
│  │  │ (2024-11, 全国, 头孢克   │      │ (2024-12, 全国, 头孢克   │          │     │
│  │  │  肟, 0.1g, 12000, 120000│      │  肟, 0.1g, 13000, 130000│ ← 变化   │     │
│  │  │  , 10)                  │      │  , 10)                  │          │     │
│  │  └─────────────────────────┘      └─────────────────────────┘          │     │
│  │                                                                             │     │
│  └─────────────────────────────────────────────────────────────────────────────┘     │
│                                   │                                          │
│                                   ▼                                          │
│  对比结果                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐     │
│  │  对比维度: stat_date + region_code + drug_name + specification      │     │
│  │                                                                     │     │
│  │  药品: 阿莫西林胶囊                                                  │     │
│  │  ┌──────────┬──────────┬──────────┬──────────┐                       │     │
│  │  │  规格    │  指标    │  上期值  │  本期值  │  变化      │           │     │
│  │  ├──────────┼──────────┼──────────┼──────────┼────────────┤           │     │
│  │  │ 0.25g    │ 销量     │ 9000     │ 10000    │ +1000(+11%)│           │     │
│  │  │          │ 销售额   │ 45000    │ 50000    │ +5000(+11%)│           │     │
│  │  ├──────────┼──────────┼──────────┼──────────┼────────────┤           │     │
│  │  │ 0.5g     │ 销量     │ 7500     │ 8000     │ +500(+6.7%)│           │     │
│  │  │          │ 销售额   │ 60000    │ 64000    │ +4000(+6.7%)│          │     │
│  │  ├──────────┼──────────┼──────────┼──────────┼────────────┤           │     │
│  │  │ 1g       │ 销量     │ 4500     │ 5000     │ +500(+11%) │           │     │
│  │  │          │ 销售额   │ 45000    │ 50000    │ +5000(+11%) │           │     │
│  │  └──────────┴──────────┴──────────┴──────────┴────────────┘           │     │
│  │                                                                              │     │
│  └──────────────────────────────────────────────────────────────────────────────┘     │
│                                                                                       │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 五、关键问题解答

### 5.1 如何处理多规格药品的一次性采集？

**方案**：在 FetchTask 层面拆分，每个规格对应一个 FetchTask，共享同一个 TaskGroup。

```
采集请求（药品：阿莫西林胶囊）
    │
    ▼
生成 TaskGroup（batch_id: batch_202412_amxl）
    │
    ├── 生成 FetchTask 1（spec: 0.25g×24粒）
    │       ├── dimension_values.specification = "0.25g×24粒"
    │       └── row_binding_key = "2024-12|NATIONWIDE|阿莫西林胶囊|0.25g×24粒"
    │
    ├── 生成 FetchTask 2（spec: 0.5g×12粒）
    │       ├── dimension_values.specification = "0.5g×12粒"
    │       └── row_binding_key = "2024-12|NATIONWIDE|阿莫西林胶囊|0.5g×12粒"
    │
    └── 生成 FetchTask 3（spec: 1g×6粒）
            ├── dimension_values.specification = "1g×6粒"
            └── row_binding_key = "2024-12|NATIONWIDE|阿莫西林胶囊|1g×6粒"
```

### 5.2 如何实现 metric_id 唯一性？

**规则**：
```
metric_id = {business_type}_{time}_{drug_code}_{spec_code}_{indicator}

示例：
- drug_sales_202412_amxl_025_volume
- drug_sales_202412_amxl_025_amount
- drug_sales_202412_amxl_025_price
```

**数据库约束**：
```sql
-- 在 collection_results 表中
UNIQUE KEY uk_metric_batch (batch_id, metric_id)
```

### 5.3 如何实现跨期主键对比？

**主键定义**：`stat_date + region_code + drug_name + specification`

**对比 SQL**：
```sql
-- 对比本期与上期数据
SELECT 
  COALESCE(c.stat_date, p.stat_date) as stat_date,
  COALESCE(c.specification, p.specification) as specification,
  -- 本期值
  c.sales_volume as current_volume,
  c.sales_amount as current_amount,
  -- 上期值
  p.sales_volume as previous_volume,
  p.sales_amount as previous_amount,
  -- 变化
  COALESCE(c.sales_volume, 0) - COALESCE(p.sales_volume, 0) as volume_diff,
  COALESCE(c.sales_amount, 0) - COALESCE(p.sales_amount, 0) as amount_diff,
  -- 状态
  CASE 
    WHEN p._batch_id IS NULL THEN 'NEW'
    WHEN c._batch_id IS NULL THEN 'DELETED'
    WHEN c.sales_volume != p.sales_volume OR c.sales_amount != p.sales_amount THEN 'CHANGED'
    ELSE 'UNCHANGED'
  END as compare_status
FROM (
  SELECT * FROM dwd_drug_sales_daily 
  WHERE _batch_id = 'batch_202412_amxl'  -- 本期
) c
FULL OUTER JOIN (
  SELECT * FROM dwd_drug_sales_daily 
  WHERE _batch_id = 'batch_202411_amxl'  -- 上期
) p ON c.stat_date = p.stat_date 
   AND c.specification = p.specification;
```

---

## 六、实施建议

### 6.1 开发优先级

| 阶段 | 周期 | 内容 |
|------|------|------|
| Phase 1 | 1-2周 | 元数据表建设（projects/requirements/wide_tables） |
| Phase 2 | 1-2周 | 任务调度表（task_groups/fetch_tasks） |
| Phase 3 | 1周 | 采集结果表（collection_results） |
| Phase 4 | 2周 | 动态目标表创建 + 数据写入 |
| Phase 5 | 1-2周 | 跨期对比功能 |

### 6.2 性能优化

1. **分区策略**：目标表按 `stat_date` 或 `_batch_id` 分区
2. **索引优化**：维度字段建立复合索引 `(stat_date, drug_name, specification)`
3. **批量写入**：单批次 1000-5000 条，使用 JDBC batch insert
4. **异步处理**：采集和写入使用线程池异步执行

### 6.3 数据质量保障

1. **schema 校验**：写入前校验数据类型和必填字段
2. **重复检测**：使用 `row_binding_key` 检测重复采集
3. **置信度过滤**：低于阈值（如 0.7）的数据标记为待审核
4. **数据审计**：保留 `collection_results.raw_data_json` 用于追溯

---

## 七、参考文档

- [数据库表结构说明](./数据库表结构说明.md)
- [采集数据存储与对比方案](./采集数据存储与对比方案.md)
- [DDD-数据库表改造方案.md](./DDD-数据库表改造方案.md)
- AI接口算法补充说明(1).docx
