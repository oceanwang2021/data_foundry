/**
 * API Client - 前后端联调层
 *
 * 负责：
 * 1. 所有 HTTP 请求到后端 API
 * 2. snake_case ↔ camelCase 转换
 * 3. 后端数据模型 → 前端数据模型映射
 */

import type {
  Project,
  Requirement,
  RequirementDataUpdateMode,
  SearchEngineProvider,
  WideTable,
  WideTableRecord,
  TaskGroup,
  FetchTask,
  CollectionBatch,
  IndicatorGroup,
  ScheduleRule,
  ColumnDefinition,
  BackfillRequest,
  ExecutionRecord,
} from "./types";
import type {
  AcceptanceTicket,
  AuditRule,
  PreprocessRule,
  OpsOverview,
  DataLineage,
  RuntimeSettings,
  ScheduleJob,
} from "./domain";
import { buildApiUrl } from "./api-base";
import { normalizeBusinessDateToken } from "./business-date";
import {
  normalizeWideTableMode,
  resolveWideTableCollectionCoverageMode,
  resolveWideTableSemanticTimeAxis,
} from "./wide-table-mode";
import {
  DEFAULT_RUNTIME_SETTINGS,
  loadRuntimeSettings,
  normalizeRuntimeSettings,
  saveRuntimeSettings,
} from "./runtime-settings";

function fallbackIso(value?: string | null): string {
  return value && value.trim() !== "" ? value : new Date().toISOString();
}

const RESERVED_SYSTEM_COLUMN_KEYS = new Set(["row_status", "last_task_id", "updated_at"]);

function normalizeApiBusinessDate(value?: string | null): string {
  return value ? normalizeBusinessDateToken(value) : "";
}

function normalizeApiPartitionLabel(
  value: string | null | undefined,
  partitionType: string | null | undefined,
): string | undefined {
  if (!value) {
    return undefined;
  }
  return partitionType === "business_date" ? normalizeBusinessDateToken(value) : value;
}

function buildCollectionPolicy(
  projectDataSource?: Project["dataSource"],
  enabledSearchEngines: SearchEngineProvider[] = DEFAULT_RUNTIME_SETTINGS.searchConfig.enabledSearchEngines,
) {
  return {
    search_engines: enabledSearchEngines,
    preferred_sites: projectDataSource?.search.sites ?? [],
    site_policy: projectDataSource?.search.sitePolicy ?? "preferred",
    knowledge_bases: projectDataSource?.knowledgeBases ?? [],
    fixed_urls: projectDataSource?.fixedUrls ?? [],
    null_policy: "未提及填 NULL，不允许把缺失写成 0。",
    source_priority: "监管公告 > 企业官网 > 券商研报 > 媒体。",
    value_format: "日期统一为 YYYY-MM，数值列与单位分离存储。",
  };
}

// ==================== 通用请求 ====================

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = buildApiUrl(path);
  const headers = new Headers(init?.headers);
  const hasBody = init?.body !== undefined && init.body !== null;
  if (hasBody && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(url, {
    ...init,
    headers,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${text}`);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json();
}

function apiGet<T>(path: string) {
  return apiFetch<T>(path);
}

function apiPost<T>(path: string, body?: unknown) {
  return apiFetch<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });
}

function apiPut<T>(path: string, body: unknown) {
  return apiFetch<T>(path, { method: "PUT", body: JSON.stringify(body) });
}

function apiDelete(path: string) {
  return apiFetch<void>(path, { method: "DELETE" });
}

// ==================== 后端 → 前端 数据转换 ====================

/** 后端 Project → 前端 Project */
function mapProject(raw: any): Project {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description ?? "",
    businessBackground: raw.business_background ?? "",
    status: raw.status ?? "active",
    ownerTeam: raw.owner_team ?? "",
    dataSource: raw.data_source ?? {
      search: { engines: [], sites: [], sitePolicy: "preferred" },
      knowledgeBases: [],
      fixedUrls: [],
    },
    createdAt: fallbackIso(raw.created_at),
  };
}

/** 后端 ColumnDefinition (WideTableColumn) → 前端 ColumnDefinition */
function mapColumn(raw: any): ColumnDefinition {
  const key = raw.key ?? raw.id;
  const rawCategory = raw.role ?? raw.category ?? "dimension";
  const category = rawCategory === "system" && !RESERVED_SYSTEM_COLUMN_KEYS.has(String(key))
    ? "attribute"
    : rawCategory;
  return {
    id: key,
    name: raw.key ?? raw.name,
    chineseName: raw.name ?? raw.chinese_name,
    type: (raw.data_type ?? raw.type ?? "STRING").toUpperCase() as ColumnDefinition["type"],
    category: category as ColumnDefinition["category"],
    description: raw.description ?? "",
    unit: raw.unit ?? undefined,
    required: raw.required ?? false,
    isBusinessDate: raw.is_business_date ?? false,
  };
}

/** 后端 IndicatorGroup → 前端 IndicatorGroup */
function mapIndicatorGroup(raw: any, wideTableId: string): IndicatorGroup {
  return {
    id: raw.id,
    wideTableId,
    name: raw.name,
    indicatorColumns: raw.indicator_keys ?? raw.indicatorColumns ?? [],
    agent: raw.default_agent ?? raw.agent ?? undefined,
    promptTemplate: raw.prompt_template ?? raw.promptTemplate ?? undefined,
    promptConfig: raw.prompt_config ? {
      coreQueryRequirement: raw.prompt_config.core_query_requirement ?? undefined,
      businessKnowledge: raw.prompt_config.business_knowledge ?? undefined,
      outputConstraints: raw.prompt_config.output_constraints ?? undefined,
      lastEditedAt: raw.prompt_config.last_edited_at ?? undefined,
    } : undefined,
    priority: raw.priority ?? 100,
    description: raw.description ?? "",
  };
}

/** 后端 ScheduleRule → 前端 ScheduleRule */
function mapScheduleRule(raw: any, wideTableId: string): ScheduleRule {
  return {
    id: raw.id,
    wideTableId,
    type: raw.frequency === "monthly" || raw.frequency === "yearly" ? "periodic" : "adhoc",
    cronExpression: raw.trigger_time ?? undefined,
    periodLabel: raw.frequency ?? undefined,
    businessDateOffsetDays: 0,
    description: `${raw.frequency ?? ""} schedule`,
  };
}

/** 后端 WideTable (嵌套在 Requirement 中) → 前端 WideTable */
function mapWideTable(raw: any, requirementId: string): WideTable {
  const schema = raw.table_schema ?? raw.schema ?? {};
  const allColumns: ColumnDefinition[] = [];

  // 合并所有列
  if (schema.id_column) allColumns.push(mapColumn(schema.id_column));
  if (schema.dimension_columns) {
    for (const col of schema.dimension_columns) allColumns.push(mapColumn(col));
  }
  if (schema.indicator_columns) {
    for (const col of schema.indicator_columns) allColumns.push(mapColumn(col));
  }
  if (schema.system_columns) {
    for (const col of schema.system_columns) allColumns.push(mapColumn(col));
  }

  // 如果后端没有结构化 schema，尝试直接使用 columns 数组
  if (allColumns.length === 0 && schema.columns) {
    for (const col of schema.columns) allColumns.push(mapColumn(col));
  }

  const scope = raw.scope ?? {};
  const bizDate = scope.business_date ?? {};
  const dimensions = scope.dimensions ?? [];

  const indicatorGroups = (raw.indicator_groups ?? []).map((ig: any) =>
    mapIndicatorGroup(ig, raw.id),
  );

  const scheduleRules = (raw.schedule_rules ?? []).map((sr: any) =>
    mapScheduleRule(sr, raw.id),
  );

  return normalizeWideTableMode({
    id: raw.id,
    requirementId,
    name: schema.table_name ?? raw.title ?? "",
    description: raw.description ?? "",
    schema: { columns: allColumns },
    schemaVersion: raw.schema_version ?? schema.version ?? 1,
    dimensionRanges: dimensions.map((d: any) => ({
      dimensionName: d.column_key,
      values: d.values ?? [],
    })),
    businessDateRange: {
      start: normalizeApiBusinessDate(bizDate.start),
      end: bizDate.end === "never" ? "never" : normalizeApiBusinessDate(bizDate.end),
      frequency: bizDate.frequency ?? "monthly",
      quarterlyForLatestYear: bizDate.latest_year_quarterly ?? false,
    },
    semanticTimeAxis: raw.semantic_time_axis ?? "business_date",
    collectionCoverageMode: raw.collection_coverage_mode ?? "incremental_by_business_date",
    indicatorGroups,
    scheduleRule: scheduleRules[0],
    currentPlanVersion: undefined,
    currentPlanFingerprint: undefined,
    recordCount: raw.record_count ?? 0,
    status: raw.status ?? "draft",
    createdAt: fallbackIso(raw.created_at),
    updatedAt: fallbackIso(raw.updated_at),
  });
}

/** 后端 Requirement → 前端 Requirement */
function mapRequirement(raw: any): Requirement {
  const wideTableRaw = raw.wide_table ?? raw.wide_tables?.[0];
  return {
    id: raw.id,
    projectId: raw.project_id,
    requirementType: raw.phase ?? "demo",
    title: raw.title,
    status: mapRequirementStatus(raw.status),
    owner: raw.owner ?? "",
    assignee: raw.assignee ?? "",
    businessGoal: raw.business_goal ?? "",
    backgroundKnowledge: raw.background_knowledge ?? undefined,
    businessBoundary: raw.business_boundary ?? raw.background_knowledge ?? "",
    deliveryScope: raw.delivery_scope ?? "",
    collectionPolicy: raw.collection_policy ? {
      searchEngines: raw.collection_policy.search_engines ?? [],
      preferredSites: raw.collection_policy.preferred_sites ?? [],
      sitePolicy: raw.collection_policy.site_policy ?? "preferred",
      knowledgeBases: raw.collection_policy.knowledge_bases ?? [],
      fixedUrls: raw.collection_policy.fixed_urls ?? [],
      nullPolicy: raw.collection_policy.null_policy ?? "",
      sourcePriority: raw.collection_policy.source_priority ?? "",
      valueFormat: raw.collection_policy.value_format ?? "",
    } : undefined,
    dataUpdateEnabled: raw.data_update_enabled ?? undefined,
    dataUpdateMode: raw.data_update_mode ?? undefined,
    wideTable: wideTableRaw ? mapWideTable(wideTableRaw, raw.id) : undefined,
    processingRuleDrafts: raw.processing_rule_drafts ?? undefined,
    createdAt: fallbackIso(raw.created_at),
    updatedAt: fallbackIso(raw.updated_at),
  };
}

function mapRequirementStatus(status: string): Requirement["status"] {
  const mapping: Record<string, Requirement["status"]> = {
    draft: "draft",
    scoping: "aligning",
    ready: "ready",
    running: "running",
    stabilized: "running",
  };
  return mapping[status] ?? "draft";
}

function resolveBusinessDateFieldName(wideTable?: Pick<WideTable, "schema">): string {
  return wideTable?.schema.columns.find((column) => column.isBusinessDate)?.name ?? "biz_date";
}

/** 后端 WideTableRow → 前端 WideTableRecord */
function mapWideTableRow(raw: any, businessDateFieldName = "biz_date"): WideTableRecord {
  const record: WideTableRecord = {
    id: raw.row_id,
    wideTableId: raw.wide_table_id,
  };

  // 展开 dimension_values 为平铺字段
  if (raw.dimension_values) {
    for (const [k, v] of Object.entries(raw.dimension_values)) {
      record[k] = v;
    }
  }

  // 展开 indicator_values 为平铺字段，同时保留 Agent 来源信息
  const agentRawValues: Record<string, { rawValue: string | number | null; dataSource?: string; sourceUrl?: string; confidence?: number }> = {};
  if (raw.indicator_values) {
    for (const [k, cell] of Object.entries(raw.indicator_values as Record<string, any>)) {
      record[k] = cell?.value ?? null;
      agentRawValues[k] = {
        rawValue: cell?.value ?? null,
        dataSource: cell?.data_source ?? undefined,
        sourceUrl: cell?.source_link ?? undefined,
      };
    }
  }

  if (raw.system_values) {
    for (const [k, v] of Object.entries(raw.system_values as Record<string, any>)) {
      if (record[k] === undefined) {
        record[k] = v;
      }
    }
  }

  // business_date
  const normalizedBusinessDate = normalizeApiBusinessDate(
    raw.business_date ?? raw.dimension_values?.[businessDateFieldName] ?? raw.dimension_values?.BIZ_DATE,
  );
  record[businessDateFieldName] = normalizedBusinessDate;
  record.business_date = normalizedBusinessDate;
  record.BIZ_DATE = normalizedBusinessDate;

  // ROW_ID
  record.ROW_ID = raw.row_id;

  // _metadata
  record._metadata = {
    confidence: 0,
    planVersion: raw.plan_version,
    agentRawValues: Object.keys(agentRawValues).length > 0 ? agentRawValues : undefined,
  };

  return record;
}

/** 后端 TaskGroup → 前端 TaskGroup */
export function mapTaskGroup(raw: any): TaskGroup {
  const normalizedBusinessDate = normalizeApiBusinessDate(raw.business_date);
  const normalizedBusinessDateLabel = normalizeApiPartitionLabel(
    raw.business_date_label ?? raw.business_date,
    raw.partition_type ?? "business_date",
  );
  const rowSnapshots = Array.isArray(raw.row_snapshots)
    ? raw.row_snapshots.map((snapshot: any) => mapWideTableRow(snapshot))
    : undefined;
  return {
    id: raw.id,
    wideTableId: raw.wide_table_id,
    businessDate: normalizedBusinessDate,
    businessDateLabel: normalizedBusinessDateLabel ?? normalizedBusinessDate,
    batchId: raw.batch_id,
    partitionType: raw.partition_type,
    partitionKey: normalizeApiPartitionLabel(raw.partition_key, raw.partition_type) ?? raw.partition_key,
    partitionLabel: normalizeApiPartitionLabel(raw.partition_label, raw.partition_type) ?? raw.partition_label,
    planVersion: raw.plan_version,
    groupKind: raw.group_kind,
    coverageStatus: raw.coverage_status,
    deltaReason: raw.delta_reason,
    status: mapTaskGroupStatus(raw.status),
    totalTasks: raw.total_tasks ?? 0,
    completedTasks: raw.completed_tasks ?? 0,
    failedTasks: raw.failed_tasks ?? 0,
    rowSnapshots,
    triggeredBy: raw.triggered_by ?? mapTriggeredBy(raw.source_type),
    createdAt: raw.created_at ?? new Date().toISOString(),
    updatedAt: raw.updated_at ?? new Date().toISOString(),
  };
}

export function mapTaskGroupStatus(status: string): TaskGroup["status"] {
  const mapping: Record<string, TaskGroup["status"]> = {
    pending: "pending",
    running: "running",
    partial: "partial",
    completed: "completed",
    invalidated: "invalidated",
  };
  return mapping[status] ?? "pending";
}

function mapTriggeredBy(sourceType: string): TaskGroup["triggeredBy"] {
  if (sourceType === "backfill") return "backfill";
  if (sourceType === "scheduled") return "schedule";
  return "manual";
}

/** 后端 FetchTask → 前端 FetchTask */
function mapFetchTask(raw: any): FetchTask {
  return {
    id: raw.id,
    taskGroupId: raw.task_group_id,
    wideTableId: raw.wide_table_id,
    batchId: raw.batch_id,
    rowId: raw.row_id,
    planVersion: raw.plan_version,
    rowBindingKey: raw.row_binding_key,
    indicatorGroupId: raw.indicator_group_id,
    indicatorGroupName: raw.name ?? raw.indicator_group_id,
    status: mapFetchTaskStatus(raw.status),
    confidence: raw.confidence,
    executionRecords: (raw.execution_records ?? []).map(mapExecutionRecord),
    createdAt: raw.created_at ?? new Date().toISOString(),
    updatedAt: raw.updated_at ?? new Date().toISOString(),
  };
}

function mapCollectionBatch(raw: any): CollectionBatch {
  return {
    id: raw.id,
    wideTableId: raw.wide_table_id,
    snapshotAt: raw.snapshot_at,
    snapshotLabel: raw.snapshot_label,
    coverageMode: raw.coverage_mode,
    semanticTimeAxis: raw.semantic_time_axis,
    status: raw.status,
    isCurrent: Boolean(raw.is_current),
    planVersion: raw.plan_version,
    triggeredBy: raw.triggered_by,
    startBusinessDate: normalizeApiBusinessDate(raw.start_business_date) || undefined,
    endBusinessDate: normalizeApiBusinessDate(raw.end_business_date) || undefined,
    createdAt: raw.created_at ?? new Date().toISOString(),
    updatedAt: raw.updated_at ?? new Date().toISOString(),
  };
}

export function mapFetchTaskStatus(status: string): FetchTask["status"] {
  const mapping: Record<string, FetchTask["status"]> = {
    pending: "pending",
    running: "running",
    completed: "completed",
    failed: "failed",
    invalidated: "invalidated",
  };
  return mapping[status] ?? "pending";
}

/** 后端 ExecutionRecord → 前端 ExecutionRecord */
function mapExecutionRecord(raw: any): ExecutionRecord {
  return {
    id: raw.id,
    fetchTaskId: raw.task_id ?? raw.fetch_task_id ?? "",
    attempt: raw.attempt ?? 1,
    status: mapRunStatus(raw.status),
    triggeredBy: mapTriggerType(raw.trigger_type),
    taskGroupRunId: raw.task_group_run_id,
    errorMessage: raw.error_message,
    startedAt: raw.started_at ?? "",
    endedAt: raw.ended_at ?? undefined,
  };
}

function mapRunStatus(status: string): ExecutionRecord["status"] {
  const mapping: Record<string, ExecutionRecord["status"]> = {
    queued: "running",
    running: "running",
    completed: "success",
    failed: "failure",
  };
  return mapping[status] ?? "running";
}

function mapTriggerType(trigger: string): ExecutionRecord["triggeredBy"] {
  const mapping: Record<string, ExecutionRecord["triggeredBy"]> = {
    trial: "manual",
    manual: "manual",
    cron: "schedule",
    resample: "backfill",
  };
  return mapping[trigger] ?? "manual";
}

/** 后端 BackfillRequest → 前端 BackfillRequest */
function mapBackfillRequest(raw: any): BackfillRequest {
  return {
    id: raw.id,
    wideTableId: raw.wide_table_id,
    businessDateStart: raw.start_business_date,
    businessDateEnd: raw.end_business_date,
    reason: raw.reason ?? "",
    requestedBy: raw.requested_by ?? "",
    status: raw.status ?? "pending",
    taskGroupIds: raw.task_group_ids ?? [],
    createdAt: raw.created_at ?? new Date().toISOString(),
  };
}

/** 后端 AcceptanceTicket → 前端 AcceptanceTicket */
function mapAcceptanceTicket(raw: any): AcceptanceTicket {
  return {
    id: raw.id,
    dataset: raw.dataset,
    requirementId: raw.requirement_id,
    status: raw.status,
    owner: raw.owner,
    feedback: raw.feedback ?? "",
    latestActionAt: raw.latest_action_at ?? "",
  };
}

/** 后端 AuditRule → 前端 AuditRule */
function mapAuditRule(raw: any): AuditRule {
  return {
    id: raw.id,
    name: raw.name,
    mode: raw.mode,
    scenarioRigour: raw.scenario_rigour,
    condition: raw.condition_expr ?? raw.condition,
    action: raw.action_text ?? raw.action,
  };
}

/** 后端 PreprocessRule → 前端 PreprocessRule */
function mapPreprocessRule(raw: any): PreprocessRule {
  return {
    id: raw.id,
    name: raw.name,
    source: raw.source,
    enabled: raw.enabled ?? true,
    category: raw.category,
    expression: raw.expression,
    sampleIssue: raw.sample_issue ?? "",
    indicatorBindings: raw.indicator_bindings ?? [],
    fillingConfig: raw.filling_config ?? undefined,
  };
}

/** 后端 OpsOverview → 前端 OpsOverview */
function mapOpsOverview(raw: any): OpsOverview {
  return {
    environment: raw.environment,
    stage: raw.stage,
    status: raw.status,
    runningTasks: raw.running_tasks,
    failedTasks: raw.failed_tasks,
  };
}

/** 后端 DataLineage → 前端 DataLineage */
function mapDataLineage(raw: any): DataLineage {
  return {
    id: raw.id,
    dataset: raw.dataset,
    upstream: raw.upstream,
    downstream: raw.downstream,
    lastSyncAt: raw.last_sync_at ?? "",
  };
}

/** 后端 ScheduleJob → 前端 ScheduleJob */
function mapScheduleJob(raw: any): ScheduleJob {
  return {
    id: raw.id,
    taskGroupId: raw.task_group_id,
    wideTableId: raw.wide_table_id ?? undefined,
    triggerType: raw.trigger_type,
    status: raw.status,
    startedAt: raw.started_at,
    endedAt: raw.ended_at ?? undefined,
    operator: raw.operator,
    logRef: raw.log_ref ?? undefined,
  };
}

function mapRuntimeSettings(raw: any): RuntimeSettings {
  return normalizeRuntimeSettings(raw);
}

/** Fetch schedule jobs from backend API */
export async function fetchScheduleJobs(
  triggerType?: string,
  status?: string,
): Promise<ScheduleJob[]> {
  const params = new URLSearchParams();
  if (triggerType) params.set("trigger_type", triggerType);
  if (status) params.set("status", status);
  const qs = params.toString();
  const url = buildApiUrl(`/api/schedule-jobs${qs ? `?${qs}` : ""}`);
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return (data as any[]).map(mapScheduleJob);
}

/** Create a schedule job (manual trigger / backfill) */
export async function createScheduleJob(data: {
  taskGroupId?: string;
  taskId?: string;
  triggerType?: string;
  operator?: string;
  backfillRequestId?: string;
}): Promise<ScheduleJob | null> {
  const url = buildApiUrl("/api/schedule-jobs");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      task_group_id: data.taskGroupId,
      task_id: data.taskId,
      trigger_type: data.triggerType ?? "manual",
      operator: data.operator ?? "manual",
      backfill_request_id: data.backfillRequestId,
    }),
  });
  if (!res.ok) return null;
  const raw = await res.json();
  return mapScheduleJob(raw);
}

export async function fetchRuntimeSettings(): Promise<RuntimeSettings> {
  return loadRuntimeSettings();
}

export async function updateRuntimeSettings(
  settings: RuntimeSettings,
): Promise<RuntimeSettings> {
  return saveRuntimeSettings(settings);
}

// ==================== 前端 → 后端 数据转换 ====================

function toBackendRequirementStatus(status: Requirement["status"]): string {
  const mapping: Record<string, string> = {
    draft: "draft",
    aligning: "scoping",
    ready: "ready",
    running: "running",
  };
  return mapping[status] ?? "draft";
}

function toBackendWideTableFrequency(
  frequency: WideTable["businessDateRange"]["frequency"],
): "monthly" | "yearly" {
  return frequency === "yearly" ? "yearly" : "monthly";
}

function toBackendWideTableColumn(column: ColumnDefinition) {
  return {
    key: column.name,
    name: column.chineseName ?? column.name,
    role: column.category === "attribute" ? "system" : column.category,
    data_type: column.type.toLowerCase(),
    description: column.description,
    required: column.required,
    unit: column.unit,
    is_business_date: Boolean(column.isBusinessDate),
  };
}

function toBackendWideTableSchema(wideTable: WideTable) {
  const idColumn = wideTable.schema.columns.find((column) => column.category === "id");
  if (!idColumn) {
    throw new Error("Wide table schema must include an id column");
  }

  return {
    table_name: wideTable.name,
    version: wideTable.schemaVersion ?? 1,
    id_column: toBackendWideTableColumn(idColumn),
    dimension_columns: wideTable.schema.columns
      .filter((column) => column.category === "dimension")
      .map(toBackendWideTableColumn),
    indicator_columns: wideTable.schema.columns
      .filter((column) => column.category === "indicator")
      .map(toBackendWideTableColumn),
    system_columns: wideTable.schema.columns
      .filter((column) => column.category === "system" || column.category === "attribute")
      .map(toBackendWideTableColumn),
  };
}

function toBackendWideTableScope(wideTable: WideTable) {
  const semanticTimeAxis = resolveWideTableSemanticTimeAxis(wideTable);
  const businessDateColumn = wideTable.schema.columns.find(
    (column) => column.category === "dimension" && column.isBusinessDate,
  );
  const businessDateScope = semanticTimeAxis === "none"
    ? undefined
    : {
        column_key: businessDateColumn?.name ?? "BIZ_DATE",
        start: wideTable.businessDateRange.start,
        end: wideTable.businessDateRange.end,
        frequency: toBackendWideTableFrequency(wideTable.businessDateRange.frequency),
        latest_year_quarterly: Boolean(wideTable.businessDateRange.quarterlyForLatestYear),
      };

  return {
    business_date: businessDateScope,
    dimensions: wideTable.dimensionRanges.map((range) => ({
      column_key: range.dimensionName,
      values: range.values,
    })),
  };
}

function toBackendWideTablePlanRows(
  wideTable: WideTable,
  records: WideTableRecord[],
  planVersion: number,
) {
  const businessDateColumn = wideTable.schema.columns.find(
    (column) => column.category === "dimension" && column.isBusinessDate,
  );
  const dimensionColumns = wideTable.schema.columns.filter(
    (column) => column.category === "dimension" && !column.isBusinessDate,
  );
  const auxiliaryColumns = wideTable.schema.columns.filter(
    (column) => column.category === "attribute" || column.category === "system",
  );

  return records.map((record) => ({
    row_id: Number(record.ROW_ID ?? record.id),
    plan_version: record._metadata?.planVersion ?? planVersion,
    row_status: record.row_status ?? record.ROW_STATUS ?? "initialized",
    dimension_values: Object.fromEntries(
      dimensionColumns.map((column) => [column.name, String(record[column.name] ?? "")]),
    ),
    business_date: businessDateColumn
      ? String(record[businessDateColumn.name] ?? record.BIZ_DATE ?? "")
      : null,
    row_binding_key: record.rowBindingKey ?? undefined,
    system_values: Object.fromEntries(
      auxiliaryColumns
        .filter((column) => record[column.name] !== undefined)
        .map((column) => [column.name, record[column.name]]),
    ),
  }));
}

function toBackendWideTablePlanTaskGroups(
  wideTableId: string,
  taskGroups: TaskGroup[],
  planVersion: number,
) {
  return taskGroups
    .filter(
      (taskGroup) =>
        taskGroup.wideTableId === wideTableId
        && (taskGroup.planVersion ?? planVersion) === planVersion,
    )
    .map((taskGroup) => ({
      id: taskGroup.id,
      batch_id: taskGroup.batchId,
      business_date: taskGroup.businessDate || null,
      plan_version: taskGroup.planVersion ?? planVersion,
      status: taskGroup.status,
      partition_type: taskGroup.partitionType ?? "business_date",
      partition_key: taskGroup.partitionKey ?? taskGroup.businessDate ?? "full_table",
      partition_label: taskGroup.partitionLabel ?? taskGroup.businessDateLabel ?? taskGroup.id,
      total_tasks: taskGroup.totalTasks,
      completed_tasks: taskGroup.completedTasks,
      failed_tasks: taskGroup.failedTasks,
      triggered_by: taskGroup.triggeredBy,
      created_at: taskGroup.createdAt,
      updated_at: taskGroup.updatedAt,
    }));
}

// ==================== API 调用函数 ====================

// ---- Projects ----

export async function fetchProjects(): Promise<Project[]> {
  const raw = await apiGet<any[]>("/api/projects");
  return raw.map(mapProject);
}

export async function fetchProject(projectId: string): Promise<Project> {
  const raw = await apiGet<any>(`/api/projects/${projectId}`);
  return mapProject(raw);
}

export async function createProject(data: {
  name: string;
  ownerTeam: string;
  description: string;
  status?: string;
  businessBackground?: string;
  dataSource?: any;
}): Promise<Project> {
  const raw = await apiPost<any>("/api/projects", {
    name: data.name,
    owner_team: data.ownerTeam,
    description: data.description,
    status: data.status ?? "planning",
    business_background: data.businessBackground,
    data_source: data.dataSource,
  });
  return mapProject(raw);
}

export async function updateProject(
  projectId: string,
  data: Partial<{
    name: string;
    ownerTeam: string;
    description: string;
    status: string;
    businessBackground: string;
    dataSource: any;
  }>,
): Promise<Project> {
  const body: any = {};
  if (data.name !== undefined) body.name = data.name;
  if (data.ownerTeam !== undefined) body.owner_team = data.ownerTeam;
  if (data.description !== undefined) body.description = data.description;
  if (data.status !== undefined) body.status = data.status;
  if (data.businessBackground !== undefined) body.business_background = data.businessBackground;
  if (data.dataSource !== undefined) body.data_source = data.dataSource;
  const raw = await apiPut<any>(`/api/projects/${projectId}`, body);
  return mapProject(raw);
}

// ---- Requirements ----

export async function fetchRequirements(projectId: string): Promise<Requirement[]> {
  const raw = await apiGet<any[]>(`/api/projects/${projectId}/requirements`);
  // 后端返回 RequirementSummary[]，需求在 .requirement 字段
  return raw.map((item) => mapRequirement(item.requirement ?? item));
}

export async function fetchRequirementWideTables(
  projectId: string,
): Promise<{ requirements: Requirement[]; wideTables: WideTable[] }> {
  const raw = await apiGet<any[]>(`/api/projects/${projectId}/requirements`);
  const requirements: Requirement[] = [];
  const wideTables: WideTable[] = [];

  for (const item of raw) {
    const reqRaw = item.requirement ?? item;
    const req = mapRequirement(reqRaw);
    requirements.push(req);

    if (req.wideTable) {
      wideTables.push(req.wideTable);
    }
  }

  return { requirements, wideTables };
}

export async function fetchRequirement(
  projectId: string,
  requirementId: string,
): Promise<{ requirement: Requirement; wideTables: WideTable[] }> {
  const raw = await apiGet<any>(`/api/projects/${projectId}/requirements/${requirementId}`);
  const requirement = mapRequirement(raw);
  const wideTables = requirement.wideTable ? [requirement.wideTable] : [];
  return { requirement, wideTables };
}

export async function createRequirement(
  projectId: string,
  data: {
    title: string;
    owner: string;
    assignee: string;
    businessGoal: string;
    businessBoundary?: string;
    deliveryScope?: string;
    dataUpdateEnabled?: boolean;
    dataUpdateMode?: RequirementDataUpdateMode | null;
    projectDataSource?: Project["dataSource"];
  },
): Promise<Requirement> {
  const runtimeSettings = loadRuntimeSettings();
  const raw = await apiPost<any>(`/api/projects/${projectId}/requirements`, {
    title: data.title,
    phase: "demo",
    owner: data.owner,
    assignee: data.assignee,
    business_goal: data.businessGoal,
    background_knowledge: data.businessBoundary ?? "",
    delivery_scope: data.deliveryScope ?? "",
    data_update_enabled: data.dataUpdateEnabled,
    data_update_mode: data.dataUpdateMode ?? null,
    collection_policy: buildCollectionPolicy(
      data.projectDataSource,
      runtimeSettings.searchConfig.enabledSearchEngines,
    ),
    wide_table: null,
  });
  return mapRequirement(raw);
}

export async function updateRequirement(
  projectId: string,
  requirementId: string,
  data: Partial<{
    title: string;
    status: Requirement["status"];
    owner: string;
    assignee: string;
    businessGoal: string;
    businessBoundary: string;
    deliveryScope: string;
    dataUpdateEnabled: boolean;
    dataUpdateMode: RequirementDataUpdateMode | null;
    processingRuleDrafts: any[];
  }>,
): Promise<Requirement> {
  const body: any = {};
  if (data.title !== undefined) body.title = data.title;
  if (data.status !== undefined) body.status = toBackendRequirementStatus(data.status);
  if (data.owner !== undefined) body.owner = data.owner;
  if (data.assignee !== undefined) body.assignee = data.assignee;
  if (data.businessGoal !== undefined) body.business_goal = data.businessGoal;
  if (data.businessBoundary !== undefined) body.background_knowledge = data.businessBoundary;
  if (data.deliveryScope !== undefined) body.delivery_scope = data.deliveryScope;
  if (data.dataUpdateEnabled !== undefined) body.data_update_enabled = data.dataUpdateEnabled;
  if (data.dataUpdateMode !== undefined) body.data_update_mode = data.dataUpdateMode;
  if (data.processingRuleDrafts !== undefined) body.processing_rule_drafts = data.processingRuleDrafts;
  const raw = await apiPut<any>(
    `/api/projects/${projectId}/requirements/${requirementId}`,
    body,
  );
  return mapRequirement(raw);
}

export async function convertRequirement(
  projectId: string,
  requirementId: string,
): Promise<Requirement> {
  const raw = await apiPost<any>(
    `/api/projects/${projectId}/requirements/${requirementId}/convert`,
  );
  return mapRequirement(raw);
}

// ---- Wide Table Rows ----

export async function fetchWideTableRows(
  wideTableId: string,
  wideTable?: Pick<WideTable, "schema">,
  options: {
    batchId?: string;
  } = {},
): Promise<WideTableRecord[]> {
  const query = options.batchId ? `?batch_id=${encodeURIComponent(options.batchId)}` : "";
  const raw = await apiGet<any[]>(`/api/wide-tables/${wideTableId}/rows${query}`);
  const businessDateFieldName = resolveBusinessDateFieldName(wideTable);
  return raw.map((item) => mapWideTableRow(item, businessDateFieldName));
}

export async function fetchRequirementRows(
  projectId: string,
  requirementId: string,
): Promise<WideTableRecord[]> {
  const raw = await apiGet<any[]>(
    `/api/projects/${projectId}/requirements/${requirementId}/rows`,
  );
  return raw.map((item) => mapWideTableRow(item));
}

export async function updateWideTableRow(
  wideTableId: string,
  rowId: number,
  data: {
    indicatorValues?: Record<string, {
      value?: string | number | null;
      valueDescription?: string | null;
      maxValue?: number | null;
      minValue?: number | null;
      dataSource?: string | null;
      sourceLink?: string | null;
    }>;
    rowStatus?: string;
    systemValues?: Record<string, unknown>;
  },
): Promise<void> {
  await apiPut(`/api/wide-tables/${wideTableId}/rows/${rowId}`, {
    indicator_values: data.indicatorValues,
    row_status: data.rowStatus,
    system_values: data.systemValues,
  });
}

export async function persistWideTablePlan(
  requirementId: string,
  wideTable: WideTable,
  records: WideTableRecord[],
  taskGroups: TaskGroup[],
): Promise<void> {
  const normalizedWideTable = normalizeWideTableMode(wideTable);
  const planVersion = Math.max(
    normalizedWideTable.currentPlanVersion ?? 0,
    ...records.map((record) => record._metadata?.planVersion ?? 0),
    ...taskGroups.map((taskGroup) => taskGroup.planVersion ?? 0),
  );

  await apiPost(`/api/requirements/${requirementId}/wide-tables/${normalizedWideTable.id}/plan`, {
    schema: toBackendWideTableSchema(normalizedWideTable),
    scope: toBackendWideTableScope(normalizedWideTable),
    indicator_groups: normalizedWideTable.indicatorGroups.map((group) => ({
      id: group.id,
      name: group.name,
      indicator_columns: group.indicatorColumns,
      priority: group.priority,
      description: group.description,
      agent: group.agent,
      prompt_template: group.promptTemplate,
      prompt_config: group.promptConfig ? {
        core_query_requirement: group.promptConfig.coreQueryRequirement,
        business_knowledge: group.promptConfig.businessKnowledge,
        output_constraints: group.promptConfig.outputConstraints,
        last_edited_at: group.promptConfig.lastEditedAt,
      } : undefined,
    })),
    rows: toBackendWideTablePlanRows(normalizedWideTable, records, planVersion),
    task_groups: toBackendWideTablePlanTaskGroups(normalizedWideTable.id, taskGroups, planVersion),
    semantic_time_axis: resolveWideTableSemanticTimeAxis(normalizedWideTable),
    collection_coverage_mode: resolveWideTableCollectionCoverageMode(normalizedWideTable),
    status: normalizedWideTable.status,
    record_count: normalizedWideTable.recordCount,
  });
}

export async function persistWideTablePreview(
  requirementId: string,
  wideTable: WideTable,
  records: WideTableRecord[],
): Promise<void> {
  const normalizedWideTable = normalizeWideTableMode(wideTable);
  const planVersion = Math.max(
    normalizedWideTable.currentPlanVersion ?? 0,
    ...records.map((record) => record._metadata?.planVersion ?? 0),
  );

  await apiPost(`/api/requirements/${requirementId}/wide-tables/${normalizedWideTable.id}/preview`, {
    schema: toBackendWideTableSchema(normalizedWideTable),
    scope: toBackendWideTableScope(normalizedWideTable),
    indicator_groups: normalizedWideTable.indicatorGroups.map((group) => ({
      id: group.id,
      name: group.name,
      indicator_columns: group.indicatorColumns,
      priority: group.priority,
      description: group.description,
      agent: group.agent,
      prompt_template: group.promptTemplate,
      prompt_config: group.promptConfig ? {
        core_query_requirement: group.promptConfig.coreQueryRequirement,
        business_knowledge: group.promptConfig.businessKnowledge,
        output_constraints: group.promptConfig.outputConstraints,
        last_edited_at: group.promptConfig.lastEditedAt,
      } : undefined,
    })),
    rows: toBackendWideTablePlanRows(normalizedWideTable, records, planVersion),
    task_groups: [],
    semantic_time_axis: resolveWideTableSemanticTimeAxis(normalizedWideTable),
    collection_coverage_mode: resolveWideTableCollectionCoverageMode(normalizedWideTable),
    status: normalizedWideTable.status,
    record_count: normalizedWideTable.recordCount,
  });
}

// ---- Task Groups ----

export async function fetchTaskGroups(
  projectId: string,
  requirementId: string,
): Promise<TaskGroup[]> {
  const raw = await apiGet<any[]>(
    `/api/projects/${projectId}/requirements/${requirementId}/task-groups`,
  );
  return raw.map(mapTaskGroup);
}

export async function fetchCollectionBatches(
  requirementId: string,
  wideTableId: string,
): Promise<CollectionBatch[]> {
  const raw = await apiGet<any[]>(
    `/api/requirements/${requirementId}/wide-tables/${wideTableId}/collection-batches`,
  );
  return raw.map(mapCollectionBatch);
}

export async function generateTaskGroups(requirementId: string): Promise<TaskGroup[]> {
  const raw = await apiPost<any[]>(
    `/api/requirements/${requirementId}/task-groups/generate`,
  );
  return raw.map(mapTaskGroup);
}

// ---- Fetch Tasks ----

export async function fetchFetchTasks(
  projectId: string,
  requirementId: string,
): Promise<FetchTask[]> {
  const raw = await apiGet<any[]>(
    `/api/projects/${projectId}/requirements/${requirementId}/tasks`,
  );
  // 后端返回 TaskSummary[]，task 在 .task 字段
  return raw.map((item) => mapFetchTask(item.task ?? item));
}

export async function executeTask(taskId: string): Promise<void> {
  await apiPost(`/api/tasks/${taskId}/execute`);
}

export async function retryTask(taskId: string): Promise<void> {
  await apiPost(`/api/tasks/${taskId}/retry`);
}

export async function executeTaskGroup(taskGroupId: string): Promise<void> {
  await apiPost(`/api/task-groups/${taskGroupId}/execute`);
}

// ---- Backfill ----

export async function fetchBackfillRequests(
  projectId: string,
  requirementId: string,
): Promise<BackfillRequest[]> {
  const raw = await apiGet<any[]>(
    `/api/projects/${projectId}/requirements/${requirementId}/backfill-requests`,
  );
  return raw.map(mapBackfillRequest);
}

export async function createBackfillRequest(
  requirementId: string,
  data: {
    wideTableId: string;
    startBusinessDate: string;
    endBusinessDate: string;
    reason?: string;
    requestedBy?: string;
  },
): Promise<BackfillRequest> {
  const raw = await apiPost<any>(
    `/api/requirements/${requirementId}/backfill-requests`,
    {
      wide_table_id: data.wideTableId,
      start_business_date: data.startBusinessDate,
      end_business_date: data.endBusinessDate,
      reason: data.reason,
      requested_by: data.requestedBy ?? "system",
    },
  );
  return mapBackfillRequest(raw);
}

// ---- Platform Config ----

export async function fetchPreprocessRules(): Promise<PreprocessRule[]> {
  const raw = await apiGet<any[]>("/api/preprocess-rules");
  return raw.map(mapPreprocessRule);
}

export async function fetchAuditRules(): Promise<AuditRule[]> {
  const raw = await apiGet<any[]>("/api/audit-rules");
  return raw.map(mapAuditRule);
}

export async function fetchAcceptanceTickets(): Promise<AcceptanceTicket[]> {
  const raw = await apiGet<any[]>("/api/acceptance-tickets");
  return raw.map(mapAcceptanceTicket);
}

export async function createAcceptanceTicket(data: {
  dataset: string;
  requirementId: string;
  owner: string;
  feedback?: string;
}): Promise<AcceptanceTicket> {
  const raw = await apiPost<any>("/api/acceptance-tickets", {
    dataset: data.dataset,
    requirement_id: data.requirementId,
    owner: data.owner,
    feedback: data.feedback,
  });
  return mapAcceptanceTicket(raw);
}

export async function updateAcceptanceTicket(
  ticketId: string,
  data: { status?: string; feedback?: string },
): Promise<void> {
  await apiPut(`/api/acceptance-tickets/${ticketId}`, data);
}

export async function fetchDashboardMetrics(): Promise<{
  projects: number;
  requirements: number;
  taskGroups: number;
  fetchTasks: number;
  runningTaskGroups: number;
  pendingBackfills: number;
}> {
  const raw = await apiGet<any>("/api/dashboard/metrics");
  return {
    projects: raw.projects,
    requirements: raw.requirements,
    taskGroups: raw.task_groups,
    fetchTasks: raw.fetch_tasks,
    runningTaskGroups: raw.running_task_groups,
    pendingBackfills: raw.pending_backfills,
  };
}

export async function fetchOpsOverview(): Promise<OpsOverview[]> {
  const raw = await apiGet<any[]>("/api/ops/overview");
  return raw.map(mapOpsOverview);
}

export async function fetchTaskStatusCounts(): Promise<Array<{ status: string; count: number }>> {
  return apiGet("/api/ops/task-status-counts");
}

export async function fetchDataStatusCounts(): Promise<Array<{ status: string; count: number }>> {
  return apiGet("/api/ops/data-status-counts");
}

// ---- Execution Records ----

export async function fetchExecutionRecords(taskId: string): Promise<ExecutionRecord[]> {
  const raw = await apiGet<any[]>(`/api/tasks/${taskId}/runs`);
  return raw.map(mapExecutionRecord);
}

// ==================== 聚合加载函数（供页面组件使用）====================

/**
 * 加载项目详情页所需的全部数据
 */
export async function loadProjectData(projectId: string): Promise<{
  project: Project;
  requirements: Requirement[];
  wideTables: WideTable[];
  taskGroups: TaskGroup[];
  fetchTasks: FetchTask[];
}> {
  const project = await fetchProject(projectId);
  const { requirements, wideTables } = await fetchRequirementWideTables(projectId);

  // 并行加载所有需求的 task groups 和 fetch tasks
  const taskGroupsArrays = await Promise.all(
    requirements.map((req) => fetchTaskGroups(projectId, req.id).catch(() => [] as TaskGroup[])),
  );
  const fetchTasksArrays = await Promise.all(
    requirements.map((req) => fetchFetchTasks(projectId, req.id).catch(() => [] as FetchTask[])),
  );

  return {
    project,
    requirements,
    wideTables,
    taskGroups: taskGroupsArrays.flat(),
    fetchTasks: fetchTasksArrays.flat(),
  };
}

/**
 * 加载需求详情页所需的全部数据
 */
export async function loadRequirementDetailData(
  projectId: string,
  requirementId: string,
): Promise<{
  project: Project;
  requirements: Requirement[];
  wideTables: WideTable[];
  wideTableRecords: WideTableRecord[];
  taskGroups: TaskGroup[];
  fetchTasks: FetchTask[];
  acceptanceTickets: AcceptanceTicket[];
  scheduleJobs: ScheduleJob[];
}> {
  const [project, reqData, taskGroups, fetchTasks, acceptanceTickets] = await Promise.all([
    fetchProject(projectId),
    fetchRequirementWideTables(projectId),
    fetchTaskGroups(projectId, requirementId).catch(() => [] as TaskGroup[]),
    fetchFetchTasks(projectId, requirementId).catch(() => [] as FetchTask[]),
    fetchAcceptanceTickets().catch(() => [] as AcceptanceTicket[]),
  ]);

  // 加载宽表记录
  const wideTableRecordsArrays = await Promise.all(
    reqData.wideTables.map((wt) =>
      fetchWideTableRows(wt.id, wt).catch(() => [] as WideTableRecord[]),
    ),
  );

  return {
    project,
    requirements: reqData.requirements,
    wideTables: reqData.wideTables,
    wideTableRecords: wideTableRecordsArrays.flat(),
    taskGroups,
    fetchTasks,
    acceptanceTickets: acceptanceTickets.filter((t) => t.requirementId === requirementId),
    scheduleJobs: await fetchScheduleJobs(), // Load from backend API
  };
}


// ---- Admin: Demo Data Reset ----

export async function resetDemoData(): Promise<{ ok: boolean; message: string }> {
  return apiPost("/api/admin/seed");
}

export { resetDemoData as seedDemoData };

export async function resetAllData(): Promise<{ ok: boolean; message: string }> {
  return apiPost("/api/admin/reset");
}
