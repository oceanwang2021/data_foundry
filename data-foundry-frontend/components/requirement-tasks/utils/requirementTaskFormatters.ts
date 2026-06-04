import type { ColumnDefinition, TaskGroup, WideTable } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  getTaskStatusBadgeClass,
  getTaskStatusDotClass,
  taskStatusLabel,
} from "@/lib/task-status-presentation";
import { formatBusinessDate } from "@/lib/business-date";
import type { HistoricalTaskGroupView } from "@/components/requirement-tasks/types";
import {
  GROUP_TONE_CLASSES,
  triggerLabel,
} from "@/components/requirement-tasks/utils/requirementTaskConstants";

export function taskGroupKindLabel(groupKind: TaskGroup["groupKind"] | undefined): string {
  return (groupKind ?? "baseline") === "delta" ? "差异补差组" : "基线任务组";
}

export function taskGroupKindBadgeClass(groupKind: TaskGroup["groupKind"] | undefined): string {
  return (groupKind ?? "baseline") === "delta"
    ? "border-amber-200 bg-amber-50 text-amber-700"
    : "border-slate-200 bg-slate-50 text-slate-700";
}

export function buildTaskStatusLegend(tasks: Array<{ status: string }>): Array<{
  status: string;
  label: string;
  count: number;
  badgeClassName: string;
  dotClassName: string;
}> {
  const countMap = new Map<string, number>();

  for (const task of tasks) {
    countMap.set(task.status, (countMap.get(task.status) ?? 0) + 1);
  }

  return buildTaskStatusLegendFromCountMap(countMap);
}

export function buildTaskStatusLegendFromCounts(counts: Record<string, number>): Array<{
  status: string;
  label: string;
  count: number;
  badgeClassName: string;
  dotClassName: string;
}> {
  return buildTaskStatusLegendFromCountMap(new Map(Object.entries(counts)));
}

export function buildTaskStatusLegendFromCountMap(countMap: Map<string, number>): Array<{
  status: string;
  label: string;
  count: number;
  badgeClassName: string;
  dotClassName: string;
}> {
  const orderedStatuses = ["completed", "running", "queued", "failed", "cancelled", "pending", "invalidated"];
  return orderedStatuses
    .filter((status) => (countMap.get(status) ?? 0) > 0)
    .map((status) => ({
      status,
      label: taskStatusLabel[status] ?? status,
      count: countMap.get(status) ?? 0,
      badgeClassName: getTaskStatusBadgeClass(status),
      dotClassName: getTaskStatusDotClass(status),
    }));
}

export function formatTaskActionError(error: unknown): string {
  if (error instanceof Error && error.message === "Failed to fetch") {
    return "无法连接后端接口，请确认服务可访问。";
  }
  if (error instanceof Error && error.message.trim() !== "") {
    return error.message;
  }
  return "未知错误";
}

export function summarizeDateSlots(dateSlots: string[], emptyLabel: string): string {
  if (dateSlots.length === 0) {
    return emptyLabel;
  }

  return `${dateSlots[0]} ~ ${dateSlots[dateSlots.length - 1]}（${dateSlots.length} 个）`;
}

export function taskFrequencyLabel(frequency: WideTable["businessDateRange"]["frequency"]): string {
  if (frequency === "daily") {
    return "日频";
  }
  if (frequency === "weekly") {
    return "周频";
  }
  if (frequency === "monthly") {
    return "月频";
  }
  if (frequency === "quarterly") {
    return "季频";
  }
  return "年频";
}

export function getTriggerDisplayLabel(triggerType: string): string {
  return triggerLabel[triggerType] ?? triggerType;
}

export function isScheduledFutureTaskGroupView(
  taskGroup: Pick<HistoricalTaskGroupView, "triggeredBy" | "businessDate" | "displayStatus">,
): boolean {
  return taskGroup.triggeredBy === "schedule"
    && taskGroup.displayStatus === "pending"
    && taskGroup.businessDate > formatBusinessDate(new Date());
}

export function getTaskGroupStatusLabel(
  taskGroup: Pick<HistoricalTaskGroupView, "triggeredBy" | "businessDate" | "displayStatus">,
): string {
  if (isScheduledFutureTaskGroupView(taskGroup)) {
    return "待调度";
  }

  return taskStatusLabel[taskGroup.displayStatus] ?? taskGroup.displayStatus;
}

export function groupToneClass(groupId: string, groups: WideTable["indicatorGroups"]): string {
  const toneIndex = Math.max(
    0,
    groups.findIndex((group) => group.id === groupId),
  ) % GROUP_TONE_CLASSES.length;
  return GROUP_TONE_CLASSES[toneIndex];
}

export function groupSelectClass(groupId: string | undefined, groups: WideTable["indicatorGroups"]): string {
  if (!groupId) {
    return "border-gray-200 bg-gray-50 text-gray-700";
  }
  return groupToneClass(groupId, groups);
}

export function findIndicatorColumnLabel(columns: ColumnDefinition[], columnName: string): string {
  const column = columns.find((item) => item.name === columnName);
  return column?.chineseName ?? column?.name ?? columnName;
}

export function formatRunTimestamp(value: Date): string {
  return value.toISOString().replace("T", " ").replace("Z", "");
}
