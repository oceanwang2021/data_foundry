"use client";

import type { StepId } from "@/lib/step-status";

export type InvalidationDialogProps = {
  open: boolean;
  changedStepLabel: string;
  affectedSteps: Array<{ id: StepId; label: string }>;
  impactSummary: {
    indicatorGroupCount: number;
    dimensionValueCount: number;
    taskGroupCount: number;
    fetchTaskCount: number;
    completedExecutionCount: number;
  };
  onConfirm: () => void;
  onCancel: () => void;
};

export default function InvalidationDialog({
  open,
  changedStepLabel,
  affectedSteps,
  impactSummary,
  onConfirm,
  onCancel,
}: InvalidationDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl border bg-card shadow-xl">
        <div className="border-b px-5 py-4 space-y-1">
          <h4 className="text-sm font-semibold">确认操作</h4>
          <p className="text-xs text-muted-foreground">
            修改「{changedStepLabel}」将导致以下下游步骤失效：
          </p>
        </div>
        <div className="space-y-4 px-5 py-4">
          <div className="flex flex-wrap gap-2">
            {affectedSteps.map((s) => (
              <span key={s.id} className="inline-flex items-center rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-[11px] text-orange-700">
                {s.id}. {s.label}
              </span>
            ))}
          </div>
          <div className="rounded-md border bg-muted/10 p-3 text-xs text-muted-foreground space-y-1">
            <div className="font-medium text-foreground">影响摘要</div>
            <div>指标组：{impactSummary.indicatorGroupCount} 个</div>
            <div>维度枚举值：{impactSummary.dimensionValueCount} 个</div>
            <div>TaskGroup：{impactSummary.taskGroupCount} 个</div>
            <div>FetchTask：{impactSummary.fetchTaskCount} 个</div>
            <div>已完成 ExecutionRecord：{impactSummary.completedExecutionCount} 个</div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              取消
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="rounded-md bg-orange-500 px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
            >
              确认
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
