"use client";

import { extractBusinessDateMonth } from "@/lib/business-date";
import type { ColumnDefinition, WideTableRecord } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  isOpen: boolean;
  previewRecords: WideTableRecord[];
  previewTotalCount: number;
  previewColumns: ColumnDefinition[];
  previewBusinessDates: string[];
  previewBusinessYears: string[];
  isPreviewMonthlyFrequency: boolean;
  effectiveSelectedPreviewYear: string;
  visiblePreviewBusinessDates: string[];
  selectedPreviewBusinessDate: string;
  visiblePreviewRecords: WideTableRecord[];
  isOpenEnded: boolean;
  openEndedPreviewPeriods: number;
  onClose: () => void;
  onPreviewYearChange: (year: string) => void;
  onPreviewBusinessDateChange: (businessDate: string) => void;
};

export function ScopePreviewModal({
  isOpen,
  previewRecords,
  previewTotalCount,
  previewColumns,
  previewBusinessDates,
  previewBusinessYears,
  isPreviewMonthlyFrequency,
  effectiveSelectedPreviewYear,
  visiblePreviewBusinessDates,
  selectedPreviewBusinessDate,
  visiblePreviewRecords,
  isOpenEnded,
  openEndedPreviewPeriods,
  onClose,
  onPreviewYearChange,
  onPreviewBusinessDateChange,
}: Props) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="max-h-[86vh] w-full max-w-6xl overflow-auto rounded-xl border bg-card p-4 shadow-lg">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold">预览行</div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            关闭
          </button>
        </div>
        {previewRecords.length === 0 ? (
          <div className="rounded-md border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
            还没有可展示的预览数据，请先补齐时间范围和采集参数表。
            {isOpenEnded ? ` open-ended 范围仅会生成截至当前与未来 ${openEndedPreviewPeriods} 期的预览。` : ""}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">
              预计生成 {previewTotalCount} 行，当前展示 {previewRecords.length} 行预览。
            </div>
            {previewBusinessDates.length > 0 ? (
              <div className="space-y-2">
                {isPreviewMonthlyFrequency && previewBusinessYears.length > 0 ? (
                  <div className={cn("flex gap-2 overflow-x-auto pb-1", previewBusinessYears.length > 1 ? "border-b" : "")}>
                    {previewBusinessYears.length > 1 ? (
                      previewBusinessYears.map((year) => (
                        <button
                          key={year}
                          type="button"
                          onClick={() => onPreviewYearChange(year)}
                          className={cn(
                            "shrink-0 px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors",
                            effectiveSelectedPreviewYear === year
                              ? "border-primary text-primary"
                              : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted",
                          )}
                        >
                          {year}年
                        </button>
                      ))
                    ) : (
                      <div className="shrink-0 px-3 py-1.5 text-xs font-medium text-muted-foreground">
                        {previewBusinessYears[0]}年
                      </div>
                    )}
                  </div>
                ) : null}
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {visiblePreviewBusinessDates.map((businessDate) => (
                    <button
                      key={businessDate}
                      type="button"
                      onClick={() => onPreviewBusinessDateChange(businessDate)}
                      className={cn(
                        "shrink-0 rounded-md border px-3 py-1.5 text-xs",
                        selectedPreviewBusinessDate === businessDate
                          ? "border-primary bg-primary/10 text-primary"
                          : "bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
                      )}
                    >
                      {isPreviewMonthlyFrequency
                        ? `${extractBusinessDateMonth(businessDate) ?? businessDate.slice(5, 7)}月`
                        : businessDate}{" "}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b bg-muted/40">
                  <tr>
                    {previewColumns.map((column) => (
                      <th key={column.id} className="px-2 py-1.5 text-left">
                        {column.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {visiblePreviewRecords.map((record) => (
                    <tr key={`${record.wideTableId}-${record.id}`}>
                      {previewColumns.map((column) => (
                        <td key={column.id} className="px-2 py-1.5 text-muted-foreground">
                          {record[column.name] != null && record[column.name] !== "" ? String(record[column.name]) : "-"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
