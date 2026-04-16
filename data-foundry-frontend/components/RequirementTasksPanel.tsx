"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type {
  ColumnDefinition,
  Requirement,
  WideTable,
  WideTableRecord,
  TaskGroup,
  FetchTask,
} from "@/lib/types";
import type { ScheduleJob } from "@/lib/domain";
import { cn } from "@/lib/utils";
import {
  createTrialRun,
  executeTask,
  executeTaskGroup,
  ensureTaskGroupTasks,
  persistWideTablePlan,
  persistWideTablePreview,
  retryTask,
} from "@/lib/api-client";
import { ChevronRight, ListTree, RotateCcw } from "lucide-react";
import {
  buildFetchTaskCardViews,
  getVisibleNarrowTableContextColumns,
  type FetchTaskCardView,
} from "@/lib/fetch-task-views";
import {
  buildBusinessDateSlots,
  formatBusinessDate,
  formatBusinessDateLabel,
  isOpenEndedBusinessDateRange,
  OPEN_ENDED_PREVIEW_PERIODS,
} from "@/lib/business-date";
import {
  buildTaskGroupExecutionSummary,
  type TaskGroupExecutionSummary,
} from "@/lib/task-group-execution";
import { resolveRequirementDataUpdateEnabled } from "@/lib/requirement-data-update";
import FetchTaskDetailPopup from "@/components/FetchTaskDetailPopup";
import RequirementDataProcessingPanel from "@/components/RequirementDataProcessingPanel";
import { StageSummaryCard } from "@/components/StageSummaryCard";
import {
  getTaskBlockSurfaceClass,
  getTaskStatusBadgeClass,
  getTaskStatusDotClass,
  getTaskStatusRailFillColor,
  taskStatusLabel,
} from "@/lib/task-status-presentation";
import {
  annotateCurrentPlanRecords,
  buildTaskPlanFingerprint,
  reconcileTaskPlanChange,
  resolveRecordPlanVersion,
  resolveCurrentPlanVersion,
  resolveTaskGroupPlanVersion,
} from "@/lib/task-plan-reconciliation";
import { isArchivedTaskGroup, isStepBComplete } from "@/lib/step-status";
import {
  LOCAL_FETCH_TASK_PREFIX,
  canShowTaskGroupRunAction,
  isLocalTaskGroupId,
  isLocalTaskId,
} from "@/lib/requirement-task-group-actions";
import { hasWideTableBusinessDateDimension } from "@/lib/wide-table-mode";
import { generateWideTablePreviewRecords } from "@/lib/wide-table-preview";
import {
  buildFullSnapshotTaskGroupPages,
  describeFullSnapshotScheduleRule,
} from "@/lib/task-group-display";
import {
  buildIndicatorGroupPrompt,
  parseIndicatorGroupPromptMarkdown,
} from "@/lib/indicator-group-prompt";

type Props = {
  requirement: Requirement;
  initialSubTab?: "prompts" | "tasks" | "output";
  wideTables: WideTable[];
  wideTableRecords: WideTableRecord[];
  taskGroups: TaskGroup[];
  fetchTasks: FetchTask[];
  scheduleJobs: ScheduleJob[];
  onUpdateWideTable?: (wideTableId: string, updater: (wideTable: WideTable) => WideTable) => void;
  onReplaceWideTableRecords?: (wideTableId: string, nextWideTableRecords: WideTableRecord[]) => void;
  onRequirementChange?: (requirement: Requirement) => void;
  onRefreshData?: () => Promise<void>;
  onWideTableRecordsChange?: (nextWideTableRecords: WideTableRecord[]) => void;
  onTaskGroupsChange: (nextTaskGroups: TaskGroup[]) => void;
  onFetchTasksChange: (nextFetchTasks: FetchTask[]) => void;
  onTaskGroupRunsChange: (nextTaskGroupRuns: ScheduleJob[]) => void;
  navSource?: "projects" | "requirements" | "tasks" | "acceptance";
};

const triggerLabel: Record<string, string> = {
  schedule: "定时调度",
  backfill: "初始补数",
  manual: "手动执行",
  manual_retry: "手动重试",
  trial: "试运行",
};

type TaskSubTabKey = "prompts" | "tasks" | "output";

const taskSubTabs: Array<{ key: TaskSubTabKey; label: string; description: string }> = [
  { key: "prompts", label: "采集提示词管理", description: "按指标组配置采集提示词。" },
  { key: "tasks", label: "采集任务", description: "查看任务实例与子任务状态。" },
  { key: "output", label: "数据产出", description: "查看采集结果与产出明细。" },
];

const DEFAULT_INDICATOR_GROUP_PREFIX = "ig_default_";

const buildDefaultIndicatorGroupId = (wideTableId: string) =>
  `${DEFAULT_INDICATOR_GROUP_PREFIX}${wideTableId}`;

const buildDefaultIndicatorGroup = (
  wideTable: WideTable,
  indicatorColumns: ColumnDefinition[],
): WideTable["indicatorGroups"][number] => ({
  id: buildDefaultIndicatorGroupId(wideTable.id),
  wideTableId: wideTable.id,
  name: "统一提示词",
  indicatorColumns: indicatorColumns.map((column) => column.name),
  priority: 1,
  description: "",
});

export default function RequirementTasksPanel({
  requirement,
  initialSubTab,
  wideTables,
  wideTableRecords,
  taskGroups,
  fetchTasks,
  scheduleJobs,
  onUpdateWideTable,
  onReplaceWideTableRecords,
  onRequirementChange,
  onRefreshData,
  onWideTableRecordsChange,
  onTaskGroupsChange,
  onFetchTasksChange,
  onTaskGroupRunsChange,
  navSource,
}: Props) {
  const searchParams = useSearchParams();
  const requestedSubTab = searchParams?.get("sub");
  const [selectedWtId, setSelectedWtId] = useState<string>(wideTables[0]?.id ?? "");
  const [expandedTgId, setExpandedTgId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskActionMessage, setTaskActionMessage] = useState("");
  const [indicatorGroupMessage, setIndicatorGroupMessage] = useState("");
  const [promptSaveMessage, setPromptSaveMessage] = useState("");
  const [isIndicatorGroupModalOpen, setIsIndicatorGroupModalOpen] = useState(false);
  const [isPersistingIndicatorGroups, setIsPersistingIndicatorGroups] = useState(false);
  const [isPersistingPrompts, setIsPersistingPrompts] = useState(false);
  const [promptEditorModes, setPromptEditorModes] = useState<Record<string, "sections" | "markdown">>({});
  const [promptMarkdownDrafts, setPromptMarkdownDrafts] = useState<Record<string, string>>({});
  const [trialBusinessDates, setTrialBusinessDates] = useState<string[]>([]);
  const [trialDimensionValues, setTrialDimensionValues] = useState<Record<string, string[]>>({});
  const [trialMaxRows, setTrialMaxRows] = useState(20);
  const [trialRunMessage, setTrialRunMessage] = useState("");
  const [isStartingTrialRun, setIsStartingTrialRun] = useState(false);
  const [isTrialModalOpen, setIsTrialModalOpen] = useState(false);
  const [runningTaskGroupIds, setRunningTaskGroupIds] = useState<string[]>([]);
  const [runningTaskIds, setRunningTaskIds] = useState<string[]>([]);
  const [activeTaskSubTab, setActiveTaskSubTab] = useState<TaskSubTabKey>(() => {
    if (requestedSubTab === "prompts" || requestedSubTab === "tasks" || requestedSubTab === "output") {
      return requestedSubTab;
    }
    if (initialSubTab === "prompts" || initialSubTab === "tasks" || initialSubTab === "output") {
      return initialSubTab;
    }
    return "prompts";
  });
  const activeTaskSubTabIndex = Math.max(
    0,
    taskSubTabs.findIndex((tab) => tab.key === activeTaskSubTab),
  );
  const requestedWtId = searchParams?.get("wt");
  const requestedTaskGroupId = searchParams?.get("tg");
  const requestedTaskId = searchParams?.get("task");
  const navQuery = navSource ? `nav=${navSource}&` : "";

  useEffect(() => {
    if (requestedWtId && wideTables.some((wideTable) => wideTable.id === requestedWtId)) {
      setSelectedWtId(requestedWtId);
    }
    if (requestedTaskGroupId) {
      setExpandedTgId(requestedTaskGroupId);
    }
    if (requestedTaskId) {
      setSelectedTaskId(requestedTaskId);
    }
  }, [requestedTaskGroupId, requestedTaskId, requestedWtId, wideTables]);

  useEffect(() => {
    if (requestedTaskGroupId || requestedTaskId) {
      setActiveTaskSubTab("tasks");
    }
  }, [requestedTaskGroupId, requestedTaskId]);

  useEffect(() => {
    if (requestedSubTab === "prompts" || requestedSubTab === "tasks" || requestedSubTab === "output") {
      setActiveTaskSubTab(requestedSubTab);
    }
  }, [requestedSubTab]);

  const selectedWt = useMemo(
    () => wideTables.find((wt) => wt.id === selectedWtId),
    [wideTables, selectedWtId],
  );
  const selectedWideTableRecords = useMemo(
    () => (
      selectedWt
        ? wideTableRecords.filter((record) => record.wideTableId === selectedWt.id)
        : []
    ),
    [selectedWt, wideTableRecords],
  );
  const selectedWideTableTaskGroups = useMemo(
    () => (
      selectedWt
        ? taskGroups.filter((taskGroup) => taskGroup.wideTableId === selectedWt.id)
        : []
    ),
    [selectedWt, taskGroups],
  );
  const usesBusinessDateAxis = Boolean(selectedWt && hasWideTableBusinessDateDimension(selectedWt));
  const dataUpdateEnabled = resolveRequirementDataUpdateEnabled(requirement);
  const currentPlanVersion = useMemo(
    () => (
      selectedWt
        ? resolveCurrentPlanVersion(
            selectedWt,
            selectedWideTableRecords,
            selectedWideTableTaskGroups,
          )
        : 1
    ),
    [selectedWideTableRecords, selectedWideTableTaskGroups, selectedWt],
  );
  const currentWideTableRecords = useMemo(
    () => (
      selectedWideTableRecords.length > 0
        ? selectedWideTableRecords.filter(
            (record) =>
              resolveRecordPlanVersion(record, currentPlanVersion) === currentPlanVersion,
          )
        : []
    ),
    [currentPlanVersion, selectedWideTableRecords],
  );
  const hasCurrentVersionTaskGroups = useMemo(
    () => Boolean(
      selectedWt && taskGroups.some(
        (taskGroup) =>
          taskGroup.wideTableId === selectedWt.id
          && resolveTaskGroupPlanVersion(taskGroup, currentPlanVersion) === currentPlanVersion,
      ),
    ),
    [currentPlanVersion, selectedWt, taskGroups],
  );
  const indicatorColumns = useMemo(
    () => selectedWt?.schema.columns.filter((column) => column.category === "indicator") ?? [],
    [selectedWt],
  );
  const trialDimensionColumns = useMemo(
    () => selectedWt?.schema.columns.filter((column) => column.category === "dimension" && !column.isBusinessDate) ?? [],
    [selectedWt],
  );
  const trialAvailableBusinessDates = useMemo(
    () => Array.from(
      new Set(
        currentWideTableRecords
          .map((record) => (selectedWt ? resolveTaskRecordBusinessDate(selectedWt, record) : ""))
          .filter(Boolean),
      ),
    ).sort((a, b) => b.localeCompare(a)),
    [currentWideTableRecords, selectedWt],
  );
  const trialAvailableDimensionValues = useMemo(() => {
    const values: Record<string, string[]> = {};
    for (const column of trialDimensionColumns) {
      values[column.name] = Array.from(
        new Set(
          currentWideTableRecords
            .map((record) => record[column.name])
            .filter((value): value is string | number => value !== undefined && value !== null && String(value).trim() !== "")
            .map(String),
        ),
      ).sort((a, b) => a.localeCompare(b, "zh-CN"));
    }
    return values;
  }, [currentWideTableRecords, trialDimensionColumns]);
  const trialFilteredRecords = useMemo(() => {
    if (!selectedWt) {
      return [] as WideTableRecord[];
    }
    return currentWideTableRecords.filter((record) => {
      const businessDate = resolveTaskRecordBusinessDate(selectedWt, record);
      if (usesBusinessDateAxis && trialBusinessDates.length > 0 && !trialBusinessDates.includes(businessDate)) {
        return false;
      }
      return trialDimensionColumns.every((column) => {
        const selectedValues = trialDimensionValues[column.name] ?? [];
        return selectedValues.length === 0 || selectedValues.includes(String(record[column.name] ?? ""));
      });
    });
  }, [
    currentWideTableRecords,
    selectedWt,
    trialBusinessDates,
    trialDimensionColumns,
    trialDimensionValues,
    usesBusinessDateAxis,
  ]);
  const defaultIndicatorGroupId = selectedWt ? buildDefaultIndicatorGroupId(selectedWt.id) : "";
  const userDefinedIndicatorGroups = useMemo(
    () => (
      selectedWt
        ? selectedWt.indicatorGroups.filter((group) => group.id !== defaultIndicatorGroupId)
        : []
    ),
    [defaultIndicatorGroupId, selectedWt],
  );
  const hasUserDefinedGrouping = userDefinedIndicatorGroups.length > 0;
  const defaultIndicatorGroup = useMemo(() => {
    if (!selectedWt) {
      return null;
    }
    return (
      selectedWt.indicatorGroups.find((group) => group.id === defaultIndicatorGroupId)
      ?? buildDefaultIndicatorGroup(selectedWt, indicatorColumns)
    );
  }, [defaultIndicatorGroupId, indicatorColumns, selectedWt]);
  const effectiveIndicatorGroups = useMemo(() => {
    if (!selectedWt) {
      return [];
    }
    if (indicatorColumns.length === 0) {
      return [];
    }
    if (hasUserDefinedGrouping) {
      return userDefinedIndicatorGroups;
    }
    return defaultIndicatorGroup ? [defaultIndicatorGroup] : [];
  }, [
    defaultIndicatorGroup,
    hasUserDefinedGrouping,
    indicatorColumns.length,
    selectedWt,
    userDefinedIndicatorGroups,
  ]);
  const effectiveWideTable = useMemo(
    () => (selectedWt ? { ...selectedWt, indicatorGroups: effectiveIndicatorGroups } : null),
    [effectiveIndicatorGroups, selectedWt],
  );
  const columnGroupMap = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const group of userDefinedIndicatorGroups) {
      for (const column of group.indicatorColumns) {
        map.set(column, { id: group.id, name: group.name });
      }
    }
    return map;
  }, [userDefinedIndicatorGroups]);
  const hasIndicatorColumns = indicatorColumns.length > 0;
  const isDefinitionSubmitted = requirement.status !== "draft";
  const isPromptEditable = !requirement.schemaLocked;
  const isIndicatorGroupingComplete = useMemo(() => {
    if (!selectedWt) {
      return false;
    }
    if (!hasIndicatorColumns) {
      return true;
    }
    if (!hasUserDefinedGrouping) {
      // 默认不要求分组：所有指标共享一份采集提示词。
      return true;
    }
    return isStepBComplete({ ...selectedWt, indicatorGroups: userDefinedIndicatorGroups });
  }, [hasIndicatorColumns, hasUserDefinedGrouping, selectedWt, userDefinedIndicatorGroups]);
  const hasPreviewRecords = currentWideTableRecords.length > 0;
  const currentTaskPlanFingerprint = useMemo(
    () => (
      effectiveWideTable && hasPreviewRecords
        ? buildTaskPlanFingerprint(effectiveWideTable, currentWideTableRecords)
        : ""
    ),
    [currentWideTableRecords, effectiveWideTable, hasPreviewRecords],
  );
  const isIndicatorGroupingDirty = Boolean(
    hasUserDefinedGrouping
    && selectedWt
    && isIndicatorGroupingComplete
    && hasPreviewRecords
    && selectedWt.currentPlanFingerprint
    && selectedWt.currentPlanFingerprint !== currentTaskPlanFingerprint,
  );
  const canGenerateTaskPlan = Boolean(
    selectedWt
    && isIndicatorGroupingComplete
    && !isIndicatorGroupingDirty
    && isDefinitionSubmitted,
  );
  const needsScopeRefresh = requirement.status === "aligning";
  const taskPlanBlockerMessage = needsScopeRefresh
    ? "范围配置已变更。请先回到【需求】Tab 调整数据范围并保存后，再回到这里生成任务组。"
    : !isDefinitionSubmitted
      ? "请先在【需求】Tab 提交需求后，再进入任务环节配置指标分组并生成任务组。"
    : !hasIndicatorColumns
      ? "当前宽表没有指标列，暂不需要任务组拆分。"
    : isIndicatorGroupingDirty
          ? "指标分组已修改，请先保存分组并重建任务组。"
        : hasUserDefinedGrouping && !isIndicatorGroupingComplete
          ? "请先完成指标分组并覆盖全部指标列，任务才能按“指标组 -> 业务周期 -> 维度组合”正确生成。"
          : "";
  const trialEstimatedRows = Math.min(trialFilteredRecords.length, trialMaxRows);
  const trialEstimatedTaskCount = trialEstimatedRows * Math.max(effectiveIndicatorGroups.length, 1);
  const latestTrialTaskGroup = useMemo(
    () => selectedWt
      ? taskGroups
          .filter((taskGroup) => taskGroup.wideTableId === selectedWt.id && taskGroup.triggeredBy === "trial")
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0]
      : undefined,
    [selectedWt, taskGroups],
  );
  const canStartTrialRun = Boolean(
    selectedWt
    && isDefinitionSubmitted
    && !needsScopeRefresh
    && hasPreviewRecords
    && effectiveIndicatorGroups.length > 0
    && trialEstimatedRows > 0
    && (!usesBusinessDateAxis || trialBusinessDates.length > 0),
  );
  const promptEditorGroups = useMemo(() => {
    if (!selectedWt) {
      return [] as WideTable["indicatorGroups"];
    }
    if (!hasIndicatorColumns) {
      return [] as WideTable["indicatorGroups"];
    }
    return hasUserDefinedGrouping
      ? userDefinedIndicatorGroups
      : defaultIndicatorGroup
        ? [defaultIndicatorGroup]
        : [];
  }, [
    defaultIndicatorGroup,
    hasIndicatorColumns,
    hasUserDefinedGrouping,
    selectedWt,
    userDefinedIndicatorGroups,
  ]);
  const indicatorGroupPromptMap = useMemo(
    () => (
      !effectiveWideTable
        ? new Map<string, ReturnType<typeof buildIndicatorGroupPrompt>>()
        : new Map(
            promptEditorGroups.map((group) => [
              group.id,
              buildIndicatorGroupPrompt(requirement, effectiveWideTable, group),
            ]),
          )
    ),
    [effectiveWideTable, promptEditorGroups, requirement],
  );
  const updateSelectedWideTable = (updater: (wideTable: WideTable) => WideTable) => {
    if (!selectedWt || !onUpdateWideTable) {
      return;
    }
    onUpdateWideTable(selectedWt.id, updater);
  };

  const wtTaskGroups = useMemo(
    () => (
      needsScopeRefresh || !canGenerateTaskPlan
        ? []
        : taskGroups
            .filter(
              (tg) =>
                tg.wideTableId === selectedWtId
                && resolveTaskGroupPlanVersion(tg, currentPlanVersion) === currentPlanVersion,
            )
            .sort((a, b) => b.businessDate.localeCompare(a.businessDate))
    ),
    [canGenerateTaskPlan, currentPlanVersion, needsScopeRefresh, selectedWtId, taskGroups],
  );

  const archivedTaskGroups = useMemo(
    () =>
      taskGroups
        .filter(
          (tg) =>
            tg.wideTableId === selectedWtId
            && isArchivedTaskGroup(tg, currentPlanVersion),
        )
        .sort((a, b) => b.businessDate.localeCompare(a.businessDate)),
    [currentPlanVersion, selectedWtId, taskGroups],
  );
  const [isArchivedSectionExpanded, setIsArchivedSectionExpanded] = useState(false);

  const toggleTaskGroupExpand = (tgId: string) => {
    setExpandedTgId((prev) => (prev === tgId ? null : tgId));

    // Lazy-generation hook: if a real task group is opened and it has no explicit tasks yet,
    // ask backend to materialize sub-task instances for this task group.
    const opened = expandedTgId !== tgId;
    if (!opened) {
      return;
    }
    const view = taskGroupRunViews.find((item) => item.id === tgId);
    if (!view?.isReal) {
      return;
    }
    const hasExplicitTasks = fetchTasks.some((task) => task.taskGroupId === tgId);
    if (hasExplicitTasks) {
      return;
    }

    void (async () => {
      try {
        await ensureTaskGroupTasks(tgId);
        await onRefreshData?.();
      } catch {
        // Keep UI usable even if backend lazy generation isn't ready yet.
      }
    })();
  };
  const returnContextColumns = useMemo(
    () => (selectedWt ? getVisibleNarrowTableContextColumns(selectedWt) : []),
    [selectedWt],
  );

  const wtScheduleJobs = useMemo(
    () => {
      const tgIds = new Set(wtTaskGroups.map((tg) => tg.id));
      return scheduleJobs.filter((sj) => tgIds.has(sj.taskGroupId));
    },
    [wtTaskGroups, scheduleJobs],
  );
  const taskGroupSummaryMap = useMemo(
    () => (
      !selectedWt
        ? new Map<string, TaskGroupExecutionSummary>()
        : new Map(
            wtTaskGroups.map((taskGroup) => {
              const scopedFetchTasks = fetchTasks.filter((task) => task.taskGroupId === taskGroup.id);
              const fallbackSummary = buildTaskGroupExecutionSummary(taskGroup, scopedFetchTasks);
              const taskCards = buildFetchTaskCardViews({
                requirement,
                wideTable: effectiveWideTable ?? undefined,
                taskGroup,
                fetchTasks: scopedFetchTasks,
                wideTableRecords: currentWideTableRecords,
              });

              if (taskCards.length === 0) {
                return [taskGroup.id, fallbackSummary] as const;
              }

              const summary = buildTaskGroupSummaryFromCards(taskGroup, fallbackSummary, taskCards);
              return [taskGroup.id, summary] as const;
            }),
          )
    ),
    [currentWideTableRecords, effectiveWideTable, fetchTasks, wtTaskGroups],
  );
  const taskPlan = useMemo(
    () => (effectiveWideTable && isIndicatorGroupingComplete ? buildTaskPlanView(effectiveWideTable) : null),
    [effectiveWideTable, isIndicatorGroupingComplete],
  );
  const taskGroupRunViews = useMemo(
    () => (
      effectiveWideTable && taskPlan && canGenerateTaskPlan
        ? buildTaskGroupRunViews(requirement, effectiveWideTable, taskPlan, wtTaskGroups, taskGroupSummaryMap, wtScheduleJobs)
        : []
    ),
    [canGenerateTaskPlan, effectiveWideTable, requirement, taskPlan, wtScheduleJobs, wtTaskGroups, taskGroupSummaryMap],
  );
  const taskGroupRunSections = useMemo(
    () => (
      effectiveWideTable
        ? buildTaskGroupRunSections(effectiveWideTable, taskGroupRunViews)
        : [{ id: "__all__", label: "", taskGroups: taskGroupRunViews }]
    ),
    [effectiveWideTable, taskGroupRunViews],
  );
  const expandedTaskGroupView = useMemo(
    () => taskGroupRunViews.find((taskGroup) => taskGroup.id === expandedTgId) ?? null,
    [taskGroupRunViews, expandedTgId],
  );
  const tgFetchTasks = useMemo(
    () => (expandedTaskGroupView?.isReal ? fetchTasks.filter((ft) => ft.taskGroupId === expandedTaskGroupView.id) : []),
    [fetchTasks, expandedTaskGroupView],
  );
  const expandedTaskCards = useMemo(
    () =>
      buildFetchTaskCardViews({
        requirement,
        wideTable: effectiveWideTable ?? undefined,
        taskGroup: expandedTaskGroupView?.taskGroupForTasks ?? null,
        fetchTasks: tgFetchTasks,
        wideTableRecords: currentWideTableRecords,
      }),
    [currentWideTableRecords, effectiveWideTable, expandedTaskGroupView, tgFetchTasks, requirement],
  );
  const selectedTask = useMemo(
    () => expandedTaskCards.find((task) => task.id === selectedTaskId) ?? null,
    [expandedTaskCards, selectedTaskId],
  );
  const expandedTaskStatusLegend = useMemo(
    () => buildTaskStatusLegend(expandedTaskCards),
    [expandedTaskCards],
  );

  useEffect(() => {
    setIndicatorGroupMessage("");
    setIsIndicatorGroupModalOpen(false);
    setPromptSaveMessage("");
    setPromptEditorModes({});
    setPromptMarkdownDrafts({});
    setTrialRunMessage("");
    setTrialDimensionValues({});
  }, [selectedWtId]);

  useEffect(() => {
    if (!usesBusinessDateAxis) {
      setTrialBusinessDates([]);
      return;
    }
    setTrialBusinessDates((current) => {
      const retained = current.filter((item) => trialAvailableBusinessDates.includes(item));
      if (retained.length > 0) {
        return retained;
      }
      return trialAvailableBusinessDates[0] ? [trialAvailableBusinessDates[0]] : [];
    });
  }, [trialAvailableBusinessDates, usesBusinessDateAxis]);

  useEffect(() => {
    if (!selectedWt) {
      return;
    }

    const baseWideTable = effectiveWideTable ?? selectedWt;
    setPromptEditorModes((current) => {
      const next = { ...current };
      for (const group of promptEditorGroups) {
        next[group.id] = next[group.id] ?? "sections";
      }
      return next;
    });

    setPromptMarkdownDrafts((current) => {
      const next = { ...current };
      for (const group of promptEditorGroups) {
        next[group.id] = next[group.id] ?? buildIndicatorGroupPrompt(requirement, baseWideTable, group).markdown;
      }
      return next;
    });
  }, [effectiveWideTable, promptEditorGroups, requirement, selectedWt]);

  const handleAddIndicatorGroup = () => {
    if (!selectedWt) {
      return;
    }

    updateSelectedWideTable((wideTable) => ({
      ...wideTable,
      indicatorGroups: (() => {
        const defaultGroupId = buildDefaultIndicatorGroupId(wideTable.id);
        const existingUserGroups = wideTable.indicatorGroups.filter(
          (group) => group.id !== defaultGroupId,
        );
        const nextIndex = existingUserGroups.length + 1;
        return [
          ...existingUserGroups,
          {
            id: `ig_${wideTable.id}_${Date.now()}`,
            wideTableId: wideTable.id,
            name: `新指标组${nextIndex}`,
            indicatorColumns: [],
            priority: nextIndex,
            description: "",
          },
        ];
      })(),
      updatedAt: new Date().toISOString(),
    }));
  };

  const handleDeleteIndicatorGroup = (groupId: string) => {
    updateSelectedWideTable((wideTable) => ({
      ...wideTable,
      indicatorGroups: (() => {
        const defaultGroupId = buildDefaultIndicatorGroupId(wideTable.id);
        return wideTable.indicatorGroups
          .filter((group) => group.id !== defaultGroupId && group.id !== groupId)
          .map((group, index) => ({
            ...group,
            priority: index + 1,
          }));
      })(),
      updatedAt: new Date().toISOString(),
    }));
  };

  const handleIndicatorGroupChange = (
    groupId: string,
    patch: Partial<WideTable["indicatorGroups"][number]>,
  ) => {
    updateSelectedWideTable((wideTable) => ({
      ...wideTable,
      indicatorGroups: wideTable.indicatorGroups.map((group) => (
        group.id === groupId ? { ...group, ...patch } : group
      )),
      updatedAt: new Date().toISOString(),
    }));
  };

  const handleIndicatorGroupPromptSectionChange = (
    groupId: string,
    key: "coreQueryRequirement" | "businessKnowledge" | "metricList" | "dimensionColumns" | "outputConstraints",
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
      const editMode = promptEditorModes[group.id] ?? "sections";
      let nextGroup = group;

      if (editMode === "markdown") {
        const markdownDraft = promptMarkdownDrafts[group.id];
        if (markdownDraft !== undefined) {
          const parsedConfig = parseIndicatorGroupPromptMarkdown(markdownDraft) ?? {};
          nextGroup = {
            ...group,
            promptConfig: {
              ...(group.promptConfig ?? {}),
              ...(parsedConfig.coreQueryRequirement !== undefined
                ? { coreQueryRequirement: parsedConfig.coreQueryRequirement }
                : {}),
              ...(parsedConfig.businessKnowledge !== undefined
                ? { businessKnowledge: parsedConfig.businessKnowledge }
                : {}),
              ...(parsedConfig.metricList !== undefined
                ? { metricList: parsedConfig.metricList }
                : {}),
              ...(parsedConfig.dimensionColumns !== undefined
                ? { dimensionColumns: parsedConfig.dimensionColumns }
                : {}),
              ...(parsedConfig.outputConstraints !== undefined
                ? { outputConstraints: parsedConfig.outputConstraints }
                : {}),
              lastEditedAt: editedAt,
            },
          };
        }
      }

      return {
        ...nextGroup,
        promptTemplate: buildIndicatorGroupPrompt(requirement, wideTable, nextGroup).markdown,
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

    if (!isPromptEditable) {
      setPromptSaveMessage("提示词已锁定为只读；如需调整，请先回到需求侧修改并重新生成计划。");
      return;
    }

    setIsPersistingPrompts(true);
    try {
      const now = new Date().toISOString();
      const nextWideTable = buildWideTableWithPromptDrafts(selectedWt, now);
      await persistWideTablePreview(requirement.id, nextWideTable, currentWideTableRecords);
      updateSelectedWideTable(() => nextWideTable);
      setPromptSaveMessage("已保存采集提示词配置。");
      await onRefreshData?.();
    } catch (error) {
      setPromptSaveMessage(`保存失败：${formatTaskActionError(error)}`);
    } finally {
      setIsPersistingPrompts(false);
    }
  };

  const handleAssignIndicatorColumnToGroup = (columnName: string, groupId: string) => {
    updateSelectedWideTable((wideTable) => ({
      ...wideTable,
      indicatorGroups: (() => {
        const defaultGroupId = buildDefaultIndicatorGroupId(wideTable.id);
        return wideTable.indicatorGroups
          .filter((group) => group.id !== defaultGroupId)
          .map((group) => {
            const nextColumns = group.indicatorColumns.filter((column) => column !== columnName);
            if (group.id === groupId) {
              return {
                ...group,
                indicatorColumns: [...nextColumns, columnName],
              };
            }
            return {
              ...group,
              indicatorColumns: nextColumns,
            };
          });
      })(),
      updatedAt: new Date().toISOString(),
    }));
  };

  const handleClearIndicatorColumnGroup = (columnName: string) => {
    updateSelectedWideTable((wideTable) => ({
      ...wideTable,
      indicatorGroups: (() => {
        const defaultGroupId = buildDefaultIndicatorGroupId(wideTable.id);
        return wideTable.indicatorGroups
          .filter((group) => group.id !== defaultGroupId)
          .map((group) => ({
            ...group,
            indicatorColumns: group.indicatorColumns.filter((column) => column !== columnName),
          }));
      })(),
      updatedAt: new Date().toISOString(),
    }));
  };

  const ensurePreviewRows = async (wideTable: WideTable, now: string) => {
    if (currentWideTableRecords.length > 0) {
      return { wideTable, records: currentWideTableRecords };
    }

    const { records, totalCount } = generateWideTablePreviewRecords(wideTable, currentWideTableRecords, wideTableRecords);
    if (totalCount === 0) {
      throw new Error(
        usesBusinessDateAxis
          ? "当前业务日期范围或维度取值不足，无法生成预览行。请先回到【需求】完善数据范围。"
          : "当前维度取值不足，无法生成快照预览行。请先回到【需求】完善数据范围。",
      );
    }

    const reconciliation = reconcileTaskPlanChange({
      requirement,
      wideTable,
      previousRecords: currentWideTableRecords,
      nextRecords: records,
      taskGroups,
      fetchTasks,
    });
    const nextPlanVersion = reconciliation.nextPlanVersion || Math.max(
      1,
      resolveCurrentPlanVersion(wideTable, currentWideTableRecords, taskGroups),
    );
    const nextPlanFingerprint = reconciliation.nextPlanFingerprint || buildTaskPlanFingerprint(wideTable, records);
    const recordsToPersist = records.map((record) => ({
      ...record,
      _metadata: {
        ...record._metadata,
        planVersion: nextPlanVersion,
        snapshotKind: "baseline" as const,
      },
    }));
    const persistedWideTable: WideTable = {
      ...wideTable,
      currentPlanVersion: nextPlanVersion,
      currentPlanFingerprint: nextPlanFingerprint,
      recordCount: totalCount,
      status: wideTable.status === "active" ? "active" : "initialized",
      updatedAt: now,
    };

    await persistWideTablePreview(requirement.id, persistedWideTable, recordsToPersist);
    updateSelectedWideTable(() => persistedWideTable);
    onReplaceWideTableRecords?.(wideTable.id, recordsToPersist);
    return { wideTable: persistedWideTable, records: recordsToPersist };
  };

  const handlePersistIndicatorGroups = async () => {
    if (!selectedWt) {
      return;
    }

    if (!isDefinitionSubmitted) {
      setIndicatorGroupMessage("请先在【需求】Tab 提交需求后再配置指标分组并生成任务组。");
      return;
    }

    const now = new Date().toISOString();
    const nextWideTable = buildWideTableWithPromptDrafts(selectedWt, now);

    if (!hasIndicatorColumns) {
      setIndicatorGroupMessage("当前宽表没有指标列，无需配置指标分组。");
      return;
    }

    setIsPersistingIndicatorGroups(true);
    try {
      if (!isIndicatorGroupingComplete) {
        await persistWideTablePreview(requirement.id, nextWideTable, currentWideTableRecords);
        updateSelectedWideTable(() => nextWideTable);
        setIndicatorGroupMessage("已保存指标分组草稿。请把所有指标分配到分组后，再保存并生成任务组。");
        return;
      }

      const ensuredPreview = await ensurePreviewRows(nextWideTable, now);
      const previewWideTable = ensuredPreview.wideTable;
      const previewRecords = ensuredPreview.records;

      const reconciliation = reconcileTaskPlanChange({
        requirement,
        wideTable: previewWideTable,
        previousRecords: previewRecords,
        nextRecords: previewRecords,
        taskGroups,
        fetchTasks,
      });
      const nextPlanVersion = reconciliation.nextPlanVersion || Math.max(
        1,
        resolveCurrentPlanVersion(previewWideTable, previewRecords, taskGroups),
      );
      const nextPlanFingerprint = reconciliation.nextPlanFingerprint || buildTaskPlanFingerprint(
        previewWideTable,
        previewRecords,
      );
      const annotatedRecords = annotateCurrentPlanRecords(previewRecords, nextPlanVersion);
      const persistedWideTable: WideTable = {
        ...previewWideTable,
        currentPlanVersion: nextPlanVersion,
        currentPlanFingerprint: nextPlanFingerprint,
        recordCount: previewWideTable.recordCount > 0 ? previewWideTable.recordCount : annotatedRecords.length,
        status: previewWideTable.status === "active" ? "active" : "initialized",
        updatedAt: now,
      };

      if (reconciliation.structuralChange) {
        await persistWideTablePlan(
          requirement.id,
          persistedWideTable,
          annotatedRecords,
          reconciliation.taskGroups.filter((taskGroup) => taskGroup.wideTableId === selectedWt.id),
        );
        onTaskGroupsChange(reconciliation.taskGroups);
        onFetchTasksChange(reconciliation.fetchTasks);
        onReplaceWideTableRecords?.(selectedWt.id, annotatedRecords);
        setIndicatorGroupMessage(
          usesBusinessDateAxis
            ? `已保存指标分组，并生成 ${reconciliation.generatedTaskGroupCount} 个任务实例（子任务将在打开/执行任务实例时按需生成）。`
            : `已保存指标分组，并生成当前快照的 ${reconciliation.generatedTaskGroupCount} 个任务实例（子任务将在打开/执行任务实例时按需生成）。`,
        );
      } else {
        await persistWideTablePreview(
          requirement.id,
          persistedWideTable,
          annotatedRecords,
        );
        setIndicatorGroupMessage("已保存指标分组配置，当前任务计划无需重建。");
      }

      updateSelectedWideTable(() => persistedWideTable);
      if (reconciliation.structuralChange && requirement.status !== "running") {
        onRequirementChange?.({
          ...requirement,
          status: "running",
          schemaLocked: true,
          updatedAt: now,
        });
      }
      await onRefreshData?.();
    } catch (error) {
      setIndicatorGroupMessage(`保存失败：${formatTaskActionError(error)}`);
    } finally {
      setIsPersistingIndicatorGroups(false);
    }
  };

  const refreshAfterExecution = async () => {
    if (!onRefreshData) {
      return;
    }

    for (const waitMs of [0, 800, 800, 1200]) {
      if (waitMs > 0) {
        await delay(waitMs);
      }
      try {
        await onRefreshData();
      } catch {
        break;
      }
    }
  };

  const handleToggleTrialBusinessDate = (businessDate: string) => {
    setTrialBusinessDates((current) => (
      current.includes(businessDate)
        ? current.filter((item) => item !== businessDate)
        : [...current, businessDate]
    ));
  };

  const handleToggleTrialDimensionValue = (columnName: string, value: string) => {
    setTrialDimensionValues((current) => {
      const existing = current[columnName] ?? [];
      return {
        ...current,
        [columnName]: existing.includes(value)
          ? existing.filter((item) => item !== value)
          : [...existing, value],
      };
    });
  };

  const handleStartTrialRun = async () => {
    if (!selectedWt || !canStartTrialRun) {
      setTrialRunMessage(
        taskPlanBlockerMessage || "请先选择试运行范围，并确保当前范围内存在可采集的预览行。",
      );
      return;
    }

    const scopedDimensions = Object.fromEntries(
      Object.entries(trialDimensionValues).filter(([, values]) => values.length > 0),
    );
    setIsStartingTrialRun(true);
    setTrialRunMessage("正在创建试运行任务，并发起小范围采集。");
    try {
      const result = await createTrialRun(requirement.id, {
        wideTableId: selectedWt.id,
        businessDates: usesBusinessDateAxis ? trialBusinessDates : [],
        dimensionValues: scopedDimensions,
        maxRows: trialMaxRows,
        operator: "当前用户",
      });
      const createdTaskGroupIds = new Set(result.taskGroups.map((taskGroup) => taskGroup.id));
      const createdTaskIds = new Set(result.fetchTasks.map((task) => task.id));
      onTaskGroupsChange([
        ...taskGroups.filter((taskGroup) => !createdTaskGroupIds.has(taskGroup.id)),
        ...result.taskGroups,
      ]);
      onFetchTasksChange([
        ...fetchTasks.filter((task) => !createdTaskIds.has(task.id)),
        ...result.fetchTasks,
      ]);
      onTaskGroupRunsChange([
        ...scheduleJobs,
        ...result.taskGroups.map((taskGroup, index) => ({
          id: `TRIAL-RUN-${Date.now()}-${index + 1}`,
          taskGroupId: taskGroup.id,
          wideTableId: taskGroup.wideTableId,
          triggerType: "trial" as const,
          status: "running" as const,
          startedAt: formatRunTimestamp(new Date()),
          operator: "当前用户",
          logRef: `log://${taskGroup.id}/trial`,
        })),
      ]);
      setRunningTaskGroupIds((current) => Array.from(new Set([
        ...current,
        ...result.taskGroups.map((taskGroup) => taskGroup.id),
      ])));

      await Promise.all(
        result.taskGroups.map((taskGroup) =>
          executeTaskGroup(taskGroup.id, { triggerType: "trial", operator: "当前用户" }),
        ),
      );
      setExpandedTgId(result.taskGroups[0]?.id ?? null);
      setTrialRunMessage(
        `已发起试运行：${result.rowCount} 行、${result.taskCount} 个采集任务。试运行数据会流转到数据产出和验收页面。`,
      );
      await refreshAfterExecution();
    } catch (error) {
      setTrialRunMessage(`试运行失败：${formatTaskActionError(error)}`);
    } finally {
      setIsStartingTrialRun(false);
      setRunningTaskGroupIds((current) =>
        current.filter((id) => !id.startsWith("TG-TRIAL-")),
      );
    }
  };

  const handleRequestTaskGroupRerun = async (taskGroupView: HistoricalTaskGroupView) => {
    if (isLocalTaskGroupId(taskGroupView.id)) {
      applyLocalTaskGroupExecution(taskGroupView);
      return;
    }

    if (!taskGroupView.isReal) {
      return;
    }

    const now = new Date();
    const startedAt = now.toISOString();
    const runId = buildTaskGroupRunId(scheduleJobs);
    const runRecord: ScheduleJob = {
      id: runId,
      taskGroupId: taskGroupView.id,
      triggerType: "manual",
      status: "running",
      startedAt: formatRunTimestamp(now),
      operator: "当前用户",
      logRef: `log://${taskGroupView.id}/${runId.toLowerCase()}`,
    };

    onTaskGroupsChange(
      taskGroups.map((taskGroup) => (
        taskGroup.id === taskGroupView.id
          ? {
              ...taskGroup,
              status: "running",
              triggeredBy: "manual",
              updatedAt: startedAt,
            }
          : taskGroup
      )),
    );
    onTaskGroupRunsChange([...scheduleJobs, runRecord]);
    setRunningTaskGroupIds((prev) => (prev.includes(taskGroupView.id) ? prev : [...prev, taskGroupView.id]));
      setTaskActionMessage(
        taskGroupView.displayStatus === "pending" || taskGroupView.displayStatus === "invalidated"
        ? `已发起任务组 ${taskGroupView.displayLabel} 的手动执行，正在同步最新结果。`
        : `已发起任务组 ${taskGroupView.displayLabel} 的整组重执行，正在同步最新结果。`,
      );
    try {
      await executeTaskGroup(taskGroupView.id);
      await refreshAfterExecution();
    } catch (error) {
      setTaskActionMessage(`执行失败：${formatTaskActionError(error)}`);
    } finally {
      setRunningTaskGroupIds((prev) => prev.filter((id) => id !== taskGroupView.id));
    }
  };

  const handleRequestTaskRerun = async (taskId: string, rowLabel: string) => {
    const now = new Date().toISOString();
    const targetTask = fetchTasks.find((task) => task.id === taskId);
    if (!targetTask) {
      return;
    }

    if (isLocalTaskId(taskId)) {
      applyLocalTaskExecution(taskId, rowLabel);
      return;
    }

    const nextAttempt = targetTask.executionRecords.length + 1;
    onFetchTasksChange(
      fetchTasks.map((task) => (
        task.id === taskId
          ? {
              ...task,
              status: "running",
              updatedAt: now,
              executionRecords: [
                ...task.executionRecords,
                {
                  id: buildExecutionRecordId(task.id, nextAttempt, "retry"),
                  fetchTaskId: task.id,
                  attempt: nextAttempt,
                  status: "running",
                  triggeredBy: "manual_retry",
                  startedAt: now,
                },
              ],
            }
          : task
      )),
    );
    onTaskGroupsChange(
      taskGroups.map((taskGroup) => (
        taskGroup.id === targetTask.taskGroupId
          ? {
              ...taskGroup,
              status: "running",
              completedTasks: targetTask.status === "completed"
                ? Math.max(taskGroup.completedTasks - 1, 0)
                : taskGroup.completedTasks,
              failedTasks: targetTask.status === "failed"
                ? Math.max(taskGroup.failedTasks - 1, 0)
                : taskGroup.failedTasks,
              updatedAt: now,
            }
          : taskGroup
      )),
    );
    setRunningTaskIds((prev) => (prev.includes(taskId) ? prev : [...prev, taskId]));
    setTaskActionMessage(`已发起任务 ${taskId}（${rowLabel}）的单任务执行，正在同步最新结果。`);
    try {
      if (targetTask.status === "failed") {
        await retryTask(taskId);
      } else {
        await executeTask(taskId);
      }
      await refreshAfterExecution();
    } catch (error) {
      setTaskActionMessage(`执行失败：${formatTaskActionError(error)}`);
    } finally {
      setRunningTaskIds((prev) => prev.filter((id) => id !== taskId));
    }
  };

  return (
    <div className="space-y-6">
      {!isDefinitionSubmitted ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 space-y-2">
          <div className="font-semibold">需求尚未提交</div>
          <div>
            提交需求后才能进入任务环节并生成任务组。请先回到需求页面完成录入并点击“提交”。
          </div>
          <div>
            <Link
              href={`/projects/${requirement.projectId}/requirements/${requirement.id}?${navQuery}view=requirement&tab=requirement`}
              className="text-amber-900 underline underline-offset-4 hover:opacity-80"
            >
              去提交需求
            </Link>
          </div>
        </section>
      ) : null}

      {/* 宽表选择 */}
      {wideTables.length > 1 ? (
        <section className="rounded-xl border bg-card p-3">
          <div className="flex gap-2 overflow-x-auto">
            {wideTables.map((wt) => (
              <button
                key={wt.id}
                type="button"
                onClick={() => { setSelectedWtId(wt.id); setExpandedTgId(null); }}
                className={cn(
                  "shrink-0 rounded-md border px-3 py-1.5 text-xs",
                  selectedWtId === wt.id
                    ? "border-primary bg-primary/10 text-primary"
                    : "bg-background text-muted-foreground hover:text-foreground",
                )}
              >
                {wt.name}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {selectedWt ? (
        <nav
          aria-label="任务页面导航"
          className={cn(
            "relative z-20 grid overflow-hidden rounded-xl border border-border/80 bg-background/98 shadow-md backdrop-blur-md supports-[backdrop-filter]:bg-background/92",
            "grid-cols-3",
          )}
        >
          {taskSubTabs.map((tab, index) => (
            <StageSummaryCard
              key={tab.key}
              href={`#task-${tab.key}`}
              index={index + 1}
              title={tab.label}
              description={tab.description}
              isActive={activeTaskSubTab === tab.key}
              onNavigate={(event) => {
                event.preventDefault();
                setActiveTaskSubTab(tab.key);
              }}
            />
          ))}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] bg-border/80">
            <div
              className="h-full bg-primary transition-transform duration-200 ease-out"
              style={{
                width: `${100 / taskSubTabs.length}%`,
                transform: `translateX(${activeTaskSubTabIndex * 100}%)`,
              }}
            />
          </div>
        </nav>
      ) : null}

      {selectedWt && activeTaskSubTab === "prompts" ? (
        <section className="rounded-xl border bg-card p-6 space-y-4">
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
                onClick={() => setIsIndicatorGroupModalOpen(true)}
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
                onClick={() => void handlePersistIndicatorGroups()}
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
                    {column.chineseName ?? column.name}{column.unit ? `（${column.unit}）` : ""}
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
                          className={cn("rounded-lg border px-4 py-3", groupToneClass(group.id, userDefinedIndicatorGroups))}
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
                                  className={cn("rounded-full border px-2 py-1 text-[11px]", groupToneClass(group.id, userDefinedIndicatorGroups))}
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
      ) : null}

      {selectedWt && activeTaskSubTab === "output" ? (
        <RequirementDataProcessingPanel
          requirement={requirement}
          wideTables={wideTables}
          wideTableRecords={wideTableRecords}
          taskGroups={taskGroups}
          fetchTasks={fetchTasks}
          scheduleJobs={scheduleJobs}
          onRequirementChange={onRequirementChange}
          onRefreshData={onRefreshData}
        />
      ) : null}

      {activeTaskSubTab === "prompts" && selectedWt && hasIndicatorColumns && isIndicatorGroupModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-6xl rounded-xl border bg-card shadow-xl">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
              <div>
                <h4 className="text-sm font-semibold">分组管理</h4>
                <p className="mt-1 text-xs text-muted-foreground">
                    在这里统一维护分组名称、执行说明与指标归属。采集提示词请在下方【采集提示词管理】模块中配置。
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAddIndicatorGroup}
                  disabled={!selectedWt || !hasIndicatorColumns || !isDefinitionSubmitted || isPersistingIndicatorGroups}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-xs",
                    !selectedWt || !hasIndicatorColumns || !isDefinitionSubmitted || isPersistingIndicatorGroups
                      ? "cursor-not-allowed text-muted-foreground opacity-50"
                      : "text-primary hover:bg-primary/5",
                  )}
                >
                  新增分组
                </button>
                <button
                  type="button"
                  onClick={() => void handlePersistIndicatorGroups()}
                  disabled={!selectedWt || !isDefinitionSubmitted || isPersistingIndicatorGroups}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium",
                    !selectedWt || !isDefinitionSubmitted || isPersistingIndicatorGroups
                      ? "cursor-not-allowed bg-muted text-muted-foreground"
                      : "bg-primary text-primary-foreground hover:opacity-90",
                  )}
                >
                  {isPersistingIndicatorGroups
                    ? "保存中..."
                    : isIndicatorGroupingComplete
                      ? hasCurrentVersionTaskGroups ? "保存分组并重建任务组" : "保存分组并生成任务组"
                      : "保存分组"}
                </button>
                <button
                  type="button"
                  onClick={() => setIsIndicatorGroupModalOpen(false)}
                  className="rounded-md border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  关闭
                </button>
              </div>
            </div>

            <div className="max-h-[80vh] space-y-4 overflow-y-auto px-5 py-4">
                <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-xs text-sky-900">
                  {isPromptEditable
                    ? "提示词支持分段编辑和整体 Markdown 编辑。默认内容来自需求定义，可在弹窗内直接改写。"
                    : "提示词已锁定为只读展示；如需调整，请先回到需求侧修改并重新生成计划。"}
                </div>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-xs">
                  <thead className="border-b bg-muted/30">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">指标列</th>
                      <th className="px-3 py-2 text-left font-medium">说明</th>
                      <th className="px-3 py-2 text-left font-medium">当前分组</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {indicatorColumns.map((column) => (
                      <tr key={column.id}>
                        <td className="px-3 py-2">
                          <div className="font-medium">{column.chineseName ?? column.name}</div>
                          <div className="text-[11px] text-muted-foreground">{column.name}{column.unit ? ` · ${column.unit}` : ""}</div>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{column.description || "-"}</td>
                        <td className="px-3 py-2">
                          <select
                            value={columnGroupMap.get(column.name)?.id ?? ""}
                            onChange={(event) => {
                              if (event.target.value) {
                                handleAssignIndicatorColumnToGroup(column.name, event.target.value);
                                return;
                              }
                              handleClearIndicatorColumnGroup(column.name);
                            }}
                            className={cn(
                              "w-full rounded-md border px-3 py-2 text-xs",
                              groupSelectClass(columnGroupMap.get(column.name)?.id, userDefinedIndicatorGroups),
                            )}
                          >
                            <option value="">未分组</option>
                            {userDefinedIndicatorGroups.map((group) => (
                              <option key={group.id} value={group.id}>
                                {group.name}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {userDefinedIndicatorGroups.length === 0 ? (
                <div className="rounded-lg border border-dashed bg-background px-4 py-8 text-center text-sm text-muted-foreground">
                  还没有指标分组。请先新增分组，并把所有指标列分配进去。
                </div>
              ) : (
                <div className="grid gap-3 lg:grid-cols-2">
                  {userDefinedIndicatorGroups.map((group) => {
                    return (
                      <div key={group.id} className={cn("rounded-lg border bg-background p-4 space-y-3", groupToneClass(group.id, userDefinedIndicatorGroups))}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 space-y-2">
                            <input
                              value={group.name}
                              onChange={(event) => handleIndicatorGroupChange(group.id, { name: event.target.value })}
                              className={cn("w-full rounded-md border bg-background px-3 py-2 text-sm", groupToneClass(group.id, userDefinedIndicatorGroups))}
                              placeholder="指标组名称"
                            />
                            <textarea
                              value={group.description}
                              onChange={(event) => handleIndicatorGroupChange(group.id, { description: event.target.value })}
                              rows={2}
                              className="w-full rounded-md border bg-background px-3 py-2 text-xs"
                              placeholder="补充该分组的执行说明"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteIndicatorGroup(group.id)}
                            className="rounded-md border border-red-200 px-2 py-1 text-[10px] text-red-600 hover:bg-red-50"
                          >
                            删除
                          </button>
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          已关联 {group.indicatorColumns.length} 个指标
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {group.indicatorColumns.length > 0 ? (
                            group.indicatorColumns.map((columnName) => (
                              <span
                                key={columnName}
                                className={cn("rounded-full border px-2 py-1 text-[11px]", groupToneClass(group.id, userDefinedIndicatorGroups))}
                              >
                                {findIndicatorColumnLabel(indicatorColumns, columnName)}
                              </span>
                            ))
                          ) : (
                            <span className="text-[11px] text-muted-foreground">该分组还没有分配指标。</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {selectedWt && isTrialModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
          <div className="w-full max-w-4xl rounded-xl border bg-card shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
              <div className="space-y-1">
                <h3 className="text-base font-semibold">试运行</h3>
                <p className="text-xs text-muted-foreground">
                  勾选少量日期与维度值后，对所有指标发起小范围采集。提示词沿用“采集提示词管理”中已保存的配置。
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsTrialModalOpen(false)}
                className="rounded-md border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                关闭
              </button>
            </div>

            <div className="space-y-4 px-5 py-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div />
                <button
                  type="button"
                  onClick={() => void handleStartTrialRun()}
                  disabled={!canStartTrialRun || isStartingTrialRun}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium",
                    !canStartTrialRun || isStartingTrialRun
                      ? "cursor-not-allowed bg-muted text-muted-foreground"
                      : "bg-primary text-primary-foreground hover:opacity-90",
                  )}
                >
                  {isStartingTrialRun ? "试运行中..." : "开始试运行"}
                </button>
              </div>

              {taskPlanBlockerMessage ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {taskPlanBlockerMessage}
                </div>
              ) : null}

              {usesBusinessDateAxis ? (
                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">选择日期</div>
                  <div className="flex flex-wrap gap-2">
                    {trialAvailableBusinessDates.length === 0 ? (
                      <span className="text-xs text-muted-foreground">当前范围暂无可选业务日期。</span>
                    ) : trialAvailableBusinessDates.slice(0, 18).map((businessDate) => (
                      <button
                        key={businessDate}
                        type="button"
                        onClick={() => handleToggleTrialBusinessDate(businessDate)}
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-[11px]",
                          trialBusinessDates.includes(businessDate)
                            ? "border-primary bg-primary/10 text-primary"
                            : "bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
                        )}
                      >
                        {businessDate}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="space-y-3">
                <div className="text-xs font-medium text-muted-foreground">选择维度值</div>
                {trialDimensionColumns.length === 0 ? (
                  <div className="rounded-lg border border-dashed bg-background px-4 py-4 text-xs text-muted-foreground">
                    当前宽表没有可筛选维度，将按单次快照范围抽样试运行。
                  </div>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {trialDimensionColumns.map((column) => {
                      const values = trialAvailableDimensionValues[column.name] ?? [];
                      const selectedValues = trialDimensionValues[column.name] ?? [];
                      return (
                        <div key={column.id} className="rounded-lg border bg-background px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-sm font-medium">{column.chineseName ?? column.name}</div>
                              <div className="text-[11px] text-muted-foreground">{column.name}</div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setTrialDimensionValues((current) => ({ ...current, [column.name]: [] }))}
                              className="text-[11px] text-muted-foreground hover:text-foreground"
                            >
                              全部
                            </button>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {values.length === 0 ? (
                              <span className="text-[11px] text-muted-foreground">暂无可选值。</span>
                            ) : values.slice(0, 12).map((value) => (
                              <button
                                key={value}
                                type="button"
                                onClick={() => handleToggleTrialDimensionValue(column.name, value)}
                                className={cn(
                                  "rounded-full border px-2.5 py-1 text-[11px]",
                                  selectedValues.includes(value)
                                    ? "border-primary bg-primary/10 text-primary"
                                    : "bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
                                )}
                              >
                                {value}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/10 px-4 py-3">
                <div className="text-xs text-muted-foreground">
                  预计试运行 <span className="font-medium text-foreground">{trialEstimatedRows}</span> 行，
                  生成 <span className="font-medium text-foreground">{trialEstimatedTaskCount}</span> 个采集任务。
                  {trialFilteredRecords.length > trialMaxRows ? ` 当前筛选命中 ${trialFilteredRecords.length} 行，将按上限抽样。` : ""}
                </div>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  最大采样行数
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={trialMaxRows}
                    onChange={(event) => setTrialMaxRows(Math.min(200, Math.max(1, Number(event.target.value) || 1)))}
                    className="w-20 rounded-md border bg-background px-2 py-1 text-xs text-foreground"
                  />
                </label>
              </div>

              {latestTrialTaskGroup ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
                  <span>最近一次试运行：{latestTrialTaskGroup.partitionLabel || latestTrialTaskGroup.businessDateLabel || latestTrialTaskGroup.id}</span>
                  <Link
                    href={`/projects/${requirement.projectId}/requirements/${requirement.id}?${navQuery}tab=tasks&sub=output`}
                    className="font-medium text-primary hover:underline"
                    onClick={() => setIsTrialModalOpen(false)}
                  >
                    查看试运行数据
                  </Link>
                </div>
              ) : null}

              {trialRunMessage ? (
                <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
                  {trialRunMessage}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {selectedWt && activeTaskSubTab === "prompts" ? (
        <section className="rounded-xl border bg-card p-6 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold">采集提示词管理</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                提示词用于指导 Agent 采集，按指标组折叠配置。提示词配置不会影响指标拆分规则。
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handlePersistPromptTemplates()}
              disabled={!isDefinitionSubmitted || !isPromptEditable || isPersistingPrompts}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium",
                !isDefinitionSubmitted || !isPromptEditable || isPersistingPrompts
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

          {!isPromptEditable ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              提示词已锁定为只读展示；如需调整，请先回到需求侧修改并重新生成计划。
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
                    ?? (effectiveWideTable ? buildIndicatorGroupPrompt(requirement, effectiveWideTable, group) : buildIndicatorGroupPrompt(requirement, selectedWt, group));
                  const editMode = promptEditorModes[group.id] ?? "sections";
                  const markdownDraft = promptMarkdownDrafts[group.id] ?? promptBundle.markdown;
                  const shouldOpen = promptEditorGroups.length === 1 || index === 0;

                  return (
                    <details
                      key={group.id}
                      open={shouldOpen}
                      className={cn(
                        "group rounded-lg border bg-background",
                        groupToneClass(group.id, promptEditorGroups),
                      )}
                    >
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold truncate">{group.name}</div>
                          <div className="text-[11px] text-muted-foreground">
                            已关联 {group.indicatorColumns.length} 个指标
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
                      </summary>
                      <div className="border-t px-4 py-4 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="text-sm font-medium">Agent 提示词</div>
                            <div className="text-[11px] text-muted-foreground">
                              未锁定前可编辑核心查询需求、业务知识和输出限制；指标与维度信息始终由需求定义生成。
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setPromptEditorModes((current) => ({ ...current, [group.id]: "sections" }))}
                              className={cn(
                                "rounded-md border px-2.5 py-1 text-[11px]",
                                editMode === "sections"
                                  ? "border-primary bg-primary/10 text-primary"
                                  : "text-muted-foreground hover:text-foreground",
                              )}
                            >
                              分段编辑
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setPromptEditorModes((current) => ({ ...current, [group.id]: "markdown" }));
                                setPromptMarkdownDrafts((current) => ({
                                  ...current,
                                  [group.id]: current[group.id] ?? promptBundle.markdown,
                                }));
                              }}
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
                              onChange={(value) => handleIndicatorGroupPromptSectionChange(group.id, "coreQueryRequirement", value)}
                            />
                            <PromptSectionField
                              label="业务知识"
                              value={promptBundle.sections.businessKnowledge}
                              editable={isPromptEditable}
                              rows={4}
                              onChange={(value) => handleIndicatorGroupPromptSectionChange(group.id, "businessKnowledge", value)}
                            />
                            <PromptReadonlyBlock
                              label="指标列表"
                              value={promptBundle.sections.metricList}
                              editable={isPromptEditable}
                              rows={8}
                              onChange={(value) => handleIndicatorGroupPromptSectionChange(group.id, "metricList", value)}
                            />
                            <PromptReadonlyBlock
                              label="维度列信息"
                              value={promptBundle.sections.dimensionColumns}
                              editable={isPromptEditable}
                              rows={8}
                              onChange={(value) => handleIndicatorGroupPromptSectionChange(group.id, "dimensionColumns", value)}
                            />
                            <PromptSectionField
                              label="输出限制"
                              value={promptBundle.sections.outputConstraints}
                              editable={isPromptEditable}
                              rows={6}
                              onChange={(value) => handleIndicatorGroupPromptSectionChange(group.id, "outputConstraints", value)}
                            />
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="text-[11px] text-muted-foreground">
                              这里编辑的是完整 Markdown 提示词，保存后会同步到当前分组。
                            </div>
                            <textarea
                              value={markdownDraft}
                              onChange={(event) => setPromptMarkdownDrafts((current) => ({
                                ...current,
                                [group.id]: event.target.value,
                              }))}
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
                })}
              </div>
            )}

          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={() => setIsTrialModalOpen(true)}
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
      ) : null}

      {selectedWt && activeTaskSubTab === "tasks" ? (
        <section className="rounded-xl border bg-card p-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold">任务计划</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                这里展示由当前范围和指标分组共同推导出的逻辑任务集合。执行动作不会改写任务定义，只改变任务组与任务的执行状态。
              </p>
            </div>
            <div className="text-xs text-muted-foreground">{selectedWt.name}</div>
          </div>

          {taskPlan ? (
            <>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <PlanMetricCard
                  title={usesBusinessDateAxis ? "业务日期数" : "单次快照行数"}
                  value={String(usesBusinessDateAxis ? taskPlan.businessDateCount : taskPlan.plannedRowCount)}
                  hint={
                    usesBusinessDateAxis
                      ? `${taskPlan.frequencyLabel} · 历史 ${taskPlan.historicalDateCount}${taskPlan.futureDateCount > 0 ? ` · 未来 ${taskPlan.futureDateCount}` : ""}`
                      : taskPlan.scheduleSummary
                  }
                />
                <PlanMetricCard title="维度组合" value={String(taskPlan.dimensionCombinationCount)} hint={taskPlan.dimensionSummary} />
                <PlanMetricCard title="指标组数" value={String(taskPlan.indicatorGroupCount)} hint={taskPlan.indicatorGroupSummary} />
                <PlanMetricCard
                  title={usesBusinessDateAxis ? "总逻辑任务" : "单次任务组任务数"}
                  value={String(taskPlan.plannedTaskCount)}
                  hint={
                    usesBusinessDateAxis
                      ? `${taskPlan.plannedRowCount} 行 × ${taskPlan.indicatorGroupCount} 组${taskPlan.futureWindowLabel ? ` · ${taskPlan.futureWindowLabel}` : ""}`
                      : `${taskPlan.plannedRowCount} 行 × ${taskPlan.indicatorGroupCount} 组`
                  }
                />
              </div>
            </>
          ) : taskPlanBlockerMessage ? (
            <div className="rounded-lg border border-dashed px-4 py-8 text-sm text-muted-foreground">
              {taskPlanBlockerMessage}
            </div>
          ) : null}
        </section>
      ) : null}

      {selectedWt && activeTaskSubTab === "tasks" ? (
        <section className="rounded-xl border bg-card p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">{`任务运行记录 – ${selectedWt?.name ?? "-"}`}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {usesBusinessDateAxis
                ? "任务会按业务周期拆分任务实例；如启用指标分组，将先按指标组拆分，再按业务周期拆分；任务实例内子任务按维度组合展开。"
                : "任务会按调度时间拆分全量快照任务实例；如启用指标分组，将先按指标组拆分，再按调度时间拆分；任务实例内子任务按维度组合展开。"}
            </p>
          </div>
        </div>

        <div className="text-right text-xs text-muted-foreground">
          <div>
            {taskPlan
              ? usesBusinessDateAxis
                ? `已建立 ${wtTaskGroups.length} 个任务实例 / 当前范围历史期数 ${taskPlan.historicalDateCount}`
                : `已建立 ${wtTaskGroups.length} 个全量快照任务实例 / ${taskPlan.scheduleSummary}`
              : `共 ${wtTaskGroups.length} 个任务实例`}
          </div>
          <div className="mt-1">
            {needsScopeRefresh
              ? "正式任务组待维度范围确认后生成"
              : !isIndicatorGroupingComplete
                ? "完成指标分组后才能生成任务组"
              : usesBusinessDateAxis
                ? dataUpdateEnabled
                  ? "需求按“历史补数 + 未来调度”生成任务组"
                  : "需求按当前固定范围生成一次性任务组"
              : dataUpdateEnabled
                ? "需求按调度规则持续生成全量快照任务组"
                : "需求按当前快照范围生成一次性交付任务组"}
          </div>
        </div>

        {taskActionMessage ? (
          <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
            {taskActionMessage}
          </div>
        ) : null}

        {taskGroupRunViews.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            {taskPlanBlockerMessage
              ? taskPlanBlockerMessage
              : usesBusinessDateAxis && taskPlan && taskPlan.historicalDateCount > 0
                ? "历史任务计划已确定，但当前还没有任何执行记录。"
                : usesBusinessDateAxis
                  ? "当前宽表暂无历史任务。"
                  : "当前宽表暂无全量快照任务组。"}
          </div>
        ) : (
          <div className="space-y-6">
            {taskGroupRunSections.map((section, sectionIndex) => {
              const rawLabel = (section.label ?? "").trim();
              const groupLabel = rawLabel.endsWith("采集任务")
                ? rawLabel.slice(0, rawLabel.length - "采集任务".length)
                : rawLabel;
              const displayGroupLabel = groupLabel || "统一提示词";

              return (
                <div key={section.id} className="space-y-3">
                  <div className="px-1">
                    <div className="text-base font-semibold text-foreground">{`采集任务${sectionIndex + 1}：${displayGroupLabel}`}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      任务实例按业务周期拆分；子任务实例在展开或执行任务实例时按维度组合按需生成。
                    </div>
                  </div>
                  <div className="rounded-xl border bg-background divide-y overflow-hidden">
                  {section.taskGroups.map((tg) => {
              const isExpanded = expandedTgId === tg.id;

              return (
                <div
                  key={tg.id}
                  className={cn(
                    "transition-colors",
                    isExpanded ? "bg-muted/10" : "hover:bg-muted/20",
                  )}
                >
                  <div className="flex items-center gap-3 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => toggleTaskGroupExpand(tg.id)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{tg.displayLabel}</span>
                          <StatusBadge
                            status={tg.displayStatus}
                            label={getTaskGroupStatusLabel(tg)}
                          />
                          <span className={cn("text-[10px] px-1.5 py-0.5 rounded border bg-background")}>
                            {getTriggerDisplayLabel(tg.triggeredBy)}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {tg.isReal
                            ? `${tg.id} | 总计 ${tg.totalTasks} | 运行中 ${tg.runningTasks} | 已完成 ${tg.completedTasks} | 失败 ${tg.failedTasks}${tg.pendingTasks > 0 ? ` | 待执行 ${tg.pendingTasks}` : ""}`
                            : isScheduledFutureTaskGroupView(tg)
                              ? `待调度任务组 | 总计 ${tg.totalTasks} | 到期后由系统自动创建并执行`
                              : `计划任务组 | 总计 ${tg.totalTasks} | 尚未建立运行记录`}
                        </div>
                      </div>
                      <div className="w-24 shrink-0">
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              tg.displayStatus === "running"
                                ? "bg-blue-400"
                                : tg.failedTasks > 0
                                ? "bg-red-400"
                                : "bg-emerald-400",
                            )}
                            style={{ width: `${tg.progressPercent}%` }}
                          />
                        </div>
                        <div className="text-[10px] text-muted-foreground text-right mt-0.5">
                        {tg.progressPercent}%
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {isExpanded ? "▲" : "▼"}
                      </span>
                    </button>

                    {canShowTaskGroupRunAction({
                      id: tg.id,
                      isReal: tg.isReal,
                      displayStatus: tg.displayStatus,
                    }) ? (
                      <button
                        type="button"
                        onClick={() => void handleRequestTaskGroupRerun(tg)}
                        disabled={runningTaskGroupIds.includes(tg.id)}
                        className={cn(
                          "inline-flex shrink-0 items-center gap-1 rounded-md border px-3 py-1.5 text-xs",
                          "border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60",
                        )}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        {runningTaskGroupIds.includes(tg.id)
                          ? "执行中..."
                          : tg.displayStatus === "pending" || tg.displayStatus === "invalidated"
                            ? "执行任务组"
                            : "重新执行任务组"}
                      </button>
                    ) : null}
                  </div>

                  {isExpanded ? (
                    <div className="border-t bg-background px-4 py-3">
                      {expandedTaskCards.length === 0 ? (
                        <div className="text-xs text-muted-foreground">当前任务组还没有可展示的采集任务。</div>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                            {expandedTaskStatusLegend.map((item) => (
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
                          <div className="overflow-x-auto rounded-lg border bg-background shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                          <table className="w-full border-separate border-spacing-0 text-xs leading-5">
                              <thead>
                                <tr>
                                  <th className="p-0" style={{ width: 3 }} />
                                  {returnContextColumns.map((column) => (
                                    <th key={column.id} className="border-b border-muted/60 bg-muted/30 px-2 py-2 text-left font-medium">
                                      {column.name}
                                    </th>
                                  ))}
                                  <th className="border-b border-muted/60 bg-muted/30 px-2 py-2 text-left font-medium">指标名</th>
                                  <th className="border-b border-muted/60 bg-muted/30 px-2 py-2 text-left font-medium">指标值</th>
                                  <th className="border-b border-muted/60 bg-muted/30 px-2 py-2 text-left font-medium">原始指标值</th>
                                  <th className="border-b border-muted/60 bg-muted/30 px-2 py-2 text-left font-medium">单位</th>
                                  <th className="border-b border-muted/60 bg-muted/30 px-2 py-2 text-left font-medium">数据发布时间</th>
                                  <th className="border-b border-muted/60 bg-muted/30 px-2 py-2 text-left font-medium">数据来源站点</th>
                                  <th className="border-b border-muted/60 bg-muted/30 px-2 py-2 text-left font-medium">最大值</th>
                                  <th className="border-b border-muted/60 bg-muted/30 px-2 py-2 text-left font-medium">最小值</th>
                                  <th className="border-b border-muted/60 bg-muted/30 px-2 py-2 text-left font-medium">来源URL</th>
                                  <th className="border-b border-muted/60 bg-muted/30 px-2 py-2 text-left font-medium">原文摘录</th>
                                  <th className="border-b border-muted/60 bg-muted/30 px-2 py-2 text-left font-medium">指标逻辑</th>
                                  <th className="border-b border-muted/60 bg-muted/30 px-2 py-2 text-left font-medium">逻辑补充</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(() => {
                                  return expandedTaskCards.flatMap((task, index) =>
                                    task.returnRows.map((row, rowIndex) => {
                                      const isTaskFirst = rowIndex === 0;
                                      const isTaskLast = rowIndex === task.returnRows.length - 1;
                                      const dataCellBorder = isTaskFirst
                                        ? "border-t-2 border-t-slate-200"
                                        : "border-t border-dashed border-t-slate-200/90";

                                      const railColor = getTaskStatusRailFillColor(task.status);
                                      const railStyle: React.CSSProperties = {
                                        width: 3,
                                        padding: 0,
                                        paddingTop: isTaskFirst ? 3 : 0,
                                        paddingBottom: isTaskLast ? 3 : 0,
                                        backgroundImage: `linear-gradient(${railColor},${railColor})`,
                                        backgroundOrigin: "content-box",
                                        backgroundClip: "content-box",
                                        backgroundSize: "100% 100%",
                                        borderRadius: isTaskFirst && isTaskLast ? 1.5 : isTaskFirst ? "1.5px 1.5px 0 0" : isTaskLast ? "0 0 1.5px 1.5px" : 0,
                                      };

                                      return (
                                        <tr
                                          key={`${task.id}-${row.indicatorName}`}
                                          onClick={() => setSelectedTaskId(task.id)}
                                          className={cn(
                                            "cursor-pointer transition-colors hover:brightness-[0.985]",
                                            getTaskBlockSurfaceClass(index),
                                          )}
                                        >
                                          <td style={railStyle} />
                                          {returnContextColumns.map((column) => (
                                            <td key={column.id} className={cn("px-2 py-2 text-slate-700 align-top", index > 0 || rowIndex > 0 ? dataCellBorder : "")}>
                                              {row.contextValues[column.name] ?? ""}
                                            </td>
                                          ))}
                                          <td className={cn("px-2 py-2 align-top", index > 0 || rowIndex > 0 ? dataCellBorder : "")}>
                                            {row.indicatorName}
                                          </td>
                                          <td className={cn("px-2 py-2 text-slate-700 align-top", index > 0 || rowIndex > 0 ? dataCellBorder : "")}>{row.indicatorValue}</td>
                                          <td className={cn("px-2 py-2 text-slate-700 align-top", index > 0 || rowIndex > 0 ? dataCellBorder : "")}>{row.rawIndicatorValue}</td>
                                          <td className={cn("px-2 py-2 text-slate-700 align-top", index > 0 || rowIndex > 0 ? dataCellBorder : "")}>{row.indicatorUnit}</td>
                                          <td className={cn("px-2 py-2 text-slate-700 align-top", index > 0 || rowIndex > 0 ? dataCellBorder : "")}>{row.publishedAt}</td>
                                          <td className={cn("px-2 py-2 text-slate-700 align-top", index > 0 || rowIndex > 0 ? dataCellBorder : "")}>{row.sourceSite}</td>
                                          <td className={cn("px-2 py-2 text-slate-700 align-top", index > 0 || rowIndex > 0 ? dataCellBorder : "")}>{row.maxValue}</td>
                                          <td className={cn("px-2 py-2 text-slate-700 align-top", index > 0 || rowIndex > 0 ? dataCellBorder : "")}>{row.minValue}</td>
                                          <td className={cn("px-2 py-2 text-primary align-top", index > 0 || rowIndex > 0 ? dataCellBorder : "")}>
                                            {row.sourceUrl ? (
                                              <a href={row.sourceUrl} target="_blank" rel="noreferrer" className="hover:underline">
                                                {row.sourceUrl}
                                              </a>
                                            ) : (
                                              ""
                                            )}
                                          </td>
                                          <td className={cn("px-2 py-2 text-slate-700 align-top", index > 0 || rowIndex > 0 ? dataCellBorder : "")}>{row.quoteText}</td>
                                          <td className={cn("px-2 py-2 text-slate-700 align-top", index > 0 || rowIndex > 0 ? dataCellBorder : "")}>{row.indicatorLogic}</td>
                                          <td className={cn("px-2 py-2 text-slate-700 align-top", index > 0 || rowIndex > 0 ? dataCellBorder : "")}>{row.indicatorLogicSupplement}</td>
                                        </tr>
                                      );
                                    }),
                                  );
                                })()}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
      ) : null}

      {selectedWt && activeTaskSubTab === "tasks" && archivedTaskGroups.length > 0 ? (
        <section className="rounded-xl border bg-card p-6 space-y-4">
          <button
            type="button"
            onClick={() => setIsArchivedSectionExpanded((prev) => !prev)}
            className="flex w-full items-center justify-between text-left"
          >
            <div>
              <h3 className="font-semibold text-muted-foreground">已归档任务组</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                共 {archivedTaskGroups.length} 个旧版本任务组
              </p>
            </div>
            <span className="text-xs text-muted-foreground shrink-0">
              {isArchivedSectionExpanded ? "▲ 收起" : "▼ 展开"}
            </span>
          </button>

          {isArchivedSectionExpanded ? (
            <div className="space-y-2">
              {archivedTaskGroups.map((tg) => (
                <div key={tg.id} className="rounded-lg border border-dashed border-slate-300 bg-muted/20 px-4 py-3 text-xs space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-muted-foreground">{tg.partitionLabel ?? (tg.businessDateLabel || tg.id)}</span>
                    <StatusBadge status={tg.status} />
                    <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">
                      已归档（版本 {tg.planVersion ?? 1}）
                    </span>
                  </div>
                  <div className="text-muted-foreground">
                    {tg.id} | 总计 {tg.totalTasks} | 已完成 {tg.completedTasks} | 失败 {tg.failedTasks}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {selectedWt && activeTaskSubTab === "tasks" && wtScheduleJobs.length > 0 ? (
        <section className="rounded-xl border bg-card p-6 space-y-4">
          <h3 className="font-semibold">任务组触发记录</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 border-b">
                <tr>
                  <th className="px-2 py-1.5 text-left">触发ID</th>
                  <th className="px-2 py-1.5 text-left">关联任务组</th>
                  <th className="px-2 py-1.5 text-left">触发类型</th>
                  <th className="px-2 py-1.5 text-left">状态</th>
                  <th className="px-2 py-1.5 text-left">开始时间</th>
                  <th className="px-2 py-1.5 text-left">结束时间</th>
                  <th className="px-2 py-1.5 text-left">操作人</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {wtScheduleJobs.map((sj) => (
                  <tr key={sj.id}>
                    <td className="px-2 py-1.5 font-mono">{sj.id}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{sj.taskGroupId}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{getTriggerDisplayLabel(sj.triggerType)}</td>
                    <td className="px-2 py-1.5">
                      <StatusBadge status={sj.status} />
                    </td>
                    <td className="px-2 py-1.5 text-muted-foreground">{sj.startedAt}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{sj.endedAt ?? "-"}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{sj.operator}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {selectedTask ? (
        <FetchTaskDetailPopup
          wideTable={selectedWt!}
          taskGroup={expandedTaskGroupView!.taskGroupForTasks}
          taskCard={selectedTask}
          onClose={() => setSelectedTaskId(null)}
          footerActions={!selectedTask.isSynthetic && (selectedTask.status === "completed" || selectedTask.status === "failed") ? (
            <button
              type="button"
              onClick={() => void handleRequestTaskRerun(selectedTask.id, selectedTask.rowLabel)}
              disabled={runningTaskIds.includes(selectedTask.id)}
              className={cn(
                "inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs",
                "border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60",
              )}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {runningTaskIds.includes(selectedTask.id) ? "执行中..." : "重新执行任务"}
            </button>
          ) : null}
        />
      ) : null}
    </div>
  );

  function applyLocalTaskGroupExecution(taskGroupView: HistoricalTaskGroupView) {
    if (!selectedWt) {
      return;
    }

    const now = new Date();
    const startedAt = now.toISOString();
    const endedAt = new Date(now.getTime() + 800).toISOString();
    const runId = buildTaskGroupRunId(scheduleJobs);
    const localArtifacts = materializeLocalTaskGroupArtifacts(taskGroupView, selectedWt, currentWideTableRecords, fetchTasks, startedAt);
    if (!localArtifacts) {
      setTaskActionMessage(`任务组 ${taskGroupView.displayLabel} 暂无可执行任务，请先保存分组并生成任务组（系统会自动生成预览行）。`);
      return;
    }

    const scopedTasks = localArtifacts.fetchTasks;
    const nextFetchTasks = [
      ...fetchTasks.filter((task) => task.taskGroupId !== taskGroupView.id),
      ...scopedTasks.map((task) => ({
        ...task,
        status: "completed" as const,
        updatedAt: endedAt,
        executionRecords: buildDemoExecutionRecords(task, "completed", runId, startedAt),
      })),
    ];
    const completedTaskCount = scopedTasks.length;
    const nextTaskGroup: TaskGroup = {
      ...localArtifacts.taskGroup,
      status: "completed",
      triggeredBy: "manual",
      totalTasks: completedTaskCount,
      completedTasks: completedTaskCount,
      failedTasks: 0,
      updatedAt: endedAt,
    };

    onFetchTasksChange(
      nextFetchTasks,
    );
    onTaskGroupsChange(
      [
        ...taskGroups.filter((taskGroup) => taskGroup.id !== taskGroupView.id),
        nextTaskGroup,
      ].sort((left, right) => right.businessDate.localeCompare(left.businessDate)),
    );
    onTaskGroupRunsChange([
      ...scheduleJobs,
      {
        id: runId,
        taskGroupId: taskGroupView.id,
        triggerType: "manual",
        status: "completed",
        startedAt: formatRunTimestamp(now),
        endedAt: formatRunTimestamp(new Date(now.getTime() + 800)),
        operator: "当前用户",
        logRef: `log://${taskGroupView.id}/${runId.toLowerCase()}`,
      },
    ]);
    if (onWideTableRecordsChange) {
      onWideTableRecordsChange(
        wideTableRecords.map((record) =>
          record.wideTableId === selectedWt.id
            ? applyTaskRecordCompletion(record, selectedWt, scopedTasks, endedAt)
            : record,
        ),
      );
    }
    setTaskActionMessage(`已执行本地任务组 ${taskGroupView.displayLabel}，结果已同步到【数据产出】Tab。`);
  }

  function applyLocalTaskExecution(taskId: string, rowLabel: string) {
    const now = new Date();
    const startedAt = now.toISOString();
    const endedAt = new Date(now.getTime() + 600).toISOString();
    const targetTask = fetchTasks.find((task) => task.id === taskId);
    if (!targetTask) {
      return;
    }

    onFetchTasksChange(
      fetchTasks.map((task) => (
        task.id === taskId
          ? {
              ...task,
              status: "completed",
              updatedAt: endedAt,
              executionRecords: [
                ...task.executionRecords,
                {
                  id: buildExecutionRecordId(task.id, task.executionRecords.length + 1, "retry"),
                  fetchTaskId: task.id,
                  attempt: task.executionRecords.length + 1,
                  status: "success",
                  triggeredBy: "manual_retry",
                  startedAt,
                  endedAt,
                },
              ],
            }
          : task
      )),
    );
    onTaskGroupsChange(
      taskGroups.map((taskGroup) => (
        taskGroup.id === targetTask.taskGroupId
          ? {
              ...taskGroup,
              status: "completed",
              completedTasks: Math.max(taskGroup.completedTasks, 1),
              failedTasks: 0,
              updatedAt: endedAt,
            }
          : taskGroup
      )),
    );
    if (selectedWt && onWideTableRecordsChange) {
      onWideTableRecordsChange(
        wideTableRecords.map((record) =>
          record.wideTableId === selectedWt.id
            ? applyTaskRecordCompletion(record, selectedWt, [targetTask], endedAt)
            : record,
        ),
      );
    }
    setTaskActionMessage(`已执行本地任务 ${taskId}（${rowLabel}），结果已同步到【数据产出】Tab。`);
  }
}

function StatusBadge({ status, label }: { status: string; label?: string }) {
  return (
    <span className={cn("rounded border px-1.5 py-0.5 text-[10px]", getTaskStatusBadgeClass(status))}>
      {label ?? taskStatusLabel[status] ?? status}
    </span>
  );
}

function PlanMetricCard({ title, value, hint }: { title: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg border bg-muted/10 px-4 py-3">
      <div className="text-[11px] text-muted-foreground">{title}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
      <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>
    </div>
  );
}

function PromptSectionField({
  label,
  value,
  editable,
  rows,
  onChange,
}: {
  label: string;
  value: string;
  editable: boolean;
  rows: number;
  onChange: (value: string) => void;
}) {
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

function PromptReadonlyBlock({
  label,
  value,
  editable,
  rows,
  onChange,
}: {
  label: string;
  value: string;
  editable: boolean;
  rows: number;
  onChange: (value: string) => void;
}) {
  return (
    <PromptSectionField
      label={label}
      value={value}
      editable={editable}
      rows={rows}
      onChange={onChange}
    />
  );
}

function VersionTabContent({
  selectedWt,
  versionViews,
  selectedVersion,
  selectedVersionTaskGroups,
  onSelectVersion,
}: {
  selectedWt?: WideTable;
  versionViews: PlanVersionView[];
  selectedVersion: PlanVersionView | null;
  selectedVersionTaskGroups: HistoricalTaskGroupView[];
  onSelectVersion: (version: number) => void;
}) {
  if (!selectedWt || versionViews.length === 0 || !selectedVersion) {
    return (
      <div className="text-sm text-muted-foreground">当前宽表还没有可展示的版本信息。</div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto">
        {versionViews.map((version) => (
          <button
            key={version.version}
            type="button"
            onClick={() => onSelectVersion(version.version)}
            className={cn(
              "shrink-0 rounded-md border px-3 py-1.5 text-xs",
              selectedVersion.version === version.version
                ? "border-primary bg-primary/10 text-primary"
                : "bg-background text-muted-foreground",
            )}
          >
            V{version.version}
            {version.isCurrent ? " · 当前" : ""}
          </button>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <PlanMetricCard title="基线任务组" value={String(selectedVersion.baselineGroupCount)} hint="该版本直接生效的业务日期" />
        <PlanMetricCard title="差异补差组" value={String(selectedVersion.deltaGroupCount)} hint="历史版本补丁" />
        <PlanMetricCard title="历史补差日期" value={String(selectedVersion.historicalPatchDates.length)} hint={summarizeDateSlots(selectedVersion.historicalPatchDates, "无历史补差")} />
        <PlanMetricCard title="未来待调度日期" value={String(selectedVersion.futureScheduledDates.length)} hint={summarizeDateSlots(selectedVersion.futureScheduledDates, "无未来调度")} />
      </div>

      <div className="rounded-lg border bg-muted/10 p-4 text-xs text-muted-foreground space-y-1">
        <div>版本时间：{selectedVersion.createdAt || "-"}</div>
        <div>历史补丁：{selectedVersion.historicalPatchDates.length > 0 ? selectedVersion.historicalPatchDates.join("、") : "无"}</div>
        <div>未来待调度：{selectedVersion.futureScheduledDates.length > 0 ? selectedVersion.futureScheduledDates.join("、") : "无"}</div>
      </div>

      <div className="space-y-2">
        {selectedVersionTaskGroups.length === 0 ? (
          <div className="rounded-lg border border-dashed px-4 py-6 text-xs text-muted-foreground">
            当前版本还没有落成任务组。
          </div>
        ) : (
          selectedVersionTaskGroups.map((taskGroup) => (
            <div key={taskGroup.id} className="rounded-lg border bg-background px-4 py-3 text-xs space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-foreground">{taskGroup.displayLabel}</span>
                <StatusBadge status={taskGroup.displayStatus} />
                <span className={cn("rounded border px-1.5 py-0.5", taskGroupKindBadgeClass(taskGroup.groupKind))}>
                  {taskGroupKindLabel(taskGroup.groupKind)}
                </span>
              </div>
              <div className="text-muted-foreground">
                {taskGroup.id} | 总计 {taskGroup.totalTasks} | 已完成 {taskGroup.completedTasks} | 失败 {taskGroup.failedTasks}
              </div>
              {taskGroup.deltaReason ? (
                <div className="text-amber-700">{taskGroup.deltaReason}</div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function taskGroupKindLabel(groupKind: TaskGroup["groupKind"] | undefined): string {
  return (groupKind ?? "baseline") === "delta" ? "差异补差组" : "基线任务组";
}

function taskGroupKindBadgeClass(groupKind: TaskGroup["groupKind"] | undefined): string {
  return (groupKind ?? "baseline") === "delta"
    ? "border-amber-200 bg-amber-50 text-amber-700"
    : "border-slate-200 bg-slate-50 text-slate-700";
}

function resolveTaskRecordBusinessDate(wideTable: WideTable, record: WideTableRecord): string {
  const businessDateColumn = wideTable.schema.columns.find((column) => column.isBusinessDate);
  return String(
    (businessDateColumn ? record[businessDateColumn.name] : undefined)
    ?? record.business_date
    ?? record.BIZ_DATE
    ?? "",
  );
}

function buildTaskStatusLegend(tasks: Array<{ status: string }>): Array<{
  status: string;
  label: string;
  count: number;
  badgeClassName: string;
  dotClassName: string;
}> {
  const orderedStatuses = ["completed", "running", "failed", "pending", "invalidated"];
  const countMap = new Map<string, number>();

  for (const task of tasks) {
    countMap.set(task.status, (countMap.get(task.status) ?? 0) + 1);
  }

  return orderedStatuses
    .filter((status) => (countMap.get(status) ?? 0) > 0)
    .map((status) => ({
      status,
      label: taskStatusLabel[status] ?? status,
      count: countMap.get(status) ?? 0,
      badgeClassName: getTaskStatusBadgeClass(status),
      dotClassName: getTaskStatusDotClass(status),
    }));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function formatTaskActionError(error: unknown): string {
  if (error instanceof Error && error.message === "Failed to fetch") {
    return "无法连接后端接口，请确认服务可访问。";
  }
  if (error instanceof Error && error.message.trim() !== "") {
    return error.message;
  }
  return "未知错误";
}

function applyTaskRecordCompletion(
  record: WideTableRecord,
  wideTable: WideTable,
  tasks: FetchTask[],
  completedAt: string,
): WideTableRecord {
  const rowId = Number(record.ROW_ID ?? record.id);
  const rowTasks = tasks.filter((task) => task.rowId === rowId);
  if (rowTasks.length === 0) {
    return record;
  }

  const indicatorGroupMap = new Map(
    wideTable.indicatorGroups.map((group) => [group.id, group.indicatorColumns]),
  );
  const nextRecord: WideTableRecord = {
    ...record,
    _metadata: {
      ...record._metadata,
      confidence: 0.88,
    },
  };

  for (const task of rowTasks) {
    const indicatorColumns = indicatorGroupMap.get(task.indicatorGroupId) ?? [];
    for (const columnName of indicatorColumns) {
      nextRecord[columnName] = buildLocalIndicatorValue(rowId, columnName);
    }
  }

  nextRecord.updated_at = completedAt;
  return nextRecord;
}

function buildLocalIndicatorValue(rowId: number, columnName: string): number {
  let hash = rowId * 97;
  for (const char of columnName) {
    hash = (hash * 31 + char.charCodeAt(0)) % 100000;
  }
  return Number(((hash % 9000) / 10 + 10).toFixed(1));
}

function buildTaskGroupSummaryFromCards(
  taskGroup: TaskGroup,
  fallbackSummary: TaskGroupExecutionSummary,
  taskCards: FetchTaskCardView[],
): TaskGroupExecutionSummary {
  const counts = taskCards.reduce(
    (summary, taskCard) => {
      summary[taskCard.status] += 1;
      return summary;
    },
    {
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0,
      invalidated: 0,
    } satisfies Record<FetchTask["status"], number>,
  );
  const totalTasks = Math.max(fallbackSummary.totalTasks, taskCards.length);
  const pendingTasks = Math.max(
    totalTasks - counts.completed - counts.failed - counts.running - counts.invalidated,
    0,
  );
  const progressPercent = totalTasks > 0
    ? Math.round(((counts.completed + counts.failed + counts.invalidated) / totalTasks) * 100)
    : 0;
  const lastUpdatedAt = taskCards.reduce((latest, taskCard) => {
    const candidate = taskCard.endedAt || taskCard.startedAt || fallbackSummary.lastUpdatedAt;
    return candidate > latest ? candidate : latest;
  }, fallbackSummary.lastUpdatedAt);

  return {
    status: resolveTaskGroupDisplayStatus(taskGroup.status, {
      pendingTasks,
      runningTasks: counts.running,
      completedTasks: counts.completed,
      failedTasks: counts.failed,
      invalidatedTasks: counts.invalidated,
    }),
    totalTasks,
    pendingTasks,
    runningTasks: counts.running,
    completedTasks: counts.completed,
    failedTasks: counts.failed,
    invalidatedTasks: counts.invalidated,
    progressPercent,
    lastUpdatedAt,
  };
}

function resolveTaskGroupDisplayStatus(
  fallbackStatus: TaskGroup["status"],
  counts: {
    pendingTasks: number;
    runningTasks: number;
    completedTasks: number;
    failedTasks: number;
    invalidatedTasks: number;
  },
): TaskGroup["status"] {
  if (fallbackStatus === "invalidated") {
    return "invalidated";
  }
  if (counts.runningTasks > 0) {
    return "running";
  }
  if (counts.failedTasks > 0 && counts.pendingTasks === 0) {
    return "partial";
  }
  if (counts.completedTasks > 0 && counts.pendingTasks > 0) {
    return "running";
  }
  if (counts.pendingTasks > 0) {
    return "pending";
  }
  return "completed";
}

type TaskPlanView = {
  businessDates: string[];
  businessDateCount: number;
  historicalDateCount: number;
  futureDateCount: number;
  historicalRangeLabel: string;
  futureRangeLabel: string;
  dimensionCombinationCount: number;
  indicatorGroupCount: number;
  plannedRowCount: number;
  plannedTaskCount: number;
  dimensionSummary: string;
  indicatorGroupSummary: string;
  frequencyLabel: string;
  scheduleSummary: string;
  futureWindowLabel?: string;
};

type HistoricalTaskGroupView = {
  id: string;
  businessDate: string;
  businessDateLabel: string;
  displayLabel: string;
  indicatorGroupId?: string;
  indicatorGroupName?: string;
  totalTasks: number;
  pendingTasks: number;
  runningTasks: number;
  completedTasks: number;
  failedTasks: number;
  invalidatedTasks: number;
  progressPercent: number;
  triggeredBy: TaskGroup["triggeredBy"];
  displayStatus: string;
  isReal: boolean;
  planVersion?: number;
  groupKind?: TaskGroup["groupKind"];
  coverageStatus?: TaskGroup["coverageStatus"];
  deltaReason?: string;
  taskGroupForTasks: TaskGroup;
};

type TaskGroupRunSectionView = {
  id: string;
  label: string;
  taskGroups: HistoricalTaskGroupView[];
};

type PlanVersionView = {
  version: number;
  isCurrent: boolean;
  createdAt: string;
  baselineGroupCount: number;
  deltaGroupCount: number;
  historicalPatchDates: string[];
  futureScheduledDates: string[];
};

function buildTaskPlanView(wideTable: WideTable): TaskPlanView {
  if (!hasWideTableBusinessDateDimension(wideTable)) {
    const dimensionColumns = wideTable.schema.columns.filter((column) => column.category === "dimension" && !column.isBusinessDate);
    const dimensionCombinationCount = calculateDimensionCombinationCount(wideTable, dimensionColumns);
    const indicatorGroupLabels = resolveIndicatorGroupLabels(wideTable);
    const indicatorGroupCount = indicatorGroupLabels.length;
    const plannedRowCount = wideTable.recordCount > 0 ? wideTable.recordCount : dimensionCombinationCount;
    return {
      businessDates: [],
      businessDateCount: 0,
      historicalDateCount: 0,
      futureDateCount: 0,
      historicalRangeLabel: "不按业务日期拆分",
      futureRangeLabel: "由调度规则持续生成",
      dimensionCombinationCount,
      indicatorGroupCount,
      plannedRowCount,
      plannedTaskCount: plannedRowCount * indicatorGroupCount,
      dimensionSummary: summarizeDimensions(wideTable, dimensionColumns),
      indicatorGroupSummary: indicatorGroupLabels.join("、") || "未配置指标分组",
      frequencyLabel: taskFrequencyLabel(wideTable.businessDateRange.frequency),
      scheduleSummary: describeFullSnapshotScheduleRule(wideTable.scheduleRule),
    };
  }

  const businessDates = buildBusinessDateSlots(wideTable.businessDateRange);
  const today = formatBusinessDate(new Date());
  const historicalDates = businessDates.filter((value) => value <= today);
  const futureDates = businessDates.filter((value) => value > today);
  const dimensionColumns = wideTable.schema.columns.filter((column) => column.category === "dimension" && !column.isBusinessDate);
  const dimensionCombinationCount = calculateDimensionCombinationCount(wideTable, dimensionColumns);
  const indicatorGroupLabels = resolveIndicatorGroupLabels(wideTable);
  const indicatorGroupCount = indicatorGroupLabels.length;
  const computedRowCount = businessDates.length * dimensionCombinationCount;
  const isOpenEnded = isOpenEndedBusinessDateRange(wideTable.businessDateRange);
  const plannedRowCount = isOpenEndedBusinessDateRange(wideTable.businessDateRange)
    ? computedRowCount
    : wideTable.recordCount > 0
      ? wideTable.recordCount
      : computedRowCount;
  const plannedTaskCount = plannedRowCount * indicatorGroupCount;
  const scheduleSummary = wideTable.scheduleRule
    ? `业务日期后 +${wideTable.scheduleRule.businessDateOffsetDays} 天触发`
    : isOpenEnded
      ? "未配置未来调度"
      : "固定结束日期，无未来调度";

  return {
    businessDates,
    businessDateCount: businessDates.length,
    historicalDateCount: historicalDates.length,
    futureDateCount: futureDates.length,
    historicalRangeLabel: summarizeDateSlots(historicalDates, "暂无历史任务"),
    futureRangeLabel: summarizeDateSlots(futureDates, "当前范围内无未来任务"),
    dimensionCombinationCount,
    indicatorGroupCount,
    plannedRowCount,
    plannedTaskCount,
    dimensionSummary: summarizeDimensions(wideTable, dimensionColumns),
    indicatorGroupSummary: indicatorGroupLabels.join("、") || "未配置指标分组",
    frequencyLabel: taskFrequencyLabel(wideTable.businessDateRange.frequency),
    scheduleSummary,
    futureWindowLabel: isOpenEnded
      ? `open-ended 范围当前仅预估未来 ${OPEN_ENDED_PREVIEW_PERIODS} 期`
      : undefined,
  };
}

function buildPlanVersionViews(
  wideTable: WideTable,
  taskGroups: TaskGroup[],
): PlanVersionView[] {
  const scopedTaskGroups = taskGroups.filter((taskGroup) => taskGroup.wideTableId === wideTable.id);
  const currentVersion = wideTable.currentPlanVersion ?? Math.max(1, ...scopedTaskGroups.map((taskGroup) => taskGroup.planVersion ?? 1));
  const versionSet = new Set<number>([currentVersion]);
  scopedTaskGroups.forEach((taskGroup) => versionSet.add(taskGroup.planVersion ?? 1));
  const today = formatBusinessDate(new Date());
  const currentFutureDates = buildBusinessDateSlots(wideTable.businessDateRange)
    .filter((businessDate) => businessDate > today)
    .sort((left, right) => right.localeCompare(left));

  return Array.from(versionSet)
    .sort((left, right) => right - left)
    .map((version) => {
      const versionTaskGroups = scopedTaskGroups.filter(
        (taskGroup) => (taskGroup.planVersion ?? 1) === version && (taskGroup.businessDate <= today || version === currentVersion),
      );
      const baselineGroups = versionTaskGroups.filter((taskGroup) => (taskGroup.groupKind ?? "baseline") === "baseline");
      const deltaGroups = versionTaskGroups.filter((taskGroup) => (taskGroup.groupKind ?? "baseline") === "delta");
      return {
        version,
        isCurrent: version === currentVersion,
        createdAt: versionTaskGroups
          .map((taskGroup) => taskGroup.updatedAt || taskGroup.createdAt)
          .sort((left, right) => right.localeCompare(left))[0] ?? wideTable.updatedAt,
        baselineGroupCount: baselineGroups.length,
        deltaGroupCount: deltaGroups.length,
        historicalPatchDates: Array.from(new Set(deltaGroups.map((taskGroup) => taskGroup.businessDate))).sort((left, right) => right.localeCompare(left)),
        futureScheduledDates: version === currentVersion ? currentFutureDates : [],
      };
    });
}

function buildTaskGroupRunViews(
  requirement: Requirement,
  wideTable: WideTable,
  taskPlan: TaskPlanView,
  taskGroups: TaskGroup[],
  taskGroupSummaryMap: Map<string, TaskGroupExecutionSummary>,
  scheduleJobs: ScheduleJob[],
): HistoricalTaskGroupView[] {
  const sortedIndicatorGroups = [...wideTable.indicatorGroups].sort(
    (left, right) => left.priority - right.priority,
  );
  const indicatorGroupById = new Map(sortedIndicatorGroups.map((group) => [group.id, group] as const));
  const indicatorGroupingEnabled = sortedIndicatorGroups.length > 1;

  if (!hasWideTableBusinessDateDimension(wideTable)) {
    const snapshotPages = buildFullSnapshotTaskGroupPages(taskGroups, scheduleJobs);
    const snapshotPageMap = new Map(snapshotPages.map((page) => [page.taskGroupId, page]));
    return [...taskGroups]
      .sort((left, right) => {
        const leftStartedAt = snapshotPageMap.get(left.id)?.startedAt ?? left.createdAt ?? left.updatedAt;
        const rightStartedAt = snapshotPageMap.get(right.id)?.startedAt ?? right.createdAt ?? right.updatedAt;
        if (leftStartedAt !== rightStartedAt) {
          return rightStartedAt.localeCompare(leftStartedAt);
        }
        return right.updatedAt.localeCompare(left.updatedAt);
      })
      .map((taskGroup) => {
        const indicatorGroupId = indicatorGroupingEnabled && taskGroup.partitionKey && indicatorGroupById.has(taskGroup.partitionKey)
          ? taskGroup.partitionKey
          : undefined;
        const indicatorGroupName = indicatorGroupId
          ? indicatorGroupById.get(indicatorGroupId)?.name ?? taskGroup.partitionLabel
          : undefined;
        const summary = taskGroupSummaryMap.get(taskGroup.id);
        const snapshotPage = snapshotPageMap.get(taskGroup.id);
        return {
          id: taskGroup.id,
          businessDate: taskGroup.businessDate,
          businessDateLabel: taskGroup.partitionLabel ?? taskGroup.businessDateLabel ?? "全量快照",
          displayLabel: snapshotPage?.pageLabel ?? taskGroup.partitionLabel ?? taskGroup.businessDateLabel ?? taskGroup.id,
          indicatorGroupId,
          indicatorGroupName,
          totalTasks: summary?.totalTasks ?? taskGroup.totalTasks,
          pendingTasks: summary?.pendingTasks ?? 0,
          runningTasks: summary?.runningTasks ?? 0,
          completedTasks: summary?.completedTasks ?? taskGroup.completedTasks,
          failedTasks: summary?.failedTasks ?? taskGroup.failedTasks,
          invalidatedTasks: summary?.invalidatedTasks ?? 0,
          progressPercent: summary?.progressPercent ?? 0,
          triggeredBy: taskGroup.triggeredBy,
          displayStatus: summary?.status ?? taskGroup.status,
          isReal: true,
          planVersion: taskGroup.planVersion,
          groupKind: "baseline",
          coverageStatus: "current",
          taskGroupForTasks: taskGroup,
        };
      });
  }

  const totalTasksPerTaskInstance = taskPlan.dimensionCombinationCount;
  const taskGroupsByDate = new Map<string, TaskGroup[]>();
  const today = formatBusinessDate(new Date());
  for (const taskGroup of taskGroups) {
    const scopedTaskGroups = taskGroupsByDate.get(taskGroup.businessDate) ?? [];
    scopedTaskGroups.push(taskGroup);
    taskGroupsByDate.set(taskGroup.businessDate, scopedTaskGroups);
  }
  const historicalRealDates = taskGroups
    .map((taskGroup) => taskGroup.businessDate)
    .filter((businessDate) => businessDate <= today);
  const currentHistoricalDates = taskPlan.businessDates.filter((businessDate) => businessDate <= today);
  const futureBusinessDates = Array.from(
    new Set([
      ...taskPlan.businessDates.filter((businessDate) => businessDate > today),
      ...taskGroups.map((taskGroup) => taskGroup.businessDate).filter((businessDate) => businessDate > today),
    ]),
  ).sort((left, right) => left.localeCompare(right));
  const visibleBusinessDates = Array.from(
    new Set([...historicalRealDates, ...currentHistoricalDates, ...futureBusinessDates]),
  );

  return visibleBusinessDates
    .sort((left, right) => right.localeCompare(left))
    .flatMap((businessDate): HistoricalTaskGroupView[] => {
      const scopedTaskGroups = [...(taskGroupsByDate.get(businessDate) ?? [])]
        .sort(compareTaskGroupsForDisplay);
      if (scopedTaskGroups.length > 0) {
        return scopedTaskGroups.map((taskGroup) => {
          const indicatorGroupId = indicatorGroupingEnabled && taskGroup.partitionKey && indicatorGroupById.has(taskGroup.partitionKey)
            ? taskGroup.partitionKey
            : undefined;
          const indicatorGroupName = indicatorGroupId
            ? indicatorGroupById.get(indicatorGroupId)?.name ?? taskGroup.partitionLabel
            : undefined;
          const summary = taskGroupSummaryMap.get(taskGroup.id);
          const businessDateLabel = formatBusinessDateLabel(
            businessDate,
            wideTable.businessDateRange.frequency,
          );
          return {
            id: taskGroup.id,
            businessDate,
            businessDateLabel,
            displayLabel: businessDateLabel,
            indicatorGroupId,
            indicatorGroupName,
            totalTasks: summary?.totalTasks ?? taskGroup.totalTasks,
            pendingTasks: summary?.pendingTasks ?? 0,
            runningTasks: summary?.runningTasks ?? 0,
            completedTasks: summary?.completedTasks ?? taskGroup.completedTasks,
            failedTasks: summary?.failedTasks ?? taskGroup.failedTasks,
            invalidatedTasks: summary?.invalidatedTasks ?? 0,
            progressPercent: summary?.progressPercent ?? 0,
            triggeredBy: taskGroup.triggeredBy,
            displayStatus: summary?.status ?? taskGroup.status,
            isReal: true,
            planVersion: taskGroup.planVersion,
            groupKind: "baseline",
            coverageStatus: "current",
            taskGroupForTasks: taskGroup,
          };
        });
      }

      if (!taskPlan.businessDates.includes(businessDate)) {
        return [];
      }

      const businessDateLabel = formatBusinessDateLabel(businessDate, wideTable.businessDateRange.frequency);
      const plannedTriggerType = resolvePlannedTriggerType(businessDate, today);

      if (indicatorGroupingEnabled) {
        return sortedIndicatorGroups.map((group) => ({
          id: `tg_planned_${businessDate}_${group.id}`,
          businessDate,
          businessDateLabel,
          displayLabel: businessDateLabel,
          indicatorGroupId: group.id,
          indicatorGroupName: group.name,
          totalTasks: totalTasksPerTaskInstance,
          pendingTasks: totalTasksPerTaskInstance,
          runningTasks: 0,
          completedTasks: 0,
          failedTasks: 0,
          invalidatedTasks: 0,
          progressPercent: 0,
          triggeredBy: plannedTriggerType,
          displayStatus: "pending",
          isReal: false,
          planVersion: wideTable.currentPlanVersion ?? 1,
          groupKind: "baseline" as const,
          coverageStatus: "current" as const,
          deltaReason: undefined,
          taskGroupForTasks: {
            id: `tg_planned_${businessDate}_${group.id}`,
            wideTableId: wideTable.id,
            businessDate,
            businessDateLabel,
            planVersion: wideTable.currentPlanVersion ?? 1,
            groupKind: "baseline",
            coverageStatus: "current",
            status: "pending",
            totalTasks: totalTasksPerTaskInstance,
            completedTasks: 0,
            failedTasks: 0,
            triggeredBy: plannedTriggerType,
            partitionType: "business_date",
            partitionKey: group.id,
            partitionLabel: group.name,
            createdAt: "",
            updatedAt: "",
          },
        }));
      }

      return [{
        id: `tg_planned_${businessDate}`,
        businessDate,
        businessDateLabel,
        displayLabel: businessDateLabel,
        totalTasks: totalTasksPerTaskInstance,
        pendingTasks: totalTasksPerTaskInstance,
        runningTasks: 0,
        completedTasks: 0,
        failedTasks: 0,
        invalidatedTasks: 0,
        progressPercent: 0,
        triggeredBy: plannedTriggerType,
        displayStatus: "pending",
        isReal: false,
        planVersion: wideTable.currentPlanVersion ?? 1,
        groupKind: "baseline" as const,
        coverageStatus: "current" as const,
        deltaReason: undefined,
        taskGroupForTasks: {
          id: `tg_planned_${businessDate}`,
          wideTableId: wideTable.id,
          businessDate,
          businessDateLabel,
          planVersion: wideTable.currentPlanVersion ?? 1,
          groupKind: "baseline",
          coverageStatus: "current",
          status: "pending",
          totalTasks: totalTasksPerTaskInstance,
          completedTasks: 0,
          failedTasks: 0,
          triggeredBy: plannedTriggerType,
          createdAt: "",
          updatedAt: "",
        },
      }];
    });
}

function buildTaskGroupRunSections(
  wideTable: WideTable,
  taskGroupRunViews: HistoricalTaskGroupView[],
): TaskGroupRunSectionView[] {
  const sortedIndicatorGroups = [...wideTable.indicatorGroups].sort(
    (left, right) => left.priority - right.priority,
  );
  if (sortedIndicatorGroups.length <= 1) {
    return [{ id: "__all__", label: "", taskGroups: taskGroupRunViews }];
  }

  const grouped = new Map<string, HistoricalTaskGroupView[]>();
  const unscoped: HistoricalTaskGroupView[] = [];
  for (const view of taskGroupRunViews) {
    if (view.indicatorGroupId) {
      const bucket = grouped.get(view.indicatorGroupId) ?? [];
      bucket.push(view);
      grouped.set(view.indicatorGroupId, bucket);
    } else {
      unscoped.push(view);
    }
  }

  const sections: TaskGroupRunSectionView[] = sortedIndicatorGroups
    .map((group) => ({
      id: group.id,
      label: `${group.name}采集任务`,
      taskGroups: grouped.get(group.id) ?? [],
    }))
    .filter((section) => section.taskGroups.length > 0);

  if (unscoped.length > 0) {
    sections.push({ id: "__other__", label: "其他", taskGroups: unscoped });
  }

  return sections.length > 0 ? sections : [{ id: "__all__", label: "", taskGroups: taskGroupRunViews }];
}

function compareTaskGroupsForDisplay(left: TaskGroup, right: TaskGroup): number {
  return right.updatedAt.localeCompare(left.updatedAt);
}

function resolvePlannedTriggerType(
  businessDate: string,
  today: string,
): TaskGroup["triggeredBy"] {
  return businessDate <= today ? "backfill" : "schedule";
}

function resolveIndicatorGroupLabels(wideTable: WideTable): string[] {
  if (wideTable.indicatorGroups.length > 0) {
    return [...wideTable.indicatorGroups]
      .sort((left, right) => left.priority - right.priority)
      .map((group) => group.name);
  }

  return [];
}

function summarizeDimensions(wideTable: WideTable, dimensionColumns: Array<WideTable["schema"]["columns"][number]>): string {
  if (dimensionColumns.length === 0) {
    return "无普通维度";
  }

  return dimensionColumns.map((column) => {
    const valueCount = wideTable.dimensionRanges.find((range) => range.dimensionName === column.name)?.values.length ?? 0;
    return `${column.chineseName ?? column.name}(${valueCount})`;
  }).join("、");
}

function calculateDimensionCombinationCount(
  wideTable: WideTable,
  dimensionColumns: Array<WideTable["schema"]["columns"][number]>,
): number {
  if (dimensionColumns.length === 0) {
    return 1;
  }

  return dimensionColumns.reduce((product, column) => {
    const valueCount = wideTable.dimensionRanges.find((range) => range.dimensionName === column.name)?.values.length ?? 0;
    if (valueCount === 0) {
      return 0;
    }
    return product * valueCount;
  }, 1);
}

function summarizeDateSlots(dateSlots: string[], emptyLabel: string): string {
  if (dateSlots.length === 0) {
    return emptyLabel;
  }

  return `${dateSlots[0]} ~ ${dateSlots[dateSlots.length - 1]}（${dateSlots.length} 个）`;
}

function taskFrequencyLabel(frequency: WideTable["businessDateRange"]["frequency"]): string {
  if (frequency === "daily") {
    return "日频";
  }
  if (frequency === "weekly") {
    return "周频";
  }
  if (frequency === "monthly") {
    return "月频";
  }
  if (frequency === "quarterly") {
    return "季频";
  }
  return "年频";
}

function getTriggerDisplayLabel(triggerType: string): string {
  return triggerLabel[triggerType] ?? triggerType;
}

function isScheduledFutureTaskGroupView(
  taskGroup: Pick<HistoricalTaskGroupView, "triggeredBy" | "businessDate" | "displayStatus">,
): boolean {
  return taskGroup.triggeredBy === "schedule"
    && taskGroup.displayStatus === "pending"
    && taskGroup.businessDate > formatBusinessDate(new Date());
}

function getTaskGroupStatusLabel(
  taskGroup: Pick<HistoricalTaskGroupView, "triggeredBy" | "businessDate" | "displayStatus">,
): string {
  if (isScheduledFutureTaskGroupView(taskGroup)) {
    return "待调度";
  }

  return taskStatusLabel[taskGroup.displayStatus] ?? taskGroup.displayStatus;
}

function buildTaskGroupRunId(scheduleJobs: ScheduleJob[]): string {
  const nextIndex = scheduleJobs.length + 1;
  return `RUN-MANUAL-${String(nextIndex).padStart(3, "0")}`;
}

function buildExecutionRecordId(taskId: string, attempt: number, suffix: "manual" | "retry"): string {
  return `${taskId}_${suffix}_${String(attempt).padStart(2, "0")}`;
}

function materializeLocalTaskGroupArtifacts(
  taskGroupView: HistoricalTaskGroupView,
  wideTable: WideTable,
  wideTableRecords: WideTableRecord[],
  fetchTasks: FetchTask[],
  timestamp: string,
): { taskGroup: TaskGroup; fetchTasks: FetchTask[] } | null {
  const existingTasks = fetchTasks.filter((task) => task.taskGroupId === taskGroupView.id);
  const scopedRecords = resolveLocalTaskGroupRecords(wideTable, wideTableRecords, taskGroupView.businessDate);
  const tasks = existingTasks.length > 0
    ? existingTasks
    : buildLocalFetchTasks(
        taskGroupView.id,
        wideTable,
        taskGroupView.planVersion ?? wideTable.currentPlanVersion ?? 1,
        scopedRecords,
        timestamp,
        taskGroupView.indicatorGroupId,
      );

  if (tasks.length === 0) {
    return null;
  }

  return {
    taskGroup: {
      ...taskGroupView.taskGroupForTasks,
      id: taskGroupView.id,
      wideTableId: wideTable.id,
      triggeredBy: "manual",
      totalTasks: tasks.length,
      completedTasks: 0,
      failedTasks: 0,
      rowSnapshots: scopedRecords,
      createdAt: taskGroupView.taskGroupForTasks.createdAt || timestamp,
      updatedAt: timestamp,
    },
    fetchTasks: tasks,
  };
}

function resolveLocalTaskGroupRecords(
  wideTable: WideTable,
  wideTableRecords: WideTableRecord[],
  businessDate: string,
): WideTableRecord[] {
  if (!hasWideTableBusinessDateDimension(wideTable)) {
    return wideTableRecords.filter((record) => record.wideTableId === wideTable.id);
  }

  const businessDateFieldName = wideTable.schema.columns.find((column) => column.isBusinessDate)?.name ?? "BIZ_DATE";
  return wideTableRecords.filter(
    (record) =>
      record.wideTableId === wideTable.id
      && String(record[businessDateFieldName] ?? "") === businessDate,
  );
}

function buildLocalFetchTasks(
  taskGroupId: string,
  wideTable: WideTable,
  planVersion: number,
  scopedRecords: WideTableRecord[],
  timestamp: string,
  indicatorGroupId?: string,
): FetchTask[] {
  const indicatorGroups = resolveRunnableIndicatorGroups(wideTable);
  const scopedIndicatorGroups = indicatorGroups.length > 1 && indicatorGroupId
    ? indicatorGroups.filter((group) => group.id === indicatorGroupId)
    : indicatorGroups;

  return scopedRecords.flatMap((record) => {
    const rowId = getWideTableRecordRowId(record);
    return scopedIndicatorGroups.map((indicatorGroup) => ({
      id: `${LOCAL_FETCH_TASK_PREFIX}${taskGroupId}_${indicatorGroup.id}_${rowId}`,
      taskGroupId,
      wideTableId: wideTable.id,
      rowId,
      planVersion,
      indicatorGroupId: indicatorGroup.id,
      indicatorGroupName: indicatorGroup.name,
      status: "pending" as const,
      executionRecords: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    }));
  });
}

function resolveRunnableIndicatorGroups(wideTable: WideTable): Array<{
  id: string;
  name: string;
}> {
  if (wideTable.indicatorGroups.length > 0) {
    return [...wideTable.indicatorGroups]
      .sort((left, right) => left.priority - right.priority)
      .map((indicatorGroup) => ({
        id: indicatorGroup.id,
        name: indicatorGroup.name,
      }));
  }

  return [];
}

function groupToneClass(groupId: string, groups: WideTable["indicatorGroups"]): string {
  const toneIndex = Math.max(
    0,
    groups.findIndex((group) => group.id === groupId),
  ) % GROUP_TONE_CLASSES.length;
  return GROUP_TONE_CLASSES[toneIndex];
}

function groupSelectClass(groupId: string | undefined, groups: WideTable["indicatorGroups"]): string {
  if (!groupId) {
    return "border-gray-200 bg-gray-50 text-gray-700";
  }
  return groupToneClass(groupId, groups);
}

function findIndicatorColumnLabel(columns: ColumnDefinition[], columnName: string): string {
  const column = columns.find((item) => item.name === columnName);
  return column?.chineseName ?? column?.name ?? columnName;
}

const GROUP_TONE_CLASSES = [
  "border-sky-200 bg-sky-50 text-sky-700",
  "border-emerald-200 bg-emerald-50 text-emerald-700",
  "border-orange-200 bg-orange-50 text-orange-700",
  "border-rose-200 bg-rose-50 text-rose-700",
  "border-violet-200 bg-violet-50 text-violet-700",
  "border-cyan-200 bg-cyan-50 text-cyan-700",
];

function getWideTableRecordRowId(record: WideTableRecord): number {
  return Number(record.ROW_ID ?? record.id);
}

function formatRunTimestamp(value: Date): string {
  return value.toISOString().replace("T", " ").replace("Z", "");
}

function buildDemoExecutionSnapshot(tasks: FetchTask[]): {
  statusByTaskId: Map<string, FetchTask["status"]>;
  completedTasks: number;
  failedTasks: number;
  taskGroupStatus: TaskGroup["status"];
} {
  const demoStatuses = buildDemoStatusSequence(tasks.length);
  const statusByTaskId = new Map<string, FetchTask["status"]>();

  tasks.forEach((task, index) => {
    statusByTaskId.set(task.id, demoStatuses[index] ?? "pending");
  });

  return {
    statusByTaskId,
    completedTasks: demoStatuses.filter((status) => status === "completed").length,
    failedTasks: demoStatuses.filter((status) => status === "failed").length,
    taskGroupStatus: demoStatuses.includes("running")
      ? "running"
      : demoStatuses.includes("failed")
        ? "partial"
        : demoStatuses.includes("pending")
          ? "pending"
          : "completed",
  };
}

function buildDemoStatusSequence(taskCount: number): FetchTask["status"][] {
  if (taskCount <= 0) {
    return [];
  }

  const seedStatuses: FetchTask["status"][] = ["completed", "running", "failed", "pending", "invalidated"];
  const statuses = seedStatuses.slice(0, Math.min(seedStatuses.length, taskCount));
  while (statuses.length < taskCount) {
    statuses.push(statuses.length % 2 === 0 ? "completed" : "pending");
  }
  return statuses;
}

function buildDemoExecutionRecords(
  task: FetchTask,
  status: FetchTask["status"],
  runId: string,
  startedAt: string,
): FetchTask["executionRecords"] {
  const attempt = task.executionRecords.length + 1;
  if (status === "pending" || status === "invalidated") {
    return task.executionRecords;
  }

  return [
    ...task.executionRecords,
    {
      id: buildExecutionRecordId(task.id, attempt, "manual"),
      fetchTaskId: task.id,
      attempt,
      status: status === "completed" ? "success" : status === "failed" ? "failure" : "running",
      triggeredBy: "manual",
      taskGroupRunId: runId,
      errorMessage: status === "failed" ? "示例任务执行失败，等待人工处理。" : undefined,
      startedAt,
      endedAt: status === "completed" || status === "failed" ? startedAt : undefined,
    },
  ];
}
