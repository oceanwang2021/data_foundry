import type { ScheduleJob } from "@/lib/domain";
import type { ScheduleRule, TaskGroup } from "@/lib/types";

export type FullSnapshotTaskGroupPage = {
  taskGroupId: string;
  scheduleJobId?: string;
  startedAt: string;
  pageLabel: string;
  pageHint: string;
};

const PERIOD_LABELS: Record<string, string> = {
  daily: "日频",
  weekly: "周频",
  monthly: "月频",
  quarterly: "季频",
  yearly: "年频",
};

export function resolveTaskGroupStartedAt(
  taskGroup: TaskGroup,
  scheduleJobs: ScheduleJob[],
): string {
  const startedAtCandidates = scheduleJobs
    .filter((job) => job.taskGroupId === taskGroup.id)
    .map((job) => job.startedAt)
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => left.localeCompare(right));

  return startedAtCandidates[0] ?? taskGroup.createdAt ?? taskGroup.updatedAt ?? "";
}

export function formatTaskGroupStartedAtLabel(value: string): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return "未开始";
  }

  const compact = normalized.replace("T", " ").replace("Z", "");
  return compact.length >= 16 ? compact.slice(0, 16) : compact;
}

export function buildFullSnapshotTaskGroupPages(
  taskGroups: TaskGroup[],
  scheduleJobs: ScheduleJob[],
): FullSnapshotTaskGroupPage[] {
  const pages = taskGroups.map((taskGroup) => {
    const latestJob = scheduleJobs
      .filter((job) => job.taskGroupId === taskGroup.id)
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt))[0];
    const startedAt = latestJob?.startedAt ?? taskGroup.createdAt ?? taskGroup.updatedAt ?? "";

    return {
      taskGroupId: taskGroup.id,
      scheduleJobId: latestJob?.id,
      startedAt,
      pageLabel: taskGroup.triggeredBy === "trial"
        ? `试运行 ${formatTaskGroupStartedAtLabel(startedAt)}`
        : formatTaskGroupStartedAtLabel(startedAt),
      pageHint: taskGroup.partitionLabel ?? taskGroup.businessDateLabel ?? "全量快照",
    };
  }).sort((left, right) => {
    if (left.startedAt !== right.startedAt) {
      return right.startedAt.localeCompare(left.startedAt);
    }
    return right.taskGroupId.localeCompare(left.taskGroupId);
  });

  return disambiguateFullSnapshotPageLabels(pages);
}

export function buildDisplayableFullSnapshotTaskGroupPages(
  taskGroups: TaskGroup[],
  scheduleJobs: ScheduleJob[],
): FullSnapshotTaskGroupPage[] {
  const pages = buildFullSnapshotTaskGroupPages(taskGroups, scheduleJobs);
  const taskGroupMap = new Map(taskGroups.map((taskGroup) => [taskGroup.id, taskGroup]));
  let hasFallbackPage = false;

  return pages.filter((page) => {
    const taskGroup = taskGroupMap.get(page.taskGroupId);
    const hasRowSnapshots = Boolean(taskGroup?.rowSnapshots?.length);
    if (hasRowSnapshots) {
      return true;
    }
    if (hasFallbackPage) {
      return false;
    }
    hasFallbackPage = true;
    return true;
  });
}

export function filterFullSnapshotScopedRows<T extends { businessDate: string }>(
  rows: T[],
  taskGroupId?: string | null,
): T[] {
  if (!taskGroupId) {
    return rows;
  }
  return rows.filter((row) => row.businessDate === taskGroupId);
}

function disambiguateFullSnapshotPageLabels(
  pages: FullSnapshotTaskGroupPage[],
): FullSnapshotTaskGroupPage[] {
  const pageLabelCounts = new Map<string, number>();
  for (const page of pages) {
    pageLabelCounts.set(page.pageLabel, (pageLabelCounts.get(page.pageLabel) ?? 0) + 1);
  }

  return pages.map((page) => {
    if ((pageLabelCounts.get(page.pageLabel) ?? 0) <= 1) {
      return page;
    }
    const hint = page.pageHint?.trim();
    const suffix = hint && hint !== page.pageLabel ? hint : page.taskGroupId;
    return {
      ...page,
      pageLabel: `${page.pageLabel} · ${suffix}`,
    };
  });
}

export function formatSchedulePeriodLabel(periodLabel?: string): string {
  if (!periodLabel) {
    return "按周期";
  }

  return PERIOD_LABELS[periodLabel] ?? periodLabel;
}

export function describeFullSnapshotScheduleRule(rule?: ScheduleRule): string {
  if (!rule) {
    return "未配置全量快照调度";
  }

  const period = formatSchedulePeriodLabel(rule.periodLabel);
  const offsetDays = Math.max(rule.businessDateOffsetDays ?? 0, 0);
  return `${period}结束后 +${offsetDays} 天触发 1 个全量快照任务组`;
}
