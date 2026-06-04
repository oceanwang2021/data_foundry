"use client";

import {
  CompactChoiceButton,
  CompactInfoItem,
  EditableField,
  ReadOnlyField,
} from "@/components/requirement-definition/shared/DefinitionShared";
import {
  formatRequirementDataUpdateMode,
} from "@/lib/requirement-data-update";
import type {
  Requirement,
  WideTable,
} from "@/lib/types";

export function DataUpdateOverview({
  selectedWt,
  usesBusinessDateAxis,
  effectiveMode,
}: {
  selectedWt?: WideTable;
  usesBusinessDateAxis: boolean;
  effectiveMode: Requirement["dataUpdateMode"];
}) {
  if (!selectedWt) {
    return (
      <div className="rounded-md border border-dashed px-3 py-4 text-xs text-muted-foreground">
        先关联 Schema，才能配置更新方式和调度规则。
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-3">
      <CompactInfoItem label="当前数据表" value={selectedWt.name} />
      <CompactInfoItem label="当前更新方式" value={formatRequirementDataUpdateMode(effectiveMode)} />
      <CompactInfoItem
        label="时间列定义"
        value={usesBusinessDateAxis ? (selectedWt.schema.columns.find((col) => col.isBusinessDate)?.name ?? "已定义") : "未定义"}
      />
    </div>
  );
}

export function DataUpdateEnabledCard({
  currentValue,
  onChange,
}: {
  currentValue: Requirement["dataUpdateEnabled"];
  onChange: (nextEnabled: boolean) => void;
}) {
  const options = [
    {
      value: true,
      title: "定期更新",
      description: "后续仍会持续补数并继续生成任务。",
    },
    {
      value: false,
      title: "一次性交付",
      description: "只交付本次确认范围内的数据。",
    },
  ];

  return (
    <div className="rounded-lg bg-muted/10 p-3 space-y-2.5">
      <div>
        <h4 className="text-sm font-semibold">是否定期更新</h4>
        <p className="mt-1 text-xs text-muted-foreground">
          有的正式需求只是一次性交付；只有需要后续持续更新时，才需要继续配置更新方式和调度规则。
        </p>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {options.map((option) => (
          <CompactChoiceButton
            key={option.title}
            onClick={() => onChange(option.value)}
            checked={currentValue === option.value}
            title={option.title}
            description={option.description}
          />
        ))}
      </div>
    </div>
  );
}

export function DataUpdateModeCard({
  visible,
  effectiveMode,
  onChange,
  modeOptions,
}: {
  visible: boolean;
  effectiveMode: Requirement["dataUpdateMode"];
  onChange: (mode: NonNullable<Requirement["dataUpdateMode"]>) => void;
  modeOptions: Array<{
    mode: NonNullable<Requirement["dataUpdateMode"]>;
    title: string;
    description: string;
  }>;
}) {
  if (!visible) {
    return null;
  }

  return (
    <div className="rounded-lg bg-muted/10 p-3 space-y-2.5">
      <div>
        <h4 className="text-sm font-semibold">更新方式</h4>
        <p className="mt-1 text-xs text-muted-foreground">
          更新方式由你选择。若需配置增量更新，请先在“表结构定义”中明确时间列。
        </p>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {modeOptions.map((option) => (
          <CompactChoiceButton
            key={option.mode}
            onClick={() => onChange(option.mode)}
            checked={effectiveMode === option.mode}
            title={option.title}
            description={option.description}
          />
        ))}
      </div>
    </div>
  );
}

export function IncrementalUpdateSettingsCard({
  visible,
  selectedWt,
  usesBusinessDateAxis,
  onApplyDefaultScheduleRule,
  onScheduleRuleChange,
}: {
  visible: boolean;
  selectedWt?: WideTable;
  usesBusinessDateAxis: boolean;
  onApplyDefaultScheduleRule: () => void;
  onScheduleRuleChange: (offsetDays: number) => void;
}) {
  if (!visible) {
    return null;
  }

  return (
    <div className="rounded-lg bg-muted/10 p-4 space-y-3">
      <h4 className="text-sm font-semibold">增量更新设置</h4>
      {!selectedWt ? (
        <div className="rounded-md border border-dashed px-3 py-4 text-xs text-muted-foreground">
          先关联数据表，再配置增量更新。
        </div>
      ) : (
        <>
          {!usesBusinessDateAxis ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              目前无业务日期字段定义，无法进行增量更新配置，请先在表结构内确认业务日期
            </div>
          ) : null}
          {usesBusinessDateAxis && !selectedWt.scheduleRule ? (
            <div className="flex items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-900">
              <div>当前还未配置增量更新调度规则，请先应用一条默认规则。</div>
              <button
                type="button"
                onClick={onApplyDefaultScheduleRule}
                className="shrink-0 rounded-md bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600"
              >
                应用默认规则
              </button>
            </div>
          ) : null}
          {usesBusinessDateAxis ? (
            <>
              <p className="text-xs text-muted-foreground">
                增量更新任务组按业务日期拆分，并通过“业务日期后偏移多少天”决定每个业务日期对应任务组的启动时间。
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                <EditableField
                  label="时间偏移量"
                  control={(
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={selectedWt.scheduleRule?.businessDateOffsetDays ?? 1}
                      onChange={(event) => onScheduleRuleChange(Math.max(0, Number(event.target.value) || 0))}
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    />
                  )}
                />
                <ReadOnlyField
                  label="规则说明"
                  value={`业务日期后 +${selectedWt.scheduleRule?.businessDateOffsetDays ?? 1} 天`}
                />
              </div>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}

export function FullUpdateSettingsCard({
  visible,
  selectedWt,
  onApplyDefaultScheduleRule,
  onFullSnapshotScheduleRuleChange,
  describeRule,
}: {
  visible: boolean;
  selectedWt?: WideTable;
  onApplyDefaultScheduleRule: () => void;
  onFullSnapshotScheduleRuleChange: (patch: Partial<NonNullable<WideTable["scheduleRule"]>>) => void;
  describeRule: (rule: WideTable["scheduleRule"]) => string;
}) {
  if (!visible) {
    return null;
  }

  return (
    <div className="rounded-lg bg-muted/10 p-4 space-y-3">
      <h4 className="text-sm font-semibold">全量更新设置</h4>
      {!selectedWt ? (
        <div className="rounded-md border border-dashed px-3 py-4 text-xs text-muted-foreground">
          先关联数据表，再配置全量更新。
        </div>
      ) : (
        <>
          {!selectedWt.scheduleRule ? (
            <div className="flex items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-900">
              <div>当前还未配置全量更新调度规则，请先应用一条默认规则。</div>
              <button
                type="button"
                onClick={onApplyDefaultScheduleRule}
                className="shrink-0 rounded-md bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600"
              >
                应用默认规则
              </button>
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">
            参照现有方案，全量更新不按业务日期拆任务组，而是按调度频度持续生成新的全量快照任务组。
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            <EditableField
              label="调度频度"
              control={(
                <select
                  value={selectedWt.scheduleRule?.periodLabel ?? selectedWt.businessDateRange.frequency}
                  onChange={(event) => onFullSnapshotScheduleRuleChange({ periodLabel: event.target.value })}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                >
                  <option value="daily">日频</option>
                  <option value="weekly">周频</option>
                  <option value="monthly">月频</option>
                  <option value="quarterly">季频</option>
                  <option value="yearly">年频</option>
                </select>
              )}
            />
            <EditableField
              label="时间偏移量"
              control={(
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={selectedWt.scheduleRule?.businessDateOffsetDays ?? 1}
                  onChange={(event) =>
                    onFullSnapshotScheduleRuleChange({
                      businessDateOffsetDays: Math.max(0, Number(event.target.value) || 0),
                    })
                  }
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              )}
            />
            <ReadOnlyField
              label="规则说明"
              value={describeRule(selectedWt.scheduleRule)}
            />
          </div>
        </>
      )}
    </div>
  );
}
