"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type {
  TaskGroup,
  FetchTask,
  Requirement,
  WideTable,
  WideTableRecord,
} from "@/lib/types";
import type { ScheduleJob } from "@/lib/domain";
import { cn } from "@/lib/utils";
import {
  createTrialRun,
  executeTaskGroup,
  fetchCollectionTaskStatusDetail,
} from "@/lib/api-client";
import { ListTree, RotateCcw } from "lucide-react";
import {
  buildFetchTaskCardViews,
  getVisibleNarrowTableContextColumns,
} from "@/lib/fetch-task-views";
import {
  buildTaskGroupExecutionSummary,
  type TaskGroupExecutionSummary,
} from "@/lib/task-group-execution";
import { resolveRequirementDataUpdateEnabled } from "@/lib/requirement-data-update";
import CollectionTaskStatusPopup from "@/components/CollectionTaskStatusPopup";
import FetchTaskDetailPopup from "@/components/FetchTaskDetailPopup";
import useIndicatorGroups from "@/components/requirement-tasks/hooks/useIndicatorGroups";
import TaskOutputTab from "@/components/requirement-tasks/output/TaskOutputTab";
import usePromptEditor from "@/components/requirement-tasks/hooks/usePromptEditor";
import IndicatorGroupModal from "@/components/requirement-tasks/prompts/IndicatorGroupModal";
import PromptManagementTab from "@/components/requirement-tasks/prompts/PromptManagementTab";
import RequirementNotSubmittedAlert from "@/components/requirement-tasks/RequirementNotSubmittedAlert";
import RequirementTaskTabs from "@/components/requirement-tasks/RequirementTaskTabs";
import useTaskStatusPolling from "@/components/requirement-tasks/hooks/useTaskStatusPolling";
import TaskInstanceActions from "@/components/requirement-tasks/tasks/TaskInstanceActions";
import TaskExecutionTab from "@/components/requirement-tasks/tasks/TaskExecutionTab";
import TaskGroupCards from "@/components/requirement-tasks/tasks/TaskGroupCards";
import TaskInstanceTable from "@/components/requirement-tasks/tasks/TaskInstanceTable";
import TaskPlanSection from "@/components/requirement-tasks/tasks/TaskPlanSection";
import TaskStatusLegend from "@/components/requirement-tasks/tasks/TaskStatusLegend";
import TrialRunModal from "@/components/requirement-tasks/tasks/TrialRunModal";
import useTrialRun from "@/components/requirement-tasks/hooks/useTrialRun";
import WideTableSelector from "@/components/requirement-tasks/WideTableSelector";
import {
  getTaskStatusBadgeClass,
  taskStatusLabel,
} from "@/lib/task-status-presentation";
import {
  buildTaskPlanFingerprint,
  resolveRecordPlanVersion,
  resolveCurrentPlanVersion,
  resolveTaskGroupPlanVersion,
} from "@/lib/task-plan-reconciliation";
import { isStepBComplete } from "@/lib/step-status";
import {
  canShowTaskGroupRunAction,
  isLocalTaskGroupId,
} from "@/lib/requirement-task-group-actions";
import { hasWideTableBusinessDateDimension } from "@/lib/wide-table-mode";
import {
  formatIndicatorSummary,
  normalizeCollectionTaskLabel,
} from "@/lib/collection-task-list-view";
import {
  buildIndicatorGroupPrompt,
} from "@/lib/indicator-group-prompt";
import CollectionTaskIndicatorsPopup from "@/components/CollectionTaskIndicatorsPopup";
import useTaskExecutionQueue from "@/components/requirement-tasks/hooks/useTaskExecutionQueue";
import type {
  CollectionTaskSectionView,
  HistoricalTaskGroupView,
  TaskInstanceRowView,
  TaskPlanView,
  TrialParameterRowView,
} from "@/components/requirement-tasks/types";
import {
  applyTaskRecordCompletion,
  buildDemoExecutionRecords,
  buildExecutionRecordId,
  buildTaskGroupRunId,
  materializeLocalTaskGroupArtifacts,
} from "@/components/requirement-tasks/utils/requirementTaskLocalExecution";
import {
  buildTaskStatusLegend,
  buildTaskStatusLegendFromCounts,
  formatRunTimestamp,
  formatTaskActionError,
  getTaskGroupStatusLabel,
  getTriggerDisplayLabel,
} from "@/components/requirement-tasks/utils/requirementTaskFormatters";
import {
  buildDefaultIndicatorGroup,
  buildDefaultIndicatorGroupId,
  buildTaskGroupRunSections,
  buildTaskGroupRunViews,
  buildTaskInstanceRowViews,
  buildTaskPlanView,
  buildTrialParameterRowKey,
  resolveTaskRecordBusinessDate,
} from "@/components/requirement-tasks/utils/requirementTaskViews";

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

type TaskSubTabKey = "prompts" | "tasks" | "output";

const taskSubTabs: Array<{ key: TaskSubTabKey; label: string; description: string }> = [
  { key: "prompts", label: "采集提示词管理", description: "按指标组配置采集提示词。" },
  { key: "tasks", label: "采集任务", description: "查看任务实例与子任务状态。" },
  { key: "output", label: "数据产出", description: "查看采集结果与产出明细。" },
];

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
  const [selectedTaskStatusLog, setSelectedTaskStatusLog] = useState<{
    collectionTaskId: string;
    rowLabel: string;
  } | null>(null);
  const [selectedIndicatorTask, setSelectedIndicatorTask] = useState<{
    collectionTaskLabel: string;
    indicatorLabels: string[];
  } | null>(null);
  const [taskStatusLogPayload, setTaskStatusLogPayload] = useState<Record<string, unknown> | null>(null);
  const [taskStatusLogError, setTaskStatusLogError] = useState("");
  const [isLoadingTaskStatusLog, setIsLoadingTaskStatusLog] = useState(false);
  const [taskActionMessage, setTaskActionMessage] = useState("");
  const [runningTaskGroupIds, setRunningTaskGroupIds] = useState<string[]>([]);
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
          && taskGroup.triggeredBy !== "trial"
          && resolveTaskGroupPlanVersion(taskGroup, currentPlanVersion) === currentPlanVersion,
      ),
    ),
    [currentPlanVersion, selectedWt, taskGroups],
  );
  const indicatorColumns = useMemo(
    () => selectedWt?.schema.columns.filter((column) => column.category === "indicator") ?? [],
    [selectedWt],
  );
  const trialParameterColumns = useMemo(
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
  const trialParameterRows = useMemo(() => {
    const sourceRows = selectedWt?.parameterRows ?? [];
    const dedupedRows = new Map<string, TrialParameterRowView>();

    for (const row of sourceRows) {
      const values = Object.fromEntries(
        trialParameterColumns.map((column) => [column.name, String(row.values[column.name] ?? "").trim()]),
      );
      const rowKey = buildTrialParameterRowKey(trialParameterColumns, values);
      if (!rowKey || dedupedRows.has(rowKey)) {
        continue;
      }
      dedupedRows.set(rowKey, {
        rowKey,
        rowId: row.rowId,
        values,
      });
    }

    return Array.from(dedupedRows.values());
  }, [selectedWt?.parameterRows, trialParameterColumns]);
  const {
    trialBusinessDates,
    selectedTrialParameterRowKeys,
    setSelectedTrialParameterRowKeys,
    trialMaxRows,
    setTrialMaxRows,
    trialRunMessage,
    setTrialRunMessage,
    isStartingTrialRun,
    setIsStartingTrialRun,
    isTrialModalOpen,
    openTrialModal,
    closeTrialModal,
    isTrialTaskListExpanded,
    setIsTrialTaskListExpanded,
    handleToggleTrialBusinessDate,
    handleToggleTrialParameterRow,
  } = useTrialRun({
    selectedWt,
    usesBusinessDateAxis,
    trialAvailableBusinessDates,
    trialParameterRows,
  });
  const trialDimensionColumns = trialParameterColumns;
  const trialAvailableDimensionValues: Record<string, string[]> = {};
  const trialDimensionValues: Record<string, string[]> = {};
  const setTrialDimensionValues: React.Dispatch<React.SetStateAction<Record<string, string[]>>> = () => {};
  const trialFilteredRecords = useMemo(() => {
    if (!selectedWt) {
      return [] as WideTableRecord[];
    }
    const selectedRowKeys = new Set(selectedTrialParameterRowKeys);
    return currentWideTableRecords.filter((record) => {
      const businessDate = resolveTaskRecordBusinessDate(selectedWt, record);
      if (usesBusinessDateAxis && trialBusinessDates.length > 0 && !trialBusinessDates.includes(businessDate)) {
        return false;
      }
      if (selectedRowKeys.size === 0) {
        return true;
      }
      const rowKey = buildTrialParameterRowKey(trialParameterColumns, record);
      return rowKey !== "" && selectedRowKeys.has(rowKey);
    });
  }, [
    currentWideTableRecords,
    selectedWt,
    trialBusinessDates,
    trialParameterColumns,
    selectedTrialParameterRowKeys,
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
  const isPromptEditable = isDefinitionSubmitted;
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
  const {
    promptSaveMessage,
    isPersistingPrompts,
    promptEditorModes,
    promptMarkdownDrafts,
    handleIndicatorGroupPromptSectionChange,
    handlePersistPromptTemplates,
    handleMarkdownModeSelect,
    handleMarkdownDraftChange,
    buildWideTableWithPromptDrafts,
  } = usePromptEditor({
    requirement,
    selectedWt,
    effectiveWideTable,
    promptEditorGroups,
    isDefinitionSubmitted,
    updateSelectedWideTable,
    onRefreshData,
  });
  const {
    indicatorGroupMessage,
    isIndicatorGroupModalOpen,
    isPersistingIndicatorGroups,
    openIndicatorGroupModal,
    closeIndicatorGroupModal,
    handleAddIndicatorGroup,
    handleDeleteIndicatorGroup,
    handleIndicatorGroupChange,
    handleAssignIndicatorColumnToGroup,
    handleClearIndicatorColumnGroup,
    handlePersistIndicatorGroups,
  } = useIndicatorGroups({
    requirement,
    selectedWt,
    hasIndicatorColumns,
    isDefinitionSubmitted,
    isIndicatorGroupingComplete,
    usesBusinessDateAxis,
    currentWideTableRecords,
    wideTableRecords,
    taskGroups,
    fetchTasks,
    updateSelectedWideTable,
    onReplaceWideTableRecords,
    onTaskGroupsChange,
    onFetchTasksChange,
    onRequirementChange,
    onRefreshData,
    buildWideTableWithPromptDrafts,
  });

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

  const toggleTaskGroupExpand = (tgId: string) => {
    setExpandedTgId((prev) => (prev === tgId ? null : tgId));
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
              return [taskGroup.id, buildTaskGroupExecutionSummary(taskGroup, scopedFetchTasks)] as const;
            }),
          )
    ),
    [fetchTasks, wtTaskGroups],
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
  const trialTaskGroupRunViews = useMemo(
    () => taskGroupRunViews.filter((taskGroup) => taskGroup.triggeredBy === "trial"),
    [taskGroupRunViews],
  );
  const trialTaskGroupIds = useMemo(
    () => new Set(trialTaskGroupRunViews.map((taskGroup) => taskGroup.id)),
    [trialTaskGroupRunViews],
  );
  const trialFetchTasks = useMemo(
    () => fetchTasks.filter((task) => trialTaskGroupIds.has(task.taskGroupId)),
    [fetchTasks, trialTaskGroupIds],
  );
  const collectionTaskGroupRunViews = useMemo(
    () => taskGroupRunViews.filter((taskGroup) => taskGroup.triggeredBy !== "trial"),
    [taskGroupRunViews],
  );
  const collectionTaskGroupSections = useMemo(
    () => (
      effectiveWideTable
        ? buildTaskGroupRunSections(effectiveWideTable, collectionTaskGroupRunViews)
        : [{ id: "__all__", label: "", taskGroups: collectionTaskGroupRunViews }]
    ),
    [collectionTaskGroupRunViews, effectiveWideTable],
  );
  const collectionTaskNameMap = useMemo(
    () => new Map(
      (taskPlan?.collectionTasks ?? []).map((task) => [
        task.id,
        normalizeCollectionTaskLabel(task.name),
      ] as const),
    ),
    [taskPlan],
  );
  const defaultCollectionTaskName = useMemo(
    () => (
      taskPlan?.collectionTasks.length === 1
        ? normalizeCollectionTaskLabel(taskPlan.collectionTasks[0]?.name)
        : ""
    ),
    [taskPlan],
  );
  const collectionTaskIndicatorLabelsMap = useMemo(
    () => new Map(
      (taskPlan?.collectionTasks ?? []).map((task) => [task.id, task.indicatorLabels] as const),
    ),
    [taskPlan],
  );
  const collectionTaskSectionViews = useMemo<CollectionTaskSectionView[]>(
    () => collectionTaskGroupSections.map((section) => {
      const indicatorLabels = collectionTaskIndicatorLabelsMap.get(section.id)
        ?? collectionTaskIndicatorLabelsMap.get(section.taskGroups[0]?.indicatorGroupId ?? "")
        ?? (taskPlan?.collectionTasks.length === 1 ? taskPlan.collectionTasks[0]?.indicatorLabels : undefined)
        ?? [];
      const displayGroupLabel = collectionTaskNameMap.get(section.id)
        ?? collectionTaskNameMap.get(section.taskGroups[0]?.indicatorGroupId ?? "")
        ?? defaultCollectionTaskName
        ?? normalizeCollectionTaskLabel(section.taskGroups[0]?.indicatorGroupName);

      return {
        id: section.id,
        title: `采集任务：${displayGroupLabel}`,
        indicatorSummary: formatIndicatorSummary(indicatorLabels),
        indicatorLabels,
        displayGroupLabel,
        taskGroups: section.taskGroups,
      };
    }),
    [
      collectionTaskGroupSections,
      collectionTaskIndicatorLabelsMap,
      collectionTaskNameMap,
      defaultCollectionTaskName,
      taskPlan,
    ],
  );
  const expandedTaskInstanceRows = useMemo(
    () => buildTaskInstanceRowViews({
      wideTable: selectedWt ?? effectiveWideTable ?? undefined,
      fetchTasks: tgFetchTasks,
      indicatorGroups: effectiveWideTable?.indicatorGroups ?? selectedWt?.indicatorGroups ?? [],
      parameterColumns: returnContextColumns.filter((column) => !column.isBusinessDate),
      overrideBusinessDateLabel: expandedTaskGroupView?.businessDateLabel ?? expandedTaskGroupView?.displayLabel ?? "",
    }),
    [effectiveWideTable, expandedTaskGroupView?.businessDateLabel, expandedTaskGroupView?.displayLabel, returnContextColumns, selectedWt, tgFetchTasks],
  );
  const trialTaskInstanceRows = useMemo(
    () => buildTaskInstanceRowViews({
      wideTable: selectedWt ?? effectiveWideTable ?? undefined,
      fetchTasks: trialFetchTasks,
      indicatorGroups: effectiveWideTable?.indicatorGroups ?? selectedWt?.indicatorGroups ?? [],
      parameterColumns: returnContextColumns.filter((column) => !column.isBusinessDate),
    }),
    [effectiveWideTable, returnContextColumns, selectedWt, trialFetchTasks],
  );
  const hasRunningCollectionInstances = useMemo(
    () => Boolean(
      selectedWt && fetchTasks.some(
        (task) =>
          task.wideTableId === selectedWt.id
          && Boolean(task.collectionTaskId)
          && (task.status === "running" || task.status === "pending"),
      ),
    ),
    [fetchTasks, selectedWt],
  );
  useTaskStatusPolling({
    selectedWt,
    activeTaskSubTab,
    hasRunningCollectionInstances,
    onRefreshData,
  });

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

  const {
    runningTaskIds,
    cancellingTaskIds,
    getTaskInstanceDisplayStatus,
    getTaskInstanceDisplayCollectionTaskId,
    canSelectTaskInstance,
    getScopedSelectedTaskIds,
    handleToggleTaskSelection,
    handleToggleAllTaskSelection,
    clearScopedTaskSelection,
    isScopeBulkExecuting,
    handleBatchExecuteTasks,
    handleRequestTaskRerun,
    handleCancelTask,
  } = useTaskExecutionQueue({
    fetchTasks,
    taskGroups,
    onFetchTasksChange,
    onTaskGroupsChange,
    refreshAfterExecution,
    setTaskActionMessage,
    applyLocalTaskExecution,
  });

  const handleToggleTrialDimensionValue = (_columnName: string, _value: string) => {};

  const handleStartTrialRun = async () => {
    if (!selectedWt || !canStartTrialRun) {
      setTrialRunMessage(
        taskPlanBlockerMessage || "请先选择试运行范围，并确保当前范围内存在可采集的预览行。",
      );
      return;
    }

    const rowBindingKeys = Array.from(
      new Set(
        trialFilteredRecords
          .slice(0, trialMaxRows)
          .map((record) => String(record.rowBindingKey ?? "").trim())
          .filter(Boolean),
      ),
    );
    if (rowBindingKeys.length === 0) {
      setTrialRunMessage("请先选择可匹配到预览行的采集参数后再试运行。");
      return;
    }
    setIsStartingTrialRun(true);
    setTrialRunMessage("正在创建试运行任务，并发起小范围采集。");
    try {
      const result = await createTrialRun(requirement.id, {
        wideTableId: selectedWt.id,
        businessDates: usesBusinessDateAxis ? trialBusinessDates : [],
        rowBindingKeys,
        maxRows: trialMaxRows,
        operator: "当前用户",
      });
      const collectionCallStatus = (result.collectionCallStatus ?? "failed") as
        | "running"
        | "failed";
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
          status: collectionCallStatus,
          startedAt: formatRunTimestamp(new Date()),
          operator: "当前用户",
          logRef: `log://${taskGroup.id}/trial`,
        })),
      ]);
      setExpandedTgId(result.taskGroups[0]?.id ?? null);
      setTrialRunMessage(collectionCallStatus === "running" ? "采集接口已成功调用" : "采集接口不可用");
    } catch (error) {
      setTrialRunMessage(`试运行失败：${formatTaskActionError(error)}`);
    } finally {
      setIsStartingTrialRun(false);
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

  const renderTaskInstanceCollectionTaskId = (
    row: Pick<TaskInstanceRowView, "fetchTaskId" | "collectionTaskId">,
  ) => {
    const displayStatus = getTaskInstanceDisplayStatus({
      fetchTaskId: row.fetchTaskId,
      status: "pending",
    });
    const displayCollectionTaskId = getTaskInstanceDisplayCollectionTaskId(row);
    if (displayStatus === "queued") {
      return (
        <div className="space-y-1">
          <div className="font-sans text-slate-500">本次：排队中</div>
          {row.collectionTaskId ? <div>上次：{row.collectionTaskId}</div> : null}
        </div>
      );
    }
    if (displayStatus === "running" && displayCollectionTaskId) {
      return (
        <div className="space-y-1">
          <div>
            本次：{displayCollectionTaskId}
          </div>
          {row.collectionTaskId && row.collectionTaskId !== displayCollectionTaskId ? (
            <div className="text-slate-500">上次：{row.collectionTaskId}</div>
          ) : null}
        </div>
      );
    }
    return displayCollectionTaskId ?? row.collectionTaskId ?? "-";
  };

  const closeTaskStatusLog = () => {
    setSelectedTaskStatusLog(null);
    setTaskStatusLogPayload(null);
    setTaskStatusLogError("");
    setIsLoadingTaskStatusLog(false);
  };

  const handleOpenTaskStatusLog = async (collectionTaskId: string, rowLabel: string) => {
    setSelectedTaskStatusLog({ collectionTaskId, rowLabel });
    setTaskStatusLogPayload(null);
    setTaskStatusLogError("");
    setIsLoadingTaskStatusLog(true);
    try {
      const payload = await fetchCollectionTaskStatusDetail(collectionTaskId);
      setTaskStatusLogPayload(payload);
    } catch (error) {
      setTaskStatusLogError(`加载日志失败：${formatTaskActionError(error)}`);
    } finally {
      setIsLoadingTaskStatusLog(false);
    }
  };

  const renderIndicatorSummaryBlock = (
    indicatorLabels: string[],
    collectionTaskLabel: string,
    compact = false,
  ) => {
    if (indicatorLabels.length === 0) {
      return <div className="text-muted-foreground">-</div>;
    }

    return (
      <div className="space-y-1">
        <div className="text-muted-foreground">
          {formatIndicatorSummary(indicatorLabels)}
        </div>
        {indicatorLabels.length > 3 ? (
          <button
            type="button"
            className={cn("text-xs text-primary hover:underline", compact ? "leading-4" : "")}
            onClick={() => setSelectedIndicatorTask({ collectionTaskLabel, indicatorLabels })}
          >
            查看全部
          </button>
        ) : null}
      </div>
    );
  };

  const renderSelectableTaskInstanceActions = (row: TaskInstanceRowView) => {
    const displayStatus = getTaskInstanceDisplayStatus(row);
    const displayCollectionTaskId = getTaskInstanceDisplayCollectionTaskId(row);
    const isRunning = displayStatus === "running";
    const isQueued = displayStatus === "queued";
    const actionLabel = row.status === "failed" || row.status === "completed" || row.status === "cancelled" ? "重采" : "采集";

    return (
      <TaskInstanceActions
        executeLabel={actionLabel}
        isRunning={isRunning}
        isQueued={isQueued}
        isCancelling={cancellingTaskIds.includes(row.fetchTaskId)}
        executeDisabled={runningTaskIds.includes(row.fetchTaskId) || cancellingTaskIds.includes(row.fetchTaskId) || isRunning || isQueued}
        showCancel={isQueued || (isRunning && !!displayCollectionTaskId)}
        showViewLog={isRunning && !!displayCollectionTaskId}
        onExecute={() => void handleRequestTaskRerun(row.fetchTaskId, row.rowLabel)}
        onCancel={() => void handleCancelTask(row.fetchTaskId, row.rowLabel, displayCollectionTaskId)}
        onViewLog={() => void handleOpenTaskStatusLog(displayCollectionTaskId!, row.rowLabel)}
      />
    );
  };

  const renderSelectableTaskInstanceTable = (
    rows: TaskInstanceRowView[],
    scopeKey: string,
    emptyMessage = "当前还没有可展示的采集实例。",
  ) => {
    if (rows.length === 0) {
      return <div className="text-xs text-muted-foreground">{emptyMessage}</div>;
    }

    const selectedTaskIds = getScopedSelectedTaskIds(scopeKey, rows);
    const selectableRows = rows.filter(canSelectTaskInstance);
    const allSelected = selectableRows.length > 0 && selectedTaskIds.length === selectableRows.length;
    const isBulkExecuting = isScopeBulkExecuting(scopeKey);
    const legendItems = buildTaskStatusLegend(
      rows.map((row) => ({ status: getTaskInstanceDisplayStatus(row) })),
    );

    return (
      <TaskInstanceTable
        rows={rows}
        legendItems={legendItems}
        emptyMessage={emptyMessage}
        selection={{
          selectedTaskIds,
          selectableTaskIds: selectableRows.map((row) => row.fetchTaskId),
          allSelected,
          isBulkExecuting,
          onToggleAll: () => handleToggleAllTaskSelection(scopeKey, rows),
          onToggleOne: (taskId) => handleToggleTaskSelection(scopeKey, taskId),
          onBatchExecute: () => void handleBatchExecuteTasks(scopeKey, rows),
          onClearSelection: () => clearScopedTaskSelection(scopeKey),
        }}
        getDisplayStatus={getTaskInstanceDisplayStatus}
        renderIndicatorSummary={renderIndicatorSummaryBlock}
        renderCollectionTaskId={renderTaskInstanceCollectionTaskId}
        renderActions={renderSelectableTaskInstanceActions}
        renderStatusBadge={(status) => <StatusBadge status={status} />}
      />
    );
  };

  const renderTaskGroupCards = (taskGroupViews: HistoricalTaskGroupView[]) => (
    <TaskGroupCards
      taskGroupViews={taskGroupViews}
      expandedTgId={expandedTgId}
      onToggleTaskGroupExpand={toggleTaskGroupExpand}
      renderTaskGroupStatusBadge={(taskGroup) => (
        <StatusBadge
          status={taskGroup.displayStatus}
          label={getTaskGroupStatusLabel(taskGroup)}
        />
      )}
      renderExpandedContent={(taskGroup) => (
        renderSelectableTaskInstanceTable(
          expandedTaskInstanceRows,
          `task-group:${taskGroup.id}`,
        )
      )}
    />
  );

  return (
    <div className="space-y-6">
      {!isDefinitionSubmitted ? (
        <RequirementNotSubmittedAlert
          href={`/projects/${requirement.projectId}/requirements/${requirement.id}?${navQuery}view=requirement&tab=requirement`}
        />
      ) : null}

      {/* 宽表选择 */}
      {wideTables.length > 1 ? (
        <WideTableSelector
          selectedWtId={selectedWtId}
          wideTables={wideTables}
          onSelect={(wideTableId) => {
            setSelectedWtId(wideTableId);
            setExpandedTgId(null);
          }}
        />
      ) : null}

      {selectedWt ? (
        <RequirementTaskTabs
          activeTaskSubTab={activeTaskSubTab}
          activeTaskSubTabIndex={activeTaskSubTabIndex}
          taskSubTabs={taskSubTabs}
          onSelect={(tabKey) => setActiveTaskSubTab(tabKey)}
        />
      ) : null}

      {selectedWt && activeTaskSubTab === "prompts" ? (
        <PromptManagementTab
          requirement={requirement}
          selectedWt={selectedWt}
          effectiveWideTable={effectiveWideTable}
          isDefinitionSubmitted={isDefinitionSubmitted}
          hasIndicatorColumns={hasIndicatorColumns}
          indicatorColumns={indicatorColumns}
          hasUserDefinedGrouping={hasUserDefinedGrouping}
          userDefinedIndicatorGroups={userDefinedIndicatorGroups}
          columnGroupMap={columnGroupMap}
          indicatorGroupMessage={indicatorGroupMessage}
          canGenerateTaskPlan={canGenerateTaskPlan}
          needsScopeRefresh={needsScopeRefresh}
          isPersistingIndicatorGroups={isPersistingIndicatorGroups}
          hasCurrentVersionTaskGroups={hasCurrentVersionTaskGroups}
          taskPlanBlockerMessage={taskPlanBlockerMessage}
          promptSaveMessage={promptSaveMessage}
          isPersistingPrompts={isPersistingPrompts}
          promptEditorGroups={promptEditorGroups}
          indicatorGroupPromptMap={indicatorGroupPromptMap}
          promptEditorModes={promptEditorModes}
          promptMarkdownDrafts={promptMarkdownDrafts}
          isPromptEditable={isPromptEditable}
          onOpenIndicatorGroupModal={openIndicatorGroupModal}
          onPersistIndicatorGroups={() => void handlePersistIndicatorGroups()}
          onPersistPromptTemplates={() => void handlePersistPromptTemplates()}
          onOpenTrialModal={openTrialModal}
          onMarkdownModeSelect={handleMarkdownModeSelect}
          onMarkdownDraftChange={handleMarkdownDraftChange}
          onIndicatorGroupPromptSectionChange={(groupId, key, value) => (
            handleIndicatorGroupPromptSectionChange(groupId, key, value)
          )}
        />
      ) : null}

      {selectedWt && activeTaskSubTab === "output" ? (
        <TaskOutputTab
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
        <IndicatorGroupModal
          selectedWt={selectedWt}
          hasIndicatorColumns={hasIndicatorColumns}
          isDefinitionSubmitted={isDefinitionSubmitted}
          isPersistingIndicatorGroups={isPersistingIndicatorGroups}
          indicatorColumns={indicatorColumns}
          columnGroupMap={columnGroupMap}
          userDefinedIndicatorGroups={userDefinedIndicatorGroups}
          isIndicatorGroupingComplete={isIndicatorGroupingComplete}
          hasCurrentVersionTaskGroups={hasCurrentVersionTaskGroups}
          onAddIndicatorGroup={handleAddIndicatorGroup}
          onPersistIndicatorGroups={() => void handlePersistIndicatorGroups()}
          onClose={closeIndicatorGroupModal}
          onAssignIndicatorColumnToGroup={handleAssignIndicatorColumnToGroup}
          onClearIndicatorColumnGroup={handleClearIndicatorColumnGroup}
          onIndicatorGroupChange={handleIndicatorGroupChange}
          onDeleteIndicatorGroup={handleDeleteIndicatorGroup}
        />
      ) : null}

      {selectedWt ? (
        <TrialRunModal
          isOpen={isTrialModalOpen}
          selectedWt={selectedWt}
          requirementProjectId={requirement.projectId}
          requirementId={requirement.id}
          navQuery={navQuery}
          onClose={closeTrialModal}
          onStartTrialRun={() => void handleStartTrialRun()}
          canStartTrialRun={canStartTrialRun}
          isStartingTrialRun={isStartingTrialRun}
          taskPlanBlockerMessage={taskPlanBlockerMessage}
          usesBusinessDateAxis={usesBusinessDateAxis}
          trialAvailableBusinessDates={trialAvailableBusinessDates}
          trialBusinessDates={trialBusinessDates}
          onToggleTrialBusinessDate={handleToggleTrialBusinessDate}
          trialParameterColumns={trialParameterColumns}
          trialParameterRows={trialParameterRows}
          selectedTrialParameterRowKeys={selectedTrialParameterRowKeys}
          onClearTrialParameterSelection={() => setSelectedTrialParameterRowKeys([])}
          onToggleTrialParameterRow={handleToggleTrialParameterRow}
          trialEstimatedRows={trialEstimatedRows}
          trialEstimatedTaskCount={trialEstimatedTaskCount}
          trialFilteredRecordsCount={trialFilteredRecords.length}
          trialMaxRows={trialMaxRows}
          onTrialMaxRowsChange={(value) => setTrialMaxRows(Math.min(200, Math.max(1, value)))}
          latestTrialTaskGroup={latestTrialTaskGroup}
          trialRunMessage={trialRunMessage}
        />
      ) : null}

      {selectedWt && activeTaskSubTab === "tasks" ? (
        <TaskPlanSection
          wideTableName={selectedWt.name}
          taskPlan={taskPlan}
          usesBusinessDateAxis={usesBusinessDateAxis}
          taskPlanBlockerMessage={taskPlanBlockerMessage}
          onOpenIndicatorList={(collectionTaskLabel, indicatorLabels) => {
            setSelectedIndicatorTask({
              collectionTaskLabel,
              indicatorLabels,
            });
          }}
        />
      ) : null}

      {selectedWt && activeTaskSubTab === "tasks" ? (
        <TaskExecutionTab
          wideTableName={selectedWt.name}
          taskActionMessage={taskActionMessage}
          taskPlanBlockerMessage={taskPlanBlockerMessage}
          usesBusinessDateAxis={usesBusinessDateAxis}
          historicalDateCount={taskPlan?.historicalDateCount ?? 0}
          taskGroupRunViews={taskGroupRunViews}
          trialTaskGroupRunViews={trialTaskGroupRunViews}
          isTrialTaskListExpanded={isTrialTaskListExpanded}
          onToggleTrialTaskListExpanded={() => setIsTrialTaskListExpanded((current) => !current)}
          renderTrialTaskTable={() => renderSelectableTaskInstanceTable(
            trialTaskInstanceRows,
            `trial:${selectedWt.id}`,
            "当前还没有可展示的试运行实例。",
          )}
          collectionTaskSections={collectionTaskSectionViews}
          onOpenIndicatorList={(collectionTaskLabel, indicatorLabels) => {
            setSelectedIndicatorTask({
              collectionTaskLabel,
              indicatorLabels,
            });
          }}
          renderTaskGroupCards={renderTaskGroupCards}
          scheduleJobs={wtScheduleJobs}
          renderStatusBadge={(status) => <StatusBadge status={status} />}
        />
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

      {selectedTaskStatusLog ? (
        <CollectionTaskStatusPopup
          collectionTaskId={selectedTaskStatusLog.collectionTaskId}
          rowLabel={selectedTaskStatusLog.rowLabel}
          payload={taskStatusLogPayload}
          isLoading={isLoadingTaskStatusLog}
          errorMessage={taskStatusLogError}
          onClose={closeTaskStatusLog}
        />
      ) : null}

      {selectedIndicatorTask ? (
        <CollectionTaskIndicatorsPopup
          collectionTaskLabel={selectedIndicatorTask.collectionTaskLabel}
          requirementTitle={requirement.title}
          wideTableName={selectedWt?.name ?? effectiveWideTable?.name ?? "-"}
          indicatorNames={selectedIndicatorTask.indicatorLabels}
          onClose={() => setSelectedIndicatorTask(null)}
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
      status: "completed" as const,
      triggeredBy: "manual" as const,
      totalTasks: completedTaskCount,
      pendingTasks: 0,
      runningTasks: 0,
      completedTasks: completedTaskCount,
      failedTasks: 0,
      cancelledTasks: 0,
      invalidatedTasks: 0,
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
              status: "completed" as const,
              pendingTasks: Math.max(taskGroup.pendingTasks - 1, 0),
              runningTasks: Math.max(taskGroup.runningTasks - 1, 0),
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

