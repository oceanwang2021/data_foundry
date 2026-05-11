import type { ColumnDefinition, WideTable } from "./types";

type WideTableModeSource = {
  schema: {
    columns: Array<Pick<ColumnDefinition, "category" | "isBusinessDate">>;
  };
  collectionCoverageMode?: WideTable["collectionCoverageMode"];
};

export function hasWideTableBusinessDateDimension(source: WideTableModeSource): boolean {
  return source.schema.columns.some(
    (column) => column.category === "dimension" && Boolean(column.isBusinessDate),
  );
}

export function resolveWideTableSemanticTimeAxis(
  source: WideTableModeSource,
): NonNullable<WideTable["semanticTimeAxis"]> {
  return hasWideTableBusinessDateDimension(source) ? "business_date" : "none";
}

export function resolveWideTableCollectionCoverageMode(
  source: WideTableModeSource,
): NonNullable<WideTable["collectionCoverageMode"]> {
  if (
    source.collectionCoverageMode === "incremental_by_business_date"
    || source.collectionCoverageMode === "full_snapshot"
  ) {
    return source.collectionCoverageMode;
  }
  return hasWideTableBusinessDateDimension(source)
    ? "incremental_by_business_date"
    : "full_snapshot";
}

export function normalizeWideTableMode<T extends WideTable>(wideTable: T): T {
  return {
    ...wideTable,
    semanticTimeAxis: resolveWideTableSemanticTimeAxis(wideTable),
    collectionCoverageMode: resolveWideTableCollectionCoverageMode(wideTable),
  };
}
