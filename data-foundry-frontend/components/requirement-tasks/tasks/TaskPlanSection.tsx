"use client";

import type { ReactNode } from "react";
import type { TaskPlanView } from "@/components/requirement-tasks/types";
import { formatIndicatorSummary, normalizeCollectionTaskLabel } from "@/lib/collection-task-list-view";

type Props = {
  wideTableName: string;
  taskPlan: TaskPlanView | null;
  usesBusinessDateAxis: boolean;
  taskPlanBlockerMessage: string | null;
  onOpenIndicatorList: (collectionTaskLabel: string, indicatorLabels: string[]) => void;
};

export default function TaskPlanSection({
  wideTableName,
  taskPlan,
  usesBusinessDateAxis,
  taskPlanBlockerMessage,
  onOpenIndicatorList,
}: Props) {
  return (
    <section className="rounded-xl border bg-card p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">任务计划</h3>
        </div>
        <div className="text-xs text-muted-foreground">{wideTableName}</div>
      </div>

      {taskPlan ? (
        <div className="grid gap-3 md:grid-cols-2">
          <PlanMetricCard
            title={usesBusinessDateAxis ? "业务日期数" : "单次快照行数"}
            value={String(usesBusinessDateAxis ? taskPlan.businessDateCount : taskPlan.plannedRowCount)}
            hint={
              usesBusinessDateAxis
                ? `${taskPlan.frequencyLabel} · 历史 ${taskPlan.historicalDateCount}${taskPlan.futureDateCount > 0 ? ` · 未来 ${taskPlan.futureDateCount}` : ""}`
                : taskPlan.scheduleSummary
            }
          />
          <PlanMetricCard
            title="采集任务"
            value={String(taskPlan.collectionTaskCount)}
            hint={taskPlan.collectionTasks.length > 0 ? (
              <div className="space-y-1">
                {taskPlan.collectionTasks.map((task) => (
                  <div key={task.id} className="space-y-1">
                    <div>
                      {`${normalizeCollectionTaskLabel(task.name)}：${formatIndicatorSummary(task.indicatorLabels)}`}
                    </div>
                    {task.indicatorLabels.length > 3 ? (
                      <button
                        type="button"
                        className="text-xs text-primary hover:underline"
                        onClick={() => onOpenIndicatorList(normalizeCollectionTaskLabel(task.name), task.indicatorLabels)}
                      >
                        查看全部
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : "未配置采集任务"}
          />
        </div>
      ) : taskPlanBlockerMessage ? (
        <div className="rounded-lg border border-dashed px-4 py-8 text-sm text-muted-foreground">
          {taskPlanBlockerMessage}
        </div>
      ) : null}
    </section>
  );
}

function PlanMetricCard({ title, value, hint }: { title: string; value: string; hint: ReactNode }) {
  return (
    <div className="rounded-lg border bg-muted/10 px-4 py-3">
      <div className="text-[11px] text-muted-foreground">{title}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
      <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>
    </div>
  );
}
