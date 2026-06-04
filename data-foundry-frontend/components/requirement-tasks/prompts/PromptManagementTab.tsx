"use client";

import type {
  ColumnDefinition,
  IndicatorGroup,
  Requirement,
  WideTable,
} from "@/lib/types";
import {
  buildIndicatorGroupPrompt,
  type IndicatorGroupPromptBundle,
  type IndicatorGroupPromptSections,
} from "@/lib/indicator-group-prompt";
import { cn } from "@/lib/utils";
import PromptEditorCard from "@/components/requirement-tasks/prompts/PromptEditorCard";
import {
  findIndicatorColumnLabel,
  groupToneClass,
} from "@/components/requirement-tasks/utils/requirementTaskFormatters";

type PromptEditorMode = "sections" | "markdown";
type PromptSectionKey = keyof IndicatorGroupPromptSections;
type ColumnGroupOption = {
  id: string;
  name: string;
};

type Props = {
  requirement: Requirement;
  selectedWt: WideTable;
  effectiveWideTable?: WideTable | null;
  isDefinitionSubmitted: boolean;
  hasIndicatorColumns: boolean;
  indicatorColumns: ColumnDefinition[];
  hasUserDefinedGrouping: boolean;
  userDefinedIndicatorGroups: IndicatorGroup[];
  columnGroupMap: Map<string, ColumnGroupOption>;
  indicatorGroupMessage: string | null;
  canGenerateTaskPlan: boolean;
  needsScopeRefresh: boolean;
  isPersistingIndicatorGroups: boolean;
  hasCurrentVersionTaskGroups: boolean;
  taskPlanBlockerMessage: string | null;
  promptSaveMessage: string | null;
  isPersistingPrompts: boolean;
  promptEditorGroups: IndicatorGroup[];
  indicatorGroupPromptMap: Map<string, IndicatorGroupPromptBundle>;
  promptEditorModes: Record<string, PromptEditorMode>;
  promptMarkdownDrafts: Record<string, string>;
  isPromptEditable: boolean;
  onOpenIndicatorGroupModal: () => void;
  onPersistIndicatorGroups: () => void;
  onPersistPromptTemplates: () => void;
  onOpenTrialModal: () => void;
  onMarkdownModeSelect: (groupId: string, fallbackMarkdown: string) => void;
  onMarkdownDraftChange: (groupId: string, value: string) => void;
  onIndicatorGroupPromptSectionChange: (
    groupId: string,
    key: PromptSectionKey,
    value: string,
  ) => void;
};

export default function PromptManagementTab({
  requirement,
  selectedWt,
  effectiveWideTable,
  isDefinitionSubmitted,
  hasIndicatorColumns,
  indicatorColumns,
  hasUserDefinedGrouping,
  userDefinedIndicatorGroups,
  columnGroupMap,
  indicatorGroupMessage,
  canGenerateTaskPlan,
  needsScopeRefresh,
  isPersistingIndicatorGroups,
  hasCurrentVersionTaskGroups,
  taskPlanBlockerMessage,
  promptSaveMessage,
  isPersistingPrompts,
  promptEditorGroups,
  indicatorGroupPromptMap,
  promptEditorModes,
  promptMarkdownDrafts,
  isPromptEditable,
  onOpenIndicatorGroupModal,
  onPersistIndicatorGroups,
  onPersistPromptTemplates,
  onOpenTrialModal,
  onMarkdownModeSelect,
  onMarkdownDraftChange,
  onIndicatorGroupPromptSectionChange,
}: Props) {
  return (
    <>
      <section className="space-y-4 rounded-xl border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold">待采集指标</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              默认不对指标进行分组，所有指标共享一份采集提示词；如有需要，可通过【指标分组】拆分成多个指标组，每个指标组的提示词独立配置。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onOpenIndicatorGroupModal}
              disabled={!hasIndicatorColumns || !isDefinitionSubmitted}
              className={cn(
                "rounded-md border px-3 py-1.5 text-xs",
                !hasIndicatorColumns || !isDefinitionSubmitted
                  ? "cursor-not-allowed text-muted-foreground opacity-50"
                  : "text-primary hover:bg-primary/5",
              )}
            >
              指标分组
            </button>
            <button
              type="button"
              onClick={onPersistIndicatorGroups}
              disabled={!canGenerateTaskPlan || needsScopeRefresh || isPersistingIndicatorGroups}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium",
                !canGenerateTaskPlan || needsScopeRefresh || isPersistingIndicatorGroups
                  ? "cursor-not-allowed bg-muted text-muted-foreground"
                  : "bg-primary text-primary-foreground hover:opacity-90",
              )}
            >
              {isPersistingIndicatorGroups
                ? "生成中..."
                : hasCurrentVersionTaskGroups ? "重建任务组" : "生成任务组"}
            </button>
          </div>
        </div>

        <div className="rounded-lg border bg-background p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <div>
              共 {indicatorColumns.length} 个指标
              {hasUserDefinedGrouping ? ` · 已分组 ${userDefinedIndicatorGroups.length} 组` : " · 未分组"}
            </div>
            <div className="truncate">{selectedWt.name}</div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {indicatorColumns.length === 0 ? (
              <span className="text-xs text-muted-foreground">当前宽表没有指标列。</span>
            ) : (
              indicatorColumns.map((column) => (
                <span
                  key={column.id}
                  className="rounded-full border bg-muted/10 px-2 py-1 text-[11px]"
                  title={column.description || ""}
                >
                  {column.chineseName ?? column.name}
                  {column.unit ? `（${column.unit}）` : ""}
                </span>
              ))
            )}
          </div>
        </div>

        {indicatorGroupMessage ? (
          <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
            {indicatorGroupMessage}
          </div>
        ) : null}

        {!hasIndicatorColumns ? (
          <div className="text-sm text-muted-foreground">当前宽表没有指标列，暂不需要指标分组。</div>
        ) : hasUserDefinedGrouping ? (
          <div className="space-y-4">
            <div className="rounded-lg border">
              <div className="border-b bg-muted/20 px-4 py-3">
                <h4 className="text-sm font-semibold">分组概览</h4>
                <p className="mt-1 text-xs text-muted-foreground">
                  仅当你对指标进行分组后才会展示分组结果。不同颜色对应不同分组，与弹窗内保持一致。
                </p>
              </div>
              <div className="space-y-3 px-4 py-4">
                <div className="grid gap-3 lg:grid-cols-2">
                  {userDefinedIndicatorGroups
                    .slice()
                    .sort((a, b) => a.priority - b.priority)
                    .map((group) => (
                      <div
                        key={group.id}
                        className={cn(
                          "rounded-lg border px-4 py-3",
                          groupToneClass(group.id, userDefinedIndicatorGroups),
                        )}
                      >
                        <div className="text-sm font-medium">{group.name}</div>
                        <div className="mt-1 text-[11px] opacity-80">
                          {group.description || `已关联 ${group.indicatorColumns.length} 个指标`}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {group.indicatorColumns.length > 0 ? (
                            group.indicatorColumns.map((columnName) => (
                              <span
                                key={columnName}
                                className={cn(
                                  "rounded-full border px-2 py-1 text-[11px]",
                                  groupToneClass(group.id, userDefinedIndicatorGroups),
                                )}
                              >
                                {findIndicatorColumnLabel(indicatorColumns, columnName)}
                              </span>
                            ))
                          ) : (
                            <span className="text-[11px] opacity-80">该分组还没有分配指标。</span>
                          )}
                        </div>
                      </div>
                    ))}
                </div>

                {indicatorColumns.some((column) => !columnGroupMap.has(column.name)) ? (
                  <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
                    未分组指标：
                    <span className="ml-1">
                      {indicatorColumns
                        .filter((column) => !columnGroupMap.has(column.name))
                        .map((column) => column.chineseName ?? column.name)
                        .join("、")}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>

            {taskPlanBlockerMessage ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {taskPlanBlockerMessage}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-dashed bg-background px-4 py-6 text-sm text-muted-foreground">
              当前未对指标进行分组，系统将使用统一提示词采集全部指标。如需按不同指标组配置提示词，请点击右上角【指标分组】。
            </div>
            {taskPlanBlockerMessage ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {taskPlanBlockerMessage}
              </div>
            ) : null}
          </div>
        )}
      </section>

      <section className="space-y-4 rounded-xl border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold">采集提示词管理</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              提示词用于指导 Agent 采集，按指标组折叠配置。提示词配置不会影响指标拆分规则。
            </p>
          </div>
          <button
            type="button"
            onClick={onPersistPromptTemplates}
            disabled={!isDefinitionSubmitted || isPersistingPrompts}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium",
              !isDefinitionSubmitted || isPersistingPrompts
                ? "cursor-not-allowed bg-muted text-muted-foreground"
                : "bg-primary text-primary-foreground hover:opacity-90",
            )}
          >
            {isPersistingPrompts ? "保存中..." : "保存提示词"}
          </button>
        </div>

        {promptSaveMessage ? (
          <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
            {promptSaveMessage}
          </div>
        ) : null}

        {!hasIndicatorColumns ? (
          <div className="rounded-lg border border-dashed bg-background px-4 py-8 text-center text-sm text-muted-foreground">
            当前宽表没有指标列，暂不需要配置采集提示词。
          </div>
        ) : promptEditorGroups.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-background px-4 py-8 text-center text-sm text-muted-foreground">
            暂无可编辑的提示词配置。
          </div>
        ) : (
          <div className="space-y-3">
            {promptEditorGroups
              .slice()
              .sort((a, b) => a.priority - b.priority)
              .map((group, index) => {
                const promptBundle = indicatorGroupPromptMap.get(group.id)
                  ?? buildIndicatorGroupPrompt(requirement, effectiveWideTable ?? selectedWt, group);
                const editMode = promptEditorModes[group.id] ?? "markdown";
                const markdownDraft = promptMarkdownDrafts[group.id] ?? group.promptTemplate ?? promptBundle.markdown;
                const shouldOpen = promptEditorGroups.length === 1 || index === 0;

                return (
                  <PromptEditorCard
                    key={group.id}
                    group={group}
                    promptBundle={promptBundle}
                    promptEditorGroups={promptEditorGroups}
                    editMode={editMode}
                    markdownDraft={markdownDraft}
                    isPromptEditable={isPromptEditable}
                    shouldOpen={shouldOpen}
                    onMarkdownModeSelect={() => onMarkdownModeSelect(group.id, group.promptTemplate ?? promptBundle.markdown)}
                    onMarkdownDraftChange={(value) => onMarkdownDraftChange(group.id, value)}
                    onSectionChange={(sectionKey, value) => (
                      onIndicatorGroupPromptSectionChange(group.id, sectionKey, value)
                    )}
                  />
                );
              })}
          </div>
        )}

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onOpenTrialModal}
            disabled={!isDefinitionSubmitted || isPersistingPrompts}
            className={cn(
              "rounded-md px-4 py-2 text-sm font-medium",
              !isDefinitionSubmitted || isPersistingPrompts
                ? "cursor-not-allowed bg-muted text-muted-foreground"
                : "bg-primary text-primary-foreground hover:opacity-90",
            )}
          >
            试运行
          </button>
        </div>
      </section>
    </>
  );
}
