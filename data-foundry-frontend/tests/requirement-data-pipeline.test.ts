import { describe, expect, it } from "vitest";

import {
  buildWideTableProcessingDiffRowMap,
  buildWideTableProcessingRows,
} from "@/lib/requirement-data-pipeline";
import type { WideTable, WideTableRecord } from "@/lib/types";

function buildWideTable(): WideTable {
  return {
    id: "WT-AD-OPS",
    requirementId: "REQ-2026-001",
    name: "ads_autodrive_ops",
    description: "自动驾驶运营快照",
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
          chineseName: "运营商",
          type: "STRING",
          category: "dimension",
          description: "运营商",
          required: true,
        },
        {
          id: "COL_ORDER_VOLUME",
          name: "order_volume",
          chineseName: "订单量",
          type: "NUMBER",
          category: "indicator",
          description: "订单量",
          required: false,
          unit: "单",
        },
      ],
    },
    dimensionRanges: [{ dimensionName: "company", values: ["Waymo"] }],
    businessDateRange: {
      start: "2026-03-13",
      end: "2026-03-27",
      frequency: "monthly",
    },
    semanticTimeAxis: "none",
    collectionCoverageMode: "full_snapshot",
    indicatorGroups: [],
    recordCount: 1,
    status: "active",
    createdAt: "2026-03-27T00:00:00Z",
    updatedAt: "2026-03-27T00:00:00Z",
  };
}

function buildRecord(orderVolume: number): WideTableRecord {
  return {
    id: 1,
    wideTableId: "WT-AD-OPS",
    ROW_ID: 1,
    company: "Waymo",
    order_volume: orderVolume,
    _metadata: {
      planVersion: 1,
    },
  };
}

describe("buildWideTableProcessingDiffRowMap", () => {
  it("uses processed indicator values for previous snapshot diffs", () => {
    const wideTable = buildWideTable();
    const previousRecords = [buildRecord(12315)];

    const { rawRows } = buildWideTableProcessingRows(wideTable, previousRecords);
    expect(rawRows[0]?.values.order_volume).toBe("12,315");

    const previousRowMap = buildWideTableProcessingDiffRowMap(wideTable, previousRecords);
    expect(previousRowMap.get("company:Waymo")?.values.order_volume).toBe("12315");
  });
});
