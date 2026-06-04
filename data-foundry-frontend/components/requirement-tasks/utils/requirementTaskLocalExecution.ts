import type { FetchTask, TaskGroup, WideTable, WideTableRecord } from "@/lib/types";
import { getVisibleNarrowTableContextColumns } from "@/lib/fetch-task-views";
import { hasWideTableBusinessDateDimension } from "@/lib/wide-table-mode";
import { LOCAL_FETCH_TASK_PREFIX } from "@/lib/requirement-task-group-actions";
import type { HistoricalTaskGroupView } from "@/components/requirement-tasks/types";

export function applyTaskRecordCompletion(
  record: WideTableRecord,
  wideTable: WideTable,
  tasks: FetchTask[],
  completedAt: string,
): WideTableRecord {
  const rowId = Number(record.ROW_ID ?? record.id);
  const rowTasks = tasks.filter((task) => task.rowId === rowId);
  if (rowTasks.length === 0) {
    return record;
  }

  const indicatorGroupMap = new Map(
    wideTable.indicatorGroups.map((group) => [group.id, group.indicatorColumns]),
  );
  const nextRecord: WideTableRecord = {
    ...record,
    _metadata: {
      ...record._metadata,
      confidence: 0.88,
    },
  };

  for (const task of rowTasks) {
    const indicatorColumns = indicatorGroupMap.get(task.indicatorGroupId) ?? [];
    for (const columnName of indicatorColumns) {
      nextRecord[columnName] = buildLocalIndicatorValue(rowId, columnName);
    }
  }

  nextRecord.updated_at = completedAt;
  return nextRecord;
}

export function buildTaskGroupRunId(scheduleJobs: Array<{ id: string }>): string {
  const nextIndex = scheduleJobs.length + 1;
  return `RUN-MANUAL-${String(nextIndex).padStart(3, "0")}`;
}

export function buildExecutionRecordId(taskId: string, attempt: number, suffix: "manual" | "retry"): string {
  return `${taskId}_${suffix}_${String(attempt).padStart(2, "0")}`;
}

export function materializeLocalTaskGroupArtifacts(
  taskGroupView: HistoricalTaskGroupView,
  wideTable: WideTable,
  wideTableRecords: WideTableRecord[],
  fetchTasks: FetchTask[],
  timestamp: string,
): { taskGroup: TaskGroup; fetchTasks: FetchTask[] } | null {
  const existingTasks = fetchTasks.filter((task) => task.taskGroupId === taskGroupView.id);
  const scopedRecords = resolveLocalTaskGroupRecords(wideTable, wideTableRecords, taskGroupView.businessDate);
  const tasks = existingTasks.length > 0
    ? existingTasks
    : buildLocalFetchTasks(
        taskGroupView.id,
        wideTable,
        taskGroupView.planVersion ?? wideTable.currentPlanVersion ?? 1,
        scopedRecords,
        timestamp,
        taskGroupView.indicatorGroupId,
      );

  if (tasks.length === 0) {
    return null;
  }

  return {
    taskGroup: {
      ...taskGroupView.taskGroupForTasks,
      id: taskGroupView.id,
      wideTableId: wideTable.id,
      triggeredBy: "manual",
      totalTasks: tasks.length,
      completedTasks: 0,
      failedTasks: 0,
      rowSnapshots: scopedRecords,
      createdAt: taskGroupView.taskGroupForTasks.createdAt || timestamp,
      updatedAt: timestamp,
    },
    fetchTasks: tasks,
  };
}

export function resolveLocalTaskGroupRecords(
  wideTable: WideTable,
  wideTableRecords: WideTableRecord[],
  businessDate: string,
): WideTableRecord[] {
  if (!hasWideTableBusinessDateDimension(wideTable)) {
    return wideTableRecords.filter((record) => record.wideTableId === wideTable.id);
  }

  const businessDateFieldName = wideTable.schema.columns.find((column) => column.isBusinessDate)?.name ?? "BIZ_DATE";
  return wideTableRecords.filter(
    (record) =>
      record.wideTableId === wideTable.id
      && String(record[businessDateFieldName] ?? "") === businessDate,
  );
}

export function buildLocalFetchTasks(
  taskGroupId: string,
  wideTable: WideTable,
  planVersion: number,
  scopedRecords: WideTableRecord[],
  timestamp: string,
  indicatorGroupId?: string,
): FetchTask[] {
  const businessDateFieldName = wideTable.schema.columns.find((column) => column.isBusinessDate)?.name ?? "BIZ_DATE";
  const indicatorGroups = resolveRunnableIndicatorGroups(wideTable);
  const scopedIndicatorGroups = indicatorGroups.length > 1 && indicatorGroupId
    ? indicatorGroups.filter((group) => group.id === indicatorGroupId)
    : indicatorGroups;

  return scopedRecords.flatMap((record) => {
    const rowId = getWideTableRecordRowId(record);
    const businessDate = String(record[businessDateFieldName] ?? record.business_date ?? "");
    return scopedIndicatorGroups.map((indicatorGroup) => ({
      id: `${LOCAL_FETCH_TASK_PREFIX}${taskGroupId}_${indicatorGroup.id}_${rowId}`,
      taskGroupId,
      wideTableId: wideTable.id,
      rowId,
      planVersion,
      indicatorGroupId: indicatorGroup.id,
      indicatorGroupName: indicatorGroup.name,
      dimensionValues: Object.fromEntries(
        getVisibleNarrowTableContextColumns(wideTable)
          .filter((column) => !column.isBusinessDate)
          .map((column) => [column.name, String(record[column.name] ?? "")]),
      ),
      businessDate: businessDate || undefined,
      status: "pending" as const,
      executionRecords: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    }));
  });
}

export function resolveRunnableIndicatorGroups(wideTable: WideTable): Array<{
  id: string;
  name: string;
}> {
  if (wideTable.indicatorGroups.length > 0) {
    return [...wideTable.indicatorGroups]
      .sort((left, right) => left.priority - right.priority)
      .map((indicatorGroup) => ({
        id: indicatorGroup.id,
        name: indicatorGroup.name,
      }));
  }

  return [];
}

export function getWideTableRecordRowId(record: WideTableRecord): number {
  return Number(record.ROW_ID ?? record.id);
}

export function buildDemoExecutionSnapshot(tasks: FetchTask[]): {
  statusByTaskId: Map<string, FetchTask["status"]>;
  completedTasks: number;
  failedTasks: number;
  taskGroupStatus: TaskGroup["status"];
} {
  const demoStatuses = buildDemoStatusSequence(tasks.length);
  const statusByTaskId = new Map<string, FetchTask["status"]>();

  tasks.forEach((task, index) => {
    statusByTaskId.set(task.id, demoStatuses[index] ?? "pending");
  });

  return {
    statusByTaskId,
    completedTasks: demoStatuses.filter((status) => status === "completed").length,
    failedTasks: demoStatuses.filter((status) => status === "failed").length,
    taskGroupStatus: demoStatuses.includes("running")
      ? "running"
      : demoStatuses.includes("failed")
        ? "partial"
        : demoStatuses.includes("pending")
          ? "pending"
          : "completed",
  };
}

export function buildDemoStatusSequence(taskCount: number): FetchTask["status"][] {
  if (taskCount <= 0) {
    return [];
  }

  const seedStatuses: FetchTask["status"][] = ["completed", "running", "failed", "pending", "invalidated"];
  const statuses = seedStatuses.slice(0, Math.min(seedStatuses.length, taskCount));
  while (statuses.length < taskCount) {
    statuses.push(statuses.length % 2 === 0 ? "completed" : "pending");
  }
  return statuses;
}

export function buildDemoExecutionRecords(
  task: FetchTask,
  status: FetchTask["status"],
  runId: string,
  startedAt: string,
): FetchTask["executionRecords"] {
  const attempt = task.executionRecords.length + 1;
  if (status === "pending" || status === "invalidated") {
    return task.executionRecords;
  }

  return [
    ...task.executionRecords,
    {
      id: buildExecutionRecordId(task.id, attempt, "manual"),
      fetchTaskId: task.id,
      attempt,
      status: status === "completed" ? "success" : status === "failed" ? "failure" : "running",
      triggeredBy: "manual",
      taskGroupRunId: runId,
      errorMessage: status === "failed" ? "示例任务执行失败，等待人工处理。" : undefined,
      startedAt,
      endedAt: status === "completed" || status === "failed" ? startedAt : undefined,
    },
  ];
}

function buildLocalIndicatorValue(rowId: number, columnName: string): number {
  let hash = rowId * 97;
  for (const char of columnName) {
    hash = (hash * 31 + char.charCodeAt(0)) % 100000;
  }
  return Number(((hash % 9000) / 10 + 10).toFixed(1));
}
