import { describe, expect, it } from "vitest";

import type { WideTable } from "@/lib/types";
import {
  hasWideTableBusinessDateDimension,
  normalizeWideTableMode,
  resolveWideTableCollectionCoverageMode,
  resolveWideTableSemanticTimeAxis,
} from "@/lib/wide-table-mode";

function buildWideTable(columns: WideTable["schema"]["columns"]): WideTable {
  return {
    id: "wt_test",
    requirementId: "REQ-TEST",
    name: "TEST_TABLE",
    description: "",
    schema: { columns },
    dimensionRanges: [],
    businessDateRange: {
      start: "2026-01-31",
      end: "2026-03-31",
      frequency: "monthly",
    },
    semanticTimeAxis: "business_date",
    collectionCoverageMode: "full_snapshot",
    indicatorGroups: [],
    recordCount: 0,
    status: "draft",
    createdAt: "2026-03-24T00:00:00.000Z",
    updatedAt: "2026-03-24T00:00:00.000Z",
  };
}

describe("wide-table mode", () => {
  it("treats tables with a business-date dimension as incremental-by-date", () => {
    const wideTable = buildWideTable([
      { id: "row_id", name: "ROW_ID", type: "INTEGER", category: "id", description: "", required: true },
      { id: "biz_date", name: "biz_date", type: "DATE", category: "dimension", description: "", required: true, isBusinessDate: true },
      { id: "company", name: "company", type: "STRING", category: "dimension", description: "", required: true },
      { id: "metric", name: "metric", type: "NUMBER", category: "indicator", description: "", required: false, unit: "个" },
    ]);

    expect(hasWideTableBusinessDateDimension(wideTable)).toBe(true);
    expect(resolveWideTableSemanticTimeAxis(wideTable)).toBe("business_date");
    expect(resolveWideTableCollectionCoverageMode(wideTable)).toBe("incremental_by_business_date");

    const normalized = normalizeWideTableMode(wideTable);
    expect(normalized.semanticTimeAxis).toBe("business_date");
    expect(normalized.collectionCoverageMode).toBe("incremental_by_business_date");
  });

  it("treats tables without a business-date dimension as full snapshots", () => {
    const wideTable = buildWideTable([
      { id: "row_id", name: "ROW_ID", type: "INTEGER", category: "id", description: "", required: true },
      { id: "company", name: "company", type: "STRING", category: "dimension", description: "", required: true },
      { id: "metric", name: "metric", type: "NUMBER", category: "indicator", description: "", required: false, unit: "个" },
    ]);

    expect(hasWideTableBusinessDateDimension(wideTable)).toBe(false);
    expect(resolveWideTableSemanticTimeAxis(wideTable)).toBe("none");
    expect(resolveWideTableCollectionCoverageMode(wideTable)).toBe("full_snapshot");

    const normalized = normalizeWideTableMode(wideTable);
    expect(normalized.semanticTimeAxis).toBe("none");
    expect(normalized.collectionCoverageMode).toBe("full_snapshot");
  });
});
