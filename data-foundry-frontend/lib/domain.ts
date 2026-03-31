import type { SearchEngineProvider } from "./types";

// 从 types.ts 重新导出新数据模型类型
export type {
  KnowledgeBase,
  Project,
  RequirementType,
  Requirement,
  ColumnCategory,
  ColumnDefinition,
  WideTableSchema,
  DimensionRange,
  WideTable,
  WideTableRecord,
  IndicatorGroup,
  ScheduleRule,
  TaskGroupStatus,
  TaskGroup,
  FetchTaskStatus,
  FetchTask,
  NarrowTableRow,
  ExecutionRecord,
  BackfillRequest,
} from "./types";
export type { SearchEngineProvider } from "./types";

// ==================== UI 辅助类型（不属于核心数据模型）====================

export type BusinessRigour = "low" | "high";

export type ModuleSummary = {
  id: string;
  name: string;
  href: string;
  ownerRole: string;
  description: string;
};

export type JourneyPhase = {
  id: string;
  stage: string;
  behavior: string;
  touchpoint: string;
  painPoints: string[];
  opportunities: string[];
};

export type AgentNode = {
  id: string;
  name: string;
  purpose: string;
  keyParams: string[];
  impact: string;
};

export type PreprocessRule = {
  id: string;
  name: string;
  source: "platform" | "business";
  enabled: boolean;
  category: "format_fix" | "null_fix" | "unit_convert" | "derived";
  expression: string;
  sampleIssue: string;
  indicatorBindings?: Array<{
    wideTableId: string;
    indicatorColumnName: string;
    indicatorLabel: string;
  }>;
  /** 指标填充：LLM 语义解析 + 规则引擎配置 */
  fillingConfig?: {
    confidenceThreshold?: number;
    rangeStrategy?: "midpoint" | "lower" | "upper" | "flag";
    nullSynonyms?: string[];
  };
};

export type AuditRule = {
  id: string;
  name: string;
  mode: "non_blocking" | "blocking";
  scenarioRigour: BusinessRigour;
  condition: string;
  action: string;
};

export type AcceptanceTicket = {
  id: string;
  dataset: string;
  requirementId: string;
  status: "approved" | "rejected" | "fixing" | "deleted";
  owner: string;
  feedback: string;
  latestActionAt: string;
};

export type OpsOverview = {
  environment: "demo" | "production";
  stage: string;
  status: "healthy" | "warning" | "error";
  runningTasks: number;
  failedTasks: number;
};

export type PromptTemplateDefinition = {
  id: string;
  name: string;
  industry: string;
  rigour: BusinessRigour;
  description: string;
  recommendedModel: string;
  updatedAt: string;
};

export type TaskGroupRun = {
  id: string;
  taskGroupId: string;
  wideTableId?: string;
  triggerType: "manual" | "cron" | "backfill" | "resample";
  status: "queued" | "running" | "completed" | "failed";
  startedAt: string;
  endedAt?: string;
  operator: string;
  logRef?: string;
};

export type ScheduleJob = TaskGroupRun;

export type DataLineage = {
  id: string;
  dataset: string;
  upstream: string;
  downstream: string;
  lastSyncAt: string;
};

export type ModelProvider = "doubao" | "qwen" | "deepseek" | "glm" | "kimi";

export type RuntimeModelConfig = {
  provider: ModelProvider;
  enableThinking: boolean;
  temperature: number;
};

export type RuntimeSearchConfig = {
  enabledSearchEngines: SearchEngineProvider[];
  parallelism: number;
  llmApiEndpoint: string;
  ragServiceEndpoint: string;
};

export type RuntimeConfidenceConfig = {
  dataConfidence: number;
  iterationRounds: number;
};

export type RuntimeSettings = {
  maxConcurrentAgentTasks: number;
  modelConfig: RuntimeModelConfig;
  searchConfig: RuntimeSearchConfig;
  confidenceConfig: RuntimeConfidenceConfig;
};
