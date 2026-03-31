import type { WideTable, WideTableRecord, ColumnDefinition } from "@/lib/types";
import { buildBusinessDateSlots } from "@/lib/business-date";
import { hasWideTableBusinessDateDimension } from "@/lib/wide-table-mode";

export function getWideTableDimensionBindingKey(
  wideTable: WideTable,
  source: Record<string, unknown>,
): string {
  const segments = wideTable.schema.columns
    .filter((column) => column.category === "dimension" && !column.isBusinessDate)
    .map((column) => `${column.name}:${String(source[column.name] ?? "")}`);

  return segments.length > 0 ? segments.join("|") : "__singleton__";
}

export function generateWideTablePreviewRecords(
  wideTable: WideTable,
  existingRecords: WideTableRecord[] = [],
  allExistingRecords: WideTableRecord[] = existingRecords,
): { records: WideTableRecord[]; totalCount: number } {
  const usesBusinessDateAxis = hasWideTableBusinessDateDimension(wideTable);
  const businessDates: Array<string | null> = usesBusinessDateAxis
    ? buildBusinessDateSlots(wideTable.businessDateRange)
    : [null];
  const dimensionColumns = wideTable.schema.columns.filter(
    (column) => column.category === "dimension" && !column.isBusinessDate,
  );
  const attributeColumns = wideTable.schema.columns.filter((column) => column.category === "attribute");
  const dimensionValueGroups = dimensionColumns.map((column) => ({
    column,
    values: wideTable.dimensionRanges.find((range) => range.dimensionName === column.name)?.values ?? [],
  }));
  const attributeBindings = buildAttributeBindings(wideTable, existingRecords, attributeColumns);

  const combinations = buildDimensionCombinations(dimensionValueGroups);
  const totalCount = businessDates.length * combinations.length;

  if (totalCount === 0) {
    return { records: [], totalCount: 0 };
  }

  const records: WideTableRecord[] = [];
  const existingRowIdsByBinding = buildExistingRowIdsByBinding(
    wideTable,
    existingRecords,
    dimensionColumns,
    usesBusinessDateAxis,
  );
  let nextRowId = Math.max(
    0,
    ...allExistingRecords
      .filter((record) => record.wideTableId === wideTable.id)
      .map((record) => Number(record.ROW_ID ?? record.id) || 0),
  ) + 1;

  for (const businessDate of businessDates) {
    for (const dimensionValues of combinations) {
      const previewKey = buildPreviewRecordKey(wideTable, businessDate, dimensionValues);
      const rowId = existingRowIdsByBinding.get(previewKey) ?? nextRowId;
      const record: WideTableRecord = {
        id: rowId,
        wideTableId: wideTable.id,
      };
      const bindingKey = getWideTableDimensionBindingKey(wideTable, dimensionValues);
      const bindingAttributes = attributeBindings.get(bindingKey);

      for (const column of wideTable.schema.columns) {
        record[column.name] = buildColumnPreviewValue(
          column,
          rowId,
          businessDate,
          dimensionValues,
          bindingAttributes?.[column.name],
        );
      }

      records.push(record);
      if (!existingRowIdsByBinding.has(previewKey)) {
        nextRowId += 1;
      }
    }
  }

  return { records, totalCount };
}

function buildExistingRowIdsByBinding(
  wideTable: WideTable,
  existingRecords: WideTableRecord[],
  dimensionColumns: ColumnDefinition[],
  usesBusinessDateAxis: boolean,
): Map<string, number> {
  const rowIdsByBinding = new Map<string, number>();
  const businessDateFieldName = wideTable.schema.columns.find((column) => column.isBusinessDate)?.name ?? "biz_date";

  for (const record of existingRecords) {
    if (record.wideTableId !== wideTable.id) {
      continue;
    }

    const rowId = Number(record.ROW_ID ?? record.id);
    if (!Number.isFinite(rowId)) {
      continue;
    }

    const businessDate = usesBusinessDateAxis
      ? String(record[businessDateFieldName] ?? record.BIZ_DATE ?? "")
      : null;
    const dimensionValues = Object.fromEntries(
      dimensionColumns.map((column) => [column.name, String(record[column.name] ?? "")]),
    );
    const previewKey = buildPreviewRecordKey(wideTable, businessDate, dimensionValues);

    if (!rowIdsByBinding.has(previewKey)) {
      rowIdsByBinding.set(previewKey, rowId);
    }
  }

  return rowIdsByBinding;
}

function buildPreviewRecordKey(
  wideTable: WideTable,
  businessDate: string | null,
  dimensionValues: Record<string, string>,
): string {
  const businessDateKey = hasWideTableBusinessDateDimension(wideTable)
    ? (businessDate ?? "")
    : "__full_table__";
  return `${businessDateKey}::${getWideTableDimensionBindingKey(wideTable, dimensionValues)}`;
}

function buildDimensionCombinations(
  groups: Array<{ column: ColumnDefinition; values: string[] }>,
): Array<Record<string, string>> {
  if (groups.some((group) => group.values.length === 0)) {
    return [];
  }

  if (groups.length === 0) {
    return [{}];
  }

  return groups.reduce<Array<Record<string, string>>>(
    (accumulator, group) =>
      accumulator.flatMap((current) =>
        group.values.map((value) => ({
          ...current,
          [group.column.name]: value,
        })),
      ),
    [{}],
  );
}

function buildColumnPreviewValue(
  column: ColumnDefinition,
  rowId: number,
  businessDate: string | null,
  dimensionValues: Record<string, string>,
  attributeValue?: unknown,
): string | number | boolean | null {
  if (column.category === "id") {
    return rowId;
  }

  if (column.isBusinessDate) {
    return businessDate;
  }

  if (column.category === "dimension") {
    return dimensionValues[column.name] ?? null;
  }

  if (column.category === "attribute") {
    if (attributeValue !== undefined) {
      return attributeValue as string | number | boolean | null;
    }
    if (column.type === "BOOLEAN") {
      return false;
    }
    if (column.type === "NUMBER" || column.type === "INTEGER") {
      return 0;
    }
    return "待补充";
  }

  return null;
}

function buildAttributeBindings(
  wideTable: WideTable,
  existingRecords: WideTableRecord[],
  attributeColumns: ColumnDefinition[],
): Map<string, Record<string, unknown>> {
  const bindings = new Map<string, Record<string, unknown>>();

  for (const record of existingRecords) {
    if (record.wideTableId !== wideTable.id) {
      continue;
    }

    const bindingKey = getWideTableDimensionBindingKey(wideTable, record);
    if (bindings.has(bindingKey)) {
      continue;
    }

    bindings.set(
      bindingKey,
      Object.fromEntries(attributeColumns.map((column) => [column.name, record[column.name] ?? defaultAttributeValue(column)])),
    );
  }

  return bindings;
}

function defaultAttributeValue(column: ColumnDefinition): string | number | boolean {
  if (column.type === "BOOLEAN") {
    return false;
  }

  if (column.type === "NUMBER" || column.type === "INTEGER") {
    return 0;
  }

  return "待补充";
}
