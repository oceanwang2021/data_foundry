import { describe, expect, it } from "vitest";

import { generateWideTablePreviewRecords } from "@/lib/wide-table-preview";
import type { WideTable, WideTableRecord } from "@/lib/types";

function buildWideTable(): WideTable {
  return {
    id: "WT-AD-SAFE",
    requirementId: "REQ-2026-004",
    name: "ads_autodrive_safety",
    description: "自动驾驶安全宽表",
    schema: {
      columns: [
        {
          id: "COL_ID",
          name: "id",
          chineseName: "行ID",
          type: "INTEGER",
          category: "id",
          description: "主键",
          required: true,
        },
        {
          id: "COL_COMPANY",
          name: "company",
          chineseName: "公司",
          type: "STRING",
          category: "dimension",
          description: "公司",
          required: true,
        },
        {
          id: "COL_CITY",
          name: "city",
          chineseName: "城市",
          type: "STRING",
          category: "dimension",
          description: "城市",
          required: true,
        },
        {
          id: "COL_BIZ_DATE",
          name: "biz_date",
          chineseName: "业务日期",
          type: "DATE",
          category: "dimension",
          description: "业务日期",
          required: true,
          isBusinessDate: true,
        },
      ],
    },
    dimensionRanges: [
      { dimensionName: "company", values: ["Waymo", "Pony.ai"] },
      { dimensionName: "city", values: ["旧金山"] },
    ],
    businessDateRange: {
      start: "2025-12-31",
      end: "2026-01-31",
      frequency: "monthly",
    },
    semanticTimeAxis: "business_date",
    collectionCoverageMode: "incremental_by_business_date",
    indicatorGroups: [],
    recordCount: 4,
    status: "initialized",
    createdAt: "2026-03-26T00:00:00Z",
    updatedAt: "2026-03-26T00:00:00Z",
  };
}

function buildRecord(
  rowId: number,
  businessDate: string,
  company: string,
): WideTableRecord {
  return {
    id: rowId,
    wideTableId: "WT-AD-SAFE",
    ROW_ID: rowId,
    company,
    city: "旧金山",
    biz_date: businessDate,
    BIZ_DATE: businessDate,
    _metadata: {
      planVersion: 1,
    },
  };
}

describe("generateWideTablePreviewRecords", () => {
  it("reuses matching row ids for existing business-date and dimension bindings", () => {
    const wideTable = buildWideTable();
    const existingRecords = [
      buildRecord(1, "2025-12-31", "Waymo"),
      buildRecord(2, "2025-12-31", "Pony.ai"),
      buildRecord(3, "2026-01-31", "Waymo"),
    ];

    const { records, totalCount } = generateWideTablePreviewRecords(wideTable, existingRecords, existingRecords);

    expect(totalCount).toBe(4);
    expect(records).toHaveLength(4);
    expect(
      records.map((record) => ({
        rowId: Number(record.ROW_ID ?? record.id),
        businessDate: String(record.biz_date),
        company: String(record.company),
      })),
    ).toEqual([
      { rowId: 1, businessDate: "2025-12-31", company: "Waymo" },
      { rowId: 2, businessDate: "2025-12-31", company: "Pony.ai" },
      { rowId: 3, businessDate: "2026-01-31", company: "Waymo" },
      { rowId: 4, businessDate: "2026-01-31", company: "Pony.ai" },
    ]);
  });
});
