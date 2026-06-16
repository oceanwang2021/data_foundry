import type {
  ColumnDefinition,
  FetchTask,
  Requirement,
  TaskGroup,
  WideTable,
  WideTableRecord,
} from "@/lib/types";
import type { ScheduleJob } from "@/lib/domain";
import {
  buildBusinessDateSlots,
  formatBusinessDateForFrequency,
  formatBusinessDateLabel,
  isOpenEndedBusinessDateRange,
  limitFutureBusinessDates,
  OPEN_ENDED_PREVIEW_PERIODS,
} from "@/lib/business-date";
import type { FetchTaskCardView } from "@/lib/fetch-task-views";
import {
  countExpectedFetchTasksForBusinessDate,
} from "@/lib/task-plan-reconciliation";
import { hasWideTableBusinessDateDimension } from "@/lib/wide-table-mode";
import {
  buildFullSnapshotTaskGroupPages,
  describeBusinessDateScheduleRule,
  describeFullSnapshotScheduleRule,
} from "@/lib/task-group-display";
import { normalizeCollectionTaskLabel } from "@/lib/collection-task-list-view";
import type { TaskGroupExecutionSummary } from "@/lib/task-group-execution";
import type {
  HistoricalTaskGroupView,
  PlanVersionView,
  TaskGroupRunSectionView,
  TaskInstanceRowView,
  TaskPlanView,
} from "@/components/requirement-tasks/types";
import { DEFAULT_INDICATOR_GROUP_PREFIX } from "@/components/requirement-tasks/utils/requirementTaskConstants";
import {
  findIndicatorColumnLabel,
  summarizeDateSlots,
  taskFrequencyLabel,
} from "@/components/requirement-tasks/utils/requirementTaskFormatters";

export const buildDefaultIndicatorGroupId = (wideTableId: string) =>
  `${DEFAULT_INDICATOR_GROUP_PREFIX}${wideTableId}`;

export const buildDefaultIndicatorGroup = (
  wideTable: WideTable,
  indicatorColumns: ColumnDefinition[],
): WideTable["indicatorGroups"][number] => ({
  id: buildDefaultIndicatorGroupId(wideTable.id),
  wideTableId: wideTable.id,
  name: "统一提示词",
  indicatorColumns: indicatorColumns.map((column) => column.name),
  priority: 1,
  description: "",
});

export function resolveTaskRecordBusinessDate(wideTable: WideTable, record: WideTableRecord): string {
  const businessDateColumn = wideTable.schema.columns.find((column) => column.isBusinessDate);
  return String(
    (businessDateColumn ? record[businessDateColumn.name] : undefined)
    ?? record.business_date
    ?? record.BIZ_DATE
    ?? "",
  );
}

export function buildTaskGroupSummaryFromCards(
  taskGroup: TaskGroup,
  fallbackSummary: TaskGroupExecutionSummary,
  taskCards: FetchTaskCardView[],
): TaskGroupExecutionSummary {
  const counts = taskCards.reduce(
    (summary, taskCard) => {
      summary[taskCard.status] += 1;
      return summary;
    },
    {
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      invalidated: 0,
    } satisfies Record<FetchTask["status"], number>,
  );
  const totalTasks = Math.max(fallbackSummary.totalTasks, taskCards.length);
  const pendingTasks = Math.max(
    totalTasks - counts.completed - counts.failed - counts.cancelled - counts.running - counts.invalidated,
    0,
  );
  const progressPercent = totalTasks > 0
    ? Math.round(((counts.completed + counts.failed + counts.cancelled + counts.invalidated) / totalTasks) * 100)
    : 0;
  const lastUpdatedAt = taskCards.reduce((latest, taskCard) => {
    const candidate = taskCard.endedAt || taskCard.startedAt || fallbackSummary.lastUpdatedAt;
    return candidate > latest ? candidate : latest;
  }, fallbackSummary.lastUpdatedAt);

  return {
    status: resolveTaskGroupDisplayStatus(taskGroup.status, {
      pendingTasks,
      runningTasks: counts.running,
      completedTasks: counts.completed,
      failedTasks: counts.failed,
      cancelledTasks: counts.cancelled,
      invalidatedTasks: counts.invalidated,
    }),
    totalTasks,
    pendingTasks,
    runningTasks: counts.running,
    completedTasks: counts.completed,
    failedTasks: counts.failed,
    cancelledTasks: counts.cancelled,
    invalidatedTasks: counts.invalidated,
    progressPercent,
    lastUpdatedAt,
  };
}

export function resolveTaskGroupDisplayStatus(
  fallbackStatus: TaskGroup["status"],
  counts: {
    pendingTasks: number;
    runningTasks: number;
    completedTasks: number;
    failedTasks: number;
    cancelledTasks: number;
    invalidatedTasks: number;
  },
): TaskGroup["status"] {
  if (fallbackStatus === "invalidated") {
    return "invalidated";
  }
  if (fallbackStatus === "cancelled" && counts.runningTasks === 0 && counts.pendingTasks === 0) {
    return "cancelled";
  }
  if (counts.runningTasks > 0) {
    return "running";
  }
  if (counts.failedTasks > 0 && counts.pendingTasks === 0) {
    if (counts.completedTasks === 0 && counts.cancelledTasks === 0 && counts.invalidatedTasks === 0) {
      return "failed";
    }
    return "partial";
  }
  if (counts.cancelledTasks > 0 && counts.pendingTasks === 0) {
    if (counts.completedTasks === 0 && counts.failedTasks === 0 && counts.invalidatedTasks === 0) {
      return "cancelled";
    }
    return "partial";
  }
  if (counts.completedTasks > 0 && counts.pendingTasks > 0) {
    return "running";
  }
  if (counts.pendingTasks > 0) {
    return "pending";
  }
  return "completed";
}

export function buildTaskPlanView(wideTable: WideTable): TaskPlanView {
  const collectionTasks = resolveCollectionTaskSummaries(wideTable);
  const collectionTaskCount = collectionTasks.length;

  if (!hasWideTableBusinessDateDimension(wideTable)) {
    const dimensionColumns = wideTable.schema.columns.filter((column) => column.category === "dimension" && !column.isBusinessDate);
    const dimensionCombinationCount = calculateDimensionCombinationCount(wideTable, dimensionColumns);
    const indicatorGroupLabels = resolveIndicatorGroupLabels(wideTable);
    const indicatorGroupCount = indicatorGroupLabels.length;
    const plannedRowCount = countExpectedFetchTasksForBusinessDate(wideTable, "", wideTable.recordCount > 0 ? wideTable.recordCount : dimensionCombinationCount);
    return {
      businessDates: [],
      businessDateCount: 0,
      historicalDateCount: 0,
      futureDateCount: 0,
      historicalRangeLabel: "不按业务日期拆分",
      futureRangeLabel: "由调度规则持续生成",
      dimensionCombinationCount,
      indicatorGroupCount,
      collectionTaskCount,
      collectionTasks,
      plannedRowCount,
      plannedTaskCount: plannedRowCount * indicatorGroupCount,
      dimensionSummary: summarizeDimensions(wideTable, dimensionColumns),
      indicatorGroupSummary: indicatorGroupLabels.join("、") || "未配置指标分组",
      frequencyLabel: taskFrequencyLabel(wideTable.businessDateRange.frequency),
      scheduleSummary: describeFullSnapshotScheduleRule(wideTable.scheduleRule),
    };
  }

  const businessDates = buildBusinessDateSlots(wideTable.businessDateRange);
  const today = formatBusinessDateForFrequency(
    new Date(),
    wideTable.businessDateRange.frequency,
  );
  const historicalDates = businessDates.filter((value) => value < today);
  const futureDates = businessDates.filter((value) => value >= today);
  const dimensionColumns = wideTable.schema.columns.filter((column) => column.category === "dimension" && !column.isBusinessDate);
  const dimensionCombinationCount = calculateDimensionCombinationCount(wideTable, dimensionColumns);
  const indicatorGroupLabels = resolveIndicatorGroupLabels(wideTable);
  const indicatorGroupCount = indicatorGroupLabels.length;
  const computedRowCount = businessDates.reduce(
    (sum, businessDate) => sum + countExpectedFetchTasksForBusinessDate(wideTable, businessDate, dimensionCombinationCount),
    0,
  );
  const isOpenEnded = isOpenEndedBusinessDateRange(wideTable.businessDateRange);
  const plannedRowCount = isOpenEndedBusinessDateRange(wideTable.businessDateRange)
    ? computedRowCount
    : (wideTable.parameterRows?.length ?? 0) > 0
      ? computedRowCount
      : wideTable.recordCount > 0
        ? wideTable.recordCount
        : computedRowCount;
  const plannedTaskCount = plannedRowCount * indicatorGroupCount;
  const scheduleSummary = wideTable.scheduleRule
    ? describeBusinessDateScheduleRule(wideTable.scheduleRule)
    : isOpenEnded
      ? "未配置未来调度"
      : "固定结束日期，无未来调度";

  return {
    businessDates,
    businessDateCount: businessDates.length,
    historicalDateCount: historicalDates.length,
    futureDateCount: futureDates.length,
    historicalRangeLabel: summarizeDateSlots(historicalDates, "暂无历史任务"),
    futureRangeLabel: summarizeDateSlots(futureDates, "当前范围内无未来任务"),
    dimensionCombinationCount,
    indicatorGroupCount,
    collectionTaskCount,
    collectionTasks,
    plannedRowCount,
    plannedTaskCount,
    dimensionSummary: summarizeDimensions(wideTable, dimensionColumns),
    indicatorGroupSummary: indicatorGroupLabels.join("、") || "未配置指标分组",
    frequencyLabel: taskFrequencyLabel(wideTable.businessDateRange.frequency),
    scheduleSummary,
    futureWindowLabel: isOpenEnded
      ? `open-ended 范围当前仅预估未来 ${OPEN_ENDED_PREVIEW_PERIODS} 期`
      : undefined,
  };
}

export function buildPlanVersionViews(
  wideTable: WideTable,
  taskGroups: TaskGroup[],
): PlanVersionView[] {
  const scopedTaskGroups = taskGroups.filter((taskGroup) => taskGroup.wideTableId === wideTable.id);
  const currentVersion = wideTable.currentPlanVersion ?? Math.max(1, ...scopedTaskGroups.map((taskGroup) => taskGroup.planVersion ?? 1));
  const versionSet = new Set<number>([currentVersion]);
  scopedTaskGroups.forEach((taskGroup) => versionSet.add(taskGroup.planVersion ?? 1));
  const today = formatBusinessDateForFrequency(
    new Date(),
    wideTable.businessDateRange.frequency,
  );
  const currentFutureDates = limitFutureBusinessDates(
    buildBusinessDateSlots(wideTable.businessDateRange)
      .filter((businessDate) => businessDate >= today),
    {
      maxFuturePeriods: OPEN_ENDED_PREVIEW_PERIODS,
      frequency: wideTable.businessDateRange.frequency,
    },
  )
    .sort((left, right) => right.localeCompare(left));

  return Array.from(versionSet)
    .sort((left, right) => right - left)
    .map((version) => {
      const versionTaskGroups = scopedTaskGroups.filter(
        (taskGroup) => (taskGroup.planVersion ?? 1) === version && (taskGroup.businessDate < today || version === currentVersion),
      );
      const baselineGroups = versionTaskGroups.filter((taskGroup) => (taskGroup.groupKind ?? "baseline") === "baseline");
      const deltaGroups = versionTaskGroups.filter((taskGroup) => (taskGroup.groupKind ?? "baseline") === "delta");
      return {
        version,
        isCurrent: version === currentVersion,
        createdAt: versionTaskGroups
          .map((taskGroup) => taskGroup.updatedAt || taskGroup.createdAt)
          .sort((left, right) => right.localeCompare(left))[0] ?? wideTable.updatedAt,
        baselineGroupCount: baselineGroups.length,
        deltaGroupCount: deltaGroups.length,
        historicalPatchDates: Array.from(new Set(deltaGroups.map((taskGroup) => taskGroup.businessDate))).sort((left, right) => right.localeCompare(left)),
        futureScheduledDates: version === currentVersion ? currentFutureDates : [],
      };
    });
}

export function buildTaskGroupRunViews(
  requirement: Requirement,
  wideTable: WideTable,
  taskPlan: TaskPlanView,
  taskGroups: TaskGroup[],
  taskGroupSummaryMap: Map<string, TaskGroupExecutionSummary>,
  scheduleJobs: ScheduleJob[],
): HistoricalTaskGroupView[] {
  const sortedIndicatorGroups = [...wideTable.indicatorGroups].sort(
    (left, right) => left.priority - right.priority,
  );
  const indicatorGroupById = new Map(sortedIndicatorGroups.map((group) => [group.id, group] as const));
  const indicatorGroupingEnabled = sortedIndicatorGroups.length > 1;

  if (!hasWideTableBusinessDateDimension(wideTable)) {
    const snapshotPages = buildFullSnapshotTaskGroupPages(taskGroups, scheduleJobs);
    const snapshotPageMap = new Map(snapshotPages.map((page) => [page.taskGroupId, page]));
    return [...taskGroups]
      .sort((left, right) => {
        const leftStartedAt = snapshotPageMap.get(left.id)?.startedAt ?? left.createdAt ?? left.updatedAt;
        const rightStartedAt = snapshotPageMap.get(right.id)?.startedAt ?? right.createdAt ?? right.updatedAt;
        if (leftStartedAt !== rightStartedAt) {
          return rightStartedAt.localeCompare(leftStartedAt);
        }
        return right.updatedAt.localeCompare(left.updatedAt);
      })
      .map((taskGroup) => {
        const indicatorGroupId = indicatorGroupingEnabled && taskGroup.partitionKey && indicatorGroupById.has(taskGroup.partitionKey)
          ? taskGroup.partitionKey
          : undefined;
        const indicatorGroupName = indicatorGroupId
          ? indicatorGroupById.get(indicatorGroupId)?.name ?? taskGroup.partitionLabel
          : undefined;
        const summary = taskGroupSummaryMap.get(taskGroup.id);
        const snapshotPage = snapshotPageMap.get(taskGroup.id);
        return {
          id: taskGroup.id,
          businessDate: taskGroup.businessDate,
          businessDateLabel: taskGroup.partitionLabel ?? taskGroup.businessDateLabel ?? "全量快照",
          displayLabel: snapshotPage?.pageLabel ?? taskGroup.partitionLabel ?? taskGroup.businessDateLabel ?? taskGroup.id,
          indicatorGroupId,
          indicatorGroupName,
          totalTasks: summary?.totalTasks ?? taskGroup.totalTasks,
          pendingTasks: summary?.pendingTasks ?? 0,
          runningTasks: summary?.runningTasks ?? 0,
          completedTasks: summary?.completedTasks ?? taskGroup.completedTasks,
          failedTasks: summary?.failedTasks ?? taskGroup.failedTasks,
          cancelledTasks: summary?.cancelledTasks ?? 0,
          invalidatedTasks: summary?.invalidatedTasks ?? 0,
          progressPercent: summary?.progressPercent ?? 0,
          triggeredBy: taskGroup.triggeredBy,
          displayStatus: summary?.status ?? taskGroup.status,
          isReal: true,
          planVersion: taskGroup.planVersion,
          groupKind: "baseline",
          coverageStatus: "current",
          taskGroupForTasks: taskGroup,
        };
      });
  }

  const taskGroupsByDate = new Map<string, TaskGroup[]>();
  const today = formatBusinessDateForFrequency(
    new Date(),
    wideTable.businessDateRange.frequency,
  );
  for (const taskGroup of taskGroups) {
    const scopedTaskGroups = taskGroupsByDate.get(taskGroup.businessDate) ?? [];
    scopedTaskGroups.push(taskGroup);
    taskGroupsByDate.set(taskGroup.businessDate, scopedTaskGroups);
  }
  const historicalRealDates = taskGroups
    .map((taskGroup) => taskGroup.businessDate)
    .filter((businessDate) => businessDate < today);
  const currentHistoricalDates = taskPlan.businessDates.filter((businessDate) => businessDate < today);
  const futureBusinessDates = limitFutureBusinessDates(
    Array.from(
      new Set([
        ...taskPlan.businessDates.filter((businessDate) => businessDate >= today),
        ...taskGroups.map((taskGroup) => taskGroup.businessDate).filter((businessDate) => businessDate >= today),
      ]),
    ).sort((left, right) => left.localeCompare(right)),
    {
      maxFuturePeriods: OPEN_ENDED_PREVIEW_PERIODS,
      frequency: wideTable.businessDateRange.frequency,
    },
  );
  const visibleBusinessDates = Array.from(
    new Set([...historicalRealDates, ...currentHistoricalDates, ...futureBusinessDates]),
  );

  return visibleBusinessDates
    .sort((left, right) => right.localeCompare(left))
    .flatMap((businessDate): HistoricalTaskGroupView[] => {
      const scopedTaskGroups = [...(taskGroupsByDate.get(businessDate) ?? [])]
        .sort(compareTaskGroupsForDisplay);
      if (scopedTaskGroups.length > 0) {
        return scopedTaskGroups.map((taskGroup) => {
          const indicatorGroupId = indicatorGroupingEnabled && taskGroup.partitionKey && indicatorGroupById.has(taskGroup.partitionKey)
            ? taskGroup.partitionKey
            : undefined;
          const indicatorGroupName = indicatorGroupId
            ? indicatorGroupById.get(indicatorGroupId)?.name ?? taskGroup.partitionLabel
            : undefined;
          const summary = taskGroupSummaryMap.get(taskGroup.id);
          const businessDateLabel = formatBusinessDateLabel(
            businessDate,
            wideTable.businessDateRange.frequency,
          );
          return {
            id: taskGroup.id,
            businessDate,
            businessDateLabel,
            displayLabel: businessDateLabel,
            indicatorGroupId,
            indicatorGroupName,
            totalTasks: summary?.totalTasks ?? taskGroup.totalTasks,
            pendingTasks: summary?.pendingTasks ?? 0,
            runningTasks: summary?.runningTasks ?? 0,
            completedTasks: summary?.completedTasks ?? taskGroup.completedTasks,
            failedTasks: summary?.failedTasks ?? taskGroup.failedTasks,
            cancelledTasks: summary?.cancelledTasks ?? 0,
            invalidatedTasks: summary?.invalidatedTasks ?? 0,
            progressPercent: summary?.progressPercent ?? 0,
            triggeredBy: taskGroup.triggeredBy,
            displayStatus: summary?.status ?? taskGroup.status,
            isReal: true,
            planVersion: taskGroup.planVersion,
            groupKind: "baseline",
            coverageStatus: "current",
            scheduledAt: taskGroup.scheduledAt,
            taskGroupForTasks: taskGroup,
          };
        });
      }

      if (!taskPlan.businessDates.includes(businessDate)) {
        return [];
      }

      const businessDateLabel = formatBusinessDateLabel(businessDate, wideTable.businessDateRange.frequency);
      const plannedTriggerType = resolvePlannedTriggerType(businessDate, today);
      const totalTasksPerTimeGroup = countExpectedFetchTasksForBusinessDate(
        wideTable,
        businessDate,
        taskPlan.dimensionCombinationCount,
      );

      if (indicatorGroupingEnabled) {
        return sortedIndicatorGroups.map((group) => ({
          id: `tg_planned_${businessDate}_${group.id}`,
          businessDate,
          businessDateLabel,
          displayLabel: businessDateLabel,
          indicatorGroupId: group.id,
          indicatorGroupName: group.name,
          totalTasks: totalTasksPerTimeGroup,
          pendingTasks: totalTasksPerTimeGroup,
          runningTasks: 0,
          completedTasks: 0,
          failedTasks: 0,
          cancelledTasks: 0,
          invalidatedTasks: 0,
          progressPercent: 0,
          triggeredBy: plannedTriggerType,
          displayStatus: "pending",
          isReal: false,
          planVersion: wideTable.currentPlanVersion ?? 1,
          groupKind: "baseline" as const,
          coverageStatus: "current" as const,
          deltaReason: undefined,
          taskGroupForTasks: {
            id: `tg_planned_${businessDate}_${group.id}`,
            wideTableId: wideTable.id,
            businessDate,
            businessDateLabel,
            planVersion: wideTable.currentPlanVersion ?? 1,
            groupKind: "baseline",
            coverageStatus: "current",
            status: "pending",
            totalTasks: totalTasksPerTimeGroup,
            pendingTasks: totalTasksPerTimeGroup,
            runningTasks: 0,
            completedTasks: 0,
            failedTasks: 0,
            cancelledTasks: 0,
            invalidatedTasks: 0,
            triggeredBy: plannedTriggerType,
            partitionType: "business_date",
            partitionKey: group.id,
            partitionLabel: group.name,
            createdAt: "",
            updatedAt: "",
          },
        }));
      }

      return [{
        id: `tg_planned_${businessDate}`,
        businessDate,
        businessDateLabel,
        displayLabel: businessDateLabel,
        totalTasks: totalTasksPerTimeGroup,
        pendingTasks: totalTasksPerTimeGroup,
        runningTasks: 0,
        completedTasks: 0,
        failedTasks: 0,
        cancelledTasks: 0,
        invalidatedTasks: 0,
        progressPercent: 0,
        triggeredBy: plannedTriggerType,
        displayStatus: "pending",
        isReal: false,
        planVersion: wideTable.currentPlanVersion ?? 1,
        groupKind: "baseline" as const,
        coverageStatus: "current" as const,
        deltaReason: undefined,
        taskGroupForTasks: {
          id: `tg_planned_${businessDate}`,
          wideTableId: wideTable.id,
          businessDate,
          businessDateLabel,
          planVersion: wideTable.currentPlanVersion ?? 1,
          groupKind: "baseline",
          coverageStatus: "current",
          status: "pending",
          totalTasks: totalTasksPerTimeGroup,
          pendingTasks: totalTasksPerTimeGroup,
          runningTasks: 0,
          completedTasks: 0,
          failedTasks: 0,
          cancelledTasks: 0,
          invalidatedTasks: 0,
          triggeredBy: plannedTriggerType,
          createdAt: "",
          updatedAt: "",
        },
      }];
    });
}

export function buildTaskGroupRunSections(
  wideTable: WideTable,
  taskGroupRunViews: HistoricalTaskGroupView[],
): TaskGroupRunSectionView[] {
  const sortedIndicatorGroups = [...wideTable.indicatorGroups].sort(
    (left, right) => left.priority - right.priority,
  );
  if (sortedIndicatorGroups.length <= 1) {
    return [{ id: "__all__", label: "", taskGroups: taskGroupRunViews }];
  }

  const grouped = new Map<string, HistoricalTaskGroupView[]>();
  const unscoped: HistoricalTaskGroupView[] = [];
  for (const view of taskGroupRunViews) {
    if (view.indicatorGroupId) {
      const bucket = grouped.get(view.indicatorGroupId) ?? [];
      bucket.push(view);
      grouped.set(view.indicatorGroupId, bucket);
    } else {
      unscoped.push(view);
    }
  }

  const sections: TaskGroupRunSectionView[] = sortedIndicatorGroups
    .map((group) => ({
      id: group.id,
      label: `${group.name}采集任务`,
      taskGroups: grouped.get(group.id) ?? [],
    }))
    .filter((section) => section.taskGroups.length > 0);

  if (unscoped.length > 0) {
    sections.push({ id: "__other__", label: "其他", taskGroups: unscoped });
  }

  return sections.length > 0 ? sections : [{ id: "__all__", label: "", taskGroups: taskGroupRunViews }];
}

export function buildTaskInstanceRowViews(params: {
  wideTable?: WideTable;
  fetchTasks: FetchTask[];
  indicatorGroups: WideTable["indicatorGroups"];
  parameterColumns: ColumnDefinition[];
  overrideBusinessDateLabel?: string;
}): TaskInstanceRowView[] {
  const { wideTable, fetchTasks, indicatorGroups, parameterColumns, overrideBusinessDateLabel } = params;
  if (!wideTable || fetchTasks.length === 0) {
    return [];
  }

  const indicatorColumns = wideTable.schema.columns.filter((column) => column.category === "indicator");
  const indicatorGroupById = new Map(indicatorGroups.map((group) => [group.id, group] as const));

  return fetchTasks.map((fetchTask) => {
    const matchedIndicatorGroup = indicatorGroupById.get(fetchTask.indicatorGroupId);
    const indicatorLabels = (matchedIndicatorGroup?.indicatorColumns ?? [])
      .map((columnName) => findIndicatorColumnLabel(indicatorColumns, columnName));

    return {
      fetchTaskId: fetchTask.id,
      taskGroupId: fetchTask.taskGroupId,
      rowLabel: buildTaskInstanceRowLabelFromTask(fetchTask),
      parameterLines: formatTaskInstanceParameterLinesFromTask(parameterColumns, fetchTask),
      businessDateLabel: overrideBusinessDateLabel || (
        fetchTask.businessDate
          ? formatBusinessDateLabel(fetchTask.businessDate, wideTable.businessDateRange.frequency)
          : fetchTask.id
      ),
      indicatorGroupName: matchedIndicatorGroup?.name ?? fetchTask.indicatorGroupName ?? "统一提示词",
      indicatorLabels,
      collectionTaskId: fetchTask.collectionTaskId,
      status: fetchTask.status,
    };
  });
}

export function buildTrialParameterRowKey(
  columns: Array<WideTable["schema"]["columns"][number]>,
  valueSource: Record<string, unknown>,
): string {
  return columns
    .map((column) => String(valueSource[column.name] ?? "").trim())
    .join("\u0001");
}

function compareTaskGroupsForDisplay(left: TaskGroup, right: TaskGroup): number {
  return right.updatedAt.localeCompare(left.updatedAt);
}

function resolvePlannedTriggerType(
  businessDate: string,
  today: string,
): TaskGroup["triggeredBy"] {
  return businessDate < today ? "backfill" : "schedule";
}

function resolveIndicatorGroupLabels(wideTable: WideTable): string[] {
  if (wideTable.indicatorGroups.length > 0) {
    return [...wideTable.indicatorGroups]
      .sort((left, right) => left.priority - right.priority)
      .map((group) => group.name);
  }

  return [];
}

function resolveCollectionTaskSummaries(
  wideTable: WideTable,
): Array<{ id: string; name: string; indicatorLabels: string[] }> {
  const indicatorColumns = wideTable.schema.columns.filter((column) => column.category === "indicator");
  if (indicatorColumns.length === 0) {
    return [];
  }

  if (wideTable.indicatorGroups.length > 0) {
    return [...wideTable.indicatorGroups]
      .filter((group) => group.indicatorColumns.length > 0)
      .sort((left, right) => left.priority - right.priority)
      .map((group) => ({
        id: group.id,
        name: group.name || "统一提示词",
        indicatorLabels: group.indicatorColumns.map((columnName) => findIndicatorColumnLabel(indicatorColumns, columnName)),
      }));
  }

  return [{
    id: buildDefaultIndicatorGroupId(wideTable.id),
    name: "统一提示词",
    indicatorLabels: indicatorColumns.map((column) => findIndicatorColumnLabel(indicatorColumns, column.name)),
  }];
}

function formatTaskInstanceParameterLines(
  parameterColumns: ColumnDefinition[],
  record?: WideTableRecord,
): string[] {
  if (!record) {
    return ["参数行未匹配到当前宽表记录"];
  }

  const lines = parameterColumns
    .map((column) => {
      const label = column.chineseName || column.name;
      const value = record[column.name];
      const text = value == null ? "" : String(value).trim();
      return text ? `${label}：${text}` : "";
    })
    .filter(Boolean);

  return lines.length > 0 ? lines : [`rowId：${record.id}`];
}

function buildTaskInstanceRowLabel(fetchTask: FetchTask, record?: WideTableRecord): string {
  if (record?.rowBindingKey) {
    return record.rowBindingKey;
  }
  if (record) {
    return `row-${record.id}`;
  }
  return fetchTask.id;
}

function formatTaskInstanceParameterLinesFromTask(
  parameterColumns: ColumnDefinition[],
  fetchTask: FetchTask,
): string[] {
  const dimensionValues = fetchTask.dimensionValues ?? {};
  const lines = parameterColumns
    .map((column) => {
      const label = column.chineseName || column.name;
      const value = dimensionValues[column.name];
      const text = value == null ? "" : String(value).trim();
      return text ? `${label}: ${text}` : "";
    })
    .filter(Boolean);

  return lines.length > 0 ? lines : [`rowId: ${fetchTask.rowId}`];
}

function buildTaskInstanceRowLabelFromTask(fetchTask: FetchTask): string {
  if (fetchTask.rowBindingKey) {
    return fetchTask.rowBindingKey;
  }
  if (fetchTask.rowId > 0) {
    return `row-${fetchTask.rowId}`;
  }
  return fetchTask.id;
}

function summarizeDimensions(wideTable: WideTable, dimensionColumns: Array<WideTable["schema"]["columns"][number]>): string {
  if (dimensionColumns.length === 0) {
    return "无普通维度";
  }

  return dimensionColumns.map((column) => {
    const valueCount = wideTable.dimensionRanges.find((range) => range.dimensionName === column.name)?.values.length ?? 0;
    return `${column.chineseName ?? column.name}(${valueCount})`;
  }).join("、");
}

function calculateDimensionCombinationCount(
  wideTable: WideTable,
  dimensionColumns: Array<WideTable["schema"]["columns"][number]>,
): number {
  if (dimensionColumns.length === 0) {
    return 1;
  }

  return dimensionColumns.reduce((product, column) => {
    const valueCount = wideTable.dimensionRanges.find((range) => range.dimensionName === column.name)?.values.length ?? 0;
    if (valueCount === 0) {
      return 0;
    }
    return product * valueCount;
  }, 1);
}
