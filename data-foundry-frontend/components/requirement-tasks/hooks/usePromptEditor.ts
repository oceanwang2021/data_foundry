"use client";

import { useEffect, useState } from "react";
import { updateRequirementWideTable } from "@/lib/api-client";
import type { IndicatorGroup, Requirement, WideTable } from "@/lib/types";
import {
  buildIndicatorGroupPrompt,
  type IndicatorGroupPromptSections,
} from "@/lib/indicator-group-prompt";
import {
  buildDefaultIndicatorGroup,
  buildDefaultIndicatorGroupId,
} from "@/components/requirement-tasks/utils/requirementTaskViews";
import { formatTaskActionError } from "@/components/requirement-tasks/utils/requirementTaskFormatters";

type PromptEditorMode = "sections" | "markdown";
type PromptSectionKey = keyof IndicatorGroupPromptSections;

type Props = {
  requirement: Requirement;
  selectedWt?: WideTable;
  effectiveWideTable?: WideTable | null;
  promptEditorGroups: IndicatorGroup[];
  isDefinitionSubmitted: boolean;
  updateSelectedWideTable: (updater: (wideTable: WideTable) => WideTable) => void;
  onRefreshData?: () => Promise<void>;
};

export default function usePromptEditor({
  requirement,
  selectedWt,
  effectiveWideTable,
  promptEditorGroups,
  isDefinitionSubmitted,
  updateSelectedWideTable,
  onRefreshData,
}: Props) {
  const [promptSaveMessage, setPromptSaveMessage] = useState("");
  const [isPersistingPrompts, setIsPersistingPrompts] = useState(false);
  const [promptEditorModes, setPromptEditorModes] = useState<Record<string, PromptEditorMode>>({});
  const [promptMarkdownDrafts, setPromptMarkdownDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    setPromptSaveMessage("");
    setPromptEditorModes({});
    setPromptMarkdownDrafts({});
  }, [selectedWt?.id]);

  useEffect(() => {
    if (!selectedWt) {
      return;
    }

    const baseWideTable = effectiveWideTable ?? selectedWt;
    setPromptEditorModes((current) => {
      const next = { ...current };
      for (const group of promptEditorGroups) {
        next[group.id] = next[group.id] ?? "markdown";
      }
      return next;
    });

    setPromptMarkdownDrafts((current) => {
      const next = { ...current };
      for (const group of promptEditorGroups) {
        next[group.id] = next[group.id] ?? (group.promptTemplate ?? buildIndicatorGroupPrompt(requirement, baseWideTable, group).markdown);
      }
      return next;
    });
  }, [effectiveWideTable, promptEditorGroups, requirement, selectedWt]);

  const handleIndicatorGroupPromptSectionChange = (
    groupId: string,
    key: PromptSectionKey,
    value: string,
  ) => {
    updateSelectedWideTable((wideTable) => ({
      ...wideTable,
      indicatorGroups: (() => {
        const defaultGroupId = buildDefaultIndicatorGroupId(wideTable.id);
        const hasTarget = wideTable.indicatorGroups.some((group) => group.id === groupId);
        const indicatorColumnsForDefault = wideTable.schema.columns.filter(
          (column) => column.category === "indicator",
        );
        const hydratedGroups = (
          !hasTarget && groupId === defaultGroupId
            ? [...wideTable.indicatorGroups, buildDefaultIndicatorGroup(wideTable, indicatorColumnsForDefault)]
            : wideTable.indicatorGroups
        );

        return hydratedGroups.map((group) => (
          group.id === groupId
            ? {
                ...group,
                promptConfig: {
                  ...(group.promptConfig ?? {}),
                  [key]: value,
                  lastEditedAt: new Date().toISOString(),
                },
              }
            : group
        ));
      })(),
      updatedAt: new Date().toISOString(),
    }));
  };

  const buildWideTableWithPromptDrafts = (
    wideTable: WideTable,
    editedAt: string,
  ): WideTable => {
    const defaultGroupId = buildDefaultIndicatorGroupId(wideTable.id);
    const schemaIndicatorColumns = wideTable.schema.columns.filter(
      (column) => column.category === "indicator",
    );
    const storedDefaultGroup = wideTable.indicatorGroups.find(
      (group) => group.id === defaultGroupId,
    );
    const userGroups = wideTable.indicatorGroups.filter(
      (group) => group.id !== defaultGroupId,
    );
    const baseGroups = userGroups.length > 0
      ? userGroups
      : schemaIndicatorColumns.length > 0
        ? [storedDefaultGroup ?? buildDefaultIndicatorGroup(wideTable, schemaIndicatorColumns)]
        : [];

    const indicatorGroups = baseGroups.map((group) => {
      const editMode = promptEditorModes[group.id] ?? "markdown";
      const markdownDraft = promptMarkdownDrafts[group.id];

      if (editMode === "markdown") {
        const nextTemplate = markdownDraft?.trim()
          ? markdownDraft
          : group.promptTemplate?.trim()
            ? group.promptTemplate
            : buildIndicatorGroupPrompt(requirement, wideTable, group).markdown;
        return {
          ...group,
          promptTemplate: nextTemplate,
          promptConfig: {
            ...(group.promptConfig ?? {}),
            lastEditedAt: editedAt,
          },
        };
      }

      return {
        ...group,
        promptTemplate: buildIndicatorGroupPrompt(requirement, wideTable, group).markdown,
      };
    });

    return {
      ...wideTable,
      indicatorGroups,
      updatedAt: editedAt,
    };
  };

  const handlePersistPromptTemplates = async () => {
    if (!selectedWt) {
      return;
    }

    if (!isDefinitionSubmitted) {
      setPromptSaveMessage("请先在【需求】Tab 提交需求后再配置采集提示词。");
      return;
    }

    setIsPersistingPrompts(true);
    try {
      const now = new Date().toISOString();
      const nextWideTable = buildWideTableWithPromptDrafts(selectedWt, now);
      await updateRequirementWideTable(requirement.id, nextWideTable);
      updateSelectedWideTable(() => nextWideTable);
      setPromptSaveMessage("已保存采集提示词配置。");
      await onRefreshData?.();
    } catch (error) {
      setPromptSaveMessage(`保存失败：${formatTaskActionError(error)}`);
    } finally {
      setIsPersistingPrompts(false);
    }
  };

  return {
    promptSaveMessage,
    isPersistingPrompts,
    promptEditorModes,
    promptMarkdownDrafts,
    handleIndicatorGroupPromptSectionChange,
    handlePersistPromptTemplates,
    handleMarkdownModeSelect: (groupId: string, fallbackMarkdown: string) => {
      setPromptEditorModes((current) => ({ ...current, [groupId]: "markdown" }));
      setPromptMarkdownDrafts((current) => ({
        ...current,
        [groupId]: current[groupId] ?? fallbackMarkdown,
      }));
    },
    handleMarkdownDraftChange: (groupId: string, value: string) => {
      setPromptMarkdownDrafts((current) => ({
        ...current,
        [groupId]: value,
      }));
    },
    buildWideTableWithPromptDrafts,
  };
}
