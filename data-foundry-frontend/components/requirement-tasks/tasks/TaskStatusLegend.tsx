"use client";

import { cn } from "@/lib/utils";

export type TaskStatusLegendItem = {
  status: string;
  label: string;
  count: number;
  badgeClassName: string;
  dotClassName: string;
};

type Props = {
  items: TaskStatusLegendItem[];
  className?: string;
};

export default function TaskStatusLegend({ items, className }: Props) {
  return (
    <div className={cn("flex flex-wrap gap-2 text-[11px] text-muted-foreground", className)}>
      {items.map((item) => (
        <span
          key={item.status}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-1",
            item.badgeClassName,
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", item.dotClassName)} />
          {item.label} {item.count}
        </span>
      ))}
    </div>
  );
}
