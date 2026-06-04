"use client";

import { cn } from "@/lib/utils";

type Props = {
  label: string;
  value: string;
  editable: boolean;
  rows: number;
  onChange: (value: string) => void;
};

export default function PromptSectionField({
  label,
  value,
  editable,
  rows,
  onChange,
}: Props) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        readOnly={!editable}
        className={cn(
          "w-full rounded-md border bg-background px-3 py-2 text-xs leading-6",
          !editable ? "cursor-default text-muted-foreground" : "",
        )}
      />
    </label>
  );
}
