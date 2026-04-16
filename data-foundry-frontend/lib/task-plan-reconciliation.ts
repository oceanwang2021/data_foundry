import { formatBusinessDate, formatBusinessDateLabel } from "@/lib/business-date";
import type { FetchTask, Requirement, TaskGroup, WideTable, WideTableRecord } from "@/lib/types";
import { getWideTableDimensionBindingKey } from "@/lib/wide-table-preview";
import { hasWideTableBusinessDateDimension } from "@/lib/wide-table-mode";

type IndicatorGroupLike = {
  id: string;
  name: string;
  indicatorColumns: string[];
  priority: number;
};

export type TaskPlanReconcileResult = {
  nextPlanVersion: number;
  nextPlanFingerprint: string;
  structuralChange: boolean;
  taskGroups: TaskGroup[];
  fetchTasks: FetchTask[];
  generatedTaskGroupCount: number;
  generatedTaskCount: number;
  invalidatedTaskGroupCount: number;
};

function resolveIndicatorGroupsForTaskGroup(
  taskGroup: Pick<TaskGroup, "partitionKey">,
  indicatorGroups: IndicatorGroupLike[],
): IndicatorGroupLike[] {
  if (indicatorGroups.length <= 1) {
    return indicatorGroups;
  }
  const key = taskGroup.partitionKey ?? "";
  const matched = indicatorGroups.find((group) => group.id === key);
  return matched ? [matched] : indicatorGroups;
}

export function reconcileTaskPlanChange(params: {
  requirement: Requirement;
  wideTable: WideTable;
  previousRecords: WideTableRecord[];
  nextRecords: WideTableRecord[];
  taskGroups: TaskGroup[];
  fetchTasks: FetchTask[];
  now?: Date;
}): TaskPlanReconcileResult {
  const { requirement, wideTable, previousRecords, nextRecords, now = new Date() } = params;
  const currentPlanVersion = resolveCurrentPlanVersion(wideTable, previousRecords, params.taskGroups);
  const previousFingerprint = wideTable.currentPlanFingerprint ?? buildTaskPlanFingerprint(wideTable, previousRecords);
  const nextPlanFingerprint = buildTaskPlanFingerprint(wideTable, nextRecords);
  const nextRecordsByDate = groupRecordsByBusinessDate(wideTable, nextRecords);
  const scopedTaskGroups = params.taskGroups.filter((taskGroup) => taskGroup.wideTableId === wideTable.id);
  const scopedFetchTasks = params.fetchTasks.filter((task) => task.wideTableId === wideTable.id);
  const currentRevisionTaskGroups = scopedTaskGroups.filter(
    (taskGroup) => resolveTaskGroupPlanVersion(taskGroup, currentPlanVersion) === currentPlanVersion,
  );
  const hasCurrentRevisionPlan = previousRecords.length > 0 || currentRevisionTaskGroups.length > 0 || Boolean(wideTable.currentPlanFingerprint);
  const nextPlanVersion = hasCurrentRevisionPlan && previousFingerprint !== nextPlanFingerprint
    ? Math.max(currentPlanVersion, 1) + 1
    : Math.max(currentPlanVersion, 1);
  const nextIndicatorGroups = resolveIndicatorGroups(wideTable);
  const indicatorGroupingEnabled = nextIndicatorGroups.length > 1;
  const needsLifecycleRebuild = shouldRebuildCurrentPlanForRequirementLifecycle({
    requirement,
    wideTable,
    nextRecordsByDate,
    currentRevisionTaskGroups,
    now,
  });

  if (
    hasCurrentRevisionPlan
    && previousFingerprint === nextPlanFingerprint
    && currentRevisionTaskGroups.length > 0
    && !needsLifecycleRebuild
  ) {
    return {
      nextPlanVersion,
      nextPlanFingerprint,
      structuralChange: false,
      taskGroups: scopedTaskGroups,
      fetchTasks: scopedFetchTasks,
      generatedTaskGroupCount: 0,
      generatedTaskCount: 0,
      invalidatedTaskGroupCount: 0,
    };
  }

  const nextTaskGroups = Array.from(nextRecordsByDate.entries())
    .sort(([left], [right]) => right.localeCompare(left))
    .flatMap(([businessDate, records]) => {
      const rowSnapshots = records.map((record) => annotateRecordSnapshot(record, nextPlanVersion, "baseline"));
      const indicatorGroupsToBuild = indicatorGroupingEnabled
        ? nextIndicatorGroups
        : nextIndicatorGroups.length > 0
          ? [nextIndicatorGroups[0]]
          : [];
      if (indicatorGroupsToBuild.length === 0) {
        return [];
      }
      return indicatorGroupsToBuild.map((indicatorGroup) =>
        buildTaskGroup({
          requirement,
          wideTable,
          businessDate,
          planVersion: nextPlanVersion,
          rowSnapshots,
          indicatorGroup,
          indicatorGroupingEnabled,
          now,
        }),
      );
    });
  const nextTaskGroupIds = new Set(nextTaskGroups.map((taskGroup) => taskGroup.id));
  // Lazy task generation:
  // - Only persist task groups (task instances) when the plan is rebuilt.
  // - Fetch tasks (sub-task instances) are generated on demand when a task group is opened/executed.
  const nextFetchTasks: FetchTask[] = [];
  const generatedTaskCount = nextTaskGroups.reduce((sum, taskGroup) => sum + (taskGroup.totalTasks ?? 0), 0);

  return {
    nextPlanVersion,
    nextPlanFingerprint,
    structuralChange: true,
    taskGroups: [
      ...scopedTaskGroups.filter(
        (taskGroup) => resolveTaskGroupPlanVersion(taskGroup, nextPlanVersion) !== nextPlanVersion || !nextTaskGroupIds.has(taskGroup.id),
      ),
      ...nextTaskGroups,
    ],
    fetchTasks: [
      ...scopedFetchTasks.filter((task) => resolveFetchTaskPlanVersion(task, nextPlanVersion) !== nextPlanVersion),
      ...nextFetchTasks,
    ],
    generatedTaskGroupCount: nextTaskGroups.length,
    generatedTaskCount,
    invalidatedTaskGroupCount: currentRevisionTaskGroups.length,
  };
}

export function annotateCurrentPlanRecords(
  records: WideTableRecord[],
  planVersion: number,
): WideTableRecord[] {
  return records.map((record) => annotateRecordSnapshot(record, planVersion, "baseline"));
}

export function resolveCurrentPlanVersion(
  wideTable: WideTable,
  records: WideTableRecord[],
  taskGroups: TaskGroup[],
): number {
  if (wideTable.currentPlanVersion != null) {
    return wideTable.currentPlanVersion;
  }

  const scopedTaskGroups = taskGroups.filter((taskGroup) => taskGroup.wideTableId === wideTable.id);
  const derivedVersion = Math.max(
    0,
    ...scopedTaskGroups.map((taskGroup) => resolveTaskGroupPlanVersion(taskGroup, 0)),
    ...records.map((record) => resolveRecordPlanVersion(record, 0)),
  );

  if (derivedVersion > 0) {
    return derivedVersion;
  }

  return records.length > 0 || wideTable.recordCount > 0 ? 1 : 0;
}

export function resolveRecordPlanVersion(record: WideTableRecord, fallbackPlanVersion = 1): number {
  return record._metadata?.planVersion ?? fallbackPlanVersion;
}

export function resolveTaskGroupPlanVersion(taskGroup: TaskGroup, fallbackPlanVersion = 1): number {
  return taskGroup.planVersion ?? fallbackPlanVersion;
}

export function resolveFetchTaskPlanVersion(task: FetchTask, fallbackPlanVersion = 1): number {
  return task.planVersion ?? fallbackPlanVersion;
}

export function buildTaskPlanFingerprint(
  wideTable: WideTable,
  records: WideTableRecord[],
): string {
  const schemaSignature = wideTable.schema.columns.map((column) => ({
    id: column.id,
    name: column.name,
    chineseName: column.chineseName ?? "",
    type: column.type,
    category: column.category,
    description: column.description,
    unit: column.unit ?? "",
    required: column.required,
    isBusinessDate: Boolean(column.isBusinessDate),
  }));
  const indicatorGroups = resolveIndicatorGroups(wideTable)
    .map((group) => `${group.name}:${[...group.indicatorColumns].sort().join(",")}`)
    .join("|");
  const recordsByDate = groupRecordsByBusinessDate(wideTable, records);
  const rows = Array.from(recordsByDate.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([businessDate, rowRecords]) => ({
      businessDate,
      keys: rowRecords
        .map((record) => buildRecordBindingKey(wideTable, record))
        .sort(),
    }));

  return JSON.stringify({
    schemaSignature,
    indicatorGroups,
    rows,
  });
}

function groupRecordsByBusinessDate(
  wideTable: WideTable,
  records: WideTableRecord[],
): Map<string, WideTableRecord[]> {
  if (!hasWideTableBusinessDateDimension(wideTable)) {
    const scopedRecords = records.filter((record) => record.wideTableId === wideTable.id);
    return scopedRecords.length > 0
      ? new Map([[FULL_TABLE_PARTITION_KEY, scopedRecords]])
      : new Map();
  }

  const businessDateFieldName = resolveBusinessDateFieldName(wideTable);
  const groupedRecords = new Map<string, WideTableRecord[]>();

  for (const record of records) {
    if (record.wideTableId !== wideTable.id) {
      continue;
    }

    const businessDate = String(record[businessDateFieldName] ?? "");
    if (!businessDate) {
      continue;
    }

    const scopedRecords = groupedRecords.get(businessDate) ?? [];
    scopedRecords.push(record);
    groupedRecords.set(businessDate, scopedRecords);
  }

  return groupedRecords;
}

function shouldRebuildCurrentPlanForRequirementLifecycle(params: {
  requirement: Requirement;
  wideTable: WideTable;
  nextRecordsByDate: Map<string, WideTableRecord[]>;
  currentRevisionTaskGroups: TaskGroup[];
  now: Date;
}): boolean {
  const { wideTable, nextRecordsByDate, currentRevisionTaskGroups, now } = params;
  if (
    currentRevisionTaskGroups.length === 0
    || !hasWideTableBusinessDateDimension(wideTable)
  ) {
    return false;
  }

  const today = formatBusinessDate(now);
  const expectedHistoricalDates = Array.from(nextRecordsByDate.keys())
    .filter((businessDate) => businessDate <= today)
    .sort((left, right) => left.localeCompare(right));
  const currentHistoricalDates = Array.from(
    new Set(
      currentRevisionTaskGroups
        .map((taskGroup) => taskGroup.businessDate)
        .filter((businessDate) => businessDate <= today),
    ),
  ).sort((left, right) => left.localeCompare(right));

  if (expectedHistoricalDates.length !== currentHistoricalDates.length) {
    return true;
  }

  if (expectedHistoricalDates.some((businessDate, index) => businessDate !== currentHistoricalDates[index])) {
    return true;
  }

  return currentRevisionTaskGroups.some((taskGroup) => {
    if (taskGroup.businessDate > today) {
      return false;
    }
    return taskGroup.triggeredBy !== "backfill";
  });
}

function resolveIndicatorGroups(wideTable: WideTable): IndicatorGroupLike[] {
  if (wideTable.indicatorGroups.length > 0) {
    return [...wideTable.indicatorGroups]
      .sort((left, right) => left.priority - right.priority)
      .map((group) => ({
        id: group.id,
        name: group.name,
        indicatorColumns: [...group.indicatorColumns],
        priority: group.priority,
      }));
  }

  return [];
}

function buildTaskGroup(params: {
  requirement: Requirement;
  wideTable: WideTable;
  businessDate: string;
  planVersion: number;
  rowSnapshots: WideTableRecord[];
  indicatorGroup: IndicatorGroupLike;
  indicatorGroupingEnabled: boolean;
  now: Date;
}): TaskGroup {
  const { wideTable, businessDate, planVersion, rowSnapshots, indicatorGroup, indicatorGroupingEnabled, now } = params;
  const timestamp = now.toISOString();
  const totalTasks = rowSnapshots.length;
  const isFullTablePartition = !hasWideTableBusinessDateDimension(wideTable);
  if (isFullTablePartition) {
    const triggeredBy = "schedule";
    return {
      id: indicatorGroupingEnabled
        ? `tg_${wideTable.id}_snapshot_${indicatorGroup.id}_r${planVersion}`
        : `tg_${wideTable.id}_snapshot_r${planVersion}`,
      wideTableId: wideTable.id,
      businessDate: "",
      businessDateLabel: "当前快照",
      batchId: undefined,
      partitionType: "full_table",
      partitionKey: indicatorGroup.id,
      partitionLabel: indicatorGroup.name,
      planVersion,
      groupKind: "baseline",
      coverageStatus: "current",
      rowSnapshots,
      status: "pending",
      totalTasks,
      completedTasks: 0,
      failedTasks: 0,
      triggeredBy,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }
  const today = formatBusinessDate(now);
  const historical = businessDate <= today;
  const triggeredBy = historical ? "backfill" : "schedule";

  return {
    id: indicatorGroupingEnabled
      ? `tg_${wideTable.id}_${businessDate.replace(/-/g, "")}_${indicatorGroup.id}_r${planVersion}`
      : `tg_${wideTable.id}_${businessDate.replace(/-/g, "")}_r${planVersion}`,
    wideTableId: wideTable.id,
    businessDate,
    businessDateLabel: formatBusinessDateLabel(businessDate, wideTable.businessDateRange.frequency),
    planVersion,
    groupKind: "baseline",
    coverageStatus: "current",
    rowSnapshots,
    status: "pending",
    totalTasks,
    completedTasks: 0,
    failedTasks: 0,
    triggeredBy,
    partitionType: "business_date",
    partitionKey: indicatorGroup.id,
    partitionLabel: indicatorGroup.name,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function buildExplicitFetchTasks(
  taskGroup: TaskGroup,
  wideTable: WideTable,
  indicatorGroups: IndicatorGroupLike[],
): FetchTask[] {
  const rowSnapshots = taskGroup.rowSnapshots ?? [];

  return rowSnapshots.flatMap((record) => {
    const rowId = Number(record.ROW_ID ?? record.id);
    return indicatorGroups.map((indicatorGroup) => ({
      id: `ft_${taskGroup.id}_${indicatorGroup.id}_${rowId}`,
      taskGroupId: taskGroup.id,
      wideTableId: wideTable.id,
      rowId,
      planVersion: taskGroup.planVersion,
      rowBindingKey: buildRecordBindingKey(wideTable, record),
      indicatorGroupId: indicatorGroup.id,
      indicatorGroupName: indicatorGroup.name,
      status: "pending" as const,
      executionRecords: [],
      createdAt: taskGroup.createdAt,
      updatedAt: taskGroup.updatedAt,
    }));
  });
}

function annotateRecordSnapshot(
  record: WideTableRecord,
  planVersion: number,
  snapshotKind: "baseline" | "delta",
): WideTableRecord {
  return {
    ...record,
    _metadata: {
      ...record._metadata,
      planVersion,
      snapshotKind,
    },
  };
}

function resolveBusinessDateFieldName(wideTable: WideTable): string {
  return wideTable.schema.columns.find((column) => column.isBusinessDate)?.name ?? "BIZ_DATE";
}

function buildRecordBindingKey(
  wideTable: WideTable,
  record: WideTableRecord,
): string {
  if (!hasWideTableBusinessDateDimension(wideTable)) {
    return getWideTableDimensionBindingKey(wideTable, record);
  }
  const businessDateFieldName = resolveBusinessDateFieldName(wideTable);
  return `${String(record[businessDateFieldName] ?? "")}::${getWideTableDimensionBindingKey(wideTable, record)}`;
}

const FULL_TABLE_PARTITION_KEY = "full_table";
