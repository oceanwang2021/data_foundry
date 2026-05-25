"use client";

import { useEffect, useMemo } from "react";

type Props = {
  collectionTaskId: string;
  rowLabel: string;
  payload: Record<string, unknown> | null;
  isLoading: boolean;
  errorMessage?: string;
  onClose: () => void;
};

export default function CollectionTaskStatusPopup({
  collectionTaskId,
  rowLabel,
  payload,
  isLoading,
  errorMessage,
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

  const formattedPayload = useMemo(() => {
    if (!payload) {
      return "";
    }
    try {
      return JSON.stringify(payload, null, 2);
    } catch {
      return String(payload);
    }
  }, [payload]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl border bg-card shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b px-5 py-4">
          <div>
            <h3 className="text-sm font-semibold">采集状态日志</h3>
            <p className="mt-1 text-xs text-muted-foreground break-all">
              {collectionTaskId} | {rowLabel}
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

        <div className="space-y-3 overflow-y-auto px-5 py-4">
          {isLoading ? (
            <div className="rounded-md border bg-muted/10 px-3 py-6 text-sm text-muted-foreground">
              正在加载采集状态...
            </div>
          ) : errorMessage ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-3 text-sm text-destructive">
              {errorMessage}
            </div>
          ) : (
            <pre className="overflow-x-auto rounded-md border bg-muted/10 px-4 py-3 text-xs leading-6 whitespace-pre-wrap break-all">
              {formattedPayload}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
