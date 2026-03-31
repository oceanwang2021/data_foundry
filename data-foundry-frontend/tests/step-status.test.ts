import { describe, expect, it } from "vitest";
import type { WideTable } from "@/lib/types";
import { deriveStepStatus } from "@/lib/step-status";

function makeWideTable(overrides: Partial<WideTable> = {}): WideTable {
  return {
    id: "wt_1",
    requirementId: "REQ-1",
    name: "测试宽表",
    description: "",
    schema: {
      columns: [
        {
          id: "dim_region",
          name: "region",
          type: "STRING",
          category: "dimension",
          description: "",
          required: true,
        },
        {
          id: "metric_sales",
          name: "sales",
          type: "NUMBER",
          category: "indicator",
          description: "",
          required: false,
        },
      ],
    },
    dimensionRanges: [{ dimensionName: "region", values: ["CN"] }],
    businessDateRange: {
      start: "2026-01-31",
      end: "2026-01-31",
      frequency: "monthly",
    },
    semanticTimeAxis: "business_date",
    collectionCoverageMode: "incremental_by_business_date",
    indicatorGroups: [
      {
        id: "ig_1",
        wideTableId: "wt_1",
        name: "指标组",
        indicatorColumns: ["sales"],
        priority: 1,
        description: "",
      },
    ],
    scheduleRule: {
      id: "rule_1",
      wideTableId: "wt_1",
      type: "periodic",
      businessDateOffsetDays: 1,
      description: "",
    },
    recordCount: 0,
    status: "draft",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("deriveStepStatus", () => {
  it("allows scope completion without indicator grouping after schema is ready", () => {
    const statuses = deriveStepStatus(makeWideTable({
      indicatorGroups: [],
    }));

    expect(statuses.A).toBe("completed");
    expect(statuses.B).toBe("pending");
    expect(statuses.C).toBe("completed");
  });

  it("keeps step D completed after reload when the confirmed preview is already persisted", () => {
    const statuses = deriveStepStatus(makeWideTable({
      status: "initialized",
      recordCount: 12,
      currentPlanVersion: undefined,
      currentPlanFingerprint: undefined,
    }));

    expect(statuses.D).toBe("completed");
  });

  it("keeps step D invalidated for local unsaved scope changes", () => {
    const statuses = deriveStepStatus(makeWideTable({
      status: "draft",
      recordCount: 12,
      currentPlanVersion: 2,
      currentPlanFingerprint: undefined,
    }));

    expect(statuses.D).toBe("invalidated");
  });
});
