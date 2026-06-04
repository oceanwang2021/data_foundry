"use client";

import type { ComponentType } from "react";
import {
  EditableField,
  ReadOnlyField,
} from "@/components/requirement-definition/shared/DefinitionShared";
import { frequencyLabel } from "@/components/requirement-definition/utils/requirementDefinitionFormatters";
import {
  fallbackBusinessDateEnd,
  formatBusinessDateEnd,
} from "@/components/requirement-definition/utils/scheduleRuleUtils";
import type { WideTable } from "@/lib/types";
import { cn } from "@/lib/utils";

export type ScopeBusinessDateInputProps = {
  frequency: WideTable["businessDateRange"]["frequency"];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

type Props = {
  wideTable: WideTable;
  editable: boolean;
  faded?: boolean;
  onBusinessDateRangeChange: (patch: Partial<WideTable["businessDateRange"]>) => void;
  DateInputComponent: ComponentType<ScopeBusinessDateInputProps>;
};

export function ScopeBusinessDateRangeCard({
  wideTable,
  editable,
  faded,
  onBusinessDateRangeChange,
  DateInputComponent,
}: Props) {
  return (
    <div className={cn("rounded-lg bg-muted/10 p-4 space-y-3", faded ? "opacity-60" : "")}>
      <h4 className="text-sm font-semibold">时间范围</h4>
      <p className="text-xs text-muted-foreground">请选择时间粒度，并设置对应的起止时间。</p>
      <div className="grid gap-3 text-xs md:grid-cols-3">
        {editable ? (
          <>
            <EditableField
              label="时间粒度"
              control={(
                <select
                  value={wideTable.businessDateRange.frequency}
                  onChange={(event) =>
                    onBusinessDateRangeChange({
                      frequency: event.target.value as WideTable["businessDateRange"]["frequency"],
                    })
                  }
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                >
                  <option value="daily">日</option>
                  <option value="weekly">周</option>
                  <option value="monthly">月</option>
                  <option value="quarterly">季</option>
                  <option value="yearly">年</option>
                </select>
              )}
            />
            <EditableField
              label="开始时间"
              control={(
                <DateInputComponent
                  frequency={wideTable.businessDateRange.frequency}
                  value={wideTable.businessDateRange.start}
                  onChange={(value) => onBusinessDateRangeChange({ start: value })}
                />
              )}
            />
            <EditableField
              label="结束时间"
              control={(
                wideTable.businessDateRange.end === "never" ? (
                  <input
                    value="never"
                    disabled
                    readOnly
                    className="w-full rounded-md border bg-muted/20 px-3 py-2 text-sm text-muted-foreground"
                  />
                ) : (
                  <DateInputComponent
                    frequency={wideTable.businessDateRange.frequency}
                    value={wideTable.businessDateRange.end}
                    onChange={(value) => onBusinessDateRangeChange({ end: value })}
                  />
                )
              )}
            />
            <div className="md:col-span-3">
              <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={wideTable.businessDateRange.end === "never"}
                  onChange={(event) =>
                    onBusinessDateRangeChange({
                      end: event.target.checked
                        ? "never"
                        : fallbackBusinessDateEnd(wideTable.businessDateRange.start),
                    })
                  }
                />
                结束时间为 `never`（持续更新/开放区间）
              </label>
            </div>
          </>
        ) : (
          <>
            <ReadOnlyField label="时间粒度" value={frequencyLabel(wideTable.businessDateRange.frequency)} />
            <ReadOnlyField label="开始时间" value={wideTable.businessDateRange.start} />
            <ReadOnlyField label="结束时间" value={formatBusinessDateEnd(wideTable.businessDateRange.end)} />
          </>
        )}
      </div>
    </div>
  );
}
