import type { ColumnDefinition, Requirement, WideTable, WideTableRecord } from "@/lib/types";
import type { AuditRule, PreprocessRule } from "@/lib/domain";
import { MOCK_WIDE_TABLE_RECORDS } from "@/lib/mock-data";
import { resolveRecordPlanVersion } from "@/lib/task-plan-reconciliation";
import { getWideTableDimensionBindingKey } from "@/lib/wide-table-preview";

export type PipelineDataRow = {
  id: string;
  businessDate: string;
  entity: string;
  indicator: string;
  value: string;
  unit: string;
  source: string;
  note: string;
};

export type AuditRuleState = AuditRule & { enabled: boolean };

export type AuditResultRow = {
  rowId: string;
  businessDate: string;
  entity: string;
  indicator: string;
  value: string;
  status: "通过" | "未通过";
  failedRuleIds: string[];
  failedRuleNames: string[];
  failedRules: string;
  detail: string;
};

export type WideTableProcessingRow = {
  recordId: number;
  values: Record<string, string>;
  filledIndicatorCount: number;
  indicatorCount: number;
};

export type WideTableProcessingView = {
  wideTableId: string;
  wideTableName: string;
  description: string;
  columns: ColumnDefinition[];
  rawRows: WideTableProcessingRow[];
  processedRows: WideTableProcessingRow[];
};

const DEFAULT_ENABLED_CATEGORIES = new Set<PreprocessRule["category"]>(["format_fix", "null_fix", "unit_convert", "derived"]);

function normalizeDate(value: string): string {
  return value.replaceAll("/", "-");
}

function resolveRecordTimelineValue(record: WideTableRecord): string {
  return formatWideCellValue(record.BIZ_DATE ?? record.ENDDATE ?? record.enddate);
}

function normalizeValue(
  value: string,
  enabledCategories: Set<PreprocessRule["category"]>,
): { value: string; note: string } {
  let nextValue = value;
  const notes: string[] = [];

  if (enabledCategories.has("null_fix") && (nextValue === "N/A" || nextValue === "未披露" || nextValue === "null" || nextValue === "")) {
    nextValue = "NULL";
    notes.push("空值标准化 -> NULL");
  }

  if (enabledCategories.has("format_fix")) {
    // 兼容 demo 噪音数据：11.8k / 12.5k / 14.6万 等倍率缩写
    const scaledCandidate = nextValue.replaceAll(",", "");
    const scaledMatch = scaledCandidate.match(/^(-?\d+(?:\.\d+)?)\s*([kKmMbB]|[百千万亿])\s*$/);
    if (scaledMatch) {
      const baseValue = Number(scaledMatch[1]);
      const multiplier = resolveScaleMultiplier(scaledMatch[2]);
      if (Number.isFinite(baseValue) && multiplier !== 1) {
        const scaledValue = Number((baseValue * multiplier).toPrecision(12));
        nextValue = String(scaledValue).replace(/\.?0+$/, "");
        notes.push(`倍率换算 ${scaledMatch[2]} -> ${nextValue}`);
      }
    }
  }

  if (enabledCategories.has("format_fix") && nextValue.includes(",")) {
    nextValue = nextValue.replaceAll(",", "");
    notes.push("去除千分位分隔符");
  }

  if (enabledCategories.has("unit_convert") && nextValue.endsWith("%")) {
    const parsed = Number(nextValue.replace("%", ""));
    if (Number.isFinite(parsed)) {
      nextValue = (parsed / 100).toFixed(4);
      notes.push("百分率转换为小数");
    }
  }

  return {
    value: nextValue,
    note: notes.length > 0 ? notes.join("；") : "无需修复",
  };
}

function resolveScaleMultiplier(char: string): number {
  const lower = char.toLowerCase();
  if (lower === "k") return 1000;
  if (lower === "m") return 1000000;
  if (lower === "b") return 1000000000;
  if (char === "百") return 100;
  if (char === "千") return 1000;
  if (char === "万") return 10000;
  if (char === "亿") return 100000000;
  return 1;
}

export function buildRawRows(
  requirement: Requirement,
  wideTables: WideTable[],
  wideTableRecords: WideTableRecord[] = [],
): PipelineDataRow[] {
  const rows: PipelineDataRow[] = [];
  const reqWideTables = requirement.wideTable
    ? [requirement.wideTable]
    : wideTables.filter((wt) => wt.requirementId === requirement.id);

  for (const wt of reqWideTables) {
    const scopedRecords = resolveScopedWideTableRecords(wt, wideTableRecords);
    const hasLocalRecords = wideTableRecords.some((record) => record.wideTableId === wt.id);
    const records = scopedRecords.length > 0 || hasLocalRecords
      ? scopedRecords
      : MOCK_WIDE_TABLE_RECORDS.filter((record) => record.wideTableId === wt.id);
    const indicatorCols = wt.schema.columns.filter((c) => c.category === "indicator");
    const firstEntityCol = wt.schema.columns.find(
      (c) => (c.category === "dimension" && !c.isBusinessDate) || c.category === "attribute",
    );

    for (const record of records.slice(0, 4)) {
      for (const col of indicatorCols.slice(0, 2)) {
        const val = record[col.name];
        rows.push({
          id: `R${record.id}-${col.name}`,
          businessDate: resolveRecordTimelineValue(record) || "-",
          entity: firstEntityCol ? (record[firstEntityCol.name] ?? "-") : "-",
          indicator: col.description,
          value: val == null ? "NULL" : String(val),
          unit: col.unit ?? "-",
          source: "-",
          note: "待后处理",
        });
      }
    }
  }

  if (rows.length === 0) {
    return [
      { id: "ROW-001", businessDate: "2026/03/01", entity: "主体待确认", indicator: "指标A", value: "128,000", unit: "单", source: "https://example.com", note: "待后处理" },
      { id: "ROW-002", businessDate: "2026/03/01", entity: "主体待确认", indicator: "指标B", value: "0.45%", unit: "%", source: "https://example.com", note: "待后处理" },
    ];
  }

  return rows;
}

export function runPreprocess(
  rows: PipelineDataRow[],
  enabledCategories = DEFAULT_ENABLED_CATEGORIES,
): PipelineDataRow[] {
  return rows.map((row) => {
    const normalized = normalizeValue(row.value, enabledCategories);
    return {
      ...row,
      businessDate: enabledCategories.has("format_fix") ? normalizeDate(row.businessDate) : row.businessDate,
      value: normalized.value,
      note: normalized.note,
    };
  });
}

export function buildWideTableProcessingViews(
  requirement: Requirement,
  wideTables: WideTable[],
  wideTableRecords: WideTableRecord[] = [],
  enabledCategories = DEFAULT_ENABLED_CATEGORIES,
): WideTableProcessingView[] {
  const reqWideTables = requirement.wideTable
    ? [requirement.wideTable]
    : wideTables.filter((wt) => wt.requirementId === requirement.id);

  return reqWideTables.map((wideTable) => {
    const { rawRows, processedRows } = buildWideTableProcessingRows(
      wideTable,
      resolveScopedWideTableRecords(wideTable, wideTableRecords),
      enabledCategories,
    );

    return {
      wideTableId: wideTable.id,
      wideTableName: wideTable.name,
      description: wideTable.description,
      columns: wideTable.schema.columns,
      rawRows,
      processedRows,
    };
  });
}

export function buildWideTableProcessingRows(
  wideTable: WideTable,
  records: WideTableRecord[],
  enabledCategories = DEFAULT_ENABLED_CATEGORIES,
): {
  rawRows: WideTableProcessingRow[];
  processedRows: WideTableProcessingRow[];
} {
  const rawRows = records.map((record) => buildWideTableProcessingRow(wideTable, record));
  return {
    rawRows,
    processedRows: rawRows.map((row) => runWideRowPreprocess(wideTable, row, enabledCategories)),
  };
}

export function buildWideTableProcessingDiffRowMap(
  wideTable: WideTable,
  records: WideTableRecord[],
  enabledCategories = DEFAULT_ENABLED_CATEGORIES,
): Map<string, WideTableProcessingRow> {
  const { processedRows } = buildWideTableProcessingRows(wideTable, records, enabledCategories);
  const rowMap = new Map<string, WideTableProcessingRow>();

  for (const row of processedRows) {
    const key = getWideTableDimensionBindingKey(wideTable, row.values);
    rowMap.set(key, row);
  }

  return rowMap;
}

function evaluateRule(row: PipelineDataRow, rule: AuditRule): { passed: boolean; reason: string } {
  if (rule.id === "AR-001") {
    const parsed = Number(row.value);
    if (Number.isFinite(parsed) && Math.abs(parsed) > 100000) {
      return { passed: false, reason: "模拟命中环比异常阈值" };
    }
    return { passed: true, reason: "未命中环比异常阈值" };
  }

  if (rule.id === "AR-002") {
    if (!row.source.trim() || row.source === "-") {
      return { passed: false, reason: "来源链接缺失" };
    }
    return { passed: true, reason: "来源链接完整" };
  }

  if (rule.id === "AR-003") {
    if (row.value === "NULL") {
      return { passed: false, reason: "值为 NULL，类型转换失败" };
    }
    const parsed = Number(row.value);
    if (!Number.isFinite(parsed)) {
      return { passed: false, reason: "值无法转换为数值类型" };
    }
    return { passed: true, reason: "类型校验通过" };
  }

  return { passed: true, reason: "未定义规则评估逻辑，默认通过" };
}

export function runAuditOnProcessedRows(rows: PipelineDataRow[], rules: AuditRuleState[]): AuditResultRow[] {
  const enabledRules = rules.filter((item) => item.enabled);
  return rows.map((row) => {
    const failed = enabledRules
      .map((rule) => ({ rule, result: evaluateRule(row, rule) }))
      .filter((item) => !item.result.passed);

    return {
      rowId: row.id,
      businessDate: row.businessDate,
      entity: row.entity,
      indicator: row.indicator,
      value: row.value,
      status: failed.length === 0 ? "通过" : "未通过",
      failedRuleIds: failed.map((item) => item.rule.id),
      failedRuleNames: failed.map((item) => item.rule.name),
      failedRules: failed.length === 0 ? "-" : failed.map((item) => item.rule.name).join(" / "),
      detail: failed.length === 0 ? "全部规则通过" : failed.map((item) => item.result.reason).join("；"),
    };
  });
}

function resolveScopedWideTableRecords(wideTable: WideTable, wideTableRecords: WideTableRecord[]): WideTableRecord[] {
  const scopedRecords = wideTableRecords.filter((record) => record.wideTableId === wideTable.id);
  const currentPlanVersion = wideTable.currentPlanVersion ?? Math.max(
    1,
    ...scopedRecords.map((record) => resolveRecordPlanVersion(record, 1)),
  );
  const currentRevisionRecords = scopedRecords.filter(
    (record) => resolveRecordPlanVersion(record, currentPlanVersion) === currentPlanVersion,
  );
  const records = scopedRecords.length > 0
    ? currentRevisionRecords
    : MOCK_WIDE_TABLE_RECORDS.filter((record) => record.wideTableId === wideTable.id);

  return [...records].sort((left, right) => {
    const leftDate = resolveRecordTimelineValue(left);
    const rightDate = resolveRecordTimelineValue(right);
    if (leftDate !== rightDate) {
      return rightDate.localeCompare(leftDate);
    }
    return getWideRecordRowId(left) - getWideRecordRowId(right);
  });
}

function buildWideTableProcessingRow(wideTable: WideTable, record: WideTableRecord): WideTableProcessingRow {
  const values = Object.fromEntries(
    wideTable.schema.columns.map((column) => [column.name, buildWideTableRawCellValue(wideTable, record, column)]),
  );
  const indicatorCount = wideTable.schema.columns.filter((column) => column.category === "indicator").length;
  const filledIndicatorCount = wideTable.schema.columns.filter(
    (column) => column.category === "indicator" && values[column.name] !== "",
  ).length;

  return {
    recordId: getWideRecordRowId(record),
    values,
    filledIndicatorCount,
    indicatorCount,
  };
}

export function buildWideTableRawCellValue(
  wideTable: WideTable,
  record: WideTableRecord,
  column: ColumnDefinition,
): string {
  return buildWideTableCellValue(wideTable, record, column);
}

export function buildWideTableProcessedCellValue(
  wideTable: WideTable,
  record: WideTableRecord,
  column: ColumnDefinition,
  enabledCategories = DEFAULT_ENABLED_CATEGORIES,
): string {
  const rawValue = buildWideTableRawCellValue(wideTable, record, column);
  if (!rawValue) {
    return "";
  }

  if (column.category === "indicator") {
    return normalizeValue(rawValue, enabledCategories).value;
  }

  if (column.isBusinessDate && enabledCategories.has("format_fix")) {
    return normalizeDate(rawValue);
  }

  return rawValue;
}

function runWideRowPreprocess(
  wideTable: WideTable,
  row: WideTableProcessingRow,
  enabledCategories: Set<PreprocessRule["category"]>,
): WideTableProcessingRow {
  const nextValues = { ...row.values };

  for (const column of wideTable.schema.columns) {
    const currentValue = nextValues[column.name] ?? "";
    if (column.category === "indicator") {
      if (currentValue === "") {
        nextValues[column.name] = "";
        continue;
      }
      nextValues[column.name] = normalizeValue(currentValue, enabledCategories).value;
      continue;
    }

    if (column.isBusinessDate && enabledCategories.has("format_fix")) {
      nextValues[column.name] = normalizeDate(currentValue);
    }
  }

  return {
    ...row,
    values: nextValues,
    filledIndicatorCount: wideTable.schema.columns.filter(
      (column) => column.category === "indicator" && nextValues[column.name] !== "",
    ).length,
  };
}

function buildWideTableCellValue(wideTable: WideTable, record: WideTableRecord, column: ColumnDefinition): string {
  if (column.category === "id") {
    return formatWideCellValue(record[column.name] ?? getWideRecordRowId(record));
  }

  if (column.category !== "indicator") {
    return formatWideCellValue(record[column.name]);
  }

  const rowId = getWideRecordRowId(record);
  const actualValue = formatIndicatorCandidateValue(column, record[column.name]);
  if (actualValue) {
    return buildRawIndicatorDisplay(column, actualValue);
  }

  if (!shouldHydrateMissingIndicator(wideTable, record, column)) {
    return "";
  }

  const syntheticValue = buildSyntheticIndicatorValue(column, record, rowId);
  return buildRawIndicatorDisplay(column, syntheticValue);
}

function shouldHydrateMissingIndicator(
  wideTable: WideTable,
  record: WideTableRecord,
  column: ColumnDefinition,
): boolean {
  const indicatorColumns = wideTable.schema.columns.filter((item) => item.category === "indicator");
  const hasActualIndicatorValue = indicatorColumns.some(
    (item) => formatIndicatorCandidateValue(item, record[item.name]) !== "",
  );
  if (hasActualIndicatorValue) {
    return false;
  }

  const sortedIndicatorGroups = [...wideTable.indicatorGroups].sort((left, right) => left.priority - right.priority);
  if (sortedIndicatorGroups.length > 0) {
    const firstGroup = sortedIndicatorGroups[0];
    if (sortedIndicatorGroups.length === 1 && firstGroup.indicatorColumns.length === 1) {
      return createSeed([wideTable.id, String(getWideRecordRowId(record))]) % 2 === 0
        && firstGroup.indicatorColumns.includes(column.name);
    }
    return firstGroup.indicatorColumns.includes(column.name);
  }

  const indicatorIndex = indicatorColumns.findIndex((item) => item.name === column.name);
  return indicatorIndex > -1 && indicatorIndex < Math.max(1, Math.ceil(indicatorColumns.length / 2));
}

function buildRawIndicatorDisplay(column: ColumnDefinition, cleanValue: string): string {
  if (!cleanValue) {
    return "";
  }

  if (column.unit === "%") {
    return `${cleanValue}%`;
  }

  const numericValue = Number(cleanValue);
  if (!Number.isFinite(numericValue)) {
    return cleanValue;
  }

  if (Math.abs(numericValue) >= 1000) {
    return Number.isInteger(numericValue)
      ? numericValue.toLocaleString("en-US")
      : numericValue.toLocaleString("en-US", { maximumFractionDigits: 4 });
  }

  return cleanValue;
}

export function getWideRecordRowId(record: WideTableRecord): number {
  const rowId = Number(record.ROW_ID ?? record.id);
  return Number.isFinite(rowId) ? rowId : Number(record.id);
}

function formatWideCellValue(value: unknown): string {
  if (value == null || value === "") {
    return "";
  }
  return String(value);
}

function formatIndicatorCandidateValue(column: ColumnDefinition, value: unknown): string {
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

function buildSyntheticIndicatorValue(
  column: ColumnDefinition,
  record: WideTableRecord,
  rowId: number,
): string {
  const seed = createSeed([
    formatWideCellValue(record.COMPANY),
    formatWideCellValue(record.OEM_BRAND),
    formatWideCellValue(record.DRUG_NAME),
    resolveRecordTimelineValue(record),
    column.name,
    String(rowId),
  ]);

  if (column.name === "FLEET_SIZE") {
    const base = entityNumberBase(
      formatWideCellValue(record.COMPANY),
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
      formatWideCellValue(record.COMPANY),
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
      formatWideCellValue(record.COMPANY),
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
      formatWideCellValue(record.COMPANY),
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
      formatWideCellValue(record.COMPANY),
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
      formatWideCellValue(record.COMPANY),
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
      formatWideCellValue(record.COMPANY),
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
    return resolveSupplierName(record);
  }

  if (column.name === "ORR_VALUE") {
    return ((entityNumberBase(formatWideCellValue(record.DRUG_NAME), {
      "Enhertu (DS-8201)": 68,
      SKB264: 63,
      RC48: 58,
    }, 56) + (seed % 6)) + 0.4).toFixed(1);
  }

  if (column.name === "PFS_VALUE") {
    return ((entityNumberBase(formatWideCellValue(record.DRUG_NAME), {
      "Enhertu (DS-8201)": 11,
      SKB264: 9,
      RC48: 8,
    }, 7) + ((seed % 4) * 0.3)) + 0.2).toFixed(1);
  }

  if (column.name === "OS_VALUE") {
    return ((entityNumberBase(formatWideCellValue(record.DRUG_NAME), {
      "Enhertu (DS-8201)": 24,
      SKB264: 20,
      RC48: 18,
    }, 16) + ((seed % 5) * 0.4)) + 0.1).toFixed(1);
  }

  if (column.name === "TEAE_RATE") {
    return ((entityNumberBase(formatWideCellValue(record.DRUG_NAME), {
      "Enhertu (DS-8201)": 31,
      SKB264: 36,
      RC48: 34,
    }, 28) + (seed % 5)) + 0.2).toFixed(1);
  }

  return "";
}

function resolveSupplierName(record: WideTableRecord): string {
  const brand = formatWideCellValue(record.OEM_BRAND);
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
