import type { FetchTask, TaskGroup, TaskGroupStatus } from "@/lib/types";

export type TaskGroupExecutionSummary = {
  status: TaskGroupStatus;
  totalTasks: number;
  pendingTasks: number;
  runningTasks: number;
  completedTasks: number;
  failedTasks: number;
  invalidatedTasks: number;
  progressPercent: number;
  lastUpdatedAt: string;
};

export function buildTaskGroupExecutionSummary(
  taskGroup: TaskGroup,
  fetchTasks: FetchTask[],
): TaskGroupExecutionSummary {
  const scopedTasks = fetchTasks.filter((task) => task.taskGroupId === taskGroup.id);
  const totalTasks = Math.max(taskGroup.totalTasks, scopedTasks.length);
  const explicitCompletedTasks = scopedTasks.filter((task) => task.status === "completed").length;
  const explicitFailedTasks = scopedTasks.filter((task) => task.status === "failed").length;
  const invalidatedTasks = scopedTasks.filter((task) => task.status === "invalidated").length;
  const completedTasks = Math.max(
    explicitCompletedTasks,
    clamp(taskGroup.completedTasks, 0, totalTasks),
  );
  const failedTasks = Math.max(
    explicitFailedTasks,
    clamp(taskGroup.failedTasks, 0, Math.max(totalTasks - completedTasks, 0)),
  );
  const runningTasks = Math.max(
    scopedTasks.filter((task) => task.status === "running").length,
    resolveFallbackRunningTasks(taskGroup.status, totalTasks, completedTasks, failedTasks, invalidatedTasks),
  );
  const pendingTasks = Math.max(totalTasks - completedTasks - failedTasks - invalidatedTasks - runningTasks, 0);
  const status = resolveTaskGroupStatus(taskGroup.status, {
    totalTasks,
    pendingTasks,
    runningTasks,
    completedTasks,
    failedTasks,
    invalidatedTasks,
  });
  const progressPercent = totalTasks > 0
    ? Math.round(((completedTasks + failedTasks + invalidatedTasks) / totalTasks) * 100)
    : 0;
  const lastUpdatedAt = scopedTasks.reduce(
    (latest, task) => (task.updatedAt > latest ? task.updatedAt : latest),
    taskGroup.updatedAt,
  );

  return {
    status,
    totalTasks,
    pendingTasks,
    runningTasks,
    completedTasks,
    failedTasks,
    invalidatedTasks,
    progressPercent,
    lastUpdatedAt,
  };
}

export function buildTaskGroupExecutionSummaryMap(
  taskGroups: TaskGroup[],
  fetchTasks: FetchTask[],
): Map<string, TaskGroupExecutionSummary> {
  return new Map(
    taskGroups.map((taskGroup) => [
      taskGroup.id,
      buildTaskGroupExecutionSummary(taskGroup, fetchTasks),
    ]),
  );
}

function resolveFallbackRunningTasks(
  status: TaskGroupStatus,
  totalTasks: number,
  completedTasks: number,
  failedTasks: number,
  invalidatedTasks: number,
): number {
  if (status !== "running") {
    return 0;
  }

  const remainingTasks = totalTasks - completedTasks - failedTasks - invalidatedTasks;
  return remainingTasks > 0 ? 1 : 0;
}

function resolveTaskGroupStatus(
  fallbackStatus: TaskGroupStatus,
  counts: Omit<TaskGroupExecutionSummary, "status" | "progressPercent" | "lastUpdatedAt">,
): TaskGroupStatus {
  if (fallbackStatus === "invalidated") {
    return "invalidated";
  }

  if (counts.runningTasks > 0) {
    return "running";
  }

  if (counts.failedTasks > 0 && counts.pendingTasks === 0) {
    // All tasks failed: show as failed; mixed results still treated as partial.
    if (counts.completedTasks === 0 && counts.invalidatedTasks === 0) {
      return "failed";
    }
    return "partial";
  }

  if ((counts.completedTasks > 0) && counts.pendingTasks > 0) {
    return "running";
  }

  if (counts.pendingTasks > 0) {
    return "pending";
  }

  return "completed";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
