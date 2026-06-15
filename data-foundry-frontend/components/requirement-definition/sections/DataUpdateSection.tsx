"use client";

import { useEffect, useState } from "react";
import type { DefinitionSectionId } from "@/lib/requirement-definition-navigation";
import {
  formatRequirementDataUpdateMode,
  resolveRequirementDataUpdateMode,
} from "@/lib/requirement-data-update";
import {
  hasWideTableBusinessDateDimension,
  normalizeWideTableMode,
} from "@/lib/wide-table-mode";
import {
  describeBusinessDateScheduleRule,
  describeFullSnapshotScheduleRule,
} from "@/lib/task-group-display";
import type {
  Requirement,
  WideTable,
} from "@/lib/types";
import type { StepStatus } from "@/lib/step-status";
import { cn } from "@/lib/utils";
import {
  DataUpdateEnabledCard,
  DataUpdateModeCard,
  DataUpdateOverview,
  FullUpdateSettingsCard,
  IncrementalUpdateSettingsCard,
} from "@/components/requirement-definition/data-update/DataUpdateCards";
import { SectionStatusBadge } from "@/components/requirement-definition/shared/DefinitionShared";
import { buildDefaultScheduleRule } from "@/components/requirement-definition/utils/scheduleRuleUtils";

type Props = {
  requirement: Requirement;
  entryGuide?: string;
  highlightedSections?: readonly DefinitionSectionId[];
  status: StepStatus;
  selectedWt?: WideTable;
  onRequirementChange?: (requirement: Requirement) => void;
  onUpdateWideTable?: (wideTableId: string, updater: (wideTable: WideTable) => WideTable) => void;
};

export default function DataUpdateSection({
  requirement,
  entryGuide,
  highlightedSections,
  status,
  selectedWt,
  onRequirementChange,
  onUpdateWideTable,
}: Props) {
  const [updateMessage, setUpdateMessage] = useState("");
  const usesBusinessDateAxis = Boolean(selectedWt && hasWideTableBusinessDateDimension(selectedWt));
  const effectiveMode = resolveRequirementDataUpdateMode(requirement, selectedWt);
  const hasConfirmedDataUpdateEnabled = requirement.dataUpdateEnabled != null;
  const dataUpdateEnabled = requirement.dataUpdateEnabled === true;

  useEffect(() => {
    setUpdateMessage("");
  }, [requirement.id, selectedWt?.id]);

  const updateRequirement = (patch: Partial<Requirement>) => {
    onRequirementChange?.({
      ...requirement,
      ...patch,
      updatedAt: new Date().toISOString(),
    });
  };

  const updateSelectedWideTable = (updater: (wideTable: WideTable) => WideTable) => {
    if (!selectedWt || !onUpdateWideTable) {
      return;
    }
    onUpdateWideTable(selectedWt.id, (wideTable) => normalizeWideTableMode(updater(wideTable)));
  };

  const handleDataUpdateEnabledChange = (nextEnabled: boolean) => {
    updateRequirement({
      dataUpdateEnabled: nextEnabled,
      dataUpdateMode: nextEnabled ? (requirement.dataUpdateMode ?? null) : null,
    });
    if (!nextEnabled) {
      updateSelectedWideTable((wideTable) => ({
        ...wideTable,
        collectionCoverageMode: "full_snapshot",
      }));
    }
    setUpdateMessage(
      nextEnabled
        ? "已标记为持续更新需求，请继续确认更新方式；如需调整正式范围，请回到上方的数据范围步骤。"
        : "已标记为一次性交付需求。上方数据范围会按固定范围确认，不再要求正式调度规则。",
    );
  };

  const handleDataUpdateModeChange = (mode: NonNullable<Requirement["dataUpdateMode"]>) => {
    if (!selectedWt) {
      setUpdateMessage("请先关联数据表，再选择更新方式。");
      return;
    }
    if (mode === "incremental" && !usesBusinessDateAxis) {
      setUpdateMessage("目前无业务日期字段定义，无法进行增量更新配置，请先在表结构内确认业务日期");
      return;
    }
    updateRequirement({
      dataUpdateEnabled: true,
      dataUpdateMode: mode,
    });
    updateSelectedWideTable((wideTable) => ({
      ...wideTable,
      collectionCoverageMode: mode === "incremental" ? "incremental_by_business_date" : "full_snapshot",
    }));
    setUpdateMessage(`已切换为${formatRequirementDataUpdateMode(mode)}。`);
  };

  const handleScheduleRuleChange = (
    patch: Partial<NonNullable<WideTable["scheduleRule"]>>,
  ) => {
    updateSelectedWideTable((wideTable) => {
      const nextRule = {
        ...(wideTable.scheduleRule ?? buildDefaultScheduleRule(wideTable.id, "business_date", wideTable.businessDateRange.frequency)),
        ...patch,
      };
      return {
        ...wideTable,
        scheduleRule: {
          ...nextRule,
          description: describeBusinessDateScheduleRule(nextRule),
        },
      };
    });
    setUpdateMessage("增量更新调度设置已修改。");
  };

  const handleFullSnapshotScheduleRuleChange = (
    patch: Partial<NonNullable<WideTable["scheduleRule"]>>,
  ) => {
    updateSelectedWideTable((wideTable) => {
      const nextRule = {
        ...(wideTable.scheduleRule ?? buildDefaultScheduleRule(wideTable.id, "full_snapshot", wideTable.businessDateRange.frequency)),
        ...patch,
      };

      return {
        ...wideTable,
        scheduleRule: {
          ...nextRule,
          description: describeFullSnapshotScheduleRule(nextRule),
        },
      };
    });
    setUpdateMessage("全量更新调度设置已修改。");
  };

  const handleApplyDefaultScheduleRule = (
    mode: "business_date" | "full_snapshot",
  ) => {
    if (!selectedWt) {
      return;
    }
    if (mode === "business_date" && !usesBusinessDateAxis) {
      setUpdateMessage("目前无业务日期字段定义，无法进行增量更新配置，请先在表结构内确认业务日期");
      return;
    }

    updateSelectedWideTable((wideTable) => ({
      ...wideTable,
      scheduleRule: buildDefaultScheduleRule(wideTable.id, mode, wideTable.businessDateRange.frequency),
    }));
    setUpdateMessage("已应用默认调度规则，请按需调整。");
  };

  const modeOptions: Array<{
    mode: NonNullable<Requirement["dataUpdateMode"]>;
    title: string;
    description: string;
  }> = [
    {
      mode: "full",
      title: "全量更新",
      description: "按当前范围整表重跑，每次调度生成新的全量快照任务组。",
    },
    {
      mode: "incremental",
      title: "增量更新",
      description: "按业务日期拆分任务组，仅生成新增日期的任务输入。",
    },
  ];

  return (
    <section
      id="data-update"
      className={cn(
        "scroll-mt-28 rounded-xl border bg-card p-6 space-y-4 transition-all",
        highlightedSections?.includes("data-update") ? "border-amber-300 ring-4 ring-amber-200/70 shadow-[0_0_0_1px_rgba(251,191,36,0.35)]" : "",
      )}
    >
      <div className="space-y-1">
        {entryGuide === "production-scope" ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            你刚从【数据产出】返回。正式范围确认完成后，请在这里补充是否持续更新、更新方式和调度设置；如需持续更新但范围还未改为长期有效，请回到上方的数据范围步骤继续调整。
          </div>
        ) : null}
        <div className="flex items-center gap-2">
          <h3 className="font-semibold">5. 数据更新</h3>
          <span className="inline-flex items-center gap-1">
            <SectionStatusBadge label="数据更新配置" status={status} />
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          需求在这里确认是否持续更新，以及采用全量还是增量的更新策略。
        </p>
      </div>

      <DataUpdateOverview
        selectedWt={selectedWt}
        usesBusinessDateAxis={usesBusinessDateAxis}
        effectiveMode={effectiveMode}
      />

      <>
        <div className="grid items-start gap-3 lg:grid-cols-2">
          <DataUpdateEnabledCard
            currentValue={requirement.dataUpdateEnabled}
            onChange={handleDataUpdateEnabledChange}
          />

          <DataUpdateModeCard
            visible={hasConfirmedDataUpdateEnabled && dataUpdateEnabled}
            effectiveMode={effectiveMode}
            onChange={handleDataUpdateModeChange}
            modeOptions={modeOptions}
          />
        </div>

        {dataUpdateEnabled ? (
          <>
            <IncrementalUpdateSettingsCard
              visible={effectiveMode === "incremental"}
              selectedWt={selectedWt}
              usesBusinessDateAxis={usesBusinessDateAxis}
              onApplyDefaultScheduleRule={() => handleApplyDefaultScheduleRule("business_date")}
              onScheduleRuleChange={handleScheduleRuleChange}
              describeRule={describeBusinessDateScheduleRule}
            />

            <FullUpdateSettingsCard
              visible={effectiveMode === "full"}
              selectedWt={selectedWt}
              onApplyDefaultScheduleRule={() => handleApplyDefaultScheduleRule("full_snapshot")}
              onFullSnapshotScheduleRuleChange={handleFullSnapshotScheduleRuleChange}
              describeRule={describeFullSnapshotScheduleRule}
            />
          </>
        ) : null}
      </>

      {updateMessage ? (
        <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary">
          {updateMessage}
        </div>
      ) : null}
    </section>
  );
}
