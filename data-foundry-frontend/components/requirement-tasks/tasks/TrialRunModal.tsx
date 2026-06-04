"use client";

import Link from "next/link";
import type { ColumnDefinition, TaskGroup, WideTable } from "@/lib/types";
import type { TrialParameterRowView } from "@/components/requirement-tasks/types";
import { cn } from "@/lib/utils";

type Props = {
  isOpen: boolean;
  selectedWt: WideTable;
  requirementProjectId: string;
  requirementId: string;
  navQuery: string;
  onClose: () => void;
  onStartTrialRun: () => void;
  canStartTrialRun: boolean;
  isStartingTrialRun: boolean;
  taskPlanBlockerMessage: string | null;
  usesBusinessDateAxis: boolean;
  trialAvailableBusinessDates: string[];
  trialBusinessDates: string[];
  onToggleTrialBusinessDate: (businessDate: string) => void;
  trialParameterColumns: ColumnDefinition[];
  trialParameterRows: TrialParameterRowView[];
  selectedTrialParameterRowKeys: string[];
  onClearTrialParameterSelection: () => void;
  onToggleTrialParameterRow: (rowKey: string) => void;
  trialEstimatedRows: number;
  trialEstimatedTaskCount: number;
  trialFilteredRecordsCount: number;
  trialMaxRows: number;
  onTrialMaxRowsChange: (value: number) => void;
  latestTrialTaskGroup?: TaskGroup;
  trialRunMessage: string;
};

export default function TrialRunModal({
  isOpen,
  selectedWt,
  requirementProjectId,
  requirementId,
  navQuery,
  onClose,
  onStartTrialRun,
  canStartTrialRun,
  isStartingTrialRun,
  taskPlanBlockerMessage,
  usesBusinessDateAxis,
  trialAvailableBusinessDates,
  trialBusinessDates,
  onToggleTrialBusinessDate,
  trialParameterColumns,
  trialParameterRows,
  selectedTrialParameterRowKeys,
  onClearTrialParameterSelection,
  onToggleTrialParameterRow,
  trialEstimatedRows,
  trialEstimatedTaskCount,
  trialFilteredRecordsCount,
  trialMaxRows,
  onTrialMaxRowsChange,
  latestTrialTaskGroup,
  trialRunMessage,
}: Props) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
      <div className="w-full max-w-4xl rounded-xl border bg-card shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
          <div className="space-y-1">
            <h3 className="text-base font-semibold">试运行</h3>
            <p className="text-xs text-muted-foreground">
              勾选少量日期与维度值后，对所有指标发起小范围采集。提示词沿用“采集提示词管理”中已保存的配置。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            关闭
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div />
            <button
              type="button"
              onClick={onStartTrialRun}
              disabled={!canStartTrialRun || isStartingTrialRun}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium",
                !canStartTrialRun || isStartingTrialRun
                  ? "cursor-not-allowed bg-muted text-muted-foreground"
                  : "bg-primary text-primary-foreground hover:opacity-90",
              )}
            >
              {isStartingTrialRun ? "试运行中..." : "开始试运行"}
            </button>
          </div>

          {taskPlanBlockerMessage ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {taskPlanBlockerMessage}
            </div>
          ) : null}

          {usesBusinessDateAxis ? (
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">选择日期</div>
              <div className="flex flex-wrap gap-2">
                {trialAvailableBusinessDates.length === 0 ? (
                  <span className="text-xs text-muted-foreground">当前范围暂无可选业务日期。</span>
                ) : trialAvailableBusinessDates.slice(0, 18).map((businessDate) => (
                  <button
                    key={businessDate}
                    type="button"
                    onClick={() => onToggleTrialBusinessDate(businessDate)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-[11px]",
                      trialBusinessDates.includes(businessDate)
                        ? "border-primary bg-primary/10 text-primary"
                        : "bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
                    )}
                  >
                    {businessDate}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-medium text-muted-foreground">选择采集参数</div>
              <button
                type="button"
                onClick={onClearTrialParameterSelection}
                className="text-[11px] text-muted-foreground hover:text-foreground"
              >
                全部
              </button>
            </div>
            {trialParameterColumns.length === 0 ? (
              <div className="rounded-lg border border-dashed bg-background px-4 py-4 text-xs text-muted-foreground">
                当前宽表没有可展示的采集参数列，将按当前预览范围抽样试运行。
              </div>
            ) : trialParameterRows.length === 0 ? (
              <div className="rounded-lg border border-dashed bg-background px-4 py-4 text-xs text-muted-foreground">
                当前需求暂无可选择的采集参数，请先回到【需求】页完善采集参数表并保存。
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border bg-background">
                <div className="max-h-72 overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-muted/40">
                      <tr className="border-b">
                        <th className="w-12 px-3 py-2 text-left">选择</th>
                        <th className="w-12 px-3 py-2 text-left">#</th>
                        {trialParameterColumns.map((column) => (
                          <th key={column.id} className="px-3 py-2 text-left font-medium">
                            <div>{column.chineseName ?? column.name}</div>
                            <div className="font-normal text-[11px] text-muted-foreground">{column.name}</div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {trialParameterRows.map((row, index) => {
                        const checked = selectedTrialParameterRowKeys.includes(row.rowKey);
                        return (
                          <tr
                            key={row.rowKey}
                            className={cn(
                              "border-b last:border-b-0 cursor-pointer hover:bg-muted/20",
                              checked && "bg-primary/5",
                            )}
                            onClick={() => onToggleTrialParameterRow(row.rowKey)}
                          >
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => onToggleTrialParameterRow(row.rowKey)}
                                onClick={(event) => event.stopPropagation()}
                              />
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">{index + 1}</td>
                            {trialParameterColumns.map((column) => (
                              <td key={`${row.rowKey}-${column.name}`} className="px-3 py-2">
                                {row.values[column.name] || "-"}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/10 px-4 py-3">
            <div className="text-xs text-muted-foreground">
              预计试运行 <span className="font-medium text-foreground">{trialEstimatedRows}</span> 行，
              生成 <span className="font-medium text-foreground">{trialEstimatedTaskCount}</span> 个采集任务。
              {trialFilteredRecordsCount > trialMaxRows ? ` 当前筛选命中 ${trialFilteredRecordsCount} 行，将按上限抽样。` : ""}
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              最大采样行数
              <input
                type="number"
                min={1}
                max={200}
                value={trialMaxRows}
                onChange={(event) => onTrialMaxRowsChange(Number(event.target.value) || 1)}
                className="w-20 rounded-md border bg-background px-2 py-1 text-xs text-foreground"
              />
            </label>
          </div>

          {latestTrialTaskGroup ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
              <span>最近一次试运行：{latestTrialTaskGroup.partitionLabel || latestTrialTaskGroup.businessDateLabel || latestTrialTaskGroup.id}</span>
              <Link
                href={`/projects/${requirementProjectId}/requirements/${requirementId}?${navQuery}tab=tasks&sub=output`}
                className="font-medium text-primary hover:underline"
                onClick={onClose}
              >
                查看试运行数据
              </Link>
            </div>
          ) : null}

          {trialRunMessage ? (
            <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
              {trialRunMessage}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
