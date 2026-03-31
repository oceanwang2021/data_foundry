"use client";

import React, { useEffect, useMemo, useState } from "react";
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
  executeTask,
  executeTaskGroup,
  persistWideTablePlan,
  persistWideTablePreview,
  retryTask,
} from "@/lib/api-client";
import { ListTree, RotateCcw } from "lucide-react";
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
};

const triggerLabel: Record<string, string> = {
  schedule: "定时调度",
  backfill: "初始补数",
  manual: "手动执行",
  manual_retry: "手动重试",
};

export default function RequirementTasksPanel({
  requirement,
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
}: Props) {
  const searchParams = useSearchParams();
  const [selectedWtId, setSelectedWtId] = useState<string>(wideTables[0]?.id ?? "");
  const [expandedTgId, setExpandedTgId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskActionMessage, setTaskActionMessage] = useState("");
  const [indicatorGroupMessage, setIndicatorGroupMessage] = useState("");
  const [isIndicatorGroupModalOpen, setIsIndicatorGroupModalOpen] = useState(false);
  const [isPersistingIndicatorGroups, setIsPersistingIndicatorGroups] = useState(false);
  const [promptEditorModes, setPromptEditorModes] = useState<Record<string, "sections" | "markdown">>({});
  const [promptMarkdownDrafts, setPromptMarkdownDrafts] = useState<Record<string, string>>({});
  const [runningTaskGroupIds, setRunningTaskGroupIds] = useState<string[]>([]);
  const [runningTaskIds, setRunningTaskIds] = useState<string[]>([]);
  const requestedWtId = searchParams?.get("wt");
  const requestedTaskGroupId = searchParams?.get("tg");
  const requestedTaskId = searchParams?.get("task");

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
  const columnGroupMap = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const group of selectedWt?.indicatorGroups ?? []) {
      for (const column of group.indicatorColumns) {
        map.set(column, { id: group.id, name: group.name });
      }
    }
    return map;
  }, [selectedWt]);
  const hasIndicatorColumns = indicatorColumns.length > 0;
  const isPromptEditable = requirement.requirementType === "demo";
  const isIndicatorGroupingComplete = selectedWt ? isStepBComplete(selectedWt) : false;
  const hasPreviewRecords = currentWideTableRecords.length > 0;
  const currentTaskPlanFingerprint = useMemo(
    () => (
      selectedWt && hasPreviewRecords
        ? buildTaskPlanFingerprint(selectedWt, currentWideTableRecords)
        : ""
    ),
    [currentWideTableRecords, hasPreviewRecords, selectedWt],
  );
  const isIndicatorGroupingDirty = Boolean(
    selectedWt
    && hasPreviewRecords
    && isIndicatorGroupingComplete
    && selectedWt.currentPlanFingerprint
    && selectedWt.currentPlanFingerprint !== currentTaskPlanFingerprint,
  );
  const canGenerateTaskPlan = Boolean(
    selectedWt
    && isIndicatorGroupingComplete
    && hasPreviewRecords
    && !isIndicatorGroupingDirty,
  );
  const needsProductionScopeRefresh = requirement.requirementType === "production" && requirement.status === "aligning";
  const taskPlanBlockerMessage = needsProductionScopeRefresh
    ? "请先回到【定义】Tab 调整维度范围并确认，正式任务组才会生成。"
    : !hasIndicatorColumns
      ? "当前宽表没有指标列，暂不需要任务组拆分。"
      : !hasPreviewRecords
        ? "请先回到【定义】Tab 确认范围并生成预览，再到这里生成任务组。"
        : isIndicatorGroupingDirty
          ? "指标分组已修改，请先保存分组并重建任务组。"
        : !isIndicatorGroupingComplete
          ? "请先完成指标分组并覆盖全部指标列，任务组才会按“宽表行 × 指标组”正确拆分。"
          : "";
  const indicatorGroupPromptMap = useMemo(
    () => (
      !selectedWt
        ? new Map<string, ReturnType<typeof buildIndicatorGroupPrompt>>()
        : new Map(
            selectedWt.indicatorGroups.map((group) => [
              group.id,
              buildIndicatorGroupPrompt(requirement, selectedWt, group),
            ]),
          )
    ),
    [requirement, selectedWt],
  );
  const updateSelectedWideTable = (updater: (wideTable: WideTable) => WideTable) => {
    if (!selectedWt || !onUpdateWideTable) {
      return;
    }
    onUpdateWideTable(selectedWt.id, updater);
  };

  const wtTaskGroups = useMemo(
    () => (
      needsProductionScopeRefresh || !canGenerateTaskPlan
        ? []
        : taskGroups
            .filter(
              (tg) =>
                tg.wideTableId === selectedWtId
                && resolveTaskGroupPlanVersion(tg, currentPlanVersion) === currentPlanVersion,
            )
            .sort((a, b) => b.businessDate.localeCompare(a.businessDate))
    ),
    [canGenerateTaskPlan, currentPlanVersion, needsProductionScopeRefresh, selectedWtId, taskGroups],
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
                wideTable: selectedWt,
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
    [currentWideTableRecords, fetchTasks, selectedWt, wtTaskGroups],
  );
  const taskPlan = useMemo(
    () => (selectedWt && isIndicatorGroupingComplete ? buildTaskPlanView(selectedWt) : null),
    [isIndicatorGroupingComplete, selectedWt],
  );
  const taskGroupRunViews = useMemo(
    () => (
      selectedWt && taskPlan && canGenerateTaskPlan
        ? buildTaskGroupRunViews(requirement, selectedWt, taskPlan, wtTaskGroups, taskGroupSummaryMap, wtScheduleJobs)
        : []
    ),
    [canGenerateTaskPlan, requirement, selectedWt, taskPlan, wtScheduleJobs, wtTaskGroups, taskGroupSummaryMap],
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
        wideTable: selectedWt,
        taskGroup: expandedTaskGroupView?.taskGroupForTasks ?? null,
        fetchTasks: tgFetchTasks,
        wideTableRecords: currentWideTableRecords,
      }),
    [currentWideTableRecords, selectedWt, expandedTaskGroupView, tgFetchTasks],
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
    setPromptEditorModes({});
    setPromptMarkdownDrafts({});
  }, [selectedWtId]);

  const initializePromptEditorState = (wideTable: WideTable) => {
    setPromptMarkdownDrafts(
      Object.fromEntries(
        wideTable.indicatorGroups.map((group) => [
          group.id,
          buildIndicatorGroupPrompt(requirement, wideTable, group).markdown,
        ]),
      ),
    );
    setPromptEditorModes((current) => (
      Object.fromEntries(
        wideTable.indicatorGroups.map((group) => [
          group.id,
          current[group.id] ?? "sections",
        ]),
      )
    ));
  };

  const handleAddIndicatorGroup = () => {
    if (!selectedWt) {
      return;
    }

    const nextIndex = selectedWt.indicatorGroups.length + 1;
    updateSelectedWideTable((wideTable) => ({
      ...wideTable,
      indicatorGroups: [
        ...wideTable.indicatorGroups,
        {
          id: `ig_${wideTable.id}_${Date.now()}`,
          wideTableId: wideTable.id,
          name: `新指标组${nextIndex}`,
          indicatorColumns: [],
          priority: nextIndex,
          description: "",
        },
      ],
      updatedAt: new Date().toISOString(),
    }));
  };

  const handleDeleteIndicatorGroup = (groupId: string) => {
    updateSelectedWideTable((wideTable) => ({
      ...wideTable,
      indicatorGroups: wideTable.indicatorGroups
        .filter((group) => group.id !== groupId)
        .map((group, index) => ({
          ...group,
          priority: index + 1,
        })),
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
      indicatorGroups: wideTable.indicatorGroups.map((group) => (
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
      )),
      updatedAt: new Date().toISOString(),
    }));
  };

  const buildWideTableWithPromptDrafts = (
    wideTable: WideTable,
    editedAt: string,
  ): WideTable => {
    const indicatorGroups = wideTable.indicatorGroups.map((group) => {
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

  const handleAssignIndicatorColumnToGroup = (columnName: string, groupId: string) => {
    updateSelectedWideTable((wideTable) => ({
      ...wideTable,
      indicatorGroups: wideTable.indicatorGroups.map((group) => {
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
      }),
      updatedAt: new Date().toISOString(),
    }));
  };

  const handleClearIndicatorColumnGroup = (columnName: string) => {
    updateSelectedWideTable((wideTable) => ({
      ...wideTable,
      indicatorGroups: wideTable.indicatorGroups.map((group) => ({
        ...group,
        indicatorColumns: group.indicatorColumns.filter((column) => column !== columnName),
      })),
      updatedAt: new Date().toISOString(),
    }));
  };

  const handlePersistIndicatorGroups = async () => {
    if (!selectedWt) {
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
      if (!isIndicatorGroupingComplete || !hasPreviewRecords) {
        await persistWideTablePreview(requirement.id, nextWideTable, currentWideTableRecords);
        updateSelectedWideTable(() => nextWideTable);
        setIndicatorGroupMessage(
          !hasPreviewRecords
            ? "已保存指标分组草稿。请先回到【定义】Tab 确认范围并生成预览，再生成任务组。"
            : "已保存指标分组草稿。请把所有指标分配到分组后，再生成任务组。",
        );
        return;
      }

      const reconciliation = reconcileTaskPlanChange({
        requirement,
        wideTable: nextWideTable,
        previousRecords: currentWideTableRecords,
        nextRecords: currentWideTableRecords,
        taskGroups,
        fetchTasks,
      });
      const nextPlanVersion = reconciliation.nextPlanVersion || Math.max(
        1,
        resolveCurrentPlanVersion(nextWideTable, currentWideTableRecords, taskGroups),
      );
      const nextPlanFingerprint = reconciliation.nextPlanFingerprint || buildTaskPlanFingerprint(
        nextWideTable,
        currentWideTableRecords,
      );
      const annotatedRecords = annotateCurrentPlanRecords(currentWideTableRecords, nextPlanVersion);
      const persistedWideTable: WideTable = {
        ...nextWideTable,
        currentPlanVersion: nextPlanVersion,
        currentPlanFingerprint: nextPlanFingerprint,
        recordCount: nextWideTable.recordCount > 0 ? nextWideTable.recordCount : annotatedRecords.length,
        status: nextWideTable.status === "active" ? "active" : "initialized",
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
            ? `已保存指标分组，并生成 ${reconciliation.generatedTaskGroupCount} 个任务组、${reconciliation.generatedTaskCount} 个采集任务。`
            : `已保存指标分组，并生成当前快照的 ${reconciliation.generatedTaskGroupCount} 个任务组、${reconciliation.generatedTaskCount} 个采集任务。`,
        );
      } else {
        await persistWideTablePreview(
          requirement.id,
          persistedWideTable,
          currentWideTableRecords,
        );
        setIndicatorGroupMessage("已保存指标分组配置，当前任务计划无需重建。");
      }

      updateSelectedWideTable(() => persistedWideTable);
      if (requirement.requirementType === "production" && requirement.status !== "running") {
        onRequirementChange?.({
          ...requirement,
          status: "running",
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
        requirement.requirementType === "demo" && (taskGroupView.displayStatus === "pending" || taskGroupView.displayStatus === "invalidated")
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
      <section className="rounded-xl border bg-card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <ListTree className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">执行</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          指标分组属于执行层配置，用来降低单次 Agent 请求的心智负担。只有先完成指标分组，系统才能按“宽表行 × 指标组”正确生成任务组。
        </p>
        {needsProductionScopeRefresh ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            当前需求刚转为正式。请先回到【定义】Tab 调整维度范围并确认，再回到这里配置指标分组并生成正式任务组。
          </div>
        ) : null}
      </section>

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
        <section className="rounded-xl border bg-card p-6 space-y-4">
          <div>
            <h3 className="font-semibold">指标分组</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              指标分组决定单次任务的执行边界，也是生成任务组前的阻塞条件。
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <PlanMetricCard title="指标列数" value={String(indicatorColumns.length)} hint={selectedWt.name} />
            <PlanMetricCard title="已建分组" value={String(selectedWt.indicatorGroups.length)} hint={selectedWt.indicatorGroups.map((group) => group.name).join("、") || "尚未配置"} />
            <PlanMetricCard title="分组完成度" value={isIndicatorGroupingComplete ? "已完成" : "待补齐"} hint={hasPreviewRecords ? "完成后可生成任务组" : "请先准备预览数据"} />
          </div>

          {indicatorGroupMessage ? (
            <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
              {indicatorGroupMessage}
            </div>
          ) : null}

          {!hasIndicatorColumns ? (
            <div className="text-sm text-muted-foreground">当前宽表没有指标列，暂不需要指标分组。</div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b bg-muted/20 px-4 py-3">
                  <div>
                    <h4 className="text-sm font-semibold">分组概览</h4>
                    <p className="mt-1 text-xs text-muted-foreground">
                      页面内只展示分组结果，不直接编辑。不同颜色对应不同分组，与弹窗内保持一致。
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!selectedWt) {
                        return;
                      }
                      initializePromptEditorState(selectedWt);
                      setIsIndicatorGroupModalOpen(true);
                    }}
                    disabled={!selectedWt || !hasIndicatorColumns}
                    className={cn(
                      "rounded-md border px-3 py-1.5 text-xs",
                      !selectedWt || !hasIndicatorColumns
                        ? "cursor-not-allowed text-muted-foreground opacity-50"
                        : "text-primary hover:bg-primary/5",
                    )}
                  >
                    分组管理
                  </button>
                </div>
                <div className="space-y-3 px-4 py-4">
                  {selectedWt.indicatorGroups.length > 0 ? (
                    <div className="grid gap-3 lg:grid-cols-2">
                      {selectedWt.indicatorGroups.map((group) => (
                        <div
                          key={group.id}
                          className={cn("rounded-lg border px-4 py-3", groupToneClass(group.id, selectedWt.indicatorGroups))}
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
                                  className={cn("rounded-full border px-2 py-1 text-[11px]", groupToneClass(group.id, selectedWt.indicatorGroups))}
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
                  ) : (
                    <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                      还没有指标分组。点击右上角“分组管理”开始配置。
                    </div>
                  )}

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
          )}
        </section>
      ) : null}

      {selectedWt && hasIndicatorColumns && isIndicatorGroupModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-6xl rounded-xl border bg-card shadow-xl">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
              <div>
                <h4 className="text-sm font-semibold">分组管理</h4>
                <p className="mt-1 text-xs text-muted-foreground">
                  在这里统一维护分组名称、执行说明、指标归属，以及各指标组对应的 Agent 提示词。
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAddIndicatorGroup}
                  disabled={!selectedWt || !hasIndicatorColumns || isPersistingIndicatorGroups}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-xs",
                    !selectedWt || !hasIndicatorColumns || isPersistingIndicatorGroups
                      ? "cursor-not-allowed text-muted-foreground opacity-50"
                      : "text-primary hover:bg-primary/5",
                  )}
                >
                  新增分组
                </button>
                <button
                  type="button"
                  onClick={() => void handlePersistIndicatorGroups()}
                  disabled={!selectedWt || isPersistingIndicatorGroups}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium",
                    !selectedWt || isPersistingIndicatorGroups
                      ? "cursor-not-allowed bg-muted text-muted-foreground"
                      : "bg-primary text-primary-foreground hover:opacity-90",
                  )}
                >
                  {isPersistingIndicatorGroups
                    ? "保存中..."
                    : hasPreviewRecords && isIndicatorGroupingComplete
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
                  ? "提示词支持分段编辑和整体 Markdown 编辑。默认内容来自需求定义，Demo 阶段可以在弹窗内直接改写。"
                  : "当前为正式需求阶段。提示词仅展示，不允许在执行阶段继续编辑。"}
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
                              groupSelectClass(columnGroupMap.get(column.name)?.id, selectedWt.indicatorGroups),
                            )}
                          >
                            <option value="">未分组</option>
                            {selectedWt.indicatorGroups.map((group) => (
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

              {selectedWt.indicatorGroups.length === 0 ? (
                <div className="rounded-lg border border-dashed bg-background px-4 py-8 text-center text-sm text-muted-foreground">
                  还没有指标分组。请先新增分组，并把所有指标列分配进去。
                </div>
              ) : (
                <div className="grid gap-3 lg:grid-cols-2">
                  {selectedWt.indicatorGroups.map((group) => {
                    const promptBundle = indicatorGroupPromptMap.get(group.id)
                      ?? buildIndicatorGroupPrompt(requirement, selectedWt, group);
                    const editMode = promptEditorModes[group.id] ?? "sections";
                    const markdownDraft = promptMarkdownDrafts[group.id] ?? promptBundle.markdown;
                    return (
                      <div key={group.id} className={cn("rounded-lg border bg-background p-4 space-y-3", groupToneClass(group.id, selectedWt.indicatorGroups))}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 space-y-2">
                            <input
                              value={group.name}
                              onChange={(event) => handleIndicatorGroupChange(group.id, { name: event.target.value })}
                              className={cn("w-full rounded-md border bg-background px-3 py-2 text-sm", groupToneClass(group.id, selectedWt.indicatorGroups))}
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
                                className={cn("rounded-full border px-2 py-1 text-[11px]", groupToneClass(group.id, selectedWt.indicatorGroups))}
                              >
                                {findIndicatorColumnLabel(indicatorColumns, columnName)}
                              </span>
                            ))
                          ) : (
                            <span className="text-[11px] text-muted-foreground">该分组还没有分配指标。</span>
                          )}
                        </div>

                        <div className="rounded-lg border bg-muted/10 p-3 space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <div className="text-sm font-medium">Agent 提示词</div>
                              <div className="text-[11px] text-muted-foreground">
                                Demo 可编辑核心查询需求、业务知识和输出限制；指标与维度信息始终由需求定义生成。
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
                                    [group.id]: current[group.id] ?? buildIndicatorGroupPrompt(requirement, selectedWt, group).markdown,
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
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {selectedWt ? (
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

      <section className="rounded-xl border bg-card p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">{`任务组运行记录 – ${selectedWt?.name ?? "-"}`}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {usesBusinessDateAxis
                ? "任务组按业务日期拆分；组内任务按“宽表行 × 指标组”展开，列表状态展示的是组内任务的当前聚合结果。"
                : "任务组按开始调度时间拆分；每次调度生成一个全量快照任务组，组内任务按“宽表行 × 指标组”展开。"}
            </p>
          </div>
        </div>

        <div className="text-right text-xs text-muted-foreground">
          <div>
            {taskPlan
              ? usesBusinessDateAxis
                ? `已建立 ${wtTaskGroups.length} 个执行任务组 / 当前范围历史期数 ${taskPlan.historicalDateCount}`
                : `已建立 ${wtTaskGroups.length} 个全量快照任务组 / ${taskPlan.scheduleSummary}`
              : `共 ${wtTaskGroups.length} 个任务组`}
          </div>
          <div className="mt-1">
            {requirement.requirementType === "demo"
              ? "Demo 全部手动执行"
              : needsProductionScopeRefresh
                ? "正式任务组待维度范围确认后生成"
                : !isIndicatorGroupingComplete
                  ? "完成指标分组后才能生成任务组"
                : usesBusinessDateAxis
                  ? dataUpdateEnabled
                    ? "正式需求按“历史补数 + 未来调度”生成任务组"
                    : "正式需求按当前固定范围生成一次性任务组"
                  : dataUpdateEnabled
                    ? "正式需求按调度规则持续生成全量快照任务组"
                    : "正式需求按当前快照范围生成一次性交付任务组"}
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
          <div className="space-y-2">
            {taskGroupRunViews.map((tg) => {
              const isExpanded = expandedTgId === tg.id;

              return (
                <div key={tg.id} className="rounded-lg border">
                  <div className="flex items-center gap-3 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => toggleTaskGroupExpand(tg.id)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left hover:bg-muted/30 rounded-md px-2 py-1.5"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{tg.displayLabel}</span>
                          <StatusBadge
                            status={tg.displayStatus}
                            label={getTaskGroupStatusLabel(tg, requirement.requirementType)}
                          />
                          <span className={cn("text-[10px] px-1.5 py-0.5 rounded border bg-background")}>
                            {getTriggerDisplayLabel(tg.triggeredBy, requirement.requirementType)}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {tg.isReal
                            ? `${tg.id} | 总计 ${tg.totalTasks} | 运行中 ${tg.runningTasks} | 已完成 ${tg.completedTasks} | 失败 ${tg.failedTasks}${tg.pendingTasks > 0 ? ` | 待执行 ${tg.pendingTasks}` : ""}`
                            : isScheduledFutureTaskGroupView(tg, requirement.requirementType)
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
                      requirementType: requirement.requirementType,
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
                          : requirement.requirementType === "demo" && (tg.displayStatus === "pending" || tg.displayStatus === "invalidated")
                            ? "执行任务组"
                            : "重新执行任务组"}
                      </button>
                    ) : null}
                  </div>

                  {isExpanded ? (
                    <div className="border-t px-4 py-3">
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
        )}
      </section>

      {archivedTaskGroups.length > 0 ? (
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

      {wtScheduleJobs.length > 0 ? (
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
                    <td className="px-2 py-1.5 text-muted-foreground">{getTriggerDisplayLabel(sj.triggerType, requirement.requirementType)}</td>
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
      setTaskActionMessage(`任务组 ${taskGroupView.displayLabel} 暂无可执行任务，请先确认当前范围已生成对应预览行。`);
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
        const summary = taskGroupSummaryMap.get(taskGroup.id);
        const snapshotPage = snapshotPageMap.get(taskGroup.id);
        return {
          id: taskGroup.id,
          businessDate: taskGroup.businessDate,
          businessDateLabel: taskGroup.partitionLabel ?? taskGroup.businessDateLabel ?? "全量快照",
          displayLabel: snapshotPage?.pageLabel ?? taskGroup.partitionLabel ?? taskGroup.businessDateLabel ?? taskGroup.id,
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

  const totalTasksPerGroup = taskPlan.dimensionCombinationCount * taskPlan.indicatorGroupCount;
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

      return [{
        id: `tg_planned_${businessDate}`,
        businessDate,
        businessDateLabel: formatBusinessDateLabel(businessDate, wideTable.businessDateRange.frequency),
        displayLabel: formatBusinessDateLabel(businessDate, wideTable.businessDateRange.frequency),
        totalTasks: totalTasksPerGroup,
        pendingTasks: totalTasksPerGroup,
        runningTasks: 0,
        completedTasks: 0,
        failedTasks: 0,
        invalidatedTasks: 0,
        progressPercent: 0,
        triggeredBy: resolvePlannedTriggerType(requirement.requirementType, businessDate, today),
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
          businessDateLabel: formatBusinessDateLabel(businessDate, wideTable.businessDateRange.frequency),
          planVersion: wideTable.currentPlanVersion ?? 1,
          groupKind: "baseline",
          coverageStatus: "current",
          status: "pending",
          totalTasks: totalTasksPerGroup,
          completedTasks: 0,
          failedTasks: 0,
          triggeredBy: resolvePlannedTriggerType(requirement.requirementType, businessDate, today),
          createdAt: "",
          updatedAt: "",
        },
      }];
    });
}

function compareTaskGroupsForDisplay(left: TaskGroup, right: TaskGroup): number {
  return right.updatedAt.localeCompare(left.updatedAt);
}

function resolvePlannedTriggerType(
  requirementType: Requirement["requirementType"],
  businessDate: string,
  today: string,
): TaskGroup["triggeredBy"] {
  if (requirementType === "demo") {
    return "manual";
  }

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

function getTriggerDisplayLabel(triggerType: string, requirementType: Requirement["requirementType"]): string {
  if (requirementType === "demo") {
    return "手动执行";
  }

  return triggerLabel[triggerType] ?? triggerType;
}

function isScheduledFutureTaskGroupView(
  taskGroup: Pick<HistoricalTaskGroupView, "triggeredBy" | "businessDate" | "displayStatus">,
  requirementType: Requirement["requirementType"],
): boolean {
  return requirementType === "production"
    && taskGroup.triggeredBy === "schedule"
    && taskGroup.displayStatus === "pending"
    && taskGroup.businessDate > formatBusinessDate(new Date());
}

function getTaskGroupStatusLabel(
  taskGroup: Pick<HistoricalTaskGroupView, "triggeredBy" | "businessDate" | "displayStatus">,
  requirementType: Requirement["requirementType"],
): string {
  if (isScheduledFutureTaskGroupView(taskGroup, requirementType)) {
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
    : buildLocalFetchTasks(taskGroupView.id, wideTable, taskGroupView.planVersion ?? wideTable.currentPlanVersion ?? 1, scopedRecords, timestamp);

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
): FetchTask[] {
  const indicatorGroups = resolveRunnableIndicatorGroups(wideTable);

  return scopedRecords.flatMap((record) => {
    const rowId = getWideTableRecordRowId(record);
    return indicatorGroups.map((indicatorGroup) => ({
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
