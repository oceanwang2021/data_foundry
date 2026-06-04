"use client";

import { cn } from "@/lib/utils";

type Props = {
  onSave: () => void;
  onSubmit: () => void;
  saveDisabled: boolean;
  submitDisabled: boolean;
  isSavingDefinition: boolean;
  isSubmittingDefinition: boolean;
  submitDisabledReason: string;
  submitMessage: string;
};

export default function DefinitionActionBar({
  onSave,
  onSubmit,
  saveDisabled,
  submitDisabled,
  isSavingDefinition,
  isSubmittingDefinition,
  submitDisabledReason,
  submitMessage,
}: Props) {
  return (
    <section className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">需求操作</div>
          <div className="mt-1 text-xs text-muted-foreground">
            保存用于落库当前配置；提交后才能进入任务环节并生成任务组。
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onSave}
            disabled={saveDisabled}
            className={cn(
              "rounded-md border px-3 py-2 text-xs font-medium",
              saveDisabled
                ? "cursor-not-allowed bg-muted text-muted-foreground"
                : "bg-background hover:bg-muted/30",
            )}
          >
            {isSavingDefinition ? "保存中..." : "保存"}
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitDisabled}
            className={cn(
              "rounded-md px-3 py-2 text-xs font-medium",
              submitDisabled
                ? "cursor-not-allowed bg-muted text-muted-foreground"
                : "bg-primary text-primary-foreground hover:opacity-90",
            )}
          >
            {isSubmittingDefinition ? "提交中..." : "提交"}
          </button>
        </div>
      </div>

      {submitDisabledReason ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {submitDisabledReason}
        </div>
      ) : null}

      {submitMessage ? (
        <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
          {submitMessage}
        </div>
      ) : null}
    </section>
  );
}
