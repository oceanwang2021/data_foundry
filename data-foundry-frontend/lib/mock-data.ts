import type {
  Project,
  KnowledgeBase,
  Requirement,
  WideTable,
  IndicatorGroup,
  TaskGroup,
  FetchTask,
  BackfillRequest,
  WideTableRecord,
  ColumnDefinition,
} from "./types";

// ==================== 知识库 ====================

export const MOCK_KNOWLEDGE_BASES: KnowledgeBase[] = [
  { id: "kb_autodrive_industry", name: "智能驾驶行业政策与研报库", description: "国内外自动驾驶法律法规及行业研报", documentCount: 850, status: "ready", lastUpdated: "2026-01-27T10:00:00Z" },
  { id: "kb_pharma_reports", name: "创新药临床数据公告库", description: "FDA/NMPA 公告及会议摘要", documentCount: 3200, status: "indexing", lastUpdated: "2026-01-28T12:00:00Z" },
];

// ==================== 项目 ====================

export const MOCK_PROJECTS: Project[] = [
  {
    id: "PROJ-001",
    name: "自动驾驶",
    businessBackground: "聚焦自动驾驶运营效率与安全指标，面向月度更新与专题分析。",
    description: "围绕行业专题承接需求定义、宽表生成和任务执行。",
    status: "active",
    ownerTeam: "AI投研业务数据团队",
    dataSource: {
      search: {
        engines: ["bing", "volcano"],
        sites: ["site:waymo.com", "site:ponyai.com", "site:dmv.ca.gov"],
        sitePolicy: "preferred",
      },
      knowledgeBases: ["kb_autodrive_industry"],
      fixedUrls: ["https://waymo.com/safety/", "https://pony.ai/"],
    },
    createdAt: "2026-01-25T09:00:00Z",
  },
  {
    id: "PROJ-002",
    name: "创新药",
    businessBackground: "聚焦肿瘤药物临床疗效、安全性与监管披露的结构化生产。",
    description: "围绕临床疗效与安全性构建结构化生产链路。",
    status: "active",
    ownerTeam: "AI投研业务数据团队",
    dataSource: {
      search: { engines: ["volcano"], sites: ["site:clinicaltrials.gov", "site:fda.gov", "site:asco.org"], sitePolicy: "whitelist" },
      knowledgeBases: ["kb_pharma_reports"],
      fixedUrls: ["https://clinicaltrials.gov/", "https://www.fda.gov/"],
    },
    createdAt: "2026-01-28T08:00:00Z",
  },
];

// ==================== 需求 ====================

export const MOCK_REQUIREMENTS: Requirement[] = [
  {
    id: "REQ-2026-001",
    projectId: "PROJ-001",
    requirementType: "demo",
    title: "自动驾驶运营快照采集",
    status: "ready",
    owner: "业务-张宁",
    assignee: "算法-陈飞",
    businessGoal: "先把自动驾驶运营快照宽表稳定下来，再按全量快照生成记录、任务组与采集任务。",
    businessBoundary: "当前需求按运营商维度采集全量快照，不按业务日期做增量拆分",
    deliveryScope: "滴滴全球 / 如祺出行 / 曹操出行 / 小马智行",
    createdAt: "2026-01-25T10:00:00Z",
    updatedAt: "2026-02-01T14:30:00Z",
  },
  {
    id: "REQ-2026-004",
    projectId: "PROJ-001",
    requirementType: "demo",
    title: "自动驾驶安全月度采集",
    status: "ready",
    owner: "业务-张宁",
    assignee: "算法-陈飞",
    businessGoal: "先把自动驾驶安全宽表稳定下来，再按宽表生成记录、任务组与采集任务。",
    businessBoundary: "MPI 接管里程与事故率都必须保持百万公里归一口径",
    deliveryScope: "Waymo / Pony.ai，旧金山，2025-01",
    createdAt: "2026-02-01T10:00:00Z",
    updatedAt: "2026-02-10T14:30:00Z",
  },
  {
    id: "REQ-2026-002",
    projectId: "PROJ-002",
    requirementType: "demo",
    title: "ADC 三期疗效采集",
    status: "ready",
    owner: "业务-李珂",
    assignee: "算法-许越",
    businessGoal: "先在 Demo 阶段把临床疗效与安全性的宽表 Schema、指标组和业务日期范围稳定下来。",
    businessBoundary: "需要按药物和适应症固定主维度，避免跨队列比较",
    deliveryScope: "DS-8201，HER2阳性乳腺癌，2024",
    createdAt: "2026-01-28T08:00:00Z",
    updatedAt: "2026-03-01T21:40:00Z",
  },
  {
    id: "REQ-2026-003",
    projectId: "PROJ-002",
    requirementType: "production",
    title: "ADC 三期疗效采集",
    status: "running",
    owner: "业务-李珂",
    assignee: "算法-许越",
    businessGoal: "沿用已稳定的临床宽表定义，在不改 Schema 的前提下扩展药物与业务日期范围并持续执行。",
    businessBoundary: "正式需求不允许修改 Schema，只允许扩展药物、适应症和业务日期范围",
    deliveryScope: "DS-8201 / SKB264，HER2阳性乳腺癌，2024 ~ 2025",
    dataUpdateEnabled: true,
    dataUpdateMode: "incremental",
    createdAt: "2026-02-15T08:00:00Z",
    updatedAt: "2026-03-06T16:20:00Z",
  },
];

// ==================== 宽表列定义辅助函数 ====================

function col(
  id: string, name: string, chineseName: string,
  type: ColumnDefinition["type"], category: ColumnDefinition["category"],
  description: string, opts?: { unit?: string; required?: boolean; isBusinessDate?: boolean },
): ColumnDefinition {
  return { id, name, chineseName, type, category, description, required: opts?.required ?? true, unit: opts?.unit, isBusinessDate: opts?.isBusinessDate };
}

// ==================== 宽表 ====================

export const MOCK_WIDE_TABLES: WideTable[] = [
  // ---- REQ-2026-001: 自动驾驶运营快照（全量快照，无业务日期） ----
  {
    id: "WT-AD-OPS",
    requirementId: "REQ-2026-001",
    name: "ads_autodrive_ops",
    description: "按运营商组织的运营全量快照。",
    schema: {
      columns: [
        col("COL_ID", "id", "行ID", "INTEGER", "id", "宽表整数型行主键。"),
        col("COL_COMPANY", "company", "运营商", "STRING", "dimension", "运营主体。"),
        col("COL_FLEET", "fleet_size", "车队数量", "NUMBER", "indicator", "截至快照时间的在运营车辆数量。", { unit: "辆", required: false }),
        col("COL_MILEAGE", "operating_mileage", "运营里程", "NUMBER", "indicator", "截至快照时间累计运营里程。", { unit: "万公里", required: false }),
        col("COL_PRICE", "order_price", "订单单价", "NUMBER", "indicator", "快照期内平均订单单价。", { unit: "元", required: false }),
        col("COL_COUNT", "order_count", "订单数量", "NUMBER", "indicator", "截至快照时间累计订单数量。", { unit: "万单", required: false }),
      ],
    },
    dimensionRanges: [
      { dimensionName: "company", values: ["滴滴全球", "如祺出行", "曹操出行", "小马智行"] },
    ],
    businessDateRange: { start: "", end: "", frequency: "monthly" },
    semanticTimeAxis: "none",
    collectionCoverageMode: "full_snapshot",
    indicatorGroups: [],
    scheduleRule: {
      id: "SR-AD-OPS-MONTHLY",
      wideTableId: "WT-AD-OPS",
      type: "periodic",
      periodLabel: "monthly",
      businessDateOffsetDays: 1,
      description: "月频结束后 +1 天触发 1 个全量快照任务组",
    },
    recordCount: 4,
    status: "initialized",
    createdAt: "2026-01-25T10:00:00Z",
    updatedAt: "2026-02-01T14:30:00Z",
  },
  // ---- REQ-2026-004: 自动驾驶安全（增量，按月） ----
  {
    id: "WT-AD-SAFE",
    requirementId: "REQ-2026-004",
    name: "ads_autodrive_safety",
    description: "按公司、城市和业务月份组织的安全指标宽表。",
    schema: {
      columns: [
        col("COL_ID", "id", "行ID", "INTEGER", "id", "宽表整数型行主键。"),
        col("COL_COMPANY", "company", "公司", "STRING", "dimension", "运营主体。"),
        col("COL_CITY", "city", "城市", "STRING", "dimension", "业务发生城市。"),
        col("COL_BIZ_DATE", "biz_date", "业务日期", "DATE", "dimension", "业务归属月份。", { isBusinessDate: true }),
        col("COL_MPI", "mpi_takeover_miles", "MPI接管里程", "NUMBER", "indicator", "发生人工接管前的自动驾驶里程。", { unit: "公里", required: false }),
        col("COL_INCIDENT", "incident_rate", "事故率", "NUMBER", "indicator", "按百万公里归一化后的事故率。", { unit: "次/百万公里", required: false }),
      ],
    },
    dimensionRanges: [
      { dimensionName: "company", values: ["Waymo", "Pony.ai"] },
      { dimensionName: "city", values: ["旧金山"] },
    ],
    businessDateRange: { start: "2025-01", end: "2025-01", frequency: "monthly" },
    semanticTimeAxis: "business_date",
    collectionCoverageMode: "incremental_by_business_date",
    indicatorGroups: [],
    scheduleRule: {
      id: "SR-AD-SAFE-MONTHLY",
      wideTableId: "WT-AD-SAFE",
      type: "periodic",
      periodLabel: "monthly",
      businessDateOffsetDays: 1,
      description: "月频结束后 +1 天触发任务组",
    },
    recordCount: 2,
    status: "initialized",
    createdAt: "2026-02-01T10:00:00Z",
    updatedAt: "2026-02-10T14:30:00Z",
  },
  // ---- REQ-2026-002: ADC Demo（增量，按年） ----
  {
    id: "WT-ADC-DEMO",
    requirementId: "REQ-2026-002",
    name: "ads_adc_phase3_clinical",
    description: "按药物、适应症和业务年份组织的临床疗效与安全性宽表。",
    schema: {
      columns: [
        col("COL_ID", "id", "行ID", "INTEGER", "id", "宽表整数型行主键。"),
        col("COL_DRUG", "drug_name", "药物", "STRING", "dimension", "采集对象药物名称。"),
        col("COL_IND", "indication", "适应症", "STRING", "dimension", "临床试验对应适应症。"),
        col("COL_BIZ_DATE", "biz_date", "业务日期", "DATE", "dimension", "业务归属年份。", { isBusinessDate: true }),
        col("COL_ORR", "orr", "ORR", "NUMBER", "indicator", "客观缓解率。", { unit: "%", required: false }),
        col("COL_PFS", "pfs", "PFS", "NUMBER", "indicator", "无进展生存期中位数。", { unit: "月", required: false }),
        col("COL_TEAE", "grade3_teae", "3级以上TEAE", "NUMBER", "indicator", "3级及以上TEAE发生比例。", { unit: "%", required: false }),
      ],
    },
    dimensionRanges: [
      { dimensionName: "drug_name", values: ["DS-8201"] },
      { dimensionName: "indication", values: ["HER2阳性乳腺癌"] },
    ],
    businessDateRange: { start: "2024", end: "2024", frequency: "yearly" },
    semanticTimeAxis: "business_date",
    collectionCoverageMode: "incremental_by_business_date",
    indicatorGroups: [],
    recordCount: 1,
    status: "initialized",
    createdAt: "2026-01-28T08:00:00Z",
    updatedAt: "2026-03-01T21:40:00Z",
  },
  // ---- REQ-2026-003: ADC Production（增量，按年，扩展范围） ----
  {
    id: "WT-ADC-PROD",
    requirementId: "REQ-2026-003",
    name: "ads_adc_phase3_clinical",
    description: "正式需求沿用 Demo 宽表定义，只扩展药物与业务日期范围。",
    schema: {
      columns: [
        col("COL_ID", "id", "行ID", "INTEGER", "id", "宽表整数型行主键。"),
        col("COL_DRUG", "drug_name", "药物", "STRING", "dimension", "采集对象药物名称。"),
        col("COL_IND", "indication", "适应症", "STRING", "dimension", "临床试验对应适应症。"),
        col("COL_BIZ_DATE", "biz_date", "业务日期", "DATE", "dimension", "业务归属年份。", { isBusinessDate: true }),
        col("COL_ORR", "orr", "ORR", "NUMBER", "indicator", "客观缓解率。", { unit: "%", required: false }),
        col("COL_PFS", "pfs", "PFS", "NUMBER", "indicator", "无进展生存期中位数。", { unit: "月", required: false }),
        col("COL_TEAE", "grade3_teae", "3级以上TEAE", "NUMBER", "indicator", "3级及以上TEAE发生比例。", { unit: "%", required: false }),
      ],
    },
    dimensionRanges: [
      { dimensionName: "drug_name", values: ["DS-8201", "SKB264"] },
      { dimensionName: "indication", values: ["HER2阳性乳腺癌"] },
    ],
    businessDateRange: { start: "2024", end: "2025", frequency: "yearly", quarterlyForLatestYear: true },
    semanticTimeAxis: "business_date",
    collectionCoverageMode: "incremental_by_business_date",
    indicatorGroups: [],
    recordCount: 4,
    status: "active",
    createdAt: "2026-02-15T08:00:00Z",
    updatedAt: "2026-03-06T16:20:00Z",
  },
];

// ==================== 指标组 ====================

export const MOCK_INDICATOR_GROUPS: IndicatorGroup[] = [
  {
    id: "IG-AD-OPS-CORE",
    wideTableId: "WT-AD-OPS",
    name: "运营快照指标组",
    indicatorColumns: ["fleet_size", "operating_mileage", "order_price", "order_count"],
    agent: "ops-agent",
    promptTemplate: "优先采集官网披露的运营快照口径，并保持不同运营商之间的统计口径一致。",
    priority: 10,
    description: "围绕运营商快照统一采集车队数量、运营里程、订单单价和订单数量",
  },
  {
    id: "IG-AD-SAFE-MPI",
    wideTableId: "WT-AD-SAFE",
    name: "接管里程指标组",
    indicatorColumns: ["mpi_takeover_miles"],
    agent: "safety-agent",
    promptTemplate: "优先采集里程口径与接管定义。",
    priority: 20,
    description: "MPI 接管里程",
  },
  {
    id: "IG-AD-SAFE-INCIDENT",
    wideTableId: "WT-AD-SAFE",
    name: "事故率指标组",
    indicatorColumns: ["incident_rate"],
    agent: "incident-agent",
    promptTemplate: "优先采集事故率及归一化口径。",
    priority: 20,
    description: "事故率",
  },
  {
    id: "IG-ADC-EFFICACY",
    wideTableId: "WT-ADC-DEMO",
    name: "疗效指标组",
    indicatorColumns: ["orr", "pfs"],
    agent: "clinical-efficacy-agent",
    promptTemplate: "优先抽取队列内可比的疗效指标及样本量描述。",
    priority: 10,
    description: "ORR、PFS 核心疗效指标",
  },
  {
    id: "IG-ADC-SAFETY",
    wideTableId: "WT-ADC-DEMO",
    name: "安全性指标组",
    indicatorColumns: ["grade3_teae"],
    agent: "clinical-safety-agent",
    promptTemplate: "优先抽取治疗期间不良事件口径和分级定义。",
    priority: 20,
    description: "3级以上TEAE发生率",
  },
];

// 将指标组关联到宽表（WT-ADC-PROD 复用 WT-ADC-DEMO 的指标组定义）
MOCK_WIDE_TABLES.forEach((wt) => {
  if (wt.id === "WT-ADC-PROD") {
    wt.indicatorGroups = MOCK_INDICATOR_GROUPS
      .filter((ig) => ig.wideTableId === "WT-ADC-DEMO")
      .map((ig) => ({ ...ig, wideTableId: "WT-ADC-PROD" }));
  } else {
    wt.indicatorGroups = MOCK_INDICATOR_GROUPS.filter((ig) => ig.wideTableId === wt.id);
  }
});

// ==================== 任务组 ====================
// ID 格式与后端 modeling.py 一致：TG-{wide_table_id}-{date_token}

export const MOCK_TASK_GROUPS: TaskGroup[] = [
  // WT-AD-OPS 全量快照（REFERENCE_DATE = 2026-03-13）
  {
    id: "TG-WT-AD-OPS-20260313",
    wideTableId: "WT-AD-OPS",
    businessDate: "",
    businessDateLabel: "当前快照",
    partitionType: "full_table",
    partitionKey: "full_table",
    partitionLabel: "2026-03-13",
    status: "completed",
    totalTasks: 4,
    completedTasks: 4,
    failedTasks: 0,
    triggeredBy: "manual",
    createdAt: "2026-03-13T00:00:00Z",
    updatedAt: "2026-03-13T00:00:00Z",
  },
  // WT-AD-SAFE 增量（2025-01）
  {
    id: "TG-WT-AD-SAFE-202501",
    wideTableId: "WT-AD-SAFE",
    businessDate: "2025-01",
    businessDateLabel: "2025-01",
    status: "completed",
    totalTasks: 4,
    completedTasks: 4,
    failedTasks: 0,
    triggeredBy: "backfill",
    createdAt: "2026-03-13T00:00:00Z",
    updatedAt: "2026-03-13T00:00:00Z",
  },
  // WT-ADC-DEMO 增量（2024）
  {
    id: "TG-WT-ADC-DEMO-2024",
    wideTableId: "WT-ADC-DEMO",
    businessDate: "2024",
    businessDateLabel: "2024",
    status: "pending",
    totalTasks: 2,
    completedTasks: 0,
    failedTasks: 0,
    triggeredBy: "manual",
    createdAt: "2026-03-13T00:00:00Z",
    updatedAt: "2026-03-13T00:00:00Z",
  },
  // WT-ADC-PROD 增量（2024, 2025）
  {
    id: "TG-WT-ADC-PROD-2024",
    wideTableId: "WT-ADC-PROD",
    businessDate: "2024",
    businessDateLabel: "2024",
    status: "completed",
    totalTasks: 4,
    completedTasks: 4,
    failedTasks: 0,
    triggeredBy: "backfill",
    createdAt: "2026-03-13T00:00:00Z",
    updatedAt: "2026-03-13T00:00:00Z",
  },
  {
    id: "TG-WT-ADC-PROD-2025",
    wideTableId: "WT-ADC-PROD",
    businessDate: "2025",
    businessDateLabel: "2025",
    status: "partial",
    totalTasks: 4,
    completedTasks: 2,
    failedTasks: 1,
    triggeredBy: "schedule",
    createdAt: "2026-03-20T00:00:00Z",
    updatedAt: "2026-03-20T12:00:00Z",
  },
];

// ==================== 采集任务 ====================
// ID 格式与后端一致：FT-{task_group_id}-R{row_id:03d}-{indicator_group_id}（全量快照）
//                     FT-{wide_table_id}-R{row_id:03d}-{indicator_group_id}（增量）

function buildSeedFetchTask(params: {
  taskGroup: TaskGroup;
  wideTableId: string;
  rowId: number;
  indicatorGroupId: string;
  indicatorGroupName: string;
  isFullSnapshot: boolean;
  status?: FetchTask["status"];
  confidence?: number;
  errorMessage?: string;
}): FetchTask {
  const { taskGroup, wideTableId, rowId, indicatorGroupId, indicatorGroupName, isFullSnapshot, status = "completed", confidence, errorMessage } = params;
  const rowToken = `R${String(rowId).padStart(3, "0")}`;
  const id = isFullSnapshot
    ? `FT-${taskGroup.id}-${rowToken}-${indicatorGroupId}`
    : `FT-${wideTableId}-${rowToken}-${indicatorGroupId}`;
  return {
    id,
    taskGroupId: taskGroup.id,
    wideTableId,
    rowId,
    indicatorGroupId,
    indicatorGroupName,
    status,
    confidence,
    executionRecords: status === "completed" ? [{
      id: `er_${id}_1`,
      fetchTaskId: id,
      attempt: 1,
      status: "success",
      triggeredBy: taskGroup.triggeredBy,
      startedAt: taskGroup.createdAt,
      endedAt: taskGroup.updatedAt,
    }] : status === "failed" ? [{
      id: `er_${id}_1`,
      fetchTaskId: id,
      attempt: 1,
      status: "failure",
      triggeredBy: taskGroup.triggeredBy,
      startedAt: taskGroup.createdAt,
      endedAt: taskGroup.updatedAt,
      errorMessage: errorMessage ?? "Agent 执行超时：目标页面无法访问",
    }] : [],
    createdAt: taskGroup.createdAt,
    updatedAt: taskGroup.updatedAt,
  };
}

export const MOCK_FETCH_TASKS: FetchTask[] = [
  // WT-AD-OPS: 4 行 × 1 指标组 = 4 任务（全量快照）
  ...[1, 2, 3, 4].map((rowId) =>
    buildSeedFetchTask({
      taskGroup: MOCK_TASK_GROUPS[0],
      wideTableId: "WT-AD-OPS",
      rowId,
      indicatorGroupId: "IG-AD-OPS-CORE",
      indicatorGroupName: "运营快照指标组",
      isFullSnapshot: true,
      confidence: [0.92, 0.89, 0.86, 0.90][rowId - 1],
    }),
  ),
  // WT-AD-SAFE: 2 行 × 2 指标组 = 4 任务（增量）
  ...[1, 2].flatMap((rowId) => [
    buildSeedFetchTask({
      taskGroup: MOCK_TASK_GROUPS[1],
      wideTableId: "WT-AD-SAFE",
      rowId,
      indicatorGroupId: "IG-AD-SAFE-MPI",
      indicatorGroupName: "接管里程指标组",
      isFullSnapshot: false,
      confidence: rowId === 1 ? 0.90 : 0.85,
    }),
    buildSeedFetchTask({
      taskGroup: MOCK_TASK_GROUPS[1],
      wideTableId: "WT-AD-SAFE",
      rowId,
      indicatorGroupId: "IG-AD-SAFE-INCIDENT",
      indicatorGroupName: "事故率指标组",
      isFullSnapshot: false,
      confidence: rowId === 1 ? 0.88 : 0.60,
    }),
  ]),
  // WT-ADC-PROD 2024: 2 行 × 2 指标组 = 4 任务（增量）
  ...[1, 2].flatMap((rowId) => [
    buildSeedFetchTask({
      taskGroup: MOCK_TASK_GROUPS[3],
      wideTableId: "WT-ADC-PROD",
      rowId,
      indicatorGroupId: "IG-ADC-EFFICACY",
      indicatorGroupName: "疗效指标组",
      isFullSnapshot: false,
      confidence: rowId === 1 ? 0.93 : 0.84,
    }),
    buildSeedFetchTask({
      taskGroup: MOCK_TASK_GROUPS[3],
      wideTableId: "WT-ADC-PROD",
      rowId,
      indicatorGroupId: "IG-ADC-SAFETY",
      indicatorGroupName: "安全性指标组",
      isFullSnapshot: false,
      confidence: rowId === 1 ? 0.91 : 0.85,
    }),
  ]),
  // WT-ADC-PROD 2025: 2 行 × 2 指标组 = 4 任务（增量，SKB264 失败）
  ...[1, 2].flatMap((rowId) => [
    buildSeedFetchTask({
      taskGroup: MOCK_TASK_GROUPS[4],
      wideTableId: "WT-ADC-PROD",
      rowId,
      indicatorGroupId: "IG-ADC-EFFICACY",
      indicatorGroupName: "疗效指标组",
      isFullSnapshot: false,
      status: rowId === 1 ? "completed" : "failed",
      confidence: rowId === 1 ? 0.90 : undefined,
      errorMessage: rowId === 2 ? "Agent 执行超时：clinicaltrials.gov 返回 503，无法获取 SKB264 2025 年数据" : undefined,
    }),
    buildSeedFetchTask({
      taskGroup: MOCK_TASK_GROUPS[4],
      wideTableId: "WT-ADC-PROD",
      rowId,
      indicatorGroupId: "IG-ADC-SAFETY",
      indicatorGroupName: "安全性指标组",
      isFullSnapshot: false,
      status: rowId === 1 ? "completed" : "pending",
      confidence: rowId === 1 ? 0.83 : undefined,
    }),
  ]),
];

// ==================== 补采请求 ====================

export const MOCK_BACKFILL_REQUESTS: BackfillRequest[] = [];

// ==================== 宽表记录 ====================
// 列名使用后端 column key（小写 snake_case），与 mapWideTableRow 展开后的字段一致。
// ROW_ID 从 1 开始，与后端 build_rows 一致。

export const MOCK_WIDE_TABLE_RECORDS: WideTableRecord[] = [
  // WT-AD-OPS（全量快照）— 第二次快照，previousValues 为上一轮快照值
  { id: 1, wideTableId: "WT-AD-OPS", ROW_ID: 1, company: "滴滴全球",
    fleet_size: 200, operating_mileage: 86.5, order_price: 85, order_count: 45.2,
    _metadata: { confidence: 0.92,
      previousValues: { fleet_size: 180, operating_mileage: 72.3, order_price: 82, order_count: 38.1 },
      agentRawValues: {
      fleet_size: { rawValue: "约200辆", dataSource: "滴滴自动驾驶官网", sourceUrl: "https://www.didiglobal.com/auto", quoteText: "截至2025年底，滴滴自动驾驶车队规模约200辆", confidence: 0.92 },
      operating_mileage: { rawValue: 865000, dataSource: "滴滴自动驾驶官网", sourceUrl: "https://www.didiglobal.com/auto", quoteText: "累计运营里程超过86.5万公里", confidence: 0.90 },
      order_price: { rawValue: 85, dataSource: "第一财经", sourceUrl: "https://www.yicai.com/news/auto", quoteText: "平均订单单价约85元", confidence: 0.85 },
      order_count: { rawValue: "45.2万单", dataSource: "滴滴自动驾驶官网", sourceUrl: "https://www.didiglobal.com/auto", quoteText: "累计完成超过45万单", confidence: 0.88 },
    } } },
  { id: 2, wideTableId: "WT-AD-OPS", ROW_ID: 2, company: "如祺出行",
    fleet_size: 300, operating_mileage: 600, order_price: 78, order_count: 18.6,
    _metadata: { confidence: 0.89,
      previousValues: { fleet_size: 250, operating_mileage: 480, order_price: 78, order_count: 14.2 },
      agentRawValues: {
      fleet_size: { rawValue: 300, dataSource: "如祺出行官网", sourceUrl: "https://www.ruqi.com", quoteText: "Robotaxi车队规模达300辆", confidence: 0.91 },
      operating_mileage: { rawValue: "600万公里", dataSource: "如祺出行官网", sourceUrl: "https://www.ruqi.com", quoteText: "累计安全运营里程突破600万公里", confidence: 0.89 },
      order_price: { rawValue: "78元/单", dataSource: "36氪", sourceUrl: "https://36kr.com/p/ruqi", quoteText: "单均价格约78元", confidence: 0.82 },
      order_count: { rawValue: 186000, dataSource: "如祺出行官网", sourceUrl: "https://www.ruqi.com", quoteText: "累计服务超18万单", confidence: 0.87 },
    } } },
  { id: 3, wideTableId: "WT-AD-OPS", ROW_ID: 3, company: "曹操出行",
    fleet_size: 100, operating_mileage: 15.3, order_price: 72, order_count: 9.8,
    _metadata: { confidence: 0.86,
      previousValues: { fleet_size: 80, operating_mileage: 10.1, order_price: 70, order_count: 6.5 },
      agentRawValues: {
      fleet_size: { rawValue: "100+", dataSource: "曹操出行公众号", sourceUrl: "https://mp.weixin.qq.com/s/caocho", quoteText: "自动驾驶测试车辆超过100辆", confidence: 0.80 },
      operating_mileage: { rawValue: "15.3万公里", dataSource: "曹操出行公众号", sourceUrl: "https://mp.weixin.qq.com/s/caocho", quoteText: "累计测试里程15.3万公里", confidence: 0.85 },
      order_price: { rawValue: 72, dataSource: "界面新闻", sourceUrl: "https://www.jiemian.com/article/caocho", quoteText: "平均客单价72元左右", confidence: 0.78 },
      order_count: { rawValue: "约10万单", dataSource: "曹操出行公众号", sourceUrl: "https://mp.weixin.qq.com/s/caocho", quoteText: "累计完成约10万单自动驾驶订单", confidence: 0.82 },
    } } },
  { id: 4, wideTableId: "WT-AD-OPS", ROW_ID: 4, company: "小马智行",
    fleet_size: 1159, operating_mileage: 3350, order_price: 35, order_count: 109.5,
    _metadata: { confidence: 0.9,
      previousValues: { fleet_size: 1000, operating_mileage: 2800, order_price: 38, order_count: 85.0 },
      agentRawValues: {
      fleet_size: { rawValue: 1159, dataSource: "小马智行招股书", sourceUrl: "https://www.pony.ai/investors", quoteText: "全球自动驾驶车队规模达1,159辆", confidence: 0.95 },
      operating_mileage: { rawValue: "3350万公里", dataSource: "小马智行招股书", sourceUrl: "https://www.pony.ai/investors", quoteText: "累计自动驾驶里程超过3,350万公里", confidence: 0.94 },
      order_price: { rawValue: "35元", dataSource: "晚点LatePost", sourceUrl: "https://www.latepost.com/pony", quoteText: "Robotaxi平均客单价约35元", confidence: 0.80 },
      order_count: { rawValue: "109.5万", dataSource: "小马智行招股书", sourceUrl: "https://www.pony.ai/investors", quoteText: "累计完成超过109万单Robotaxi订单", confidence: 0.92 },
    } } },

  // WT-AD-SAFE（增量，biz_date = 2025-01）
  { id: 1, wideTableId: "WT-AD-SAFE", ROW_ID: 1, BIZ_DATE: "2025-01", biz_date: "2025-01", company: "Waymo", city: "旧金山",
    mpi_takeover_miles: 182000, incident_rate: 0.23,
    _metadata: { confidence: 0.88, agentRawValues: {
      mpi_takeover_miles: { rawValue: "182,000 miles", dataSource: "Waymo Safety Report", sourceUrl: "https://waymo.com/safety/report-2025-01", quoteText: "Average miles between disengagements: 182,000", confidence: 0.90 },
      incident_rate: { rawValue: "0.23 per million miles", dataSource: "CA DMV Report", sourceUrl: "https://dmv.ca.gov/av-reports/2025-01", quoteText: "Waymo reported 0.23 incidents per million miles", confidence: 0.88 },
    } } },
  { id: 2, wideTableId: "WT-AD-SAFE", ROW_ID: 2, BIZ_DATE: "2025-01", biz_date: "2025-01", company: "Pony.ai", city: "旧金山",
    mpi_takeover_miles: 64000, incident_rate: null,
    _metadata: { confidence: 0.85, agentRawValues: {
      mpi_takeover_miles: { rawValue: 64000, dataSource: "Pony.ai Blog", sourceUrl: "https://pony.ai/blog/safety-2025", quoteText: "MPI reached 64,000 miles in San Francisco operations", confidence: 0.85 },
      incident_rate: { rawValue: "N/A", dataSource: "CA DMV Report", sourceUrl: "https://dmv.ca.gov/av-reports/2025-01", quoteText: "Pony.ai incident data not yet reported for Jan 2025", confidence: 0.60 },
    } } },

  // WT-ADC-DEMO（增量，biz_date = 2024）— 未执行，无 Agent 数据
  { id: 1, wideTableId: "WT-ADC-DEMO", ROW_ID: 1, BIZ_DATE: "2024", biz_date: "2024", drug_name: "DS-8201", indication: "HER2阳性乳腺癌",
    orr: null, pfs: null, grade3_teae: null,
    _metadata: { confidence: 0 } },

  // WT-ADC-PROD 2024 — Agent 已完成，存在后处理差异
  { id: 1, wideTableId: "WT-ADC-PROD", ROW_ID: 1, BIZ_DATE: "2024", biz_date: "2024", drug_name: "DS-8201", indication: "HER2阳性乳腺癌",
    orr: 78.4, pfs: 14.2, grade3_teae: 46.4,
    _metadata: { confidence: 0.9, agentRawValues: {
      orr: { rawValue: "78.4%", dataSource: "DESTINY-Breast03 Updated Results", sourceUrl: "https://www.nejm.org/doi/full/10.1056/NEJMoa2405581", quoteText: "Confirmed ORR was 78.4% (95% CI, 73.2–83.0)", confidence: 0.95 },
      pfs: { rawValue: "14.2 months", dataSource: "DESTINY-Breast03 Updated Results", sourceUrl: "https://www.nejm.org/doi/full/10.1056/NEJMoa2405581", quoteText: "Median PFS was 14.2 months (95% CI, 12.1–17.5)", confidence: 0.93 },
      grade3_teae: { rawValue: "46.4%", dataSource: "DESTINY-Breast03 Safety Update", sourceUrl: "https://www.nejm.org/doi/full/10.1056/NEJMoa2405581", quoteText: "Grade ≥3 TEAEs occurred in 46.4% of patients", confidence: 0.91 },
    } } },
  { id: 2, wideTableId: "WT-ADC-PROD", ROW_ID: 2, BIZ_DATE: "2024", biz_date: "2024", drug_name: "SKB264", indication: "HER2阳性乳腺癌",
    orr: 66.7, pfs: 11.1, grade3_teae: 38.2,
    _metadata: { confidence: 0.84, agentRawValues: {
      orr: { rawValue: "66.7%", dataSource: "OptiTROP-Breast04 Phase III", sourceUrl: "https://www.thelancet.com/journals/lanonc/article/PIIS1470-2045(24)00620-7", quoteText: "ORR was 66.7% (95% CI, 57.8–74.7)", confidence: 0.88 },
      pfs: { rawValue: "约11个月", dataSource: "ASCO 2024 Poster", sourceUrl: "https://meetings.asco.org/abstracts/skb264-2024", quoteText: "Median PFS approximately 11 months", confidence: 0.78 },
      grade3_teae: { rawValue: "38.2%", dataSource: "OptiTROP-Breast04 Safety", sourceUrl: "https://www.thelancet.com/journals/lanonc/article/PIIS1470-2045(24)00620-7", quoteText: "Grade ≥3 TEAEs were reported in 38.2% of patients", confidence: 0.85 },
    } } },

  // WT-ADC-PROD 2025 — DS-8201 有上一轮（2024 年值），SKB264 失败
  { id: 3, wideTableId: "WT-ADC-PROD", ROW_ID: 1, BIZ_DATE: "2025", biz_date: "2025", drug_name: "DS-8201", indication: "HER2阳性乳腺癌",
    orr: 80.1, pfs: 15.8, grade3_teae: 42.3,
    _metadata: { confidence: 0.87,
      previousValues: { orr: 78.4, pfs: 14.2, grade3_teae: 46.4 },
      agentRawValues: {
      orr: { rawValue: "80.1%", dataSource: "DESTINY-Breast03 3-Year Follow-up", sourceUrl: "https://www.nejm.org/doi/full/10.1056/NEJMoa2506123", quoteText: "Updated confirmed ORR was 80.1% at 3-year follow-up", confidence: 0.92 },
      pfs: { rawValue: "15.8mo", dataSource: "DESTINY-Breast03 3-Year Follow-up", sourceUrl: "https://www.nejm.org/doi/full/10.1056/NEJMoa2506123", quoteText: "Updated median PFS was 15.8 months", confidence: 0.90 },
      grade3_teae: { rawValue: "42.3% (updated safety)", dataSource: "ESMO 2025 Oral Presentation", sourceUrl: "https://www.esmo.org/meetings/esmo-congress-2025/abstracts/ds8201-safety", quoteText: "Grade ≥3 TEAEs decreased to 42.3% with longer follow-up", confidence: 0.83 },
    } } },
  { id: 4, wideTableId: "WT-ADC-PROD", ROW_ID: 2, BIZ_DATE: "2025", biz_date: "2025", drug_name: "SKB264", indication: "HER2阳性乳腺癌",
    orr: null, pfs: null, grade3_teae: null,
    _metadata: { confidence: 0,
      previousValues: { orr: 66.7, pfs: 11.1, grade3_teae: 38.2 },
      agentRawValues: {
      orr: { rawValue: null, dataSource: "Agent执行失败", confidence: 0 },
      pfs: { rawValue: null, dataSource: "Agent执行失败", confidence: 0 },
      grade3_teae: { rawValue: null, dataSource: "Agent执行失败", confidence: 0 },
    } } },
];
