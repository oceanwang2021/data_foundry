import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildTaskGroupRunViews,
  buildTaskPlanView,
} from "@/components/requirement-tasks/utils/requirementTaskViews";
import type { Requirement, WideTable } from "@/lib/types";

function buildWideTable(overrides: Partial<WideTable> = {}): WideTable {
  return {
    id: "wt_future",
    requirementId: "req_future",
    name: "future_range",
    description: "",
    schema: {
      columns: [
        {
          id: "id",
          name: "id",
          type: "INTEGER",
          category: "id",
          description: "",
          required: true,
        },
        {
          id: "company",
          name: "company",
          type: "STRING",
          category: "dimension",
          description: "",
          required: true,
        },
        {
          id: "biz_date",
          name: "biz_date",
          type: "DATE",
          category: "dimension",
          description: "",
          required: true,
          isBusinessDate: true,
        },
        {
          id: "metric",
          name: "metric",
          type: "STRING",
          category: "indicator",
          description: "",
          required: true,
        },
      ],
    },
    dimensionRanges: [{ dimensionName: "company", values: ["XPeng"] }],
    parameterRows: [],
    businessDateRange: {
      start: "2026-06",
      end: "2026-12",
      frequency: "monthly",
    },
    semanticTimeAxis: "business_date",
    collectionCoverageMode: "incremental_by_business_date",
    indicatorGroups: [
      {
        id: "ig_metric",
        wideTableId: "wt_future",
        name: "metric group",
        indicatorColumns: ["metric"],
        priority: 1,
        description: "",
      },
    ],
    currentPlanVersion: 1,
    recordCount: 0,
    status: "active",
    createdAt: "2026-06-16T00:00:00.000Z",
    updatedAt: "2026-06-16T00:00:00.000Z",
    ...overrides,
  };
}

describe("requirement task views", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("limits visible future planned task groups to the nearest six periods", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-16T00:00:00.000Z"));

    const wideTable = buildWideTable();
    const taskPlan = buildTaskPlanView(wideTable);
    const views = buildTaskGroupRunViews(
      {} as Requirement,
      wideTable,
      taskPlan,
      [],
      new Map(),
      [],
    );

    expect(views.map((view) => view.businessDate)).toEqual([
      "2026-11",
      "2026-10",
      "2026-09",
      "2026-08",
      "2026-07",
      "2026-06",
    ]);
  });
});
