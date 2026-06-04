"use client";

import { ChevronRight } from "lucide-react";
import type { IndicatorGroup } from "@/lib/types";
import type {
  IndicatorGroupPromptBundle,
  IndicatorGroupPromptSections,
} from "@/lib/indicator-group-prompt";
import { cn } from "@/lib/utils";
import { groupToneClass } from "@/components/requirement-tasks/utils/requirementTaskFormatters";
import PromptReadonlyBlock from "@/components/requirement-tasks/prompts/PromptReadonlyBlock";
import PromptSectionField from "@/components/requirement-tasks/prompts/PromptSectionField";

type PromptEditorMode = "sections" | "markdown";
type PromptSectionKey = keyof IndicatorGroupPromptSections;

type Props = {
  group: IndicatorGroup;
  promptBundle: IndicatorGroupPromptBundle;
  promptEditorGroups: IndicatorGroup[];
  editMode: PromptEditorMode;
  markdownDraft: string;
  isPromptEditable: boolean;
  shouldOpen: boolean;
  onMarkdownModeSelect: () => void;
  onMarkdownDraftChange: (value: string) => void;
  onSectionChange: (sectionKey: PromptSectionKey, value: string) => void;
};

export default function PromptEditorCard({
  group,
  promptBundle,
  promptEditorGroups,
  editMode,
  markdownDraft,
  isPromptEditable,
  shouldOpen,
  onMarkdownModeSelect,
  onMarkdownDraftChange,
  onSectionChange,
}: Props) {
  return (
    <details
      open={shouldOpen}
      className={cn(
        "group rounded-lg border bg-background",
        groupToneClass(group.id, promptEditorGroups),
      )}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{group.name}</div>
          <div className="text-[11px] text-muted-foreground">
            已关联 {group.indicatorColumns.length} 个指标
          </div>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
      </summary>
      <div className="space-y-3 border-t px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-medium">Agent 提示词</div>
            <div className="text-[11px] text-muted-foreground">
              可编辑核心查询需求、业务知识和输出限制；指标与维度信息始终由需求定义生成。
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled
              className={cn(
                "rounded-md border px-2.5 py-1 text-[11px]",
                "cursor-not-allowed text-muted-foreground opacity-70",
              )}
            >
              分段编辑
            </button>
            <button
              type="button"
              onClick={onMarkdownModeSelect}
              className={cn(
                "rounded-md border px-2.5 py-1 text-[11px]",
                editMode === "markdown"
                  ? "border-primary bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              整体 Markdown
            </button>
          </div>
        </div>

        {editMode === "sections" ? (
          <div className="space-y-3">
            <PromptSectionField
              label="核心查询需求"
              value={promptBundle.sections.coreQueryRequirement}
              editable={isPromptEditable}
              rows={5}
              onChange={(value) => onSectionChange("coreQueryRequirement", value)}
            />
            <PromptSectionField
              label="业务知识"
              value={promptBundle.sections.businessKnowledge}
              editable={isPromptEditable}
              rows={4}
              onChange={(value) => onSectionChange("businessKnowledge", value)}
            />
            <PromptReadonlyBlock
              label="指标列表"
              value={promptBundle.sections.metricList}
              editable={isPromptEditable}
              rows={8}
              onChange={(value) => onSectionChange("metricList", value)}
            />
            <PromptReadonlyBlock
              label="维度列信息"
              value={promptBundle.sections.dimensionColumns}
              editable={isPromptEditable}
              rows={8}
              onChange={(value) => onSectionChange("dimensionColumns", value)}
            />
            <PromptSectionField
              label="输出限制"
              value={promptBundle.sections.outputConstraints}
              editable={isPromptEditable}
              rows={6}
              onChange={(value) => onSectionChange("outputConstraints", value)}
            />
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-[11px] text-muted-foreground">
              这里编辑的是完整 Markdown 提示词，保存后会同步到当前分组。
            </div>
            <textarea
              value={markdownDraft}
              onChange={(event) => onMarkdownDraftChange(event.target.value)}
              rows={20}
              readOnly={!isPromptEditable}
              className={cn(
                "w-full rounded-md border bg-background px-3 py-2 text-xs leading-6",
                !isPromptEditable ? "cursor-default text-muted-foreground" : "",
              )}
            />
          </div>
        )}
      </div>
    </details>
  );
}
