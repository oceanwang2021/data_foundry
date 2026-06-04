"use client";

import { cn } from "@/lib/utils";

type Props = {
  executeLabel: string;
  isRunning: boolean;
  isQueued?: boolean;
  isCancelling?: boolean;
  executeDisabled?: boolean;
  showCancel?: boolean;
  showViewLog?: boolean;
  onExecute: () => void;
  onCancel?: () => void;
  onViewLog?: () => void;
};

export default function TaskInstanceActions({
  executeLabel,
  isRunning,
  isQueued = false,
  isCancelling = false,
  executeDisabled = false,
  showCancel = false,
  showViewLog = false,
  onExecute,
  onCancel,
  onViewLog,
}: Props) {
  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onExecute}
          disabled={executeDisabled}
          className={cn(
            "inline-flex items-center rounded-md border px-2.5 py-1 text-xs",
            "border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60",
          )}
        >
          {isQueued ? "排队中..." : isRunning ? "采集中..." : executeLabel}
        </button>
        {showCancel ? (
          <button
            type="button"
            onClick={onCancel}
            disabled={isCancelling}
            className={cn(
              "inline-flex items-center rounded-md border px-2.5 py-1 text-xs",
              "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60",
            )}
          >
            {isCancelling ? "取消中..." : "取消"}
          </button>
        ) : null}
      </div>
      {showViewLog ? (
        <button
          type="button"
          onClick={onViewLog}
          className={cn(
            "inline-flex items-center rounded-md border px-2.5 py-1 text-xs",
            "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
          )}
        >
          查看日志
        </button>
      ) : null}
    </div>
  );
}
