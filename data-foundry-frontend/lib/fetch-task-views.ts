import type {
  ColumnDefinition,
  ExecutionRecord,
  FetchTask,
  IndicatorGroup,
  Requirement,
  TaskGroup,
  WideTable,
  WideTableRecord,
} from "@/lib/types";
import { buildTaskGroupExecutionSummary } from "@/lib/task-group-execution";
import {
  buildWideTableProcessedCellValue,
  buildWideTableRawCellValue,
} from "@/lib/requirement-data-pipeline";
import { fillIndicator } from "@/lib/indicator-filling";
import { hasWideTableBusinessDateDimension } from "@/lib/wide-table-mode";
import { buildIndicatorGroupPrompt } from "@/lib/indicator-group-prompt";

type FetchTaskLike = FetchTask & {
  isSynthetic?: boolean;
};

export type FetchTaskReturnRowView = {
  contextValues: Record<string, string>;
  indicatorName: string;
  indicatorUnit: string;
  indicatorValue: string;
  rawIndicatorValue: string;
  publishedAt: string;
  sourceSite: string;
  source: string;
  sourceUrl: string;
  indicatorLogic: string;
  indicatorLogicSupplement: string;
  maxValue: string;
  minValue: string;
  quoteText: string;
};

export type FetchTaskCardView = {
  id: string;
  rowId: number;
  indicatorGroupId: string;
  indicatorGroupName: string;
  rowLabel: string;
  status: FetchTask["status"];
  confidenceLabel: string;
  attempts: number;
  cumulativeDurationLabel: string;
  latestTrigger: string;
  startedAt: string;
  endedAt: string;
  latestError: string;
  agent: string;
  promptTemplate: string;
  promptMarkdown: string;
  executionRecords: ExecutionRecord[];
  returnRows: FetchTaskReturnRowView[];
  isSynthetic: boolean;
};

export function getVisibleNarrowTableContextColumns(wideTable: WideTable): ColumnDefinition[] {
  return wideTable.schema.columns.filter(
    (column) => column.category !== "indicator" && column.category !== "system",
  );
}

const ENTITY_URL_MAP: Record<string, string> = {
  Uber: "https://www.uber.com/",
  "滴滴全球": "https://www.didiglobal.com/",
  "如祺出行": "https://www.ruqi-mobility.com/",
  "曹操出行": "https://www.caocao.com/",
  "小马智行": "https://pony.ai/",
  "文远知行": "https://www.weride.ai/",
  "百度Apollo": "https://apollo.auto/",
  Waymo: "https://waymo.com/",
  "Pony.ai": "https://pony.ai/",
  Inceptio: "https://inceptio.ai/",
  "百度萝卜快跑": "https://apollo.auto/",
  "小米汽车": "https://www.mi.com/",
  "智界": "https://hima.auto/",
  "理想": "https://www.lixiang.com/",
  "Enhertu (DS-8201)": "https://www.astrazeneca.com/",
  SKB264: "https://www.kelun.com/",
  RC48: "https://www.remegen.com/",
};

export function buildFetchTaskCardViews(params: {
  requirement?: Requirement;
  wideTable?: WideTable;
  taskGroup?: TaskGroup | null;
  fetchTasks: FetchTask[];
  wideTableRecords: WideTableRecord[];
}): FetchTaskCardView[] {
  const {
    requirement,
    wideTable,
    taskGroup,
    fetchTasks,
    wideTableRecords,
  } = params;
  if (!wideTable || !taskGroup) {
    return [];
  }

  const indicatorGroups = buildIndicatorGroups(wideTable);
  const usesBusinessDateAxis = hasWideTableBusinessDateDimension(wideTable);
  const businessDateFieldName = wideTable.schema.columns.find((column) => column.isBusinessDate)?.name ?? "BIZ_DATE";
  const explicitTasks = fetchTasks.filter((task) => task.taskGroupId === taskGroup.id);
  const taskGroupExecution = buildTaskGroupExecutionSummary(taskGroup, explicitTasks);
  const explicitTaskMap = new Map(explicitTasks.map((task) => [makeTaskKey(task.rowId, task.indicatorGroupId), task]));
  const recordMap = new Map<number, WideTableRecord>();
  const snapshotRecords = taskGroup.rowSnapshots ?? [];

  for (const record of snapshotRecords) {
    recordMap.set(getRecordRowId(record), record);
  }

  for (const record of wideTableRecords) {
    if (record.wideTableId !== wideTable.id) {
      continue;
    }
    if (
      usesBusinessDateAxis
      && normalizeDate(String(record[businessDateFieldName] ?? "")) !== normalizeDate(taskGroup.businessDate)
    ) {
      continue;
    }
    const rowId = getRecordRowId(record);
    recordMap.set(rowId, mergeWideTableRecord(recordMap.get(rowId), record));
  }

  const rowIds = Array.from(
    new Set([
      ...explicitTasks.map((task) => task.rowId),
      ...Array.from(recordMap.keys()),
    ]),
  ).sort((left, right) => left - right);

  const candidateTasks = rowIds.flatMap((rowId) => {
    const record = recordMap.get(rowId);
    return indicatorGroups.map((group) => ({
      rowId,
      record,
      group,
      explicitTask: explicitTaskMap.get(makeTaskKey(rowId, group.id)),
    }));
  }).filter((item) => item.explicitTask || item.record);
  const syntheticStatuses = buildSyntheticTaskStatuses(
    taskGroupExecution,
    explicitTasks,
    candidateTasks.filter((item) => !item.explicitTask).length,
  );

  const cards: FetchTaskCardView[] = [];
  let syntheticTaskIndex = 0;

  for (const rowId of rowIds) {
    const record = recordMap.get(rowId);

    for (const group of indicatorGroups) {
      const explicitTask = explicitTaskMap.get(makeTaskKey(rowId, group.id));
      if (!explicitTask && !record) {
        continue;
      }

      const hydratedTask = explicitTask
        ? hydrateExplicitTaskForDisplay(explicitTask, wideTable, record, group.indicatorColumns)
        : buildSyntheticTask(
          wideTable,
          taskGroupExecution.status,
          taskGroup,
          rowId,
          group.id,
          group.name,
          group.indicatorColumns,
          syntheticStatuses[syntheticTaskIndex++] ?? inferFallbackSyntheticStatus(taskGroupExecution.status),
          record,
        );
      cards.push(
        buildTaskCardView(
          hydratedTask,
          group,
          requirement,
          wideTable,
          taskGroup,
          record,
        ),
      );
    }
  }

  return cards;
}

function buildTaskCardView(
  task: FetchTaskLike,
  group: {
    id: string;
    name: string;
    agent?: string;
    promptTemplate?: string;
    promptConfig?: IndicatorGroup["promptConfig"];
    indicatorColumns: string[];
    description: string;
  },
  requirement: Requirement | undefined,
  wideTable: WideTable,
  taskGroup: TaskGroup,
  record?: WideTableRecord,
): FetchTaskCardView {
  const contextColumns = getVisibleNarrowTableContextColumns(wideTable);
  const indicatorColumns = wideTable.schema.columns.filter(
    (column) => column.category === "indicator" && group.indicatorColumns.includes(column.name),
  );
  const entityValue = getPrimaryEntityValue(wideTable, record);
  const returnRows = indicatorColumns.map((column, rowIndex) =>
    buildReturnRow({
      task,
      wideTable,
      record,
      rowId: task.rowId,
      contextColumns,
      indicatorColumn: column,
      groupDescription: group.description,
      entityValue,
      taskGroup,
      rowIndex,
      totalIndicatorCount: indicatorColumns.length,
    }),
  );
  const durationMs = getCumulativeDurationMs(task.executionRecords);
  const latestExecution = task.executionRecords[task.executionRecords.length - 1];
  const latestError = [...task.executionRecords].reverse().find((execution) => execution.errorMessage)?.errorMessage ?? "";
  const startedAt = task.executionRecords[0]?.startedAt ?? task.createdAt;
  const endedAt = latestExecution?.endedAt ?? "";
  const confidence = task.confidence ?? record?._metadata?.confidence;
  const promptMarkdown = requirement
    ? buildIndicatorGroupPrompt(requirement, wideTable, {
      ...group,
      wideTableId: wideTable.id,
      priority: 0,
    }).markdown
    : (group.promptTemplate ?? "-");

  return {
    id: task.id,
    rowId: task.rowId,
    indicatorGroupId: group.id,
    indicatorGroupName: group.name,
    rowLabel: entityValue ? `ROW ${task.rowId} · ${entityValue}` : `ROW ${task.rowId}`,
    status: task.status,
    confidenceLabel: confidence != null ? `${(confidence * 100).toFixed(0)}%` : "-",
    attempts: task.executionRecords.length,
    cumulativeDurationLabel: durationMs != null ? formatDuration(durationMs) : task.status === "running" ? "进行中" : "-",
    latestTrigger: latestExecution?.triggeredBy ?? taskGroup.triggeredBy,
    startedAt,
    endedAt,
    latestError,
    agent: group.agent ?? "-",
    promptTemplate: group.promptTemplate ?? "-",
    promptMarkdown,
    executionRecords: task.executionRecords,
    returnRows,
    isSynthetic: Boolean(task.isSynthetic),
  };
}

function buildReturnRow(params: {
  task: FetchTaskLike;
  wideTable: WideTable;
  record?: WideTableRecord;
  rowId: number;
  contextColumns: ColumnDefinition[];
  indicatorColumn: ColumnDefinition;
  groupDescription: string;
  entityValue: string;
  taskGroup: TaskGroup;
  rowIndex: number;
  totalIndicatorCount: number;
}): FetchTaskReturnRowView {
  const {
    wideTable,
    record,
    contextColumns,
    indicatorColumn,
    groupDescription,
    entityValue,
    taskGroup,
  } = params;
  const indicatorValue = record
    ? buildWideTableProcessedCellValue(wideTable, record, indicatorColumn)
    : "";
  const rawIndicatorValue = record
    ? buildWideTableRawCellValue(wideTable, record, indicatorColumn)
    : "";
  const shouldExposeReturnMetadata = Boolean(indicatorValue || rawIndicatorValue);
  const indicatorUnit = indicatorColumn.unit ?? "";
  const sourceSite = shouldExposeReturnMetadata ? lookupSourceSite(entityValue) : "";
  const sourceUrl = shouldExposeReturnMetadata ? lookupSourceUrl(entityValue) : "";
  const indicatorBounds = shouldExposeReturnMetadata ? buildIndicatorBounds(rawIndicatorValue, indicatorUnit) : { maxValue: "", minValue: "" };
  const quoteText = shouldExposeReturnMetadata
    ? buildQuoteText({
      taskGroup,
      wideTable,
      record,
      entityValue,
      indicatorColumn,
      rawIndicatorValue,
      indicatorValue,
      indicatorUnit,
    })
    : "";

  return {
    contextValues: Object.fromEntries(
      contextColumns.map((column) => [column.name, formatContextColumnValue(column, record, params.rowId)]),
    ),
    indicatorName: indicatorColumn.chineseName ?? indicatorColumn.name,
    indicatorUnit,
    indicatorValue: shouldExposeReturnMetadata ? indicatorValue : "",
    rawIndicatorValue: shouldExposeReturnMetadata ? rawIndicatorValue : "",
    publishedAt: shouldExposeReturnMetadata ? resolveReturnRowPublishedAt(taskGroup, record) : "",
    sourceSite,
    source: sourceSite,
    sourceUrl,
    indicatorLogic: shouldExposeReturnMetadata ? buildIndicatorLogic(groupDescription) : "",
    indicatorLogicSupplement: shouldExposeReturnMetadata ? buildIndicatorLogicSupplement(indicatorColumn) : "",
    maxValue: indicatorBounds.maxValue,
    minValue: indicatorBounds.minValue,
    quoteText,
  };
}

function buildIndicatorGroups(wideTable: WideTable) {
  if (wideTable.indicatorGroups.length > 0) {
    return [...wideTable.indicatorGroups].sort((left, right) => left.priority - right.priority);
  }

  return [];
}

function buildSyntheticTask(
  wideTable: WideTable,
  taskGroupStatus: TaskGroup["status"],
  taskGroup: TaskGroup,
  rowId: number,
  indicatorGroupId: string,
  indicatorGroupName: string,
  indicatorColumns: string[],
  syntheticStatus: FetchTask["status"],
  record?: WideTableRecord,
): FetchTaskLike {
  const inferredStatus = inferRecordBackedTaskStatus(wideTable, record, indicatorColumns) ?? syntheticStatus;
  const resolvedStatus = resolveSyntheticTaskStatus(taskGroupStatus, inferredStatus);

  return {
    id: `ft_auto_${taskGroup.id}_${indicatorGroupId}_${rowId}`,
    taskGroupId: taskGroup.id,
    wideTableId: wideTable.id,
    rowId,
    indicatorGroupId,
    indicatorGroupName,
    status: resolvedStatus,
    confidence: record?._metadata?.confidence,
    executionRecords: buildSyntheticExecutionRecords(taskGroup, rowId, indicatorGroupId, resolvedStatus),
    createdAt: taskGroup.createdAt,
    updatedAt: taskGroup.updatedAt,
    isSynthetic: true,
  };
}

function hydrateExplicitTaskForDisplay(
  task: FetchTask,
  wideTable: WideTable,
  record: WideTableRecord | undefined,
  indicatorColumns: string[],
): FetchTask {
  if (task.status === "failed" || task.status === "invalidated") {
    return task;
  }

  const inferredStatus = inferRecordBackedTaskStatus(wideTable, record, indicatorColumns);
  if (!inferredStatus || inferredStatus === task.status) {
    return task;
  }

  if (taskStatusProgress(inferredStatus) <= taskStatusProgress(task.status)) {
    return task;
  }

  return {
    ...task,
    status: inferredStatus,
  };
}

function getPrimaryEntityValue(wideTable: WideTable, record?: WideTableRecord): string {
  if (!record) {
    return "";
  }

  const entityColumn = wideTable.schema.columns.find(
    (column) => column.category === "dimension" && !column.isBusinessDate && isMeaningfulValue(record[column.name]),
  ) ?? wideTable.schema.columns.find(
    (column) => column.category === "attribute" && isMeaningfulValue(record[column.name]),
  );
  return entityColumn ? formatCellValue(record[entityColumn.name]) : "";
}

function formatContextColumnValue(column: ColumnDefinition, record: WideTableRecord | undefined, rowId: number): string {
  if (column.category === "id") {
    return String(record?.[column.name] ?? rowId);
  }

  if (!record) {
    return "";
  }

  return formatCellValue(record[column.name]);
}

function buildIndicatorLogic(groupDescription: string): string {
  return groupDescription || "按指标组规则采集";
}

function buildIndicatorLogicSupplement(column: ColumnDefinition): string {
  const logicParts = [
    column.description || `返回 ${column.chineseName ?? column.name}`,
  ];

  if (column.unit) {
    logicParts.push(`单位：${column.unit}`);
  }

  logicParts.push(`类型：${columnTypeLabel(column.type)}`);
  return logicParts.filter(Boolean).join("；");
}

function buildQuoteText(params: {
  taskGroup: TaskGroup;
  wideTable: WideTable;
  record?: WideTableRecord;
  entityValue: string;
  indicatorColumn: ColumnDefinition;
  rawIndicatorValue: string;
  indicatorValue: string;
  indicatorUnit: string;
}): string {
  const {
    taskGroup,
    wideTable,
    record,
    entityValue,
    indicatorColumn,
    rawIndicatorValue,
    indicatorValue,
    indicatorUnit,
  } = params;

  if (!record) {
    return "";
  }

  const dimensionLabel = wideTable.schema.columns
    .filter((column) => column.category === "dimension" && !column.isBusinessDate)
    .map((column) => formatCellValue(record[column.name]))
    .filter(Boolean)
    .join(" / ");
  const subjectLabel = shortenText(dimensionLabel || entityValue || "该对象", 32);
  const indicatorLabel = shortenText(indicatorColumn.description || indicatorColumn.chineseName || indicatorColumn.name, 32);
  const valueText = formatQuoteValueText(rawIndicatorValue, indicatorValue, indicatorUnit);
  const timelineLabel = resolveReturnRowPublishedAt(taskGroup, record);
  const candidates = buildQuoteTextCandidates({
    taskGroup,
    entityValue,
    subjectLabel,
    indicatorLabel,
    valueText,
    timelineLabel,
  });

  if (candidates.length === 0) {
    return "";
  }

  const templateIndex = hashQuoteTemplateIndex(
    timelineLabel,
    subjectLabel,
    indicatorLabel,
    valueText,
    entityValue,
  );
  return shortenText(candidates[templateIndex % candidates.length]);
}

function lookupSourceUrl(entityValue: string): string {
  if (!entityValue) {
    return "";
  }

  return ENTITY_URL_MAP[entityValue] ?? "";
}

function lookupSourceSite(entityValue: string): string {
  const sourceUrl = lookupSourceUrl(entityValue);
  if (!sourceUrl) {
    return entityValue;
  }

  try {
    return new URL(sourceUrl).hostname.replace(/^www\./, "");
  } catch {
    return entityValue;
  }
}

function buildIndicatorBounds(rawIndicatorValue: string, unit: string): { maxValue: string; minValue: string } {
  if (!rawIndicatorValue) {
    return { maxValue: "", minValue: "" };
  }

  const semantic = fillIndicator(rawIndicatorValue, unit).semantic;
  if (semantic.kind === "range" && semantic.lower != null && semantic.upper != null) {
    return {
      maxValue: formatNumericBound(semantic.upper),
      minValue: formatNumericBound(semantic.lower),
    };
  }

  if (semantic.kind === "at_least" && semantic.lower != null) {
    const value = formatNumericBound(semantic.lower);
    return { maxValue: value, minValue: value };
  }

  if (semantic.kind === "approximate" && semantic.value != null) {
    const value = formatNumericBound(semantic.value);
    return { maxValue: value, minValue: value };
  }

  if (semantic.kind === "exact" && semantic.value != null) {
    const value = formatNumericBound(semantic.value);
    return { maxValue: value, minValue: value };
  }

  return { maxValue: "", minValue: "" };
}

function formatNumericBound(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(4).replace(/\.?0+$/, "");
}

function buildQuoteTextCandidates(params: {
  taskGroup: TaskGroup;
  entityValue: string;
  subjectLabel: string;
  indicatorLabel: string;
  valueText: string;
  timelineLabel: string;
}): string[] {
  const { taskGroup, entityValue, subjectLabel, indicatorLabel, valueText, timelineLabel } = params;
  if (!valueText) {
    return [];
  }

  const publishedAt = timelineLabel || taskGroup.businessDate || taskGroup.partitionLabel || taskGroup.businessDateLabel || "当前快照";

  const candidates = [
    entityValue
      ? `${entityValue}在${publishedAt}的相关披露中，${indicatorLabel}为${valueText}。`
      : "",
    `在${publishedAt}披露的结果里，${subjectLabel}的${indicatorLabel}达到${valueText}。`,
    `数据显示，${subjectLabel}的${indicatorLabel}为${valueText}。`,
    `原文提到，${indicatorLabel}为${valueText}。`,
    `${publishedAt}，${subjectLabel}方面的${indicatorLabel}记录为${valueText}。`,
    `${indicatorLabel}：${valueText}。`,
  ];

  return candidates.filter(Boolean);
}

function formatQuoteValueText(rawValue: string, processedValue: string, unit: string): string {
  const raw = rawValue.trim();
  if (raw) {
    if (unit && raw.endsWith(unit)) {
      return raw;
    }

    const rangeMatch = raw.match(/^(-?\d+(?:\.\d+)?)\s*([~-]|至|到)\s*(-?\d+(?:\.\d+)?)(.*)$/);
    if (rangeMatch) {
      const suffix = rangeMatch[4].trim();
      if (!suffix || suffix === unit) {
        return unit
          ? `${rangeMatch[1]}${unit}${rangeMatch[2]}${rangeMatch[3]}${unit}`
          : `${rangeMatch[1]}${rangeMatch[2]}${rangeMatch[3]}`;
      }
      return raw;
    }

    const prefixMatch = raw.match(/^(至少|不低于|不少于|≥|>=|约|近|大约|大概|接近)\s*(-?\d+(?:\.\d+)?)(.*)$/);
    if (prefixMatch) {
      const suffix = prefixMatch[3].trim();
      if (!suffix || suffix === unit) {
        return unit ? `${prefixMatch[1]}${prefixMatch[2]}${unit}` : `${prefixMatch[1]}${prefixMatch[2]}`;
      }
      return raw;
    }

    if (/^-?\d+(?:\.\d+)?$/.test(raw) && unit) {
      return `${raw}${unit}`;
    }

    return raw;
  }

  const processed = processedValue.trim();
  if (!processed) {
    return "";
  }

  if (unit && processed.endsWith(unit)) {
    return processed;
  }

  if (/^-?\d+(?:\.\d+)?$/.test(processed) && unit) {
    return `${processed}${unit}`;
  }

  return processed;
}

function hashQuoteTemplateIndex(...parts: string[]): number {
  let hash = 2166136261;
  for (const part of parts) {
    for (let index = 0; index < part.length; index += 1) {
      hash ^= part.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    hash ^= 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function getRecordRowId(record: WideTableRecord): number {
  const rowId = Number(record.ROW_ID ?? record.id);
  return Number.isFinite(rowId) ? rowId : Number(record.id);
}

function mergeWideTableRecord(
  snapshotRecord: WideTableRecord | undefined,
  latestRecord: WideTableRecord,
): WideTableRecord {
  if (!snapshotRecord) {
    return latestRecord;
  }

  return {
    ...snapshotRecord,
    ...latestRecord,
    _metadata: {
      ...snapshotRecord._metadata,
      ...latestRecord._metadata,
    },
  };
}

function makeTaskKey(rowId: number, indicatorGroupId: string): string {
  return `${rowId}::${indicatorGroupId}`;
}

function normalizeDate(value: string): string {
  return value.trim();
}

function resolveReturnRowPublishedAt(taskGroup: TaskGroup, record?: WideTableRecord): string {
  const recordSnapshotDate = formatCellValue(record?.ENDDATE ?? record?.enddate);
  if (recordSnapshotDate) {
    return recordSnapshotDate;
  }
  return taskGroup.businessDate || taskGroup.partitionLabel || taskGroup.businessDateLabel || "";
}

function formatCellValue(value: unknown): string {
  if (value == null || value === "") {
    return "";
  }
  return String(value);
}

function shortenText(value: string, maxLength = 80): string {
  const text = value.trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

function formatIndicatorValue(column: ColumnDefinition, value: unknown): string {
  if (value == null || value === "") {
    return "";
  }

  if (column.type !== "NUMBER") {
    return String(value);
  }

  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue)) {
    return String(value);
  }

  if (Number.isInteger(numericValue)) {
    return String(numericValue);
  }

  return numericValue.toFixed(4).replace(/\.?0+$/, "");
}

function inferRecordBackedTaskStatus(
  wideTable: WideTable,
  record: WideTableRecord | undefined,
  indicatorColumns: string[],
): FetchTask["status"] | null {
  if (!record) {
    return null;
  }

  const scopedIndicatorColumns = wideTable.schema.columns.filter(
    (column) => column.category === "indicator" && indicatorColumns.includes(column.name),
  );
  if (scopedIndicatorColumns.length === 0) {
    return null;
  }

  const filledCount = scopedIndicatorColumns.filter(
    (column) => buildWideTableRawCellValue(wideTable, record, column) !== "",
  ).length;
  if (filledCount === 0) {
    return "pending";
  }
  if (filledCount === scopedIndicatorColumns.length) {
    return "completed";
  }
  return "running";
}

function resolveSyntheticTaskStatus(
  taskGroupStatus: TaskGroup["status"],
  inferredStatus: FetchTask["status"],
): FetchTask["status"] {
  if (inferredStatus === "completed" || inferredStatus === "running") {
    return inferredStatus;
  }

  if (inferredStatus === "failed" || inferredStatus === "invalidated") {
    return inferredStatus;
  }

  if (taskGroupStatus === "completed") {
    return "completed";
  }

  if (taskGroupStatus === "partial") {
    return "failed";
  }

  return inferredStatus || "pending";
}

function buildSyntheticTaskStatuses(
  taskGroupExecution: ReturnType<typeof buildTaskGroupExecutionSummary>,
  explicitTasks: FetchTask[],
  syntheticTaskCount: number,
): FetchTask["status"][] {
  if (syntheticTaskCount <= 0) {
    return [];
  }

  const explicitCounts = countTaskStatuses(explicitTasks);
  const remainingCounts = {
    completed: Math.max(taskGroupExecution.completedTasks - explicitCounts.completed, 0),
    running: Math.max(taskGroupExecution.runningTasks - explicitCounts.running, 0),
    failed: Math.max(taskGroupExecution.failedTasks - explicitCounts.failed, 0),
    pending: Math.max(taskGroupExecution.pendingTasks - explicitCounts.pending, 0),
    invalidated: Math.max(taskGroupExecution.invalidatedTasks - explicitCounts.invalidated, 0),
  };
  const statuses: FetchTask["status"][] = [];
  const orderedStatuses: Array<FetchTask["status"]> = ["completed", "running", "failed", "pending", "invalidated"];

  for (const status of orderedStatuses) {
    for (let count = 0; count < remainingCounts[status]; count += 1) {
      statuses.push(status);
    }
  }

  while (statuses.length < syntheticTaskCount) {
    statuses.push(inferFallbackSyntheticStatus(taskGroupExecution.status));
  }

  return statuses.slice(0, syntheticTaskCount);
}

function inferFallbackSyntheticStatus(taskGroupStatus: TaskGroup["status"]): FetchTask["status"] {
  if (taskGroupStatus === "completed") {
    return "completed";
  }
  if (taskGroupStatus === "partial") {
    return "failed";
  }
  if (taskGroupStatus === "running") {
    return "pending";
  }
  return "pending";
}

function taskStatusProgress(status: FetchTask["status"]): number {
  switch (status) {
    case "pending":
      return 0;
    case "running":
      return 1;
    case "completed":
      return 2;
    case "failed":
      return 3;
    case "invalidated":
      return 4;
    default:
      return 0;
  }
}

function countTaskStatuses(tasks: FetchTask[]): Record<FetchTask["status"], number> {
  return tasks.reduce(
    (counts, task) => {
      counts[task.status] += 1;
      return counts;
    },
    {
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0,
      invalidated: 0,
    } satisfies Record<FetchTask["status"], number>,
  );
}

function buildSyntheticExecutionRecords(
  taskGroup: TaskGroup,
  rowId: number,
  indicatorGroupId: string,
  status: FetchTask["status"],
): ExecutionRecord[] {
  const baseId = `${taskGroup.id}_${indicatorGroupId}_${rowId}`;

  if (status === "completed") {
    return [
      {
        id: `${baseId}_success`,
        fetchTaskId: `ft_auto_${taskGroup.id}_${indicatorGroupId}_${rowId}`,
        attempt: 1,
        status: "success",
        triggeredBy: taskGroup.triggeredBy,
        startedAt: taskGroup.createdAt,
        endedAt: taskGroup.updatedAt || taskGroup.createdAt,
      },
    ];
  }

  if (status === "running") {
    return [
      {
        id: `${baseId}_running`,
        fetchTaskId: `ft_auto_${taskGroup.id}_${indicatorGroupId}_${rowId}`,
        attempt: 1,
        status: "running",
        triggeredBy: taskGroup.triggeredBy,
        startedAt: taskGroup.updatedAt || taskGroup.createdAt,
      },
    ];
  }

  if (status === "failed") {
    return [
      {
        id: `${baseId}_failure`,
        fetchTaskId: `ft_auto_${taskGroup.id}_${indicatorGroupId}_${rowId}`,
        attempt: 1,
        status: "failure",
        triggeredBy: taskGroup.triggeredBy,
        errorMessage: "该任务在组级执行中失败，等待人工重试。",
        startedAt: taskGroup.createdAt,
        endedAt: taskGroup.updatedAt || taskGroup.createdAt,
      },
    ];
  }

  return [];
}

function buildSyntheticIndicatorValue(
  column: ColumnDefinition,
  record: WideTableRecord,
  rowId: number,
): string {
  const seed = createSeed([
    formatCellValue(record.COMPANY),
    formatCellValue(record.OEM_BRAND),
    formatCellValue(record.DRUG_NAME),
    formatCellValue(record.BIZ_DATE ?? record.ENDDATE ?? record.enddate),
    column.name,
    String(rowId),
  ]);

  if (column.name === "FLEET_SIZE") {
    const base = entityNumberBase(
      formatCellValue(record.COMPANY),
      {
        "滴滴全球": 200,
        "如祺出行": 300,
        "曹操出行": 100,
        "小马智行": 1159,
      },
      260,
    );
    return String(base + (seed % 41));
  }

  if (column.name === "OPERATING_MILEAGE") {
    const base = entityNumberBase(
      formatCellValue(record.COMPANY),
      {
        "滴滴全球": 86.5,
        "如祺出行": 600,
        "曹操出行": 15.3,
        "小马智行": 3350,
      },
      420,
    );
    return (base + ((seed % 25) / 10)).toFixed(1).replace(/\.?0+$/, "");
  }

  if (column.name === "ORDER_PRICE") {
    const base = entityNumberBase(
      formatCellValue(record.COMPANY),
      {
        "滴滴全球": 85,
        "如祺出行": 78,
        "曹操出行": 72,
        "小马智行": 35,
      },
      60,
    );
    return String(base + (seed % 3));
  }

  if (column.name === "ORDER_COUNT") {
    const base = entityNumberBase(
      formatCellValue(record.COMPANY),
      {
        "滴滴全球": 45.2,
        "如祺出行": 18.6,
        "曹操出行": 9.8,
        "小马智行": 109.5,
      },
      12,
    );
    return (base + ((seed % 15) / 10)).toFixed(1).replace(/\.?0+$/, "");
  }

  if (column.name === "ORDERS") {
    const base = entityNumberBase(
      formatCellValue(record.COMPANY),
      {
        Waymo: 11800,
        "Pony.ai": 8500,
        "百度萝卜快跑": 14600,
        Inceptio: 3200,
      },
      4200,
    );
    return String(base + (seed % 750));
  }

  if (column.name === "MPI_VALUE") {
    const base = entityNumberBase(
      formatCellValue(record.COMPANY),
      {
        Waymo: 17200,
        "Pony.ai": 12000,
        "百度萝卜快跑": 9800,
        Inceptio: 11500,
      },
      9600,
    );
    return String(base + (seed % 620));
  }

  if (column.name === "INCIDENT_RATE") {
    const base = entityNumberBase(
      formatCellValue(record.COMPANY),
      {
        Waymo: 12,
        "Pony.ai": 19,
        "百度萝卜快跑": 16,
        Inceptio: 10,
      },
      18,
    );
    return (base / 100).toFixed(2).replace(/\.?0+$/, "");
  }

  if (column.name === "SUPPLIER_NAME") {
    const supplier = resolveSupplierName(record);
    return supplier;
  }

  if (column.name === "ORR_VALUE") {
    return ((entityNumberBase(formatCellValue(record.DRUG_NAME), {
      "Enhertu (DS-8201)": 68,
      SKB264: 63,
      RC48: 58,
    }, 56) + (seed % 6)) + 0.4).toFixed(1);
  }

  if (column.name === "PFS_VALUE") {
    return ((entityNumberBase(formatCellValue(record.DRUG_NAME), {
      "Enhertu (DS-8201)": 11,
      SKB264: 9,
      RC48: 8,
    }, 7) + ((seed % 4) * 0.3)) + 0.2).toFixed(1);
  }

  if (column.name === "OS_VALUE") {
    return ((entityNumberBase(formatCellValue(record.DRUG_NAME), {
      "Enhertu (DS-8201)": 24,
      SKB264: 20,
      RC48: 18,
    }, 16) + ((seed % 5) * 0.4)) + 0.1).toFixed(1);
  }

  if (column.name === "TEAE_RATE") {
    return ((entityNumberBase(formatCellValue(record.DRUG_NAME), {
      "Enhertu (DS-8201)": 31,
      SKB264: 36,
      RC48: 34,
    }, 28) + (seed % 5)) + 0.2).toFixed(1);
  }

  return "";
}

function resolveSupplierName(record: WideTableRecord): string {
  const brand = formatCellValue(record.OEM_BRAND);
  if (brand === "小米汽车") {
    return "禾赛科技";
  }
  if (brand === "智界") {
    return "华为海思";
  }
  if (brand === "理想") {
    return "速腾聚创";
  }
  return "待确认供应商";
}

function entityNumberBase(
  entityValue: string,
  mapping: Record<string, number>,
  fallback: number,
): number {
  return mapping[entityValue] ?? fallback;
}

function createSeed(parts: string[]): number {
  const source = parts.join("|");
  let hash = 0;

  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 33 + source.charCodeAt(index)) % 2147483647;
  }

  return Math.abs(hash);
}

function isMeaningfulValue(value: unknown): boolean {
  const formatted = formatCellValue(value);
  return formatted !== "" && formatted !== "待补充";
}

function formatGroupedMetricValue(indicatorValue: string): string {
  const numericValue = Number(indicatorValue);
  if (!Number.isFinite(numericValue)) {
    return indicatorValue;
  }

  const displayValue = Number.isInteger(numericValue)
    ? numericValue.toLocaleString("en-US")
    : numericValue.toFixed(4).replace(/\.?0+$/, "");
  return displayValue;
}

function getCumulativeDurationMs(executionRecords: ExecutionRecord[]): number | null {
  let totalDuration = 0;
  let hasDuration = false;

  for (const execution of executionRecords) {
    if (!execution.startedAt || !execution.endedAt) {
      continue;
    }
    const startedAt = Date.parse(execution.startedAt);
    const endedAt = Date.parse(execution.endedAt);
    if (Number.isNaN(startedAt) || Number.isNaN(endedAt) || endedAt < startedAt) {
      continue;
    }
    totalDuration += endedAt - startedAt;
    hasDuration = true;
  }

  return hasDuration ? totalDuration : null;
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${seconds}秒`;
  }

  if (minutes < 60) {
    return `${minutes}分${seconds.toString().padStart(2, "0")}秒`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}小时${remainingMinutes}分`;
}

function columnTypeLabel(type: ColumnDefinition["type"]): string {
  if (type === "INTEGER") {
    return "整数";
  }
  if (type === "NUMBER") {
    return "数值";
  }
  if (type === "DATE") {
    return "日期";
  }
  if (type === "BOOLEAN") {
    return "布尔";
  }
  return "字符串";
}
