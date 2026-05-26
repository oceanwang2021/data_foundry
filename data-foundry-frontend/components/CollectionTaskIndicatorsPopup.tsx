"use client";

import { useEffect } from "react";

type Props = {
  collectionTaskLabel: string;
  requirementTitle: string;
  wideTableName: string;
  indicatorNames: string[];
  onClose: () => void;
};

export default function CollectionTaskIndicatorsPopup({
  collectionTaskLabel,
  requirementTitle,
  wideTableName,
  indicatorNames,
  onClose,
}: Props) {
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
        className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl border bg-card shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b px-5 py-4">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">采集任务指标明细</h3>
            <p className="text-xs text-muted-foreground break-all">
              {collectionTaskLabel} · {indicatorNames.length} 个指标
            </p>
            <p className="text-xs text-muted-foreground break-all">
              关联需求：{requirementTitle} ｜ 目标表：{wideTableName}
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

        <div className="overflow-y-auto px-5 py-4">
          {indicatorNames.length === 0 ? (
            <div className="rounded-md border bg-muted/10 px-3 py-6 text-sm text-muted-foreground">
              当前采集任务尚未配置指标。
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {indicatorNames.map((indicatorName) => (
                <span
                  key={indicatorName}
                  className="rounded-full border bg-muted/10 px-3 py-1.5 text-xs text-foreground"
                >
                  {indicatorName}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
