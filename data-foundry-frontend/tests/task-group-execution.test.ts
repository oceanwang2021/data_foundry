import { describe, expect, it } from "vitest";

import { buildTaskGroupExecutionSummary } from "@/lib/task-group-execution";
import type { FetchTask, FetchTaskStatus, TaskGroup } from "@/lib/types";

const now = "2026-06-02T10:00:00Z";

function buildTaskGroup(overrides: Partial<TaskGroup> = {}): TaskGroup {
  return {
    id: "tg_progress",
    wideTableId: "wt_progress",
    businessDate: "2024-12-31",
    businessDateLabel: "2024",
    status: "partial",
    totalTasks: 18,
    pendingTasks: 0,
    runningTasks: 0,
    completedTasks: 5,
    failedTasks: 0,
    cancelledTasks: 13,
    invalidatedTasks: 0,
    triggeredBy: "manual",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function buildFetchTask(id: string, status: FetchTaskStatus): FetchTask {
  return {
    id,
    taskGroupId: "tg_progress",
    wideTableId: "wt_progress",
    rowId: Number(id.replace("ft_", "")),
    indicatorGroupId: "ig_progress",
    indicatorGroupName: "Progress",
    status,
    executionRecords: [],
    createdAt: now,
    updatedAt: now,
  };
}

describe("buildTaskGroupExecutionSummary", () => {
  it("calculates progress from completed tasks only", () => {
    const summary = buildTaskGroupExecutionSummary(buildTaskGroup(), []);

    expect(summary.totalTasks).toBe(18);
    expect(summary.completedTasks).toBe(5);
    expect(summary.cancelledTasks).toBe(13);
    expect(summary.progressPercent).toBe(28);
  });

  it("does not count failed, cancelled, or invalidated tasks as completed progress", () => {
    const fetchTasks = [
      ...Array.from({ length: 5 }, (_, index) => buildFetchTask(`ft_${index + 1}`, "completed")),
      ...Array.from({ length: 4 }, (_, index) => buildFetchTask(`ft_${index + 6}`, "failed")),
      ...Array.from({ length: 5 }, (_, index) => buildFetchTask(`ft_${index + 10}`, "cancelled")),
      ...Array.from({ length: 4 }, (_, index) => buildFetchTask(`ft_${index + 15}`, "invalidated")),
    ];

    const summary = buildTaskGroupExecutionSummary(
      buildTaskGroup({
        completedTasks: 0,
        failedTasks: 0,
        cancelledTasks: 0,
        invalidatedTasks: 0,
      }),
      fetchTasks,
    );

    expect(summary.completedTasks).toBe(5);
    expect(summary.failedTasks).toBe(4);
    expect(summary.cancelledTasks).toBe(5);
    expect(summary.invalidatedTasks).toBe(4);
    expect(summary.progressPercent).toBe(28);
  });
});
