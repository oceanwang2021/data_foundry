import type { FetchTask, Project, Requirement, TaskGroup, TaskGroupStatus, WideTable } from "@/lib/types";

const COLLECTION_TASK_DEFAULT_KEY = "__default__";
const COLLECTION_TASK_DEFAULT_LABEL = "统一提示词";

const FREQUENCY_LABELS: Record<string, string> = {
  daily: "日频",
  weekly: "周频",
  monthly: "月频",
  quarterly: "季频",
  yearly: "年频",
};

export type CollectionTaskListRowView = {
  key: string;
  collectionTaskKey: string;
  collectionTaskLabel: string;
  requirementId: string;
  requirementTitle: string;
  projectId: string;
  projectName: string;
  wideTableId: string;
  wideTableName: string;
  scheduleLabel: string;
  indicatorNames: string[];
  indicatorCount: number;
  indicatorSummary: string;
  taskGroups: TaskGroup[];
  taskGroupCount: number;
  fetchTaskCount: number;
  aggregateStatus: keyof typeof STATUS_LABELS;
  statusSummary: string;
  lastUpdatedAt: string;
  totalTasks: number;
};

const STATUS_LABELS = {
  pending: "待执行",
  running: "执行中",
  completed: "已完成",
  failed: "失败",
  invalidated: "已失效",
} as const;

export function resolveCollectionTaskKey(taskGroup: TaskGroup): string {
  return taskGroup.partitionKey ?? COLLECTION_TASK_DEFAULT_KEY;
}

export function normalizeCollectionTaskLabel(label?: string | null): string {
  const normalized = String(label ?? "").trim();
  if (!normalized || normalized === COLLECTION_TASK_DEFAULT_KEY) {
    return COLLECTION_TASK_DEFAULT_LABEL;
  }
  return normalized;
}

export function resolveCollectionTaskLabel(taskGroup: TaskGroup): string {
  return normalizeCollectionTaskLabel(taskGroup.partitionLabel ?? taskGroup.partitionKey ?? COLLECTION_TASK_DEFAULT_LABEL);
}

export function formatIndicatorSummary(indicatorNames: string[], previewCount = 3): string {
  if (indicatorNames.length === 0) {
    return "未配置指标";
  }

  const preview = indicatorNames.slice(0, previewCount);
  if (indicatorNames.length <= previewCount) {
    return `${indicatorNames.length} 个指标｜${preview.join("、")}`;
  }

  return `${indicatorNames.length} 个指标｜${preview.join("、")} 等`;
}

export function formatCollectionTaskDisplaySummary(
  label: string | undefined | null,
  indicatorNames: string[],
  previewCount = 3,
): string {
  return `${normalizeCollectionTaskLabel(label)}｜${formatIndicatorSummary(indicatorNames, previewCount)}`;
}

export function formatCollectionTaskDateTime(value?: string): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return "-";
  }

  const compact = normalized.replace("T", " ").replace("Z", "");
  return compact.length >= 16 ? compact.slice(0, 16) : compact;
}

export function getCollectionTaskStatusLabel(status: keyof typeof STATUS_LABELS): string {
  return STATUS_LABELS[status] ?? status;
}

export function buildCollectionTaskListRows(params: {
  projects: Project[];
  requirements: Requirement[];
  wideTables: WideTable[];
  taskGroups: TaskGroup[];
  fetchTasks: FetchTask[];
}): CollectionTaskListRowView[] {
  const { projects, requirements, wideTables, taskGroups, fetchTasks } = params;
  const projectById = new Map(projects.map((project) => [project.id, project] as const));
  const requirementById = new Map(requirements.map((requirement) => [requirement.id, requirement] as const));
  const wideTableById = new Map(wideTables.map((wideTable) => [wideTable.id, wideTable] as const));
  const fetchTasksByTaskGroupId = new Map<string, FetchTask[]>();

  for (const fetchTask of fetchTasks) {
    const scopedTasks = fetchTasksByTaskGroupId.get(fetchTask.taskGroupId) ?? [];
    scopedTasks.push(fetchTask);
    fetchTasksByTaskGroupId.set(fetchTask.taskGroupId, scopedTasks);
  }

  const groupedRows = new Map<string, {
    key: string;
    collectionTaskKey: string;
    collectionTaskLabel: string;
    requirement: Requirement;
    project?: Project;
    wideTable: WideTable;
    taskGroups: TaskGroup[];
  }>();

  for (const taskGroup of taskGroups) {
    const wideTable = wideTableById.get(taskGroup.wideTableId);
    if (!wideTable) {
      continue;
    }

    const requirement = requirementById.get(wideTable.requirementId);
    if (!requirement) {
      continue;
    }

    const collectionTaskKey = resolveCollectionTaskKey(taskGroup);
    const rowKey = `${requirement.id}:${wideTable.id}:${collectionTaskKey}`;
    const row = groupedRows.get(rowKey) ?? {
      key: rowKey,
      collectionTaskKey,
      collectionTaskLabel: resolveCollectionTaskLabel(taskGroup),
      requirement,
      project: projectById.get(requirement.projectId),
      wideTable,
      taskGroups: [],
    };

    row.taskGroups.push(taskGroup);
    groupedRows.set(rowKey, row);
  }

  return Array.from(groupedRows.values())
    .map((row) => buildRowView(row, fetchTasksByTaskGroupId))
    .sort((left, right) => {
      if (left.lastUpdatedAt !== right.lastUpdatedAt) {
        return right.lastUpdatedAt.localeCompare(left.lastUpdatedAt);
      }
      if (left.projectName !== right.projectName) {
        return left.projectName.localeCompare(right.projectName);
      }
      return left.collectionTaskLabel.localeCompare(right.collectionTaskLabel);
    });
}

function buildRowView(
  row: {
    key: string;
    collectionTaskKey: string;
    collectionTaskLabel: string;
    requirement: Requirement;
    project?: Project;
    wideTable: WideTable;
    taskGroups: TaskGroup[];
  },
  fetchTasksByTaskGroupId: Map<string, FetchTask[]>,
): CollectionTaskListRowView {
  const orderedTaskGroups = [...row.taskGroups].sort((left, right) => {
    const leftValue = left.businessDate || left.updatedAt || left.createdAt || "";
    const rightValue = right.businessDate || right.updatedAt || right.createdAt || "";
    return rightValue.localeCompare(leftValue);
  });

  const scopedFetchTasks = orderedTaskGroups.flatMap((taskGroup) => fetchTasksByTaskGroupId.get(taskGroup.id) ?? []);
  const indicatorNames = resolveIndicatorNames(row.wideTable, row.collectionTaskKey, scopedFetchTasks);

  const totalTasks = orderedTaskGroups.reduce((sum, taskGroup) => sum + (taskGroup.totalTasks ?? 0), 0);
  const pendingTasks = orderedTaskGroups.reduce((sum, taskGroup) => sum + (taskGroup.pendingTasks ?? 0), 0);
  const runningTasks = orderedTaskGroups.reduce((sum, taskGroup) => sum + (taskGroup.runningTasks ?? 0), 0);
  const completedTasks = orderedTaskGroups.reduce((sum, taskGroup) => sum + (taskGroup.completedTasks ?? 0), 0);
  const failedTasks = orderedTaskGroups.reduce((sum, taskGroup) => sum + (taskGroup.failedTasks ?? 0), 0);
  const cancelledTasks = orderedTaskGroups.reduce((sum, taskGroup) => sum + (taskGroup.cancelledTasks ?? 0), 0);
  const invalidatedTasks = orderedTaskGroups.reduce((sum, taskGroup) => sum + (taskGroup.invalidatedTasks ?? 0), 0);

  const aggregateStatus = resolveAggregateStatus(orderedTaskGroups.map((taskGroup) => taskGroup.status));
  const lastUpdatedAt = [orderedTaskGroups, scopedFetchTasks]
    .flat()
    .map((item) => item.updatedAt ?? item.createdAt ?? "")
    .sort((left, right) => right.localeCompare(left))[0] ?? "";

  return {
    key: row.key,
    collectionTaskKey: row.collectionTaskKey,
    collectionTaskLabel: row.collectionTaskLabel,
    requirementId: row.requirement.id,
    requirementTitle: row.requirement.title ?? row.requirement.id,
    projectId: row.requirement.projectId,
    projectName: row.project?.name ?? row.requirement.projectId,
    wideTableId: row.wideTable.id,
    wideTableName: row.wideTable.name ?? row.wideTable.id,
    scheduleLabel: resolveScheduleLabel(row.requirement, row.wideTable),
    indicatorNames,
    indicatorCount: indicatorNames.length,
    indicatorSummary: formatIndicatorSummary(indicatorNames),
    taskGroups: orderedTaskGroups,
    taskGroupCount: orderedTaskGroups.length,
    fetchTaskCount: scopedFetchTasks.length,
    aggregateStatus,
    statusSummary: formatStatusSummary({
      totalTasks,
      pendingTasks,
      runningTasks,
      completedTasks,
      failedTasks,
      cancelledTasks,
      invalidatedTasks,
    }),
    lastUpdatedAt,
    totalTasks,
  };
}

function resolveIndicatorNames(
  wideTable: WideTable,
  collectionTaskKey: string,
  scopedFetchTasks: FetchTask[],
): string[] {
  const schemaLabelByName = new Map(
    wideTable.schema.columns.map((column) => [column.name, column.chineseName?.trim() || column.name] as const),
  );

  const names = new Set<string>();
  for (const fetchTask of scopedFetchTasks) {
    for (const indicatorKey of fetchTask.indicatorKeys ?? []) {
      names.add(schemaLabelByName.get(indicatorKey) ?? indicatorKey);
    }
  }

  if (names.size > 0) {
    return Array.from(names).sort((left, right) => left.localeCompare(right, "zh-Hans-CN"));
  }

  const matchedIndicatorGroup = wideTable.indicatorGroups.find((indicatorGroup) => indicatorGroup.id === collectionTaskKey);
  if (matchedIndicatorGroup) {
    return matchedIndicatorGroup.indicatorColumns
      .map((indicatorKey) => schemaLabelByName.get(indicatorKey) ?? indicatorKey)
      .sort((left, right) => left.localeCompare(right, "zh-Hans-CN"));
  }

  if (wideTable.indicatorGroups.length === 1) {
    return wideTable.indicatorGroups[0].indicatorColumns
      .map((indicatorKey) => schemaLabelByName.get(indicatorKey) ?? indicatorKey)
      .sort((left, right) => left.localeCompare(right, "zh-Hans-CN"));
  }

  return wideTable.schema.columns
    .filter((column) => column.category === "indicator")
    .map((column) => column.chineseName?.trim() || column.name);
}

function resolveAggregateStatus(statuses: TaskGroupStatus[]): keyof typeof STATUS_LABELS {
  if (statuses.some((status) => status === "running")) {
    return "running";
  }
  if (statuses.some((status) => status === "failed" || status === "partial")) {
    return "failed";
  }
  if (statuses.some((status) => status === "invalidated" || status === "cancelled")) {
    return "invalidated";
  }
  if (statuses.length > 0 && statuses.every((status) => status === "completed")) {
    return "completed";
  }
  return "pending";
}

function resolveScheduleLabel(requirement: Requirement, wideTable: WideTable): string {
  const frequencyLabel = FREQUENCY_LABELS[wideTable.businessDateRange.frequency] ?? wideTable.businessDateRange.frequency ?? "-";
  if (requirement.dataUpdateEnabled === false) {
    return `一次性交付｜${frequencyLabel}`;
  }
  if (requirement.dataUpdateEnabled === true) {
    return `定期更新｜${frequencyLabel}`;
  }
  return frequencyLabel;
}

function formatStatusSummary(stats: {
  totalTasks: number;
  pendingTasks: number;
  runningTasks: number;
  completedTasks: number;
  failedTasks: number;
  cancelledTasks: number;
  invalidatedTasks: number;
}): string {
  if (stats.totalTasks <= 0) {
    return "暂无实例";
  }

  const parts = [
    `running ${stats.runningTasks}`,
    `completed ${stats.completedTasks}`,
    `failed ${stats.failedTasks}`,
    `pending ${stats.pendingTasks}`,
  ];

  if (stats.cancelledTasks > 0) {
    parts.push(`cancelled ${stats.cancelledTasks}`);
  }
  if (stats.invalidatedTasks > 0) {
    parts.push(`invalidated ${stats.invalidatedTasks}`);
  }

  return parts.join(" / ");
}
