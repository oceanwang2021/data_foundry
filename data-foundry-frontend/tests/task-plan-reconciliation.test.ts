import { describe, expect, it } from "vitest";

import { resolveCurrentPlanVersion } from "@/lib/task-plan-reconciliation";
import type { TaskGroup, WideTable, WideTableRecord } from "@/lib/types";

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
          description: "行主键",
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
    dimensionRanges: [],
    businessDateRange: {
      start: "2025-11-30",
      end: "2026-03-31",
      frequency: "monthly",
    },
    semanticTimeAxis: "business_date",
    collectionCoverageMode: "incremental_by_business_date",
    indicatorGroups: [],
    recordCount: 10,
    status: "initialized",
    createdAt: "2026-03-26T00:00:00Z",
    updatedAt: "2026-03-26T00:00:00Z",
  };
}

function buildRecord(id: number, planVersion: number, businessDate: string): WideTableRecord {
  return {
    id,
    wideTableId: "WT-AD-SAFE",
    ROW_ID: id,
    biz_date: businessDate,
    BIZ_DATE: businessDate,
    _metadata: {
      planVersion,
    },
  };
}

function buildTaskGroup(id: string, planVersion: number, businessDate: string): TaskGroup {
  return {
    id,
    wideTableId: "WT-AD-SAFE",
    businessDate,
    businessDateLabel: businessDate,
    planVersion,
    status: "completed",
    totalTasks: 4,
    completedTasks: 4,
    failedTasks: 0,
    triggeredBy: "backfill",
    createdAt: "2026-03-26T00:00:00Z",
    updatedAt: "2026-03-26T00:00:00Z",
  };
}

describe("resolveCurrentPlanVersion", () => {
  it("prefers the latest row plan version when task groups are stale", () => {
    const wideTable = buildWideTable();
    const records = [
      buildRecord(1, 1, "2025-01-31"),
      buildRecord(2, 3, "2025-12-31"),
      buildRecord(3, 3, "2026-01-31"),
    ];
    const taskGroups = [
      buildTaskGroup("TG-WT-AD-SAFE-202501", 1, "2025-01-31"),
    ];

    expect(resolveCurrentPlanVersion(wideTable, records, taskGroups)).toBe(3);
  });
});
