"use client";

import type { ReactNode } from "react";
import type { StepStatus } from "@/lib/step-status";
import { cn } from "@/lib/utils";

function formatStepStatusLabel(status: StepStatus): string {
  if (status === "completed") {
    return "已完成";
  }
  if (status === "invalidated") {
    return "已失效";
  }
  return "待完成";
}

export function StatusDot({
  status,
  title,
}: {
  status: StepStatus;
  title: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-3.5 w-3.5 shrink-0 rounded-full",
        status === "completed"
          ? "bg-green-500"
          : status === "invalidated"
            ? "bg-orange-400"
            : "bg-gray-300",
      )}
      title={title}
      aria-label={title}
    />
  );
}

export function SectionStatusBadge({
  label,
  status,
}: {
  label: string;
  status: StepStatus;
}) {
  return (
    <StatusDot
      status={status}
      title={`${label}: ${formatStepStatusLabel(status)}`}
    />
  );
}

export function CompactInfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/10 px-3 py-2.5">
      <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm">{value}</div>
    </div>
  );
}

export function CompactChoiceButton({
  title,
  description,
  checked,
  disabled,
  badge,
  onClick,
}: {
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  badge?: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-md border px-3 py-2 text-left transition-colors",
        checked
          ? "border-primary bg-primary/5"
          : "border-border/70 hover:border-border hover:bg-muted/20",
        disabled ? "cursor-not-allowed opacity-50" : "",
      )}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            "mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors",
            checked
              ? "border-primary bg-primary/10"
              : "border-border/70 bg-background",
          )}
          aria-hidden="true"
        >
          <span className={cn("h-2 w-2 rounded-full", checked ? "bg-primary" : "bg-transparent")} />
        </span>
        <div className="min-w-0 flex-1 space-y-0.5 md:flex md:items-center md:justify-between md:gap-3 md:space-y-0">
          <div className="min-w-0">
            <div className="text-sm font-medium leading-5">{title}</div>
            <div className="text-[11px] leading-4 text-muted-foreground">{description}</div>
          </div>
          {badge ? <div className="shrink-0">{badge}</div> : null}
        </div>
      </div>
    </button>
  );
}

export function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="rounded-md border bg-muted/10 p-3 text-xs">{value}</div>
    </div>
  );
}

export function EditableField({ label, control }: { label: string; control: ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      {control}
    </div>
  );
}
