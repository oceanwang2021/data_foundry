// ==================== 基础辅助类型 ====================

export type SearchEngineProvider = "volcano" | "bing";

export type KnowledgeBase = {
  id: string;
  name: string;
  description: string;
  documentCount: number;
  status: "indexing" | "ready" | "error";
  lastUpdated: string;
};

// ==================== 项目 ====================

export type TargetTableSummary = {
  tableName: string;
  tableComment?: string;
  createTime?: string;
  updateTime?: string;
};

export type TargetTableColumn = {
  columnName: string;
  dataType: string;
  columnType?: string;
  isNullable?: string;
  columnComment?: string;
  ordinalPosition?: number;
};

export type Project = {
  id: string;
  name: string;
  createdBy?: string;
  businessBackground?: string;
  description: string;
  status: "active" | "planning";
  ownerTeam: string;
  dataSource: {
    search: {
      engines: SearchEngineProvider[];
      sites: string[];
      sitePolicy: "preferred" | "whitelist";
    };
    knowledgeBases: string[];
    fixedUrls?: string[];
  };
  createdAt: string;
};

// ==================== 需求 ====================

export type RequirementType = "production";
export type RequirementDataUpdateMode = "full" | "incremental";
export type RequirementCollectionPolicy = {
  searchEngines: SearchEngineProvider[];
  preferredSites: string[];
  sitePolicy: "preferred" | "whitelist";
  knowledgeBases: string[];
  nullPolicy: string;
  sourcePriority: string;
  valueFormat: string;
};

export type Requirement = {
  id: string;
  projectId: string;
  requirementType: RequirementType;
  title: string;
  status: "draft" | "aligning" | "ready" | "running";
  schemaLocked?: boolean;
  owner: string;
  assignee: string;
  businessGoal: string;
  backgroundKnowledge?: string;
  businessBoundary?: string;
  deliveryScope?: string;
  collectionPolicy?: RequirementCollectionPolicy;
  dataUpdateEnabled?: boolean;
  dataUpdateMode?: RequirementDataUpdateMode | null;
  wideTable?: WideTable;
  processingRuleDrafts?: Array<{
    id: string;
    name: string;
    note: string;
    wideTableId?: string;
    indicatorColumnName?: string;
    indicatorLabel?: string;
  }>;
  createdAt: string;
  updatedAt: string;
};

// ==================== 宽表 ====================

export type ColumnCategory = "id" | "dimension" | "attribute" | "indicator" | "system";

export type ColumnDefinition = {
  id: string;
  name: string;
  chineseName?: string;
  type: "STRING" | "NUMBER" | "DATE" | "BOOLEAN" | "INTEGER";
  category: ColumnCategory;
  description: string;
  unit?: string;
  required: boolean;
  isBusinessDate?: boolean;
  passthroughEnabled?: boolean;
  passthroughContent?: string;
  auditRuleType?: "max_lte" | "min_gte" | "change_rate_lte" | "not_empty";
  auditRuleValue?: string;
};

export type WideTableSchema = {
  columns: ColumnDefinition[];
};

export type DimensionRange = {
  dimensionName: string;
  values: string[];
};

export type BusinessDateFrequency = "daily" | "weekly" | "monthly" | "quarterly" | "yearly";

export type BusinessDateRange = {
  start: string;
  end: string | "never";
  frequency: BusinessDateFrequency;
  quarterlyForLatestYear?: boolean;
};

export type WideTable = {
  id: string;
  requirementId: string;
  name: string;
  description: string;
  schema: WideTableSchema;
  schemaVersion?: number;
  dimensionRanges: DimensionRange[];
  businessDateRange: BusinessDateRange;
  semanticTimeAxis?: "business_date" | "none";
  collectionCoverageMode?: "incremental_by_business_date" | "full_snapshot";
  indicatorGroups: IndicatorGroup[];
  scheduleRule?: ScheduleRule;
  currentPlanVersion?: number;
  currentPlanFingerprint?: string;
  recordCount: number;
  status: "draft" | "initialized" | "active";
  createdAt: string;
  updatedAt: string;
};

// ==================== 宽表记录 ====================

export type WideTableRecord = {
  id: number;
  wideTableId: string;
  [key: string]: any;
  _metadata?: {
    confidence?: number;
    highlight?: boolean;
    historyDiff?: boolean;
    auditChanged?: boolean;
    auditComment?: string;
    planVersion?: number;
    snapshotKind?: "baseline" | "delta";
    /** Agent 原始返回值（后处理前），用于验收差异对比 */
    agentRawValues?: Record<string, {
      rawValue: string | number | null;
      dataSource?: string;
      sourceUrl?: string;
      quoteText?: string;
      confidence?: number;
    }>;
    /** 上一轮采集值，用于验收差异展示 */
    previousValues?: Record<string, string | number | null>;
  };
};

// ==================== 指标组 ====================

export type IndicatorGroup = {
  id: string;
  wideTableId: string;
  name: string;
  indicatorColumns: string[];
  agent?: string;
  promptTemplate?: string;
  promptConfig?: {
    coreQueryRequirement?: string;
    businessKnowledge?: string;
    metricList?: string;
    dimensionColumns?: string;
    outputConstraints?: string;
    lastEditedAt?: string;
  };
  priority: number;
  description: string;
};

// ==================== 调度规则 ====================

export type ScheduleRule = {
  id: string;
  wideTableId: string;
  type: "adhoc" | "periodic";
  cronExpression?: string;
  periodLabel?: string;
  businessDateOffsetDays: number;
  description: string;
};

// ==================== 任务组 ====================

export type TaskGroupStatus = "pending" | "running" | "completed" | "partial" | "invalidated";

export type TaskGroup = {
  id: string;
  wideTableId: string;
  businessDate: string;
  businessDateLabel: string;
  batchId?: string;
  partitionType?: "business_date" | "full_table" | "shard";
  partitionKey?: string;
  partitionLabel?: string;
  planVersion?: number;
  groupKind?: "baseline" | "delta";
  coverageStatus?: "current" | "stale";
  deltaReason?: string;
  rowSnapshots?: WideTableRecord[];
  status: TaskGroupStatus;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  triggeredBy: "schedule" | "backfill" | "manual" | "trial";
  createdAt: string;
  updatedAt: string;
};

// ==================== 采集任务 ====================

export type FetchTaskStatus = "pending" | "running" | "completed" | "failed" | "invalidated";

export type FetchTask = {
  id: string;
  taskGroupId: string;
  wideTableId: string;
  batchId?: string;
  rowId: number;
  planVersion?: number;
  rowBindingKey?: string;
  indicatorGroupId: string;
  indicatorGroupName: string;
  status: FetchTaskStatus;
  confidence?: number;
  executionRecords: ExecutionRecord[];
  createdAt: string;
  updatedAt: string;
};

export type CollectionBatch = {
  id: string;
  wideTableId: string;
  snapshotAt: string;
  snapshotLabel: string;
  coverageMode: "incremental_by_business_date" | "full_snapshot";
  semanticTimeAxis: "business_date" | "none";
  status: "pending" | "running" | "completed" | "failed" | "invalidated";
  isCurrent: boolean;
  planVersion?: number;
  triggeredBy?: string;
  startBusinessDate?: string;
  endBusinessDate?: string;
  createdAt: string;
  updatedAt: string;
};

// ==================== 窄表请求 ====================

export type NarrowTableRow = {
  rowId: number;
  indicatorName: string;
  indicatorDescription: string;
  unit?: string;
  indicatorUnit?: string;
  publishedAt?: string;
  sourceSite?: string;
  dataSource?: string;
  indicatorLogic?: string;
  indicatorLogicSupplement?: string;
  indicatorValueDescription?: string;
  maxValue?: number;
  minValue?: number;
  sourceUrl?: string;
  quoteText?: string;
  dimensionValues: Record<string, string>;
};

// ==================== 执行记录 ====================

export type ExecutionRecord = {
  id: string;
  fetchTaskId: string;
  attempt: number;
  status: "running" | "success" | "failure" | "timeout";
  triggeredBy: "schedule" | "backfill" | "manual" | "manual_retry" | "trial";
  taskGroupRunId?: string;
  errorMessage?: string;
  startedAt: string;
  endedAt?: string;
};

// ==================== 补采请求 ====================

export type BackfillRequest = {
  id: string;
  wideTableId: string;
  businessDateStart: string;
  businessDateEnd: string;
  reason: string;
  requestedBy: string;
  status: "pending" | "running" | "completed" | "failed";
  taskGroupIds: string[];
  createdAt: string;
};
