"use client";

import type { ReactNode } from "react";
import type { TaskInstanceRowView } from "@/components/requirement-tasks/types";
import { cn } from "@/lib/utils";
import TaskStatusLegend, {
  type TaskStatusLegendItem,
} from "@/components/requirement-tasks/tasks/TaskStatusLegend";

type SelectionConfig = {
  selectedTaskIds: string[];
  selectableTaskIds: string[];
  allSelected: boolean;
  isBulkExecuting: boolean;
  onToggleAll: () => void;
  onToggleOne: (taskId: string) => void;
  onBatchExecute: () => void;
  onClearSelection: () => void;
};

type Props = {
  rows: TaskInstanceRowView[];
  legendItems: TaskStatusLegendItem[];
  emptyMessage?: string;
  selection?: SelectionConfig;
  getDisplayStatus: (row: TaskInstanceRowView) => string;
  renderIndicatorSummary: (
    indicatorLabels: string[],
    collectionTaskLabel: string,
    compact?: boolean,
  ) => ReactNode;
  renderCollectionTaskId: (
    row: Pick<TaskInstanceRowView, "fetchTaskId" | "collectionTaskId">,
  ) => ReactNode;
  renderActions: (row: TaskInstanceRowView) => ReactNode;
  renderStatusBadge: (status: string) => ReactNode;
};

export default function TaskInstanceTable({
  rows,
  legendItems,
  emptyMessage = "当前还没有可展示的采集实例。",
  selection,
  getDisplayStatus,
  renderIndicatorSummary,
  renderCollectionTaskId,
  renderActions,
  renderStatusBadge,
}: Props) {
  if (rows.length === 0) {
    return <div className="text-xs text-muted-foreground">{emptyMessage}</div>;
  }

  return (
    <div className="space-y-3">
      {selection ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-muted-foreground/30 bg-muted/10 px-3 py-2 text-xs">
          <div className="flex flex-wrap items-center gap-3 text-muted-foreground">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={selection.allSelected}
                disabled={selection.selectableTaskIds.length === 0 || selection.isBulkExecuting}
                onChange={selection.onToggleAll}
                className="h-3.5 w-3.5 rounded border-slate-300 text-primary focus:ring-primary"
              />
              <span>全选当前时间范围可执行实例</span>
            </label>
            <span>{`已选 ${selection.selectedTaskIds.length} 项`}</span>
            <span>{`可批量执行 ${selection.selectableTaskIds.length} 项`}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={selection.onBatchExecute}
              disabled={selection.selectedTaskIds.length === 0 || selection.isBulkExecuting}
              className={cn(
                "inline-flex items-center rounded-md px-3 py-1.5 text-xs font-medium",
                selection.selectedTaskIds.length === 0 || selection.isBulkExecuting
                  ? "cursor-not-allowed bg-muted text-muted-foreground"
                  : "bg-primary text-primary-foreground hover:opacity-90",
              )}
            >
              {selection.isBulkExecuting ? "批量采集中..." : "批量采集"}
            </button>
            <button
              type="button"
              onClick={selection.onClearSelection}
              disabled={selection.selectedTaskIds.length === 0}
              className={cn(
                "inline-flex items-center rounded-md border px-3 py-1.5 text-xs",
                selection.selectedTaskIds.length === 0
                  ? "cursor-not-allowed border-muted text-muted-foreground opacity-60"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
              )}
            >
              清空选择
            </button>
          </div>
        </div>
      ) : null}

      <TaskStatusLegend items={legendItems} />

      <div className="overflow-x-auto rounded-lg border bg-background shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
        <table className="w-full text-xs leading-5">
          <thead>
            <tr>
              {selection ? (
                <th className="w-10 border-b border-muted/60 bg-muted/30 px-3 py-2 text-left font-medium">
                  <input
                    type="checkbox"
                    aria-label="全选当前时间范围采集实例"
                    checked={selection.allSelected}
                    disabled={selection.selectableTaskIds.length === 0 || selection.isBulkExecuting}
                    onChange={selection.onToggleAll}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-primary focus:ring-primary"
                  />
                </th>
              ) : null}
              <th className="border-b border-muted/60 bg-muted/30 px-3 py-2 text-left font-medium">采集参数</th>
              <th className="border-b border-muted/60 bg-muted/30 px-3 py-2 text-left font-medium">时间列</th>
              <th className="border-b border-muted/60 bg-muted/30 px-3 py-2 text-left font-medium">采集指标组</th>
              <th className="border-b border-muted/60 bg-muted/30 px-3 py-2 text-left font-medium">采集实例 ID</th>
              <th className="border-b border-muted/60 bg-muted/30 px-3 py-2 text-left font-medium">实例状态</th>
              <th className="border-b border-muted/60 bg-muted/30 px-3 py-2 text-left font-medium">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row) => {
              const displayStatus = getDisplayStatus(row);
              const isSelected = selection?.selectedTaskIds.includes(row.fetchTaskId) ?? false;
              const isSelectable = selection?.selectableTaskIds.includes(row.fetchTaskId) ?? false;

              return (
                <tr key={row.fetchTaskId}>
                  {selection ? (
                    <td className="px-3 py-3 align-top">
                      <input
                        type="checkbox"
                        aria-label={`选择采集实例 ${row.rowLabel}`}
                        checked={isSelected}
                        disabled={!isSelectable || selection.isBulkExecuting}
                        onChange={() => selection.onToggleOne(row.fetchTaskId)}
                        className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-primary focus:ring-primary"
                      />
                    </td>
                  ) : null}
                  <td className="px-3 py-3 align-top text-slate-700">
                    <div className="space-y-1">
                      {row.parameterLines.map((line) => (
                        <div key={`${row.fetchTaskId}-${line}`} className="break-all">
                          {line}
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-3 align-top text-slate-700">{row.businessDateLabel}</td>
                  <td className="px-3 py-3 align-top text-slate-700">
                    <div className="space-y-1">
                      <div className="font-medium">{row.indicatorGroupName}</div>
                      {renderIndicatorSummary(row.indicatorLabels, row.indicatorGroupName, true)}
                    </div>
                  </td>
                  <td className="break-all px-3 py-3 align-top font-mono text-slate-700">
                    {renderCollectionTaskId(row)}
                  </td>
                  <td className="px-3 py-3 align-top">
                    {renderStatusBadge(displayStatus)}
                  </td>
                  <td className="px-3 py-3 align-top">
                    {renderActions(row)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
