"use client";

import type { ReactNode } from "react";
import type { HistoricalTaskGroupView } from "@/components/requirement-tasks/types";
import {
  buildTaskStatusLegendFromCounts,
  getTaskGroupStatusLabel,
  getTriggerDisplayLabel,
  isScheduledFutureTaskGroupView,
} from "@/components/requirement-tasks/utils/requirementTaskFormatters";
import { cn } from "@/lib/utils";
import { getTaskStatusRailFillColor } from "@/lib/task-status-presentation";

type Props = {
  taskGroupViews: HistoricalTaskGroupView[];
  expandedTgId: string | null;
  onToggleTaskGroupExpand: (taskGroupId: string) => void;
  renderTaskGroupStatusBadge: (taskGroup: HistoricalTaskGroupView) => ReactNode;
  renderExpandedContent: (taskGroup: HistoricalTaskGroupView) => ReactNode;
};

export default function TaskGroupCards({
  taskGroupViews,
  expandedTgId,
  onToggleTaskGroupExpand,
  renderTaskGroupStatusBadge,
  renderExpandedContent,
}: Props) {
  return (
    <div className="divide-y overflow-hidden rounded-xl border bg-background">
      {taskGroupViews.map((taskGroup) => {
        const isExpanded = expandedTgId === taskGroup.id;
        const taskGroupStatusLegend = buildTaskStatusLegendFromCounts({
          completed: taskGroup.completedTasks,
          running: taskGroup.runningTasks,
          failed: taskGroup.failedTasks,
          cancelled: taskGroup.cancelledTasks,
          pending: taskGroup.pendingTasks,
          invalidated: taskGroup.invalidatedTasks,
        });

        return (
          <div
            key={taskGroup.id}
            className={cn(
              "transition-colors",
              isExpanded ? "bg-muted/10" : "hover:bg-muted/20",
            )}
          >
            <div className="flex items-center gap-3 px-4 py-3">
              <button
                type="button"
                onClick={() => onToggleTaskGroupExpand(taskGroup.id)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{taskGroup.displayLabel}</span>
                    {renderTaskGroupStatusBadge(taskGroup)}
                    <span className={cn("rounded border bg-background px-1.5 py-0.5 text-[10px]")}>
                      {getTriggerDisplayLabel(taskGroup.triggeredBy)}
                    </span>
                    {taskGroupStatusLegend.map((item) => (
                      <span
                        key={`${taskGroup.id}-${item.status}`}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px]",
                          item.badgeClassName,
                        )}
                      >
                        <span className={cn("h-1.5 w-1.5 rounded-full", item.dotClassName)} />
                        {item.label} {item.count}
                      </span>
                    ))}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {taskGroup.isReal
                      ? `${taskGroup.id} | total ${taskGroup.totalTasks} | running ${taskGroup.runningTasks} | completed ${taskGroup.completedTasks} | failed ${taskGroup.failedTasks}${taskGroup.cancelledTasks > 0 ? ` | cancelled ${taskGroup.cancelledTasks}` : ""}${taskGroup.pendingTasks > 0 ? ` | pending ${taskGroup.pendingTasks}` : ""}`
                      : isScheduledFutureTaskGroupView(taskGroup)
                        ? "planned task group | total "
                          + `${taskGroup.totalTasks} | will be created and executed automatically when due`
                        : `planned task group | total ${taskGroup.totalTasks} | no runtime records yet`}
                  </div>
                </div>
                <div className="w-24 shrink-0">
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${taskGroup.progressPercent}%`,
                        backgroundColor: getTaskStatusRailFillColor(taskGroup.displayStatus),
                      }}
                    />
                  </div>
                  <div className="mt-0.5 text-right text-[10px] text-muted-foreground">
                    {taskGroup.progressPercent}%
                  </div>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {isExpanded ? "收起" : "展开"}
                </span>
              </button>
            </div>

            {isExpanded ? (
              <div className="border-t bg-background px-4 py-3">
                {renderExpandedContent(taskGroup)}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
