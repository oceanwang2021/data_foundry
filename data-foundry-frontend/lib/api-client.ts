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
  CollectionResult,
  CollectionResultRow,
  MetricFieldMapping,
  MappedResultMaterializationOutcome,
  TargetComparisonOutcome,
  TargetPublishOutcome,
  FetchTaskResults,
  CollectionBatch,
  IndicatorGroup,
  ScheduleRule,
  ColumnDefinition,
  TargetTableSummary,
  TargetTableColumn,
  BackfillRequest,
  ExecutionRecord,
  WideTableScopeImport,
} from "./types";
import type {
  AcceptanceTicket,
  AuditRule,
  PreprocessRule,
  OpsMonitoringSummary,
  OpsOverview,
  DataLineage,
  RuntimeSettings,
  ScheduleJob,
} from "./domain";
import { buildApiUrl } from "./api-base";
import { loadAuthToken, type PermissionUser } from "./auth-permissions";
import {
  normalizeBusinessDateForFrequency,
  normalizeBusinessDateFrequency,
  normalizeBusinessDateToken,
  toApiBusinessDateFrequency,
} from "./business-date";
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

function safeParseObject(value: unknown): Record<string, string> | undefined {
  if (!value) {
    return undefined;
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, item == null ? "" : String(item)]),
    );
  }
  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object"
      ? Object.fromEntries(Object.entries(parsed).map(([key, item]) => [key, item == null ? "" : String(item)]))
      : undefined;
  } catch {
    return undefined;
  }
}

function safeParseStringArray(value: unknown): string[] | undefined {
  if (!value) {
    return undefined;
  }
  if (Array.isArray(value)) {
    const items = value
      .map((item) => String(item ?? "").trim())
      .filter((item) => item !== "");
    return items.length > 0 ? items : undefined;
  }
  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.map((item) => String(item ?? "").trim()).filter((item) => item !== "")
      : undefined;
  } catch {
    return undefined;
  }
}

function readRaw(raw: any, snakeKey: string, camelKey: string = snakeKey): any {
  return raw?.[snakeKey] ?? raw?.[camelKey];
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
    null_policy: "未提及填 NULL，不允许把缺失写成 0。",
    source_priority: "监管公告 > 企业官网 > 券商研报 > 媒体。",
    value_format: "日期统一为 YYYY-MM，数值列与单位分离存储。",
  };
}

// ==================== 通用请求 ====================

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = buildApiUrl(path);
  const headers = new Headers(init?.headers);
  const token = loadAuthToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
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
    let detail = "";
    if (text.trim() !== "") {
      try {
        const parsed = JSON.parse(text);
        detail = parsed?.detail ?? parsed?.message ?? parsed?.error ?? "";
      } catch {
        detail = text;
      }
    }
    throw new Error(detail && String(detail).trim() !== "" ? String(detail).trim() : `API ${res.status}: ${text}`);
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

function resolveDownloadFileName(contentDisposition: string | null, fallbackName: string): string {
  if (!contentDisposition) {
    return fallbackName;
  }
  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch (error) {
      return utf8Match[1];
    }
  }
  const plainMatch = contentDisposition.match(/filename="?([^\";]+)"?/i);
  return plainMatch?.[1] ? plainMatch[1] : fallbackName;
}

// ==================== 后端 → 前端 数据转换 ====================

/** 后端 Project → 前端 Project */
export async function listTargetTables(keyword?: string): Promise<TargetTableSummary[]> {
  const kw = keyword?.trim();
  const qs = kw ? `?keyword=${encodeURIComponent(kw)}` : "";
  const raw = await apiGet<any>(`/api/target-tables${qs}`);
  const items = Array.isArray(raw) ? raw : raw?.value ?? [];
  return (items as any[])
    .map((row) => ({
      tableName: row.tableName ?? row.table_name ?? "",
      tableComment: row.tableComment ?? row.table_comment ?? undefined,
      createTime: row.createTime ?? row.create_time ?? undefined,
      updateTime: row.updateTime ?? row.update_time ?? undefined,
    } satisfies TargetTableSummary))
    .filter((row) => row.tableName.trim() !== "");
}

export async function listTargetTableColumns(tableName: string): Promise<TargetTableColumn[]> {
  const raw = await apiGet<any>(`/api/target-tables/${encodeURIComponent(tableName)}/columns`);
  const items = Array.isArray(raw) ? raw : raw?.value ?? [];
  return (items as any[])
    .map((row) => ({
      columnName: row.columnName ?? row.column_name ?? "",
      dataType: row.dataType ?? row.data_type ?? "",
      columnType: row.columnType ?? row.column_type ?? undefined,
      isNullable: row.isNullable ?? row.is_nullable ?? undefined,
      columnComment: row.columnComment ?? row.column_comment ?? undefined,
      ordinalPosition: row.ordinalPosition ?? row.ordinal_position ?? undefined,
    } satisfies TargetTableColumn))
    .filter((row) => row.columnName.trim() !== "");
}

function mapProject(raw: any): Project {
  return {
    id: raw.id,
    name: raw.name,
    createdBy: raw.created_by ?? raw.createdBy ?? "",
    createdByAccount: raw.created_by_account ?? raw.createdByAccount ?? "",
    description: raw.description ?? "",
    businessBackground: raw.business_background ?? raw.businessBackground ?? "",
    status: raw.status ?? "active",
    ownerTeam: raw.owner_team ?? raw.ownerTeam ?? "",
    dataSource: raw.data_source ?? raw.dataSource ?? {
      search: { engines: [], sites: [], sitePolicy: "preferred" },
      knowledgeBases: [],
      fixedUrls: [],
    },
    createdAt: fallbackIso(raw.created_at ?? raw.createdAt),
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
    passthroughEnabled: raw.passthrough_enabled ?? raw.passthroughEnabled ?? false,
    passthroughContent: raw.passthrough_content ?? raw.passthroughContent ?? undefined,
    auditRuleType: raw.audit_rule_type ?? raw.auditRuleType ?? undefined,
    auditRuleValue: raw.audit_rule_value != null ? String(raw.audit_rule_value) : raw.auditRuleValue,
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
  const frequency = normalizeBusinessDateFrequency(raw.frequency);
  return {
    id: raw.id,
    wideTableId,
    type: "periodic",
    cronExpression: raw.trigger_time ?? undefined,
    periodLabel: frequency,
    businessDateOffsetDays: 0,
    description: `${frequency} schedule`,
  };
}

/** 后端 WideTable (嵌套在 Requirement 中) → 前端 WideTable */
function mapWideTable(raw: any, requirementId?: string): WideTable {
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
  const parameterRows = scope.parameter_rows ?? [];
  const parameterSource = scope.parameter_source ?? {};

  const indicatorGroups = (raw.indicator_groups ?? []).map((ig: any) =>
    mapIndicatorGroup(ig, raw.id),
  );

  const scheduleRules = (raw.schedule_rules ?? []).map((sr: any) =>
    mapScheduleRule(sr, raw.id),
  );
  const scopeImport = mapWideTableScopeImport(raw.scopeImport ?? raw.scope_import);

  const businessDateFrequency = normalizeBusinessDateFrequency(bizDate.frequency);

  return normalizeWideTableMode({
    id: raw.id,
    requirementId: raw.requirement_id ?? raw.requirementId ?? requirementId ?? "",
    name: raw.tableName ?? raw.table_name ?? schema.table_name ?? raw.title ?? "",
    description: raw.description ?? "",
    schema: { columns: allColumns },
    schemaVersion: raw.schema_version ?? raw.schemaVersion ?? schema.version ?? 1,
    dimensionRanges: dimensions.map((d: any) => ({
      dimensionName: d.column_key,
      values: d.values ?? [],
    })),
    parameterRows: (parameterRows as any[]).map((row: any, index: number) => ({
      rowId: Number(row.row_id ?? index + 1),
      values: row.values ?? row.parameter_values ?? {},
      businessDate: row.business_date ?? undefined,
    })),
    parameterSource: parameterSource?.mode
      ? {
          mode: parameterSource.mode === "sql" ? "sql" : "manual_file",
          sql: parameterSource.sql ?? undefined,
          maxRows: parameterSource.max_rows ?? parameterSource.maxRows ?? undefined,
        }
      : undefined,
    businessDateRange: {
      start: normalizeBusinessDateForFrequency(String(bizDate.start ?? ""), businessDateFrequency),
      end: bizDate.end === "never"
        ? "never"
        : normalizeBusinessDateForFrequency(String(bizDate.end ?? ""), businessDateFrequency),
      frequency: businessDateFrequency,
      quarterlyForLatestYear: bizDate.latest_year_quarterly ?? false,
    },
    scopeImport,
    semanticTimeAxis: raw.semantic_time_axis ?? raw.semanticTimeAxis ?? "business_date",
    collectionCoverageMode: raw.collection_coverage_mode ?? raw.collectionCoverageMode ?? "incremental_by_business_date",
    indicatorGroups,
    scheduleRule: scheduleRules[0],
    currentPlanVersion: undefined,
    currentPlanFingerprint: undefined,
    recordCount: raw.record_count ?? raw.recordCount ?? 0,
    status: raw.status ?? "draft",
    createdAt: fallbackIso(raw.created_at ?? raw.createdAt),
    updatedAt: fallbackIso(raw.updated_at ?? raw.updatedAt),
  });
}

function mapWideTableScopeImport(raw: any): WideTableScopeImport | undefined {
  if (!raw) {
    return undefined;
  }
  const fileName = String(raw.fileName ?? raw.file_name ?? "").trim();
  const importMode = String(raw.importMode ?? raw.import_mode ?? "").trim();
  if (!fileName || !importMode) {
    return undefined;
  }
  return {
    fileName,
    fileType: String(raw.fileType ?? raw.file_type ?? "text/csv").trim() || "text/csv",
    rowCount: Number(raw.rowCount ?? raw.row_count ?? 0) || 0,
    importMode: importMode as WideTableScopeImport["importMode"],
    contentHash: String(raw.contentHash ?? raw.content_hash ?? "").trim() || undefined,
    createdAt: raw.createdAt ? fallbackIso(raw.createdAt) : raw.created_at ? fallbackIso(raw.created_at) : undefined,
    updatedAt: raw.updatedAt ? fallbackIso(raw.updatedAt) : raw.updated_at ? fallbackIso(raw.updated_at) : undefined,
  };
}

/** 后端 Requirement → 前端 Requirement */
function mapRequirement(raw: any): Requirement {
  const wideTableRaw = raw.wide_table ?? raw.wideTable ?? raw.wide_tables?.[0] ?? raw.wideTables?.[0];
  return {
    id: raw.id,
    projectId: raw.project_id ?? raw.projectId,
    requirementType: "production",
    title: raw.title,
    status: mapRequirementStatus(raw.status),
    schemaLocked: raw.schema_locked ?? raw.schemaLocked ?? undefined,
    createdBy: raw.created_by ?? raw.createdBy ?? undefined,
    createdByAccount: raw.created_by_account ?? raw.createdByAccount ?? undefined,
    owner: raw.owner ?? "",
    ownerAccount: raw.owner_account ?? raw.ownerAccount ?? undefined,
    assignee: raw.assignee ?? "",
    assigneeAccount: raw.assignee_account ?? raw.assigneeAccount ?? undefined,
    acceptanceOwner: raw.acceptance_owner ?? raw.acceptanceOwner ?? "",
    acceptanceOwnerAccount: raw.acceptance_owner_account ?? raw.acceptanceOwnerAccount ?? undefined,
    businessGoal: raw.business_goal ?? raw.businessGoal ?? "",
    backgroundKnowledge: raw.background_knowledge ?? raw.backgroundKnowledge ?? raw.business_goal ?? raw.businessGoal ?? undefined,
    businessBoundary: raw.business_boundary ?? raw.businessBoundary ?? "",
    deliveryScope: raw.delivery_scope ?? raw.deliveryScope ?? "",
    collectionPolicy: (raw.collection_policy ?? raw.collectionPolicy) ? {
      searchEngines: (raw.collection_policy ?? raw.collectionPolicy).search_engines ?? (raw.collection_policy ?? raw.collectionPolicy).searchEngines ?? [],
      preferredSites: (raw.collection_policy ?? raw.collectionPolicy).preferred_sites ?? (raw.collection_policy ?? raw.collectionPolicy).preferredSites ?? [],
      sitePolicy: (raw.collection_policy ?? raw.collectionPolicy).site_policy ?? (raw.collection_policy ?? raw.collectionPolicy).sitePolicy ?? "preferred",
      knowledgeBases: (raw.collection_policy ?? raw.collectionPolicy).knowledge_bases ?? (raw.collection_policy ?? raw.collectionPolicy).knowledgeBases ?? [],
      nullPolicy: (raw.collection_policy ?? raw.collectionPolicy).null_policy ?? (raw.collection_policy ?? raw.collectionPolicy).nullPolicy ?? "",
      sourcePriority: (raw.collection_policy ?? raw.collectionPolicy).source_priority ?? (raw.collection_policy ?? raw.collectionPolicy).sourcePriority ?? "",
      valueFormat: (raw.collection_policy ?? raw.collectionPolicy).value_format ?? (raw.collection_policy ?? raw.collectionPolicy).valueFormat ?? "",
    } : undefined,
    dataUpdateEnabled: raw.data_update_enabled ?? raw.dataUpdateEnabled ?? undefined,
    dataUpdateMode: raw.data_update_mode ?? raw.dataUpdateMode ?? undefined,
    wideTable: wideTableRaw ? mapWideTable(wideTableRaw, raw.id) : undefined,
    processingRuleDrafts: raw.processing_rule_drafts ?? raw.processingRuleDrafts ?? undefined,
    createdAt: fallbackIso(raw.created_at ?? raw.createdAt),
    updatedAt: fallbackIso(raw.updated_at ?? raw.updatedAt),
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
    rowBindingKey: raw.row_binding_key ?? undefined,
  };

  // 展开 dimension_values 为平铺字段
  if (raw.dimension_values) {
    for (const [k, v] of Object.entries(raw.dimension_values)) {
      record[k] = v;
    }
  }

  // 展开 indicator_values 为平铺字段，同时保留 Agent 来源信息
  const agentRawValues: Record<string, {
    rawValue: string | number | null;
    dataSource?: string;
    sourceUrl?: string;
    quoteText?: string;
    confidence?: number;
  }> = {};
  if (raw.indicator_values) {
    for (const [k, cell] of Object.entries(raw.indicator_values as Record<string, any>)) {
      record[k] = cell?.value ?? null;
      agentRawValues[k] = {
        rawValue: cell?.raw_value ?? cell?.value ?? null,
        dataSource: cell?.data_source ?? undefined,
        sourceUrl: cell?.source_link ?? undefined,
        quoteText: cell?.quote_text ?? undefined,
        confidence: cell?.confidence ?? undefined,
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

function deriveDimensionRangesFromRows(
  wideTable: WideTable,
  records: WideTableRecord[],
): WideTable["dimensionRanges"] {
  const dimensionColumns = wideTable.schema.columns.filter(
    (column) => column.category === "dimension" && !column.isBusinessDate,
  );
  const valuesByDimension = new Map<string, Set<string>>();

  for (const column of dimensionColumns) {
    valuesByDimension.set(column.name, new Set<string>());
  }

  for (const record of records) {
    if (record.wideTableId !== wideTable.id) {
      continue;
    }
    for (const column of dimensionColumns) {
      const rawValue = record[column.name];
      const value = rawValue == null ? "" : String(rawValue).trim();
      if (!value) {
        continue;
      }
      valuesByDimension.get(column.name)?.add(value);
    }
  }

  return dimensionColumns.map((column) => ({
    dimensionName: column.name,
    values: Array.from(valuesByDimension.get(column.name) ?? []),
  }));
}

function deriveParameterRowsFromRows(
  wideTable: WideTable,
  records: WideTableRecord[],
  currentPlanVersion?: number,
): NonNullable<WideTable["parameterRows"]> {
  const dimensionColumns = wideTable.schema.columns.filter(
    (column) => column.category === "dimension" && !column.isBusinessDate,
  );

  if (dimensionColumns.length === 0) {
    return [];
  }

  const scopedRecords = currentPlanVersion != null
    ? records.filter((record) => (record._metadata?.planVersion ?? 0) === currentPlanVersion)
    : records;
  const sourceRecords = scopedRecords.length > 0 ? scopedRecords : records;
  const dedupedRows = new Map<string, Record<string, string>>();

  for (const record of sourceRecords) {
    if (record.wideTableId !== wideTable.id) {
      continue;
    }
    const values = Object.fromEntries(
      dimensionColumns.map((column) => [column.name, String(record[column.name] ?? "").trim()]),
    );
    const rowKey = dimensionColumns.map((column) => values[column.name] ?? "").join("\u0001");
    if (!rowKey.trim()) {
      continue;
    }
    if (!dedupedRows.has(rowKey)) {
      dedupedRows.set(rowKey, values);
    }
  }

  return Array.from(dedupedRows.values()).map((values, index) => ({
    rowId: index + 1,
    values,
  }));
}

function hydrateWideTablesFromRows(
  wideTables: WideTable[],
  wideTableRecords: WideTableRecord[],
): WideTable[] {
  const recordsByWideTableId = new Map<string, WideTableRecord[]>();

  for (const record of wideTableRecords) {
    if (!recordsByWideTableId.has(record.wideTableId)) {
      recordsByWideTableId.set(record.wideTableId, []);
    }
    recordsByWideTableId.get(record.wideTableId)?.push(record);
  }

  return wideTables.map((wideTable) => {
    const rows = recordsByWideTableId.get(wideTable.id) ?? [];
    if (rows.length === 0) {
      return wideTable;
    }

    const derivedDimensionRanges = deriveDimensionRangesFromRows(wideTable, rows);
    const derivedPlanVersion = Math.max(
      wideTable.currentPlanVersion ?? 0,
      ...rows.map((row) => row._metadata?.planVersion ?? 0),
    );
    const derivedParameterRows = deriveParameterRowsFromRows(
      wideTable,
      rows,
      derivedPlanVersion > 0 ? derivedPlanVersion : undefined,
    );

    return normalizeWideTableMode({
      ...wideTable,
      parameterRows: derivedParameterRows.length > 0 ? derivedParameterRows : (wideTable.parameterRows ?? []),
      dimensionRanges: derivedDimensionRanges,
      currentPlanVersion: derivedPlanVersion > 0 ? derivedPlanVersion : wideTable.currentPlanVersion,
      recordCount: rows.length,
    });
  });
}

/** 后端 TaskGroup → 前端 TaskGroup */
export function mapTaskGroup(raw: any): TaskGroup {
  const normalizedBusinessDate = normalizeApiBusinessDate(raw.business_date ?? raw.businessDate);
  const normalizedBusinessDateLabel = normalizeApiPartitionLabel(
    raw.business_date_label ?? raw.businessDateLabel ?? raw.business_date ?? raw.businessDate,
    raw.partition_type ?? raw.partitionType ?? "business_date",
  );
  const rawRowSnapshots = raw.row_snapshots ?? raw.rowSnapshots;
  const rowSnapshots = Array.isArray(rawRowSnapshots)
    ? rawRowSnapshots.map((snapshot: any) => mapWideTableRow(snapshot))
    : undefined;
  return {
    id: raw.id,
    requirementId: raw.requirement_id ?? raw.requirementId ?? undefined,
    wideTableId: raw.wide_table_id ?? raw.wideTableId,
    businessDate: normalizedBusinessDate,
    businessDateLabel: normalizedBusinessDateLabel ?? normalizedBusinessDate,
    batchId: raw.batch_id ?? raw.batchId,
    partitionType: raw.partition_type ?? raw.partitionType,
    partitionKey: normalizeApiPartitionLabel(raw.partition_key ?? raw.partitionKey, raw.partition_type ?? raw.partitionType)
      ?? raw.partition_key
      ?? raw.partitionKey,
    partitionLabel: normalizeApiPartitionLabel(raw.partition_label ?? raw.partitionLabel, raw.partition_type ?? raw.partitionType)
      ?? raw.partition_label
      ?? raw.partitionLabel,
    planVersion: raw.plan_version ?? raw.planVersion,
    groupKind: raw.group_kind ?? raw.groupKind,
    coverageStatus: raw.coverage_status ?? raw.coverageStatus,
    deltaReason: raw.delta_reason ?? raw.deltaReason,
    status: mapTaskGroupStatus(raw.status),
    totalTasks: raw.total_tasks ?? raw.totalTasks ?? 0,
    runningTasks: raw.running_tasks ?? raw.runningTasks ?? 0,
    pendingTasks: raw.pending_tasks ?? raw.pendingTasks ?? 0,
    completedTasks: raw.completed_tasks ?? raw.completedTasks ?? 0,
    failedTasks: raw.failed_tasks ?? raw.failedTasks ?? 0,
    cancelledTasks: raw.cancelled_tasks ?? raw.cancelledTasks ?? 0,
    invalidatedTasks: raw.invalidated_tasks ?? raw.invalidatedTasks ?? 0,
    rowSnapshots,
    triggeredBy: raw.triggered_by ?? raw.triggeredBy ?? mapTriggeredBy(raw.source_type ?? raw.sourceType),
    lastAggregatedAt: raw.last_aggregated_at ?? raw.lastAggregatedAt ?? undefined,
    createdAt: raw.created_at ?? raw.createdAt ?? new Date().toISOString(),
    updatedAt: raw.updated_at ?? raw.updatedAt ?? new Date().toISOString(),
  };
}

export function mapTaskGroupStatus(status: string): TaskGroup["status"] {
  const mapping: Record<string, TaskGroup["status"]> = {
    pending: "pending",
    running: "running",
    failed: "failed",
    cancelled: "cancelled",
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
export function mapFetchTask(raw: any): FetchTask {
  return {
    id: raw.id,
    taskGroupId: raw.task_group_id ?? raw.taskGroupId,
    wideTableId: raw.wide_table_id ?? raw.wideTableId,
    batchId: raw.batch_id ?? raw.batchId,
    rowId: raw.row_id ?? raw.rowId,
    planVersion: raw.plan_version ?? raw.planVersion,
    rowBindingKey: raw.row_binding_key ?? raw.rowBindingKey,
    indicatorGroupId: raw.indicator_group_id ?? raw.indicatorGroupId,
    indicatorGroupName: raw.indicator_group_name ?? raw.indicatorGroupName ?? raw.name ?? raw.indicator_group_id ?? raw.indicatorGroupId,
    indicatorKeys: safeParseStringArray(readRaw(raw, "indicator_keys", "indicatorKeys"))
      ?? safeParseStringArray(raw.indicator_keys_json ?? raw.indicatorKeysJson),
    dimensionValues: safeParseObject(readRaw(raw, "dimension_values", "dimensionValues"))
      ?? safeParseObject(raw.dimension_values_json ?? raw.dimensionValuesJson),
    businessDate: raw.business_date ?? raw.businessDate ?? undefined,
    collectionTaskId: raw.collection_task_id ?? raw.collectionTaskId ?? undefined,
    status: mapFetchTaskStatus(raw.status),
    confidence: raw.confidence,
    executionRecords: (raw.execution_records ?? []).map(mapExecutionRecord),
    collectionRows: (raw.collection_rows ?? raw.collectionRows ?? raw.collection_result_rows ?? []).map(mapCollectionResultRow),
    createdAt: raw.created_at ?? raw.createdAt ?? new Date().toISOString(),
    updatedAt: raw.updated_at ?? raw.updatedAt ?? new Date().toISOString(),
  };
}

function mapCollectionResultRow(raw: any): CollectionResultRow {
  return {
    id: readRaw(raw, "id"),
    collectionResultId: readRaw(raw, "collection_result_id", "collectionResultId"),
    fetchTaskId: readRaw(raw, "fetch_task_id", "fetchTaskId"),
    scheduleJobId: readRaw(raw, "schedule_job_id", "scheduleJobId"),
    wideTableId: readRaw(raw, "wide_table_id", "wideTableId"),
    rowId: readRaw(raw, "row_id", "rowId"),
    sourceMetricName: readRaw(raw, "source_metric_name", "sourceMetricName") ?? undefined,
    targetIndicatorKey: readRaw(raw, "target_indicator_key", "targetIndicatorKey") ?? undefined,
    indicatorKey: readRaw(raw, "indicator_key", "indicatorKey"),
    indicatorName: readRaw(raw, "indicator_name", "indicatorName"),
    businessDate: readRaw(raw, "business_date", "businessDate"),
    dimensionValues: safeParseObject(readRaw(raw, "dimension_values_json", "dimensionValuesJson")),
    rawValue: readRaw(raw, "raw_value", "rawValue") ?? undefined,
    cleanedValue: readRaw(raw, "cleaned_value", "cleanedValue") ?? undefined,
    unit: readRaw(raw, "unit") ?? undefined,
    publishedAt: readRaw(raw, "published_at", "publishedAt") ?? undefined,
    sourceSite: readRaw(raw, "source_site", "sourceSite") ?? undefined,
    sourceUrl: readRaw(raw, "source_url", "sourceUrl") ?? undefined,
    quoteText: readRaw(raw, "quote_text", "quoteText") ?? undefined,
    maxValue: readRaw(raw, "max_value", "maxValue") ?? undefined,
    minValue: readRaw(raw, "min_value", "minValue") ?? undefined,
    confidence: readRaw(raw, "confidence") != null ? Number(readRaw(raw, "confidence")) : undefined,
    status: readRaw(raw, "status") ?? undefined,
    warningMsg: readRaw(raw, "warning_msg", "warningMsg") ?? undefined,
    reasoning: readRaw(raw, "reasoning") ?? undefined,
    whyNotFound: readRaw(raw, "why_not_found", "whyNotFound") ?? undefined,
    createdAt: readRaw(raw, "created_at", "createdAt") ?? undefined,
    updatedAt: readRaw(raw, "updated_at", "updatedAt") ?? undefined,
  };
}

function mapMetricFieldMapping(raw: any): MetricFieldMapping {
  return {
    id: readRaw(raw, "id"),
    requirementId: readRaw(raw, "requirement_id", "requirementId"),
    wideTableId: readRaw(raw, "wide_table_id", "wideTableId"),
    sourceMetricName: readRaw(raw, "source_metric_name", "sourceMetricName"),
    targetIndicatorKey: readRaw(raw, "target_indicator_key", "targetIndicatorKey") ?? undefined,
    targetIndicatorName: readRaw(raw, "target_indicator_name", "targetIndicatorName") ?? undefined,
    matchType: readRaw(raw, "match_type", "matchType") ?? "manual",
    confidence: readRaw(raw, "confidence") != null ? Number(readRaw(raw, "confidence")) : undefined,
    status: readRaw(raw, "status") ?? "pending",
    createdAt: readRaw(raw, "created_at", "createdAt") ?? undefined,
    updatedAt: readRaw(raw, "updated_at", "updatedAt") ?? undefined,
  };
}

function mapCollectionResult(raw: any): CollectionResult {
  return {
    id: readRaw(raw, "id"),
    fetchTaskId: readRaw(raw, "fetch_task_id", "fetchTaskId") ?? undefined,
    scheduleJobId: readRaw(raw, "schedule_job_id", "scheduleJobId") ?? undefined,
    externalTaskId: readRaw(raw, "external_task_id", "externalTaskId") ?? undefined,
    taskGroupId: readRaw(raw, "task_group_id", "taskGroupId") ?? undefined,
    batchId: readRaw(raw, "batch_id", "batchId") ?? undefined,
    wideTableId: readRaw(raw, "wide_table_id", "wideTableId") ?? undefined,
    rowId: readRaw(raw, "row_id", "rowId") ?? undefined,
    rawResultJson: readRaw(raw, "raw_result_json", "rawResultJson") ?? undefined,
    finalReport: readRaw(raw, "final_report", "finalReport") ?? undefined,
    normalizedRowsJson: readRaw(raw, "normalized_rows_json", "normalizedRowsJson") ?? null,
    status: readRaw(raw, "status") ?? undefined,
    errorMsg: readRaw(raw, "error_msg", "errorMsg") ?? undefined,
    durationMs: readRaw(raw, "duration_ms", "durationMs") ?? undefined,
    collectedAt: readRaw(raw, "collected_at", "collectedAt") ?? undefined,
    createdAt: readRaw(raw, "created_at", "createdAt") ?? undefined,
    updatedAt: readRaw(raw, "updated_at", "updatedAt") ?? undefined,
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
    cancelled: "cancelled",
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
  const rawRowIds = raw.row_ids ?? raw.rowIds ?? raw.row_ids_json ?? raw.rowIdsJson;
  return {
    id: raw.id,
    taskGroupId: raw.task_group_id ?? raw.taskGroupId ?? "",
    wideTableId: raw.wide_table_id ?? raw.wideTableId ?? undefined,
    dataset: raw.dataset,
    requirementId: raw.requirement_id ?? raw.requirementId,
    status: raw.status,
    owner: raw.owner,
    ownerAccount: raw.owner_account ?? raw.ownerAccount ?? undefined,
    reviewer: raw.reviewer ?? undefined,
    reviewerAccount: raw.reviewer_account ?? raw.reviewerAccount ?? undefined,
    feedback: raw.feedback ?? "",
    rowIds: parseNumberArray(rawRowIds),
    latestActionAt: raw.latest_action_at ?? raw.latestActionAt ?? "",
  };
}

export type PersonalCenterCollectionTask = {
  project: Project;
  requirement: Requirement;
  taskGroup: TaskGroup;
};

export type PersonalCenterAcceptanceTask = {
  project: Project;
  requirement: Requirement;
  taskGroup: TaskGroup;
  ticket?: AcceptanceTicket;
  reviewStatus: "pending" | "approved" | "partial_approved" | "rejected";
};

export type PersonalCenterOverview = {
  projects: Project[];
  requirements: Requirement[];
  collectionTasks: PersonalCenterCollectionTask[];
  acceptanceTasks: PersonalCenterAcceptanceTask[];
};

function mapPersonalCenterProject(rawProject: any, rawRequirement: any): Project {
  if (rawProject) {
    return mapProject(rawProject);
  }
  return {
    id: rawRequirement?.project_id ?? rawRequirement?.projectId ?? "",
    name: rawRequirement?.project_id ?? rawRequirement?.projectId ?? "",
    createdBy: "",
    createdByAccount: "",
    businessBackground: "",
    description: "",
    status: "active",
    ownerTeam: "",
    dataSource: {
      search: { engines: [], sites: [], sitePolicy: "preferred" },
      knowledgeBases: [],
      fixedUrls: [],
    },
    createdAt: fallbackIso(undefined),
  };
}

function parseNumberArray(value: unknown): number[] | undefined {
  if (Array.isArray(value)) {
    return value.map((item) => Number(item)).filter((item) => Number.isFinite(item));
  }
  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.map((item) => Number(item)).filter((item) => Number.isFinite(item))
      : undefined;
  } catch {
    return undefined;
  }
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
  options: {
    taskGroupId?: string;
    taskGroupIds?: string[];
  } = {},
): Promise<ScheduleJob[]> {
  const params = new URLSearchParams();
  if (triggerType) params.set("trigger_type", triggerType);
  if (status) params.set("status", status);
  if (options.taskGroupId) params.set("task_group_id", options.taskGroupId);
  if (options.taskGroupIds && options.taskGroupIds.length > 0) {
    params.set("task_group_ids", options.taskGroupIds.join(","));
  }
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
): Uppercase<WideTable["businessDateRange"]["frequency"]> {
  return toApiBusinessDateFrequency(frequency);
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
    passthrough_enabled: Boolean(column.passthroughEnabled),
    passthrough_content: column.passthroughEnabled ? (column.passthroughContent ?? "") : undefined,
    audit_rule_type: column.auditRuleType,
    audit_rule_value: column.auditRuleValue ?? undefined,
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
    parameter_rows: wideTable.parameterSource?.mode === "sql"
      ? []
      : (wideTable.parameterRows ?? []).map((row, index) => ({
          row_id: Number(row.rowId ?? index + 1),
          values: row.values ?? {},
          business_date: row.businessDate ?? null,
        })),
    parameter_source: wideTable.parameterSource
      ? {
          mode: wideTable.parameterSource.mode,
          sql: wideTable.parameterSource.sql ?? null,
          max_rows: wideTable.parameterSource.maxRows ?? null,
        }
      : {
          mode: "manual_file",
        },
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
    parameter_values: record._metadata?.parameterValues ?? Object.fromEntries(
      dimensionColumns.map((column) => [column.name, String(record[column.name] ?? "")]),
    ),
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
      running_tasks: taskGroup.runningTasks,
      pending_tasks: taskGroup.pendingTasks,
      completed_tasks: taskGroup.completedTasks,
      failed_tasks: taskGroup.failedTasks,
      cancelled_tasks: taskGroup.cancelledTasks,
      invalidated_tasks: taskGroup.invalidatedTasks,
      triggered_by: taskGroup.triggeredBy,
      created_at: taskGroup.createdAt,
      updated_at: taskGroup.updatedAt,
    }));
}

// ==================== API 调用函数 ====================

// ---- Projects ----

let projectsCache: Project[] | null = null;
let projectsCachePromise: Promise<Project[]> | null = null;

export async function fetchProjects(): Promise<Project[]> {
  if (projectsCache) {
    return projectsCache;
  }
  if (!projectsCachePromise) {
    projectsCachePromise = apiGet<any[]>("/api/projects")
      .then((raw) => raw.map(mapProject))
      .then((projects) => {
        projectsCache = projects;
        return projects;
      })
      .finally(() => {
        projectsCachePromise = null;
      });
  }
  return projectsCachePromise;
}

export async function fetchProject(projectId: string): Promise<Project> {
  const raw = await apiGet<any>(`/api/projects/${projectId}`);
  return mapProject(raw);
}

export async function fetchProjectsOverview(): Promise<Array<{
  project: Project;
  requirementCount: number;
}>> {
  const raw = await apiGet<any[]>("/api/projects/overview");
  return raw.map((item) => ({
    project: mapProject(item.project ?? item),
    requirementCount: Number(item.requirement_count ?? item.requirementCount ?? 0),
  }));
}

export async function createProject(data: {
  name: string;
  ownerTeam?: string;
  description?: string;
  status?: string;
  businessBackground?: string;
  dataSource?: any;
  createdBy: string;
  createdByAccount?: string;
}): Promise<Project> {
  const raw = await apiPost<any>("/api/projects", {
    name: data.name,
    owner_team: data.ownerTeam,
    description: data.description,
    business_background: data.businessBackground,
    created_by: data.createdBy,
    created_by_account: data.createdByAccount,
  });
  const project = mapProject(raw);
  projectsCache = null;
  return project;
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
  const project = mapProject(raw);
  projectsCache = null;
  return project;
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

export async function fetchCollectionTasksOverview(): Promise<{
  projects: Project[];
  requirements: Requirement[];
  wideTables: WideTable[];
  taskGroups: TaskGroup[];
  fetchTasks: FetchTask[];
}> {
  const raw = await apiGet<any>("/api/collection-tasks/overview");
  const requirements = (raw.requirements ?? []).map((item: any) => mapRequirement(item.requirement ?? item));
  const wideTablesFromRequirements = requirements
    .map((requirement: Requirement) => requirement.wideTable)
    .filter((wideTable: Requirement["wideTable"]): wideTable is WideTable => Boolean(wideTable));
  return {
    projects: (raw.projects ?? []).map(mapProject),
    requirements,
    wideTables: wideTablesFromRequirements,
    taskGroups: (raw.task_groups ?? raw.taskGroups ?? []).map(mapTaskGroup),
    fetchTasks: (raw.fetch_tasks ?? raw.fetchTasks ?? []).map((item: any) => mapFetchTask(item.task ?? item)),
  };
}

export async function fetchAcceptanceOverview(): Promise<{
  projects: Project[];
  requirements: Requirement[];
  taskGroups: TaskGroup[];
  tickets: AcceptanceTicket[];
}> {
  const raw = await apiGet<any>("/api/acceptance/overview");
  return {
    projects: (raw.projects ?? []).map(mapProject),
    requirements: (raw.requirements ?? []).map((item: any) => mapRequirement(item.requirement ?? item)),
    taskGroups: (raw.task_groups ?? raw.taskGroups ?? []).map(mapTaskGroup),
    tickets: (raw.acceptance_tickets ?? raw.acceptanceTickets ?? []).map(mapAcceptanceTicket),
  };
}

export async function fetchSchedulingContext(): Promise<{
  taskGroups: TaskGroup[];
}> {
  const raw = await apiGet<any>("/api/scheduling/context");
  return {
    taskGroups: (raw.task_groups ?? raw.taskGroups ?? []).map(mapTaskGroup),
  };
}

export type RequirementSearchSortBy =
  | "updated_at"
  | "created_at"
  | "title"
  | "project_name"
  | "owner"
  | "assignee"
  | "status"
  | "wide_table_name";

export type RequirementSearchSortDir = "asc" | "desc";

export type RequirementSearchItem = {
  requirement: Requirement;
  project: { id: string; name: string };
  wideTable?: {
    id: string;
    tableName: string;
    columnCount?: number;
    recordCount?: number;
  } | null;
};

export type RequirementSearchPage = {
  page: number;
  pageSize: number;
  total: number;
  items: RequirementSearchItem[];
};

export async function searchRequirementsPage(params: {
  page: number;
  pageSize: number;
  keyword?: string;
  projectId?: string;
  owner?: string;
  assignee?: string;
  statuses?: Array<Requirement["status"]>;
  wideTableId?: string;
  wideTableKeyword?: string;
  hasWideTable?: boolean;
  sortBy?: RequirementSearchSortBy;
  sortDir?: RequirementSearchSortDir;
}): Promise<RequirementSearchPage> {
  const qs = new URLSearchParams();
  qs.set("page", String(params.page));
  qs.set("page_size", String(params.pageSize));
  if (params.keyword) qs.set("keyword", params.keyword);
  if (params.projectId) qs.set("project_id", params.projectId);
  if (params.owner) qs.set("owner", params.owner);
  if (params.assignee) qs.set("assignee", params.assignee);
  if (params.wideTableId) qs.set("wide_table_id", params.wideTableId);
  if (params.wideTableKeyword) qs.set("wide_table_keyword", params.wideTableKeyword);
  if (params.hasWideTable !== undefined) qs.set("has_wide_table", String(params.hasWideTable));
  if (params.sortBy) qs.set("sort_by", params.sortBy);
  if (params.sortDir) qs.set("sort_dir", params.sortDir);
  if (params.statuses && params.statuses.length > 0) {
    for (const status of params.statuses) {
      qs.append("status", status);
    }
  }

  const raw = await apiGet<any>(`/api/requirements/search?${qs.toString()}`);
  const items: RequirementSearchItem[] = (raw.items ?? []).map((row: any) => {
    const projectRaw = row.project ?? {};
    const wideTableRaw = row.wide_table ?? row.wideTable ?? null;
    return {
      requirement: mapRequirement(row.requirement ?? {}),
      project: { id: projectRaw.id ?? "", name: projectRaw.name ?? "" },
      wideTable: wideTableRaw
        ? {
            id: wideTableRaw.id ?? "",
            tableName: wideTableRaw.table_name ?? wideTableRaw.tableName ?? "",
            columnCount: wideTableRaw.column_count ?? wideTableRaw.columnCount ?? undefined,
            recordCount: wideTableRaw.record_count ?? wideTableRaw.recordCount ?? undefined,
          }
        : null,
    };
  });

  return {
    page: raw.page ?? params.page,
    pageSize: raw.page_size ?? raw.pageSize ?? params.pageSize,
    total: raw.total ?? 0,
    items,
  };
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
    createdBy: string;
    createdByAccount?: string;
    owner: string;
    ownerAccount?: string;
    assignee: string;
    assigneeAccount?: string;
    acceptanceOwner: string;
    acceptanceOwnerAccount?: string;
    backgroundKnowledge?: string;
    deliveryScope?: string;
    dataUpdateEnabled?: boolean;
    dataUpdateMode?: RequirementDataUpdateMode | null;
    projectDataSource?: Project["dataSource"];
    enabledSearchEngines?: SearchEngineProvider[];
    wideTable?: {
      title: string;
      description?: string;
      tableName: string;
      schema: any;
      scope: any;
      indicatorGroups?: any;
      scheduleRules?: any;
      semanticTimeAxis?: string;
      collectionCoverageMode?: string;
      schemaVersion?: number;
      status?: string;
    };
  },
): Promise<Requirement> {
  const runtimeSettings = loadRuntimeSettings();
  const engines = data.enabledSearchEngines ?? runtimeSettings.searchConfig.enabledSearchEngines;
  const raw = await apiPost<any>(`/api/projects/${projectId}/requirements`, {
    title: data.title,
    phase: "production",
    created_by: data.createdBy,
    created_by_account: data.createdByAccount,
    owner: data.owner,
    owner_account: data.ownerAccount,
    assignee: data.assignee,
    assignee_account: data.assigneeAccount,
    acceptance_owner: data.acceptanceOwner,
    acceptance_owner_account: data.acceptanceOwnerAccount,
    background_knowledge: data.backgroundKnowledge ?? "",
    delivery_scope: data.deliveryScope ?? "",
    data_update_enabled: data.dataUpdateEnabled,
    data_update_mode: data.dataUpdateMode ?? null,
    collection_policy: buildCollectionPolicy(
      data.projectDataSource,
      engines,
    ),
    wide_table: data.wideTable ? {
      title: data.wideTable.title,
      description: data.wideTable.description ?? "",
      table_name: data.wideTable.tableName,
      schema_version: data.wideTable.schemaVersion ?? 1,
      schema: data.wideTable.schema ?? null,
      scope: data.wideTable.scope ?? null,
      indicator_groups: data.wideTable.indicatorGroups ?? [],
      schedule_rules: data.wideTable.scheduleRules ?? [],
      semantic_time_axis: data.wideTable.semanticTimeAxis ?? "business_date",
      collection_coverage_mode: data.wideTable.collectionCoverageMode ?? "incremental_by_business_date",
      status: data.wideTable.status ?? "draft",
    } : null,
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
    ownerAccount: string | null;
    assignee: string;
    assigneeAccount: string | null;
    acceptanceOwner: string;
    acceptanceOwnerAccount: string | null;
    businessGoal: string;
    backgroundKnowledge: string;
    deliveryScope: string;
    collectionPolicy: Requirement["collectionPolicy"];
    dataUpdateEnabled: boolean;
    dataUpdateMode: RequirementDataUpdateMode | null;
    processingRuleDrafts: any[];
  }>,
): Promise<Requirement> {
  const body: any = {};
  if (data.title !== undefined) body.title = data.title;
  if (data.status !== undefined) body.status = toBackendRequirementStatus(data.status);
  if (data.owner !== undefined) body.owner = data.owner;
  if (data.ownerAccount !== undefined) body.owner_account = data.ownerAccount;
  if (data.assignee !== undefined) body.assignee = data.assignee;
  if (data.assigneeAccount !== undefined) body.assignee_account = data.assigneeAccount;
  if (data.acceptanceOwner !== undefined) body.acceptance_owner = data.acceptanceOwner;
  if (data.acceptanceOwnerAccount !== undefined) body.acceptance_owner_account = data.acceptanceOwnerAccount;
  if (data.businessGoal !== undefined) body.business_goal = data.businessGoal;
  if (data.backgroundKnowledge !== undefined) body.background_knowledge = data.backgroundKnowledge;
  if (data.deliveryScope !== undefined) body.delivery_scope = data.deliveryScope;
  if (data.collectionPolicy !== undefined) {
    body.collection_policy = data.collectionPolicy
      ? {
          search_engines: data.collectionPolicy.searchEngines ?? [],
          preferred_sites: data.collectionPolicy.preferredSites ?? [],
          site_policy: data.collectionPolicy.sitePolicy ?? "preferred",
          knowledge_bases: data.collectionPolicy.knowledgeBases ?? [],
          null_policy: data.collectionPolicy.nullPolicy ?? "",
          source_priority: data.collectionPolicy.sourcePriority ?? "",
          value_format: data.collectionPolicy.valueFormat ?? "",
        }
      : null;
  }
  if (data.dataUpdateEnabled !== undefined) body.data_update_enabled = data.dataUpdateEnabled;
  if (data.dataUpdateMode !== undefined) body.data_update_mode = data.dataUpdateMode;
  if (data.processingRuleDrafts !== undefined) body.processing_rule_drafts = data.processingRuleDrafts;
  const raw = await apiPut<any>(
    `/api/projects/${projectId}/requirements/${requirementId}`,
    body,
  );
  return mapRequirement(raw);
}

// ---- Wide Table Rows ----

export async function fetchWideTableRows(
  wideTableId: string,
  wideTable?: Pick<WideTable, "schema">,
  options: {
    batchId?: string;
    page?: number;
    pageSize?: number;
  } = {},
): Promise<WideTableRecord[]> {
  const params = new URLSearchParams();
  if (options.batchId) params.set("batch_id", options.batchId);
  if (options.page) params.set("page", String(options.page));
  if (options.pageSize) params.set("page_size", String(options.pageSize));
  const query = params.toString();
  const raw = await apiGet<any[]>(`/api/wide-tables/${wideTableId}/rows${query ? `?${query}` : ""}`);
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

type BackendIndicatorGroup = {
  id: string;
  name: string;
  indicator_keys: string[];
  execution_mode: "agent" | "human";
  default_agent?: string;
  prompt_template?: string;
  prompt_config?: {
    core_query_requirement?: string;
    business_knowledge?: string;
    output_constraints?: string;
    last_edited_at?: string;
  };
  description?: string;
  priority?: number;
  timeout_seconds?: number;
  source_preference?: string[];
};

type BackendScheduleRule = {
  id: string;
  frequency: "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY";
  trigger_time: string;
  auto_retry_limit?: number;
  enabled?: boolean;
};

function isValidBackendFrequency(value: unknown): value is BackendScheduleRule["frequency"] {
  return value === "DAILY"
    || value === "WEEKLY"
    || value === "MONTHLY"
    || value === "QUARTERLY"
    || value === "YEARLY";
}

function resolveBackendFrequency(wideTable: WideTable, scheduleRule?: ScheduleRule): BackendScheduleRule["frequency"] {
  const candidate = scheduleRule?.periodLabel ?? wideTable.businessDateRange.frequency;
  const normalized = String(candidate ?? "").toUpperCase();
  return isValidBackendFrequency(normalized) ? normalized : "MONTHLY";
}

function resolveBackendTriggerTime(scheduleRule?: ScheduleRule): string {
  const candidate = scheduleRule?.cronExpression;
  if (!candidate) {
    return "09:00";
  }
  // Backend compares lexicographically (HH:MM), keep a strict default when invalid.
  return /^\d{2}:\d{2}$/.test(candidate) ? candidate : "09:00";
}

function toBackendScheduleRules(wideTable: WideTable): BackendScheduleRule[] | undefined {
  if (!wideTable.scheduleRule) {
    return undefined;
  }
  return [
    {
      id: wideTable.scheduleRule.id || `sr_${wideTable.id}`,
      frequency: resolveBackendFrequency(wideTable, wideTable.scheduleRule),
      trigger_time: resolveBackendTriggerTime(wideTable.scheduleRule),
      auto_retry_limit: 0,
      enabled: true,
    },
  ];
}

function buildFallbackIndicatorGroup(wideTable: WideTable): BackendIndicatorGroup {
  const indicatorColumns = wideTable.schema.columns.filter((col) => col.category === "indicator").map((col) => col.name);
  const fallback = wideTable.indicatorGroups[0];
  return {
    id: fallback?.id ?? `ig_${wideTable.id}_all`,
    name: fallback?.name ?? "默认分组",
    indicator_keys: indicatorColumns,
    execution_mode: "agent",
    default_agent: fallback?.agent ?? undefined,
    prompt_template: fallback?.promptTemplate ?? undefined,
    prompt_config: fallback?.promptConfig
      ? {
          core_query_requirement: fallback.promptConfig.coreQueryRequirement ?? undefined,
          business_knowledge: fallback.promptConfig.businessKnowledge ?? undefined,
          output_constraints: fallback.promptConfig.outputConstraints ?? undefined,
          last_edited_at: fallback.promptConfig.lastEditedAt ?? undefined,
        }
      : undefined,
    description: fallback?.description ?? "",
    priority: fallback?.priority ?? 100,
    source_preference: [],
  };
}

function toBackendIndicatorGroupsForUpdate(wideTable: WideTable): BackendIndicatorGroup[] {
  // Keep indicator groups exactly as edited in the UI (drafts included).
  // Completeness checks happen in the task-plan generation flow, not here.
  if (!wideTable.indicatorGroups || wideTable.indicatorGroups.length === 0) {
    return [buildFallbackIndicatorGroup(wideTable)];
  }

  return wideTable.indicatorGroups.map((group) => ({
    id: group.id,
    name: group.name,
    indicator_keys: group.indicatorColumns,
    execution_mode: "agent",
    default_agent: group.agent ?? undefined,
    prompt_template: group.promptTemplate ?? undefined,
    prompt_config: group.promptConfig
      ? {
          core_query_requirement: group.promptConfig.coreQueryRequirement ?? undefined,
          business_knowledge: group.promptConfig.businessKnowledge ?? undefined,
          output_constraints: group.promptConfig.outputConstraints ?? undefined,
          last_edited_at: group.promptConfig.lastEditedAt ?? undefined,
        }
      : undefined,
    description: group.description ?? "",
    priority: group.priority ?? 100,
    source_preference: [],
  }));
}

export async function updateRequirementWideTable(
  requirementId: string,
  wideTable: WideTable,
): Promise<WideTable> {
  const normalizedWideTable = normalizeWideTableMode(wideTable);
  const scheduleRules = toBackendScheduleRules(normalizedWideTable);

  const raw = await apiPut<any>(
    `/api/requirements/${requirementId}/wide-tables/${normalizedWideTable.id}`,
    {
      title: normalizedWideTable.name,
      table_name: normalizedWideTable.name,
      description: normalizedWideTable.description,
      schema: toBackendWideTableSchema(normalizedWideTable),
      scope: toBackendWideTableScope(normalizedWideTable),
      indicator_groups: toBackendIndicatorGroupsForUpdate(normalizedWideTable),
      schedule_rules: scheduleRules,
      semantic_time_axis: resolveWideTableSemanticTimeAxis(normalizedWideTable),
      collection_coverage_mode: resolveWideTableCollectionCoverageMode(normalizedWideTable),
    },
  );

  return mapWideTable(raw, requirementId);
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
    invalidate_missing: true,
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
  scopeImport?: {
    fileName: string;
    fileType: string;
    rowCount: number;
    fileContent: string;
    headers: string[];
    rows: Array<Record<string, string>>;
  } | null,
): Promise<void> {
  const normalizedWideTable = normalizeWideTableMode(wideTable);
  const planVersion = Math.max(
    1,
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
    ...(scopeImport !== undefined
      ? {
          scope_import: scopeImport
            ? {
                file_name: scopeImport.fileName,
                file_type: scopeImport.fileType,
                row_count: scopeImport.rowCount,
                file_content: scopeImport.fileContent,
                header: scopeImport.headers,
                import_mode: "parameter_rows_file",
              }
            : null,
        }
      : {}),
    task_groups: [],
    semantic_time_axis: resolveWideTableSemanticTimeAxis(normalizedWideTable),
    collection_coverage_mode: resolveWideTableCollectionCoverageMode(normalizedWideTable),
    status: normalizedWideTable.status,
    record_count: normalizedWideTable.recordCount,
  });
}

export async function downloadWideTableScopeImport(
  wideTableId: string,
  fallbackName = "scope-import.csv",
): Promise<void> {
  const response = await fetch(buildApiUrl(`/api/wide-tables/${wideTableId}/scope-import/download`));
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`API ${response.status}: ${text}`);
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = resolveDownloadFileName(response.headers.get("content-disposition"), fallbackName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(objectUrl);
}

export async function previewParameterRowsSql(
  sql: string,
  limit = 500,
): Promise<{ headers: string[]; rows: Array<Record<string, unknown>>; rowCount: number; limit: number }> {
  const raw = await apiPost<any>("/api/target-tables/query-preview", { sql, limit });
  return {
    headers: Array.isArray(raw.headers) ? raw.headers.map((item: unknown) => String(item)) : [],
    rows: Array.isArray(raw.rows) ? raw.rows : [],
    rowCount: Number(raw.row_count ?? raw.rowCount ?? 0),
    limit: Number(raw.limit ?? limit),
  };
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

export async function createTrialRun(
  requirementId: string,
  data: {
    wideTableId: string;
    businessDates?: string[];
    rowBindingKeys?: string[];
    maxRows?: number;
    operator?: string;
  },
): Promise<{
  batch: CollectionBatch;
  taskGroups: TaskGroup[];
  fetchTasks: FetchTask[];
  rowCount: number;
  taskCount: number;
  collectionCallStatus?: string;
}> {
  const raw = await apiPost<any>(
    `/api/requirements/${requirementId}/trial-run`,
    {
      wide_table_id: data.wideTableId,
      business_dates: data.businessDates ?? [],
      row_binding_keys: data.rowBindingKeys ?? [],
      max_rows: data.maxRows ?? 20,
      operator: data.operator ?? "system",
    },
  );
  return {
    batch: mapCollectionBatch(raw.batch),
    taskGroups: (raw.task_groups ?? []).map(mapTaskGroup),
    fetchTasks: (raw.fetch_tasks ?? []).map(mapFetchTask),
    rowCount: raw.row_count ?? 0,
    taskCount: raw.task_count ?? 0,
    collectionCallStatus: raw.collection_call_status,
  };
}

// ---- Fetch Tasks ----

export async function fetchFetchTasks(
  projectId: string,
  requirementId: string,
  options: {
    includeCollectionRows?: boolean;
  } = {},
): Promise<FetchTask[]> {
  const params = new URLSearchParams();
  if (options.includeCollectionRows === false) {
    params.set("include_collection_rows", "false");
  }
  const query = params.toString();
  const raw = await apiGet<any[]>(
    `/api/projects/${projectId}/requirements/${requirementId}/tasks${query ? `?${query}` : ""}`,
  );
  // 后端返回 TaskSummary[]，task 在 .task 字段
  return raw.map((item) => mapFetchTask(item.task ?? item));
}

export async function fetchRequirementTaskRuntime(
  projectId: string,
  requirementId: string,
  options: {
    includeCollectionRows?: boolean;
  } = {},
): Promise<{
  taskGroups: TaskGroup[];
  fetchTasks: FetchTask[];
}> {
  const params = new URLSearchParams();
  if (options.includeCollectionRows === false) {
    params.set("include_collection_rows", "false");
  }
  const query = params.toString();
  const raw = await apiGet<any>(
    `/api/projects/${projectId}/requirements/${requirementId}/task-runtime${query ? `?${query}` : ""}`,
  );
  return {
    taskGroups: (raw.task_groups ?? raw.taskGroups ?? []).map(mapTaskGroup),
    fetchTasks: (raw.fetch_tasks ?? raw.fetchTasks ?? []).map((item: any) => mapFetchTask(item.task ?? item)),
  };
}

export async function fetchTaskResults(taskId: string): Promise<FetchTaskResults> {
  const raw = await apiGet<any>(`/api/tasks/${encodeURIComponent(taskId)}/results`);
  return {
    collectionResults: (raw.collection_results ?? raw.collectionResults ?? []).map(mapCollectionResult),
    collectionResultRows: (raw.collection_result_rows ?? raw.collectionResultRows ?? []).map(mapCollectionResultRow),
  };
}

export async function fetchTaskGroupResults(taskGroupId: string): Promise<FetchTaskResults> {
  const raw = await apiGet<any>(`/api/tasks/task-groups/${encodeURIComponent(taskGroupId)}/results`);
  return {
    collectionResults: (raw.collection_results ?? raw.collectionResults ?? []).map(mapCollectionResult),
    collectionResultRows: (raw.collection_result_rows ?? raw.collectionResultRows ?? []).map(mapCollectionResultRow),
  };
}

export async function fetchWideTableResults(wideTableId: string): Promise<FetchTaskResults> {
  const raw = await apiGet<any>(`/api/tasks/wide-tables/${encodeURIComponent(wideTableId)}/results`);
  return {
    collectionResults: (raw.collection_results ?? raw.collectionResults ?? []).map(mapCollectionResult),
    collectionResultRows: (raw.collection_result_rows ?? raw.collectionResultRows ?? []).map(mapCollectionResultRow),
  };
}

export async function normalizeFinalReport(taskId: string, resultId: string): Promise<CollectionResult> {
  const raw = await apiPost<any>(
    `/api/tasks/${encodeURIComponent(taskId)}/results/${encodeURIComponent(resultId)}/actions/normalize-final-report`,
  );
  return mapCollectionResult(raw);
}

export async function normalizeWideTableFinalReports(wideTableId: string): Promise<FetchTaskResults> {
  const raw = await apiPost<any>(
    `/api/tasks/wide-tables/${encodeURIComponent(wideTableId)}/results/actions/normalize-final-reports`,
  );
  return {
    collectionResults: (raw.collection_results ?? raw.collectionResults ?? []).map(mapCollectionResult),
    collectionResultRows: (raw.collection_result_rows ?? raw.collectionResultRows ?? []).map(mapCollectionResultRow),
  };
}

export async function normalizeTaskGroupFinalReports(taskGroupId: string): Promise<FetchTaskResults> {
  const raw = await apiPost<any>(
    `/api/tasks/task-groups/${encodeURIComponent(taskGroupId)}/results/actions/normalize-final-reports`,
  );
  return {
    collectionResults: (raw.collection_results ?? raw.collectionResults ?? []).map(mapCollectionResult),
    collectionResultRows: (raw.collection_result_rows ?? raw.collectionResultRows ?? []).map(mapCollectionResultRow),
  };
}

export async function fetchMetricFieldMappings(wideTableId: string): Promise<MetricFieldMapping[]> {
  const raw = await apiGet<any[]>(
    `/api/tasks/wide-tables/${encodeURIComponent(wideTableId)}/metric-mappings`,
  );
  return raw.map(mapMetricFieldMapping);
}

export async function generateMetricFieldMappings(wideTableId: string): Promise<MetricFieldMapping[]> {
  const raw = await apiPost<any[]>(
    `/api/tasks/wide-tables/${encodeURIComponent(wideTableId)}/metric-mappings/actions/generate-from-results`,
  );
  return raw.map(mapMetricFieldMapping);
}

export async function updateMetricFieldMapping(
  wideTableId: string,
  mappingId: string,
  data: {
    targetIndicatorKey?: string | null;
    targetIndicatorName?: string | null;
    matchType?: MetricFieldMapping["matchType"];
    status?: MetricFieldMapping["status"];
  },
): Promise<MetricFieldMapping> {
  const raw = await apiPost<any>(
    `/api/tasks/wide-tables/${encodeURIComponent(wideTableId)}/metric-mappings/${encodeURIComponent(mappingId)}`,
    {
      target_indicator_key: data.targetIndicatorKey ?? null,
      target_indicator_name: data.targetIndicatorName ?? null,
      match_type: data.matchType ?? "manual",
      status: data.status ?? (data.targetIndicatorKey ? "confirmed" : "pending"),
    },
  );
  return mapMetricFieldMapping(raw);
}

export async function materializeMappedResults(wideTableId: string): Promise<MappedResultMaterializationOutcome> {
  const raw = await apiPost<any>(
    `/api/tasks/wide-tables/${encodeURIComponent(wideTableId)}/results/actions/materialize-mapped-results`,
  );
  return {
    wideTableId: String(raw.wide_table_id ?? raw.wideTableId ?? wideTableId),
    collectionResults: Number(raw.collection_results ?? raw.collectionResults ?? 0),
    collectionResultRows: Number(raw.collection_result_rows ?? raw.collectionResultRows ?? 0),
    wideTableCells: Number(raw.wide_table_cells ?? raw.wideTableCells ?? 0),
    skippedMissingRows: Number(raw.skipped_missing_rows ?? raw.skippedMissingRows ?? 0),
    skippedUnmappedMetrics: Number(raw.skipped_unmapped_metrics ?? raw.skippedUnmappedMetrics ?? 0),
  };
}

export async function publishWideTableToTarget(
  wideTableId: string,
  options?: { taskGroupId?: string; rowIds?: number[] },
): Promise<TargetPublishOutcome> {
  const body =
    options?.taskGroupId || options?.rowIds
      ? {
          ...(options.taskGroupId ? { task_group_id: options.taskGroupId } : {}),
          ...(options.rowIds ? { row_ids: options.rowIds } : {}),
        }
      : undefined;
  const raw = await apiPost<any>(
    `/api/wide-tables/${encodeURIComponent(wideTableId)}/actions/publish-to-target`,
    body,
  );
  return mapTargetPublishOutcome(raw, wideTableId);
}

export async function approveAndPublishAcceptanceTicket(
  ticketId: string,
  options?: { rowIds?: number[]; reviewer?: string; reviewerAccount?: string },
): Promise<TargetPublishOutcome> {
  const body =
    options?.rowIds || options?.reviewer || options?.reviewerAccount
      ? {
          ...(options.rowIds ? { row_ids: options.rowIds } : {}),
          ...(options.reviewer ? { reviewer: options.reviewer } : {}),
          ...(options.reviewerAccount ? { reviewer_account: options.reviewerAccount } : {}),
        }
      : undefined;
  const raw = await apiPost<any>(
    `/api/acceptance-tickets/${encodeURIComponent(ticketId)}/actions/approve-and-publish`,
    body,
  );
  return mapTargetPublishOutcome(raw);
}

function mapTargetPublishOutcome(raw: any, fallbackWideTableId = ""): TargetPublishOutcome {
  return {
    jobId: String(raw.job_id ?? raw.jobId ?? ""),
    requirementId: raw.requirement_id ?? raw.requirementId ?? undefined,
    wideTableId: String(raw.wide_table_id ?? raw.wideTableId ?? fallbackWideTableId),
    taskGroupId: raw.task_group_id ?? raw.taskGroupId ?? undefined,
    targetSchema: raw.target_schema ?? raw.targetSchema ?? undefined,
    targetTable: raw.target_table ?? raw.targetTable ?? undefined,
    status: String(raw.status ?? "failed"),
    errorMsg: raw.error_msg ?? raw.errorMsg ?? undefined,
    totalRows: Number(raw.total_rows ?? raw.totalRows ?? 0),
    insertedRows: Number(raw.inserted_rows ?? raw.insertedRows ?? 0),
    updatedRows: Number(raw.updated_rows ?? raw.updatedRows ?? 0),
    skippedRows: Number(raw.skipped_rows ?? raw.skippedRows ?? 0),
    failedRows: Number(raw.failed_rows ?? raw.failedRows ?? 0),
  };
}

export async function fetchWideTableTargetComparison(wideTableId: string): Promise<TargetComparisonOutcome> {
  const raw = await apiGet<any>(
    `/api/wide-tables/${encodeURIComponent(wideTableId)}/actions/target-comparison`,
  );
  return {
    requirementId: raw.requirement_id ?? raw.requirementId ?? undefined,
    wideTableId: String(raw.wide_table_id ?? raw.wideTableId ?? wideTableId),
    targetSchema: raw.target_schema ?? raw.targetSchema ?? undefined,
    targetTable: raw.target_table ?? raw.targetTable ?? undefined,
    status: String(raw.status ?? "failed"),
    totalRows: Number(raw.total_rows ?? raw.totalRows ?? 0),
    matchedRows: Number(raw.matched_rows ?? raw.matchedRows ?? 0),
    missingRows: Number(raw.missing_rows ?? raw.missingRows ?? 0),
    failedRows: Number(raw.failed_rows ?? raw.failedRows ?? 0),
    rows: (raw.rows ?? []).map((row: any) => ({
      rowId: Number(row.row_id ?? row.rowId),
      status: String(row.status ?? ""),
      message: row.message ?? undefined,
      dimensionValues: row.dimension_values ?? row.dimensionValues ?? undefined,
      previousValues: Object.fromEntries(
        Object.entries(row.previous_values ?? row.previousValues ?? {}).map(([key, value]) => [
          key,
          value == null ? null : typeof value === "number" ? value : String(value),
        ]),
      ),
    })),
  };
}

export async function executeTask(taskId: string): Promise<{
  taskId: string;
  collectionTaskId?: string;
  status?: FetchTask["status"];
}> {
  const raw = await apiPost<any>(`/api/tasks/${taskId}/execute`);
  return {
    taskId: String(raw.task_id ?? raw.taskId ?? taskId),
    collectionTaskId: raw.collection_task_id ?? raw.collectionTaskId ?? undefined,
    status: raw.status ? mapFetchTaskStatus(String(raw.status)) : undefined,
  };
}

export async function fetchCollectionTaskStatusDetail(taskId: string): Promise<Record<string, unknown>> {
  const raw = await apiGet<any>(`/api/tasks/${encodeURIComponent(taskId)}/status-detail`);
  if (raw && typeof raw === "object") {
    return raw as Record<string, unknown>;
  }
  return { success: false, detail: "Empty status response" };
}

export async function retryTask(taskId: string): Promise<{
  taskId: string;
  collectionTaskId?: string;
  status?: FetchTask["status"];
}> {
  const raw = await apiPost<any>(`/api/tasks/${taskId}/retry`);
  return {
    taskId: String(raw.task_id ?? raw.taskId ?? taskId),
    collectionTaskId: raw.collection_task_id ?? raw.collectionTaskId ?? undefined,
    status: raw.status ? mapFetchTaskStatus(String(raw.status)) : undefined,
  };
}

export async function cancelTask(collectionTaskId: string): Promise<void> {
  await apiPost(`/api/tasks/${encodeURIComponent(collectionTaskId)}/cancel`);
}

export async function executeTaskGroup(
  taskGroupId: string,
  options?: { triggerType?: "manual" | "trial"; operator?: string },
): Promise<void> {
  await apiPost(
    `/api/task-groups/${taskGroupId}/execute`,
    options
      ? {
          trigger_type: options.triggerType ?? "manual",
          operator: options.operator ?? "manual",
        }
      : undefined,
  );
}

export async function ensureTaskGroupTasks(taskGroupId: string): Promise<{
  taskGroupId: string;
  taskCount: number;
  taskGroup?: TaskGroup;
  fetchTasks: FetchTask[];
}> {
  const raw = await apiPost<any>(`/api/task-groups/${taskGroupId}/ensure-tasks`);
  return {
    taskGroupId: String(raw.task_group_id ?? raw.taskGroupId ?? taskGroupId),
    taskCount: Number(raw.task_count ?? raw.taskCount ?? 0),
    taskGroup: raw.task_group ?? raw.taskGroup ? mapTaskGroup(raw.task_group ?? raw.taskGroup) : undefined,
    fetchTasks: (raw.fetch_tasks ?? raw.fetchTasks ?? []).map((item: any) => mapFetchTask(item.task ?? item)),
  };
}

export async function syncWideTableCollectionStatuses(wideTableId: string): Promise<void> {
  await apiPost(`/api/tasks/wide-tables/${encodeURIComponent(wideTableId)}/sync-collection-statuses`);
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

export async function fetchAcceptanceTickets(
  options: {
    requirementId?: string;
  } = {},
): Promise<AcceptanceTicket[]> {
  const params = new URLSearchParams();
  if (options.requirementId) {
    params.set("requirement_id", options.requirementId);
  }
  const query = params.toString();
  const raw = await apiGet<any[]>(`/api/acceptance-tickets${query ? `?${query}` : ""}`);
  return raw.map(mapAcceptanceTicket);
}

export async function createAcceptanceTicket(data: {
  dataset: string;
  requirementId: string;
  taskGroupId?: string;
  wideTableId?: string;
  owner: string;
  ownerAccount?: string;
  feedback?: string;
  status?: "pending" | "approved" | "partial_approved" | "rejected";
}): Promise<AcceptanceTicket> {
  const raw = await apiPost<any>("/api/acceptance-tickets", {
    dataset: data.dataset,
    requirement_id: data.requirementId,
    task_group_id: data.taskGroupId,
    wide_table_id: data.wideTableId,
    owner: data.owner,
    owner_account: data.ownerAccount,
    feedback: data.feedback,
    status: data.status,
  });
  return mapAcceptanceTicket(raw);
}

export async function updateAcceptanceTicket(
  ticketId: string,
  data: {
    status?: string;
    feedback?: string;
    owner?: string;
    ownerAccount?: string | null;
    reviewer?: string;
    reviewerAccount?: string | null;
  },
): Promise<void> {
  const body: Record<string, unknown> = {};
  if (data.status !== undefined) body.status = data.status;
  if (data.feedback !== undefined) body.feedback = data.feedback;
  if (data.owner !== undefined) body.owner = data.owner;
  if (data.ownerAccount !== undefined) body.owner_account = data.ownerAccount;
  if (data.reviewer !== undefined) body.reviewer = data.reviewer;
  if (data.reviewerAccount !== undefined) body.reviewer_account = data.reviewerAccount;
  await apiPut(`/api/acceptance-tickets/${ticketId}`, body);
}

function mapPermissionUser(raw: any): PermissionUser {
  return {
    account: String(raw.account ?? "").trim(),
    name: String(raw.display_name ?? raw.displayName ?? raw.name ?? "").trim(),
    role: raw.role,
    status: raw.status,
  };
}

export async function registerAccount(data: {
  account: string;
  password: string;
  displayName: string;
  role: PermissionUser["role"];
}): Promise<PermissionUser> {
  const raw = await apiPost<any>("/api/auth/register", {
    account: data.account,
    password: data.password,
    display_name: data.displayName,
    role: data.role,
  });
  return mapPermissionUser(raw);
}

export async function loginAccount(data: {
  account: string;
  password: string;
}): Promise<{ token: string; user: PermissionUser }> {
  const raw = await apiPost<any>("/api/auth/login", data);
  return {
    token: String(raw.token ?? "").trim(),
    user: mapPermissionUser(raw.user ?? {}),
  };
}

export async function fetchCurrentAccount(): Promise<PermissionUser> {
  const raw = await apiGet<any>("/api/auth/me");
  return mapPermissionUser(raw);
}

export async function fetchAccounts(): Promise<PermissionUser[]> {
  const raw = await apiGet<any[]>("/api/accounts");
  return raw.map(mapPermissionUser);
}

export async function fetchAssignableAccounts(): Promise<PermissionUser[]> {
  const raw = await apiGet<any[]>("/api/accounts/options");
  return raw.map(mapPermissionUser);
}

export async function updateAccount(
  account: string,
  data: Partial<{
    displayName: string;
    role: PermissionUser["role"];
    status: PermissionUser["status"];
  }>,
): Promise<PermissionUser> {
  const raw = await apiPut<any>(`/api/accounts/${encodeURIComponent(account)}`, {
    display_name: data.displayName,
    role: data.role,
    status: data.status,
  });
  return mapPermissionUser(raw);
}

export async function rejectAcceptanceTicket(
  ticketId: string,
  data: { feedback?: string; reviewer?: string; reviewerAccount?: string } = {},
): Promise<AcceptanceTicket> {
  const raw = await apiPost<any>(`/api/acceptance-tickets/${encodeURIComponent(ticketId)}/actions/reject`, {
    feedback: data.feedback,
    reviewer: data.reviewer,
    reviewer_account: data.reviewerAccount,
  });
  return mapAcceptanceTicket(raw);
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

export async function fetchOpsMonitoringSummary(): Promise<OpsMonitoringSummary> {
  const raw = await apiGet<any>("/api/ops/monitoring/summary");
  return {
    generatedAt: raw.generated_at ?? raw.generatedAt ?? "",
    overview: {
      healthScore: Number(raw.overview?.health_score ?? raw.overview?.healthScore ?? 0),
      taskCompletionRate: Number(raw.overview?.task_completion_rate ?? raw.overview?.taskCompletionRate ?? 0),
      dataCollectionRate: Number(raw.overview?.data_collection_rate ?? raw.overview?.dataCollectionRate ?? 0),
      dataReviewRate: Number(raw.overview?.data_review_rate ?? raw.overview?.dataReviewRate ?? 0),
    },
    serviceHealth: (raw.service_health ?? raw.serviceHealth ?? []).map((item: any) => ({
      service: String(item.service ?? ""),
      label: String(item.label ?? item.stage ?? ""),
      status: (item.status ?? "warning") as OpsMonitoringSummary["serviceHealth"][number]["status"],
      detail: String(item.detail ?? ""),
    })),
    taskMonitoring: {
      total: Number(raw.task_monitoring?.total ?? raw.taskMonitoring?.total ?? 0),
      completionRate: Number(raw.task_monitoring?.completion_rate ?? raw.taskMonitoring?.completionRate ?? 0),
      runningTaskCount: Number(raw.task_monitoring?.running_task_count ?? raw.taskMonitoring?.runningTaskCount ?? 0),
      failedTaskCount: Number(raw.task_monitoring?.failed_task_count ?? raw.taskMonitoring?.failedTaskCount ?? 0),
      successRate: Number(raw.task_monitoring?.success_rate ?? raw.taskMonitoring?.successRate ?? 0),
      statusCounts: (raw.task_monitoring?.status_counts ?? raw.taskMonitoring?.statusCounts ?? []).map((item: any) => ({
        status: String(item.status ?? ""),
        label: String(item.label ?? item.status ?? ""),
        count: Number(item.count ?? 0),
        ratio: Number(item.ratio ?? 0),
      })),
    },
    dataMonitoring: {
      totalUnits: Number(raw.data_monitoring?.total_units ?? raw.dataMonitoring?.totalUnits ?? 0),
      collectionRate: Number(raw.data_monitoring?.collection_rate ?? raw.dataMonitoring?.collectionRate ?? 0),
      reviewRate: Number(raw.data_monitoring?.review_rate ?? raw.dataMonitoring?.reviewRate ?? 0),
      approvalRate: Number(raw.data_monitoring?.approval_rate ?? raw.dataMonitoring?.approvalRate ?? 0),
      stageCounts: (raw.data_monitoring?.stage_counts ?? raw.dataMonitoring?.stageCounts ?? []).map((item: any) => ({
        status: String(item.status ?? ""),
        label: String(item.label ?? item.stage ?? ""),
        count: Number(item.count ?? 0),
        ratio: Number(item.ratio ?? 0),
      })),
    },
    riskCards: (raw.risk_cards ?? raw.riskCards ?? []).map((item: any) => ({
      code: String(item.code ?? ""),
      label: String(item.label ?? ""),
      severity: (item.severity ?? "low") as OpsMonitoringSummary["riskCards"][number]["severity"],
      count: Number(item.count ?? 0),
      description: String(item.description ?? ""),
      target: String(item.target ?? "/ops-monitoring"),
    })),
  };
}

export async function fetchPersonalCenterOverview(): Promise<PersonalCenterOverview> {
  const raw = await apiGet<any>("/api/personal-center");
  return {
    projects: (raw.projects ?? []).map(mapProject),
    requirements: (raw.requirements ?? []).map(mapRequirement),
    collectionTasks: (raw.collection_tasks ?? raw.collectionTasks ?? []).map((item: any) => ({
      project: mapPersonalCenterProject(item.project, item.requirement),
      requirement: mapRequirement(item.requirement ?? {}),
      taskGroup: mapTaskGroup(item.task_group ?? item.taskGroup ?? {}),
    })),
    acceptanceTasks: (raw.acceptance_tasks ?? raw.acceptanceTasks ?? []).map((item: any) => ({
      project: mapPersonalCenterProject(item.project, item.requirement),
      requirement: mapRequirement(item.requirement ?? {}),
      taskGroup: mapTaskGroup(item.task_group ?? item.taskGroup ?? {}),
      ticket: item.ticket ? mapAcceptanceTicket(item.ticket) : undefined,
      reviewStatus: (item.review_status ?? item.reviewStatus ?? "pending") as PersonalCenterAcceptanceTask["reviewStatus"],
    })),
  };
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
  return {
    project,
    requirements,
    wideTables,
    taskGroups: [],
    fetchTasks: [],
  };
}

export async function loadRequirementOperationalData(
  projectId: string,
  requirementId: string,
  wideTables: WideTable[],
): Promise<{
  wideTables: WideTable[];
  wideTableRecords: WideTableRecord[];
  taskGroups: TaskGroup[];
  fetchTasks: FetchTask[];
  acceptanceTickets: AcceptanceTicket[];
  scheduleJobs: ScheduleJob[];
}> {
  const runtimeData = await fetchRequirementTaskRuntime(projectId, requirementId, {
    includeCollectionRows: false,
  }).catch(() => ({
    taskGroups: [] as TaskGroup[],
    fetchTasks: [] as FetchTask[],
  }));
  const taskGroupIds = runtimeData.taskGroups.map((taskGroup) => taskGroup.id);
  const [acceptanceTickets, scheduleJobs, wideTableRecordsArrays] = await Promise.all([
    fetchAcceptanceTickets({ requirementId }).catch(() => [] as AcceptanceTicket[]),
    taskGroupIds.length > 0
      ? fetchScheduleJobs(undefined, undefined, { taskGroupIds }).catch(() => [] as ScheduleJob[])
      : Promise.resolve([] as ScheduleJob[]),
    Promise.all(
      wideTables.map((wideTable) =>
        fetchWideTableRows(wideTable.id, wideTable).catch(() => [] as WideTableRecord[]),
      ),
    ),
  ]);

  const wideTableRecords = wideTableRecordsArrays.flat();
  const hydratedWideTables = hydrateWideTablesFromRows(wideTables, wideTableRecords);

  return {
    wideTables: hydratedWideTables,
    wideTableRecords,
    taskGroups: runtimeData.taskGroups,
    fetchTasks: runtimeData.fetchTasks,
    acceptanceTickets,
    scheduleJobs,
  };
}

/**
 * 加载需求详情页所需的全部数据
 */
export async function loadRequirementDetailData(
  projectId: string,
  requirementId: string,
  options: {
    includeOperationalData?: boolean;
  } = {},
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
  const includeOperationalData = options.includeOperationalData ?? true;
  const [project, reqData] = await Promise.all([
    fetchProject(projectId),
    fetchRequirement(projectId, requirementId),
  ]);

  // 加载宽表记录
  const operationalData = includeOperationalData
    ? await loadRequirementOperationalData(projectId, requirementId, reqData.wideTables)
    : {
        wideTables: reqData.wideTables,
        wideTableRecords: [] as WideTableRecord[],
        taskGroups: [] as TaskGroup[],
        fetchTasks: [] as FetchTask[],
        acceptanceTickets: [] as AcceptanceTicket[],
        scheduleJobs: [] as ScheduleJob[],
      };
  const hydratedWideTableByRequirementId = new Map(
    operationalData.wideTables.map((wideTable) => [wideTable.requirementId, wideTable]),
  );

  return {
    project,
    requirements: [reqData.requirement].map((requirement) => ({
      ...requirement,
      wideTable: hydratedWideTableByRequirementId.get(requirement.id) ?? requirement.wideTable,
    })),
    wideTables: operationalData.wideTables,
    wideTableRecords: operationalData.wideTableRecords,
    taskGroups: operationalData.taskGroups,
    fetchTasks: operationalData.fetchTasks,
    acceptanceTickets: operationalData.acceptanceTickets,
    scheduleJobs: operationalData.scheduleJobs,
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
