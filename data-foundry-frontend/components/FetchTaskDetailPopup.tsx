"use client";

import { useEffect, type ReactNode } from "react";
import type { TaskGroup, WideTable } from "@/lib/types";
import { getVisibleNarrowTableContextColumns, type FetchTaskCardView } from "@/lib/fetch-task-views";
import { cn } from "@/lib/utils";
import { fillIndicator } from "@/lib/indicator-filling";
import {
  getTaskStatusBadgeClass,
  getTaskStatusDotClass,
  getTaskStatusPanelClass,
  taskStatusLabel,
} from "@/lib/task-status-presentation";

type Props = {
  wideTable: WideTable;
  taskGroup: TaskGroup;
  taskCard: FetchTaskCardView;
  onClose: () => void;
  footerActions?: ReactNode;
};

const triggerLabel: Record<string, string> = {
  schedule: "定时调度",
  backfill: "手动重采",
  manual: "手动触发",
  manual_retry: "手动重试",
};

export default function FetchTaskDetailPopup({
  wideTable,
  taskGroup,
  taskCard,
  onClose,
  footerActions,
}: Props) {
  const contextColumns = getVisibleNarrowTableContextColumns(wideTable);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-xl border bg-card shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b px-5 py-4">
          <div>
            <h3 className="text-sm font-semibold">任务信息</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {taskCard.id} · {taskCard.rowLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            关闭
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          <div className={cn("rounded-lg border px-4 py-3", getTaskStatusPanelClass(taskCard.status))}>
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("h-2.5 w-2.5 rounded-full", getTaskStatusDotClass(taskCard.status))} />
              <span className="text-sm font-semibold">{taskStatusLabel[taskCard.status] ?? taskCard.status}</span>
              <span className={cn("rounded-full border px-2 py-0.5 text-[11px]", getTaskStatusBadgeClass(taskCard.status))}>
                {taskCard.indicatorGroupName}
              </span>
            </div>
            <div className="mt-1 text-xs opacity-80">
              任务组 {taskGroup.id} · 业务日期 {taskGroup.businessDate} · {taskCard.rowLabel}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 text-xs">
            <PopupMetaField label="指标组" value={taskCard.indicatorGroupName} />
            <PopupMetaField label="耗时" value={taskCard.cumulativeDurationLabel} />
            <PopupMetaField label="尝试次数" value={`${taskCard.attempts}`} />
            <PopupMetaField label="置信度" value={taskCard.confidenceLabel} />
            <PopupMetaField label="触发方式" value={triggerLabel[taskCard.latestTrigger] ?? taskCard.latestTrigger} />
            <PopupMetaField label="开始时间" value={formatDateTime(taskCard.startedAt)} />
            <PopupMetaField label="结束时间" value={formatDateTime(taskCard.endedAt)} />
            <PopupMetaField label="Agent" value={taskCard.agent} />
            <PopupMetaField label="显式提示词模板" value={taskCard.promptTemplate || "-"} />
            <PopupMetaField label="最近错误" value={taskCard.latestError || ""} />
          </div>

          {taskCard.promptTemplate && taskCard.promptTemplate !== "-" ? (
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">显式提示词模板</div>
              <pre className="max-h-48 overflow-y-auto rounded-md border bg-muted/10 px-3 py-3 text-xs leading-6 whitespace-pre-wrap">
                {taskCard.promptTemplate}
              </pre>
            </div>
          ) : null}

          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Agent 提示词（完整解析）</div>
            <pre className="max-h-60 overflow-y-auto rounded-md border bg-muted/10 px-3 py-3 text-xs leading-6 whitespace-pre-wrap">
              {taskCard.promptMarkdown || taskCard.promptTemplate}
            </pre>
          </div>

          {taskCard.executionRecords.length > 0 ? (
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">执行记录</div>
              <div className="space-y-2">
                {taskCard.executionRecords.map((record) => (
                  <div key={record.id} className="rounded-md border bg-muted/10 px-3 py-2 text-xs text-muted-foreground">
                    <div className="flex flex-wrap items-center gap-2">
                      <span>第 {record.attempt} 次</span>
                      <span>{triggerLabel[record.triggeredBy] ?? record.triggeredBy}</span>
                      <span className={cn("rounded-full border px-2 py-0.5 text-[11px]", getTaskStatusBadgeClass(record.status))}>
                        {taskStatusLabel[record.status] ?? record.status}
                      </span>
                    </div>
                    <div className="mt-1">
                      {buildExecutionRecordDetail(record)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">窄表数据</div>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-xs">
                <thead className="border-b bg-muted/40">
                  <tr>
                    {contextColumns.map((column) => (
                      <th key={column.id} className="px-2 py-1.5 text-left">
                        {column.name}
                      </th>
                    ))}
                    <th className="px-2 py-1.5 text-left">指标名</th>
                    <th className="px-2 py-1.5 text-left">指标值</th>
                    <th className="px-2 py-1.5 text-left">原始指标值</th>
                    <th className="px-2 py-1.5 text-left">单位</th>
                    <th className="px-2 py-1.5 text-left">数据发布时间</th>
                    <th className="px-2 py-1.5 text-left">数据来源站点</th>
                    <th className="px-2 py-1.5 text-left">最大值</th>
                    <th className="px-2 py-1.5 text-left">最小值</th>
                    <th className="px-2 py-1.5 text-left">来源URL</th>
                    <th className="px-2 py-1.5 text-left">原文摘录</th>
                    <th className="px-2 py-1.5 text-left">指标逻辑</th>
                    <th className="px-2 py-1.5 text-left">逻辑补充</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {taskCard.returnRows.map((row) => (
                    <tr key={`${taskCard.id}-${row.indicatorName}`}>
                      {contextColumns.map((column) => (
                        <td key={column.id} className="px-2 py-1.5 text-muted-foreground">
                          {row.contextValues[column.name] ?? ""}
                        </td>
                        ))}
                      <td className="px-2 py-1.5">{row.indicatorName}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">
                        {row.indicatorValue || (
                          row.rawIndicatorValue
                            ? fillIndicator(row.rawIndicatorValue, row.indicatorUnit).finalValue
                            : ""
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-muted-foreground">{row.rawIndicatorValue}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">{row.indicatorUnit}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">{row.publishedAt}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">{row.sourceSite}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">{row.maxValue}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">{row.minValue}</td>
                      <td className="px-2 py-1.5 text-primary">
                        {row.sourceUrl ? (
                          <a href={row.sourceUrl} target="_blank" rel="noreferrer" className="hover:underline">
                            {row.sourceUrl}
                          </a>
                        ) : (
                          ""
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-muted-foreground">{row.quoteText}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">{row.indicatorLogic}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">{row.indicatorLogicSupplement}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {footerActions ? (
            <div className="flex items-center justify-end gap-3 border-t pt-4">
              {footerActions}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function PopupMetaField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/10 px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm">{value}</div>
    </div>
  );
}

function formatDateTime(value: string): string {
  if (!value) {
    return "";
  }

  return value.replace("T", " ").replace("Z", "");
}

function buildExecutionRecordDetail(record: FetchTaskCardView["executionRecords"][number]): string {
  return [
    record.taskGroupRunId ? `批次 ${record.taskGroupRunId}` : "单任务重试",
    record.startedAt ? `开始 ${formatDateTime(record.startedAt)}` : "",
    record.endedAt ? `结束 ${formatDateTime(record.endedAt)}` : "",
    record.errorMessage ?? "",
  ].filter(Boolean).join(" · ");
}
