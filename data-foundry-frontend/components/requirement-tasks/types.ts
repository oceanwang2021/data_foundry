import type { FetchTask, TaskGroup, WideTable } from "@/lib/types";

export type TaskPlanView = {
  businessDates: string[];
  businessDateCount: number;
  historicalDateCount: number;
  futureDateCount: number;
  historicalRangeLabel: string;
  futureRangeLabel: string;
  dimensionCombinationCount: number;
  indicatorGroupCount: number;
  collectionTaskCount: number;
  collectionTasks: Array<{
    id: string;
    name: string;
    indicatorLabels: string[];
  }>;
  plannedRowCount: number;
  plannedTaskCount: number;
  dimensionSummary: string;
  indicatorGroupSummary: string;
  frequencyLabel: string;
  scheduleSummary: string;
  futureWindowLabel?: string;
};

export type HistoricalTaskGroupView = {
  id: string;
  businessDate: string;
  businessDateLabel: string;
  displayLabel: string;
  indicatorGroupId?: string;
  indicatorGroupName?: string;
  totalTasks: number;
  pendingTasks: number;
  runningTasks: number;
  completedTasks: number;
  failedTasks: number;
  cancelledTasks: number;
  invalidatedTasks: number;
  progressPercent: number;
  triggeredBy: TaskGroup["triggeredBy"];
  displayStatus: string;
  isReal: boolean;
  planVersion?: number;
  groupKind?: TaskGroup["groupKind"];
  coverageStatus?: TaskGroup["coverageStatus"];
  deltaReason?: string;
  scheduledAt?: string;
  taskGroupForTasks: TaskGroup;
};

export type TaskGroupRunSectionView = {
  id: string;
  label: string;
  taskGroups: HistoricalTaskGroupView[];
};

export type CollectionTaskSectionView = {
  id: string;
  title: string;
  indicatorSummary: string;
  indicatorLabels: string[];
  displayGroupLabel: string;
  taskGroups: HistoricalTaskGroupView[];
};

export type TaskInstanceRowView = {
  fetchTaskId: string;
  taskGroupId: string;
  rowLabel: string;
  parameterLines: string[];
  businessDateLabel: string;
  indicatorGroupName: string;
  indicatorLabels: string[];
  collectionTaskId?: string;
  status: string;
};

export type PlanVersionView = {
  version: number;
  isCurrent: boolean;
  createdAt: string;
  baselineGroupCount: number;
  deltaGroupCount: number;
  historicalPatchDates: string[];
  futureScheduledDates: string[];
};

export type TrialParameterRowView = {
  rowKey: string;
  rowId: number;
  values: Record<string, string>;
};

export type IndicatorGroupOption = WideTable["indicatorGroups"][number];
