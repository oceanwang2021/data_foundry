import type {
  ModuleSummary,
  JourneyPhase,
  PromptTemplateDefinition,
  AgentNode,
  ScheduleJob,
  PreprocessRule,
  AuditRule,
  AcceptanceTicket,
  OpsOverview,
  DataLineage,
} from "./domain";
import { MOCK_REQUIREMENTS, MOCK_PROJECTS, MOCK_TASK_GROUPS, MOCK_FETCH_TASKS, MOCK_BACKFILL_REQUESTS } from "./mock-data";

// ==================== Prompt 模板 ====================

export const PROMPT_TEMPLATES: PromptTemplateDefinition[] = [
  {
    id: "pt-autodrive-high-v2",
    name: "自动驾驶高严谨性模板V2",
    industry: "自动驾驶",
    rigour: "high",
    description: "强调监管优先、指标口径一致性与来源摘录完整性。",
    recommendedModel: "gpt-4.1",
    updatedAt: "2026-02-20 11:30",
  },
  {
    id: "pt-clinical-v3",
    name: "临床试验模板V3",
    industry: "创新药",
    rigour: "high",
    description: "强调队列/剂量组可比性与疗效安全性指标一致抽取。",
    recommendedModel: "gpt-4.1",
    updatedAt: "2026-02-18 09:15",
  },
  {
    id: "pt-general-low-v1",
    name: "通用低严谨模板V1",
    industry: "通用",
    rigour: "low",
    description: "适用于常规场景，优先保证采集效率与覆盖率。",
    recommendedModel: "gpt-4.1-mini",
    updatedAt: "2026-02-10 16:40",
  },
];

// ==================== 模块/导航 ====================

export const MODULES: ModuleSummary[] = [
  { id: "m1", name: "需求清单", href: "/requirements", ownerRole: "AI投研业务数据团队", description: "跨项目查看需求阶段、关联宽表与配置沉淀。" },
  { id: "m2", name: "任务执行", href: "/collection-tasks", ownerRole: "算法工程师", description: "查看任务组拆分、采集任务展开与执行进度。" },
  { id: "m3", name: "调度", href: "/scheduling", ownerRole: "算法工程师", description: "手动触发、定时调度、补采重跑与执行记录。" },
  { id: "m4", name: "数据产出", href: "/preprocessing", ownerRole: "数据工程师", description: "后处理、格式修复、单位换算与结果确认。" },
  { id: "m6", name: "验收", href: "/requirements", ownerRole: "业务团队 / 数据工程师", description: "从具体需求进入验收，查看宽表结果并执行修订或重采。" },
  { id: "m7", name: "监控", href: "/ops-monitoring", ownerRole: "算法工程师 / 运维", description: "查看任务阶段、运行状态、采集日志和数据状态。" },
  { id: "m8", name: "数据管理", href: "/data-management", ownerRole: "数据工程师", description: "版本管理、数据溯源、数据血缘。" },
];

// ==================== 业务旅程 ====================

export const BUSINESS_JOURNEY: JourneyPhase[] = [
  { id: "p1", stage: "阶段1：定义需求", behavior: "在项目下定义需求的业务目标与边界。", touchpoint: "AI投研业务数据团队", painPoints: ["不确定模型行业常识，背景知识粒度难拿捏。"], opportunities: ["先做 demo 需求评估，再原地转换为正式需求。"] },
  { id: "p2", stage: "阶段2：定义宽表", behavior: "在需求下定义一张或多张宽表，配置表结构、数据范围和指标组。", touchpoint: "算法工程师", painPoints: ["表结构指标组拆分复杂。", "维度范围确认依赖业务输入，属性列不应误参与拆分。"], opportunities: ["支持维度枚举范围定义与自动初始化记录，并让属性列随行携带。"] },
  { id: "p3", stage: "阶段3：采集执行", behavior: "按业务日期生成任务组，展开采集任务并执行。", touchpoint: "算法工程师", painPoints: ["批量执行依赖手动脚本。"], opportunities: ["平台化调度与实时监控。"] },
  { id: "p4", stage: "阶段4：数据管理", behavior: "后处理、宽表回填、版本管理与溯源。", touchpoint: "数据工程师", painPoints: ["原始数据格式不统一。"], opportunities: ["后处理规则自动修复。"] },
  { id: "p5", stage: "阶段5：审核验收", behavior: "稽核配置、异常修复、验收反馈与补采闭环。", touchpoint: "数据工程师 / AI投研业务数据团队", painPoints: ["稽核规则依赖业务输入。"], opportunities: ["稽核前置到 demo 阶段，验收在线闭环。"] },
];

// ==================== Agent 节点 ====================

export const AGENT_NODES: AgentNode[] = [
  { id: "N1", name: "需求理解", purpose: "读取需求配置并生成规范化 Query 草案。", keyParams: ["domain_context", "rigour"], impact: "决定查询完整度和行业术语准确性。" },
  { id: "N2", name: "实体识别", purpose: "识别公司、药物、车型等维度实体。", keyParams: ["entity_dictionary", "alias_map"], impact: "影响采集覆盖率与误识别率。" },
  { id: "N3", name: "时间识别", purpose: "将自然语言时间转换为执行时间窗。", keyParams: ["time_window", "timezone"], impact: "影响周期采集准确性。" },
  { id: "N4", name: "检索路由", purpose: "配置搜索引擎、站点策略与RAG召回。", keyParams: ["search_provider", "site_policy", "rag_topk"], impact: "影响信源质量与召回率。" },
  { id: "N5", name: "指标抽取", purpose: "抽取指标、单位、来源链接和原文摘录。", keyParams: ["extract_pattern", "schema_hint"], impact: "影响结构化准确率。" },
  { id: "N6", name: "反思校验", purpose: "多轮反思，做跨来源冲突检查。", keyParams: ["reflection_rounds", "consistency_threshold"], impact: "提升高风险字段可信度。" },
  { id: "N7", name: "空值处理", purpose: "执行 NULL/0/UNKNOWN 语义判定。", keyParams: ["null_policy", "zero_guard"], impact: "防止空值噪声污染。" },
  { id: "N8", name: "YAML与结果输出", purpose: "输出任务入参与标准化结果。", keyParams: ["yaml_template", "placeholder_map"], impact: "决定批量调度能力与可维护性。" },
];

// ==================== 调度记录 ====================

export const SCHEDULE_JOBS: ScheduleJob[] = [];

// ==================== 后处理规则 ====================

export const PREPROCESS_RULES: PreprocessRule[] = [
  {
    id: "PR-001",
    name: "ORR 百分率统一为数值",
    source: "business",
    enabled: true,
    category: "unit_convert",
    expression: "percent_to_decimal(ORR_VALUE, scale=2)",
    sampleIssue: "ORR 同列出现 45% 与 0.45",
    indicatorBindings: [{ wideTableId: "WT-ADC-PROD", indicatorColumnName: "orr", indicatorLabel: "客观缓解率" }],
  },
  {
    id: "PR-002",
    name: "PFS 月数格式修复",
    source: "platform",
    enabled: true,
    category: "format_fix",
    expression: "normalize_numeric(PFS_VALUE, unit='月')",
    sampleIssue: "PFS 出现 12 months、12.0mo、约12月 等混用",
    indicatorBindings: [{ wideTableId: "WT-ADC-PROD", indicatorColumnName: "pfs", indicatorLabel: "无进展生存期" }],
  },
  {
    id: "PR-003",
    name: "TEAE 空值语义修复",
    source: "platform",
    enabled: true,
    category: "null_fix",
    expression: "map_unknown_to_null(['未披露','N/A'])",
    sampleIssue: "TEAE 字段混入未披露、N/A 等文本",
    indicatorBindings: [{ wideTableId: "WT-ADC-PROD", indicatorColumnName: "grade3_teae", indicatorLabel: "3级以上TEAE发生率" }],
  },
  {
    id: "PR-004",
    name: "OS 衍生环比变化",
    source: "business",
    enabled: false,
    category: "derived",
    expression: "mom_change = (curr - prev) / prev",
    sampleIssue: "需要在导入前自动补充 OS 趋势字段",
    indicatorBindings: [{ wideTableId: "WT-ADC-PROD", indicatorColumnName: "pfs", indicatorLabel: "总生存期" }],
  },
];

// ==================== 稽核规则 ====================

export const AUDIT_RULES: AuditRule[] = [
  { id: "AR-001", name: "环比异常阈值", mode: "non_blocking", scenarioRigour: "low", condition: "abs(mom_change) > 0.5", action: "标记异常，不阻断导入" },
  { id: "AR-002", name: "高严谨性单指标元数据缺失", mode: "blocking", scenarioRigour: "high", condition: "单指标来源链接或摘录缺失", action: "阻断并打回重采" },
  { id: "AR-003", name: "指标类型校验", mode: "blocking", scenarioRigour: "high", condition: "指标列无法转换为目标类型", action: "阻断并触发后处理修复" },
];

// ==================== 验收工单 ====================

export const ACCEPTANCE_TICKETS: AcceptanceTicket[] = [
  { id: "AC-003", taskGroupId: "", dataset: "ads_adc_phase3_clinical(WT-ADC-PROD)", requirementId: "REQ-2026-003", status: "rejected", owner: "李珂", feedback: "OS 指标来源不足，要求重采并附会议摘要截图。", latestActionAt: "2026-03-01 21:40" },
];

// ==================== 权限配置 ====================

export const ROLE_PERMISSIONS = [
  { role: "业务审核员", edit: true, delete: true, rollback: false, comment: "仅异常数据可编辑" },
  { role: "数据工程师", edit: true, delete: true, rollback: true, comment: "支持回滚与重放" },
  { role: "算法工程师", edit: false, delete: false, rollback: false, comment: "只读验收结果" },
];

// ==================== 运维 ====================

export const OPS_OVERVIEW: OpsOverview[] = [
  { environment: "demo", stage: "Demo数据采集环境", status: "healthy", runningTasks: 2, failedTasks: 0 },
  { environment: "production", stage: "正式数据采集环境", status: "warning", runningTasks: 3, failedTasks: 1 },
];

export const OPS_TASK_STATUS_COUNTS = [
  { status: "待采集", count: 6 },
  { status: "采集中", count: 3 },
  { status: "采集异常", count: 1 },
  { status: "采集完成", count: 18 },
];

export const OPS_DATA_STATUS_COUNTS = [
  { status: "原始数据待处理", count: 4 },
  { status: "宽表待审核", count: 7 },
  { status: "数据已回填", count: 22 },
];

// ==================== 数据血缘 ====================

export const DATA_LINEAGE: DataLineage[] = [
  { id: "L-001", dataset: "AUTO_DRIVING_OPS", upstream: "ODS抓取层 -> DWD清洗层", downstream: "投研看板 / 风险模型", lastSyncAt: "2026-03-01 13:25" },
  { id: "L-002", dataset: "DRUG_CLINICAL", upstream: "ODS抓取层 -> DWD临床标准层", downstream: "医药洞察周报", lastSyncAt: "2026-03-01 21:12" },
];

// ==================== 仪表盘统计 ====================

export const DASHBOARD_METRICS = {
  projects: MOCK_PROJECTS.length,
  requirements: MOCK_REQUIREMENTS.length,
  taskGroups: MOCK_TASK_GROUPS.length,
  fetchTasks: MOCK_FETCH_TASKS.length,
  runningTaskGroups: MOCK_TASK_GROUPS.filter((tg) => tg.status === "running").length,
  pendingBackfills: MOCK_BACKFILL_REQUESTS.filter((bf) => bf.status === "pending").length,
};
