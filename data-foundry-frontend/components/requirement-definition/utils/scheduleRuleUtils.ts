import {
  describeFullSnapshotScheduleRule,
} from "@/lib/task-group-display";
import type { WideTable } from "@/lib/types";

export function buildDefaultScheduleRule(
  wideTableId: string,
  mode: "business_date" | "full_snapshot",
  frequency: WideTable["businessDateRange"]["frequency"],
): NonNullable<WideTable["scheduleRule"]> {
  if (mode === "full_snapshot") {
    const rule = {
      id: `sr_${wideTableId}`,
      wideTableId,
      type: "periodic" as const,
      periodLabel: frequency,
      businessDateOffsetDays: 1,
      description: "",
    };
    return {
      ...rule,
      description: describeFullSnapshotScheduleRule(rule),
    };
  }

  return {
    id: `sr_${wideTableId}`,
    wideTableId,
    type: "periodic",
    businessDateOffsetDays: 1,
    description: "业务日期后 1 天触发未来任务",
  };
}

export function fallbackBusinessDateEnd(start: string): string {
  return start || new Date().toISOString().slice(0, 10);
}

export function formatBusinessDateEnd(end: string | "never"): string {
  return end === "never" ? "never" : end;
}
