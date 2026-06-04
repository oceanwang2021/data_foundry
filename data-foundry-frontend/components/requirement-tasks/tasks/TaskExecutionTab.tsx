"use client";

import type { ReactNode } from "react";
import type { ScheduleJob } from "@/lib/domain";
import type {
  CollectionTaskSectionView,
  HistoricalTaskGroupView,
} from "@/components/requirement-tasks/types";
import { getTriggerDisplayLabel } from "@/components/requirement-tasks/utils/requirementTaskFormatters";

type Props = {
  wideTableName: string;
  taskActionMessage: string;
  taskPlanBlockerMessage: string | null;
  usesBusinessDateAxis: boolean;
  historicalDateCount: number;
  taskGroupRunViews: HistoricalTaskGroupView[];
  trialTaskGroupRunViews: HistoricalTaskGroupView[];
  isTrialTaskListExpanded: boolean;
  onToggleTrialTaskListExpanded: () => void;
  renderTrialTaskTable: () => ReactNode;
  collectionTaskSections: CollectionTaskSectionView[];
  onOpenIndicatorList: (collectionTaskLabel: string, indicatorLabels: string[]) => void;
  renderTaskGroupCards: (taskGroupViews: HistoricalTaskGroupView[]) => ReactNode;
  scheduleJobs: ScheduleJob[];
  renderStatusBadge: (status: string) => ReactNode;
};

export default function TaskExecutionTab({
  wideTableName,
  taskActionMessage,
  taskPlanBlockerMessage,
  usesBusinessDateAxis,
  historicalDateCount,
  taskGroupRunViews,
  trialTaskGroupRunViews,
  isTrialTaskListExpanded,
  onToggleTrialTaskListExpanded,
  renderTrialTaskTable,
  collectionTaskSections,
  onOpenIndicatorList,
  renderTaskGroupCards,
  scheduleJobs,
  renderStatusBadge,
}: Props) {
  return (
    <>
      <section className="space-y-4 rounded-xl border bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">{`任务运行记录 - ${wideTableName}`}</h3>
          </div>
        </div>

        {taskActionMessage ? (
          <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
            {taskActionMessage}
          </div>
        ) : null}

        {taskGroupRunViews.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            {taskPlanBlockerMessage
              ? taskPlanBlockerMessage
              : usesBusinessDateAxis && historicalDateCount > 0
                ? "历史任务计划已确定，但当前还没有任何执行记录。"
                : usesBusinessDateAxis
                  ? "当前宽表暂无历史任务。"
                  : "当前宽表暂无全量快照任务组。"}
          </div>
        ) : (
          <div className="space-y-6">
            {trialTaskGroupRunViews.length > 0 ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3 px-1">
                  <div>
                    <div className="text-base font-semibold text-foreground">试运行任务</div>
                  </div>
                  <button
                    type="button"
                    onClick={onToggleTrialTaskListExpanded}
                    className="rounded-md border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    {isTrialTaskListExpanded ? "收起" : "展开"}
                  </button>
                </div>
                {isTrialTaskListExpanded ? renderTrialTaskTable() : null}
              </div>
            ) : null}

            {collectionTaskSections.map((section) => (
              <div key={section.id} className="space-y-3">
                <div className="space-y-1 px-1">
                  <div className="text-base font-semibold text-foreground">{section.title}</div>
                  <div className="text-sm text-muted-foreground">{section.indicatorSummary}</div>
                  {section.indicatorLabels.length > 3 ? (
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline"
                      onClick={() => onOpenIndicatorList(section.displayGroupLabel, section.indicatorLabels)}
                    >
                      查看全部指标
                    </button>
                  ) : null}
                </div>
                {renderTaskGroupCards(section.taskGroups)}
              </div>
            ))}
          </div>
        )}
      </section>

      {scheduleJobs.length > 0 ? (
        <section className="space-y-4 rounded-xl border bg-card p-6">
          <h3 className="font-semibold">任务组触发记录</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className="px-2 py-1.5 text-left">触发ID</th>
                  <th className="px-2 py-1.5 text-left">关联任务组</th>
                  <th className="px-2 py-1.5 text-left">触发类型</th>
                  <th className="px-2 py-1.5 text-left">状态</th>
                  <th className="px-2 py-1.5 text-left">开始时间</th>
                  <th className="px-2 py-1.5 text-left">结束时间</th>
                  <th className="px-2 py-1.5 text-left">操作人</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {scheduleJobs.map((scheduleJob) => (
                  <tr key={scheduleJob.id}>
                    <td className="font-mono px-2 py-1.5">{scheduleJob.id}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{scheduleJob.taskGroupId}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">
                      {getTriggerDisplayLabel(scheduleJob.triggerType)}
                    </td>
                    <td className="px-2 py-1.5">
                      {renderStatusBadge(scheduleJob.status)}
                    </td>
                    <td className="px-2 py-1.5 text-muted-foreground">{scheduleJob.startedAt}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{scheduleJob.endedAt ?? "-"}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{scheduleJob.operator}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  );
}
