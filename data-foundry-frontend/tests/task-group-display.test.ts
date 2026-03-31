import { describe, expect, it } from "vitest";

import type { ScheduleJob } from "@/lib/domain";
import type { ScheduleRule, TaskGroup, WideTableRecord } from "@/lib/types";
import {
  buildDisplayableFullSnapshotTaskGroupPages,
  buildFullSnapshotTaskGroupPages,
  describeFullSnapshotScheduleRule,
  filterFullSnapshotScopedRows,
} from "@/lib/task-group-display";

function buildTaskGroup(id: string, createdAt: string, partitionLabel = "全量快照"): TaskGroup {
  return {
    id,
    wideTableId: "wt_ops",
    businessDate: "",
    businessDateLabel: "当前快照",
    partitionType: "full_table",
    partitionKey: "full_table",
    partitionLabel,
    status: "completed",
    totalTasks: 4,
    completedTasks: 4,
    failedTasks: 0,
    triggeredBy: "schedule",
    createdAt,
    updatedAt: createdAt,
  };
}

function buildScheduleJob(taskGroupId: string, startedAt: string): ScheduleJob {
  return {
    id: `run_${taskGroupId}`,
    taskGroupId,
    wideTableId: "wt_ops",
    triggerType: "cron",
    status: "completed",
    startedAt,
    endedAt: startedAt,
    operator: "system",
  };
}

function buildRecord(id: number, scopeKey: string): WideTableRecord & { businessDate: string } {
  return {
    id,
    wideTableId: "wt_ops",
    businessDate: scopeKey,
    ROW_ID: id,
  };
}

describe("task-group display helpers", () => {
  it("describes full-snapshot scheduling as period plus offset days", () => {
    const rule: ScheduleRule = {
      id: "sr_ops",
      wideTableId: "wt_ops",
      type: "periodic",
      periodLabel: "monthly",
      businessDateOffsetDays: 2,
      description: "",
    };

    expect(describeFullSnapshotScheduleRule(rule)).toBe("月频结束后 +2 天触发 1 个全量快照任务组");
  });

  it("orders full-snapshot pages by task-group start time", () => {
    const pages = buildFullSnapshotTaskGroupPages(
      [
        buildTaskGroup("tg_old", "2026-03-01T10:00:00Z"),
        buildTaskGroup("tg_new", "2026-03-02T10:00:00Z"),
      ],
      [
        buildScheduleJob("tg_old", "2026-03-03T09:00:00Z"),
        buildScheduleJob("tg_new", "2026-03-04T09:00:00Z"),
      ],
    );

    expect(pages.map((page) => page.taskGroupId)).toEqual(["tg_new", "tg_old"]);
    expect(pages[0]?.pageLabel).toBe("2026-03-04 09:00");
  });

  it("keeps only the latest page for each full-snapshot task group when rerun multiple times", () => {
    const pages = buildFullSnapshotTaskGroupPages(
      [
        buildTaskGroup("tg_snapshot", "2026-03-02T10:00:00Z"),
      ],
      [
        buildScheduleJob("tg_snapshot", "2026-03-04T09:00:00Z"),
        buildScheduleJob("tg_snapshot", "2026-03-04T09:05:00Z"),
        buildScheduleJob("tg_snapshot", "2026-03-04T09:10:00Z"),
      ],
    );

    expect(pages).toHaveLength(1);
    expect(pages[0]?.taskGroupId).toBe("tg_snapshot");
    expect(pages[0]?.pageLabel).toBe("2026-03-04 09:10");
  });

  it("keeps only the latest fallback page when multiple full snapshots have no row snapshots", () => {
    const pages = buildDisplayableFullSnapshotTaskGroupPages(
      [
        buildTaskGroup("tg_old", "2026-03-01T10:00:00Z"),
        buildTaskGroup("tg_new", "2026-03-02T10:00:00Z"),
      ],
      [
        buildScheduleJob("tg_old", "2026-03-03T09:00:00Z"),
        buildScheduleJob("tg_new", "2026-03-04T09:00:00Z"),
      ],
    );

    expect(pages.map((page) => page.taskGroupId)).toEqual(["tg_new"]);
  });

  it("filters full-snapshot rows by the selected task group scope", () => {
    const rows = [
      buildRecord(1, "tg_new"),
      buildRecord(2, "tg_old"),
      buildRecord(3, "tg_new"),
    ];

    expect(filterFullSnapshotScopedRows(rows, "tg_new").map((row) => row.id)).toEqual([1, 3]);
  });

  it("disambiguates duplicate snapshot start labels with the snapshot hint", () => {
    const pages = buildFullSnapshotTaskGroupPages(
      [
        buildTaskGroup("tg_old", "2026-03-13T13:56:00Z", "2026-03-13"),
        buildTaskGroup("tg_new", "2026-03-27T13:56:00Z", "2026-03-27"),
      ],
      [
        buildScheduleJob("tg_old", "2026-03-27T13:56:31Z"),
        buildScheduleJob("tg_new", "2026-03-27T13:56:46Z"),
      ],
    );

    expect(pages.map((page) => page.pageLabel)).toEqual([
      "2026-03-27 13:56 · 2026-03-27",
      "2026-03-27 13:56 · 2026-03-13",
    ]);
  });
});
