"use client";

import { useEffect, useState } from "react";
import { cancelTask, executeTask, retryTask } from "@/lib/api-client";
import type { FetchTask, TaskGroup } from "@/lib/types";
import { isLocalTaskId } from "@/lib/requirement-task-group-actions";
import type { TaskInstanceRowView } from "@/components/requirement-tasks/types";
import { MAX_BATCH_EXECUTION_CONCURRENCY } from "@/components/requirement-tasks/utils/requirementTaskConstants";
import {
  buildExecutionRecordId,
} from "@/components/requirement-tasks/utils/requirementTaskLocalExecution";
import { formatTaskActionError } from "@/components/requirement-tasks/utils/requirementTaskFormatters";

type BatchExecutionTaskState = {
  phase: "queued" | "running";
  scopeKey: string;
  rowLabel: string;
  collectionTaskId?: string;
};

type DispatchSingleTaskResult =
  | { ok: true; collectionTaskId?: string; status?: string }
  | { ok: false; error: string };

type Props = {
  fetchTasks: FetchTask[];
  taskGroups: TaskGroup[];
  onFetchTasksChange: (nextFetchTasks: FetchTask[]) => void;
  onTaskGroupsChange: (nextTaskGroups: TaskGroup[]) => void;
  refreshAfterExecution: () => Promise<void>;
  setTaskActionMessage: (message: string) => void;
  applyLocalTaskExecution: (taskId: string, rowLabel: string) => void;
};

export default function useTaskExecutionQueue({
  fetchTasks,
  taskGroups,
  onFetchTasksChange,
  onTaskGroupsChange,
  refreshAfterExecution,
  setTaskActionMessage,
  applyLocalTaskExecution,
}: Props) {
  const [runningTaskIds, setRunningTaskIds] = useState<string[]>([]);
  const [batchExecutionStateByTaskId, setBatchExecutionStateByTaskId] = useState<Record<string, BatchExecutionTaskState>>({});
  const [batchExecutionTaskOrderByScope, setBatchExecutionTaskOrderByScope] = useState<Record<string, string[]>>({});
  const [cancellingTaskIds, setCancellingTaskIds] = useState<string[]>([]);
  const [bulkExecutingScopeKeys, setBulkExecutingScopeKeys] = useState<string[]>([]);
  const [selectedTaskIdsByScope, setSelectedTaskIdsByScope] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (Object.keys(batchExecutionStateByTaskId).length === 0) {
      if (Object.keys(batchExecutionTaskOrderByScope).length > 0) {
        setBatchExecutionTaskOrderByScope({});
      }
      if (bulkExecutingScopeKeys.length > 0) {
        setBulkExecutingScopeKeys([]);
      }
      return;
    }

    const activeTaskIds = new Set(Object.keys(batchExecutionStateByTaskId));
    const nextTaskOrderByScope: Record<string, string[]> = {};
    let orderChanged = false;
    for (const [scopeKey, taskIds] of Object.entries(batchExecutionTaskOrderByScope)) {
      const retainedTaskIds = taskIds.filter((taskId) => activeTaskIds.has(taskId));
      if (retainedTaskIds.length > 0) {
        nextTaskOrderByScope[scopeKey] = retainedTaskIds;
      }
      if (retainedTaskIds.length !== taskIds.length) {
        orderChanged = true;
      }
    }
    if (
      orderChanged
      || Object.keys(nextTaskOrderByScope).length !== Object.keys(batchExecutionTaskOrderByScope).length
    ) {
      setBatchExecutionTaskOrderByScope(nextTaskOrderByScope);
    }

    const nextScopeKeys = Object.keys(nextTaskOrderByScope);
    const scopeKeysChanged = nextScopeKeys.length !== bulkExecutingScopeKeys.length
      || nextScopeKeys.some((scopeKey) => !bulkExecutingScopeKeys.includes(scopeKey));
    if (scopeKeysChanged) {
      setBulkExecutingScopeKeys(nextScopeKeys);
    }
  }, [batchExecutionStateByTaskId, batchExecutionTaskOrderByScope, bulkExecutingScopeKeys]);

  useEffect(() => {
    if (Object.keys(batchExecutionStateByTaskId).length === 0 || fetchTasks.length === 0) {
      return;
    }

    const fetchTaskById = new Map(fetchTasks.map((task) => [task.id, task] as const));
    const nextBatchExecutionStateByTaskId: Record<string, BatchExecutionTaskState> = {};
    const releasedTaskIds: string[] = [];
    let changed = false;

    for (const [taskId, state] of Object.entries(batchExecutionStateByTaskId)) {
      if (state.phase !== "running") {
        nextBatchExecutionStateByTaskId[taskId] = state;
        continue;
      }

      const actualTask = fetchTaskById.get(taskId);
      const stillOccupiesSlot = Boolean(
        actualTask
        && (actualTask.status === "running" || actualTask.status === "pending"),
      );

      if (!stillOccupiesSlot) {
        releasedTaskIds.push(taskId);
        changed = true;
        continue;
      }

      if (!state.collectionTaskId && actualTask?.collectionTaskId) {
        nextBatchExecutionStateByTaskId[taskId] = {
          ...state,
          collectionTaskId: actualTask.collectionTaskId,
        };
        changed = true;
        continue;
      }

      nextBatchExecutionStateByTaskId[taskId] = state;
    }

    if (changed) {
      setBatchExecutionStateByTaskId(nextBatchExecutionStateByTaskId);
    }
    if (releasedTaskIds.length > 0) {
      setRunningTaskIds((prev) => prev.filter((taskId) => !releasedTaskIds.includes(taskId)));
    }
  }, [batchExecutionStateByTaskId, fetchTasks]);

  useEffect(() => {
    const runningCount = Object.values(batchExecutionStateByTaskId)
      .filter((state) => state.phase === "running").length;
    const availableSlots = Math.max(0, MAX_BATCH_EXECUTION_CONCURRENCY - runningCount);
    if (availableSlots === 0) {
      return;
    }

    const dispatchCandidates = Object.entries(batchExecutionTaskOrderByScope)
      .flatMap(([, orderedTaskIds]) => orderedTaskIds
        .map((taskId) => [taskId, batchExecutionStateByTaskId[taskId]] as const)
        .filter((entry): entry is [string, BatchExecutionTaskState] => Boolean(entry[1]))
        .filter(([, state]) => state.phase === "queued")
        .map(([taskId, state]) => ({
          taskId,
          rowLabel: state.rowLabel,
        })))
      .slice(0, availableSlots);

    if (dispatchCandidates.length === 0) {
      return;
    }

    setBatchExecutionStateByTaskId((prev) => {
      const next = { ...prev };
      for (const { taskId } of dispatchCandidates) {
        const current = next[taskId];
        if (!current) {
          continue;
        }
        next[taskId] = {
          ...current,
          phase: "running",
          collectionTaskId: undefined,
        };
      }
      return next;
    });

    for (const { taskId, rowLabel } of dispatchCandidates) {
      void (async () => {
        const result = await dispatchSingleTaskExecution(taskId, rowLabel, {
          refreshAfterExecution: false,
          silent: true,
          optimistic: false,
          preserveRunningState: true,
        });

        if (result.ok) {
          setBatchExecutionStateByTaskId((prev) => {
            const current = prev[taskId];
            if (!current) {
              return prev;
            }
            return {
              ...prev,
              [taskId]: {
                ...current,
                phase: "running",
                collectionTaskId: result.collectionTaskId,
              },
            };
          });
          return;
        }

        setBatchExecutionStateByTaskId((prev) => {
          if (!prev[taskId]) {
            return prev;
          }
          const next = { ...prev };
          delete next[taskId];
          return next;
        });
        setRunningTaskIds((prev) => prev.filter((id) => id !== taskId));
        setTaskActionMessage(`批量执行中有实例发起失败：${rowLabel}，错误：${result.error}`);
      })();
    }
  }, [batchExecutionStateByTaskId, batchExecutionTaskOrderByScope]);

  const getTaskInstanceBatchExecutionState = (taskId: string): BatchExecutionTaskState | undefined =>
    batchExecutionStateByTaskId[taskId];

  const getTaskInstanceDisplayStatus = (row: Pick<TaskInstanceRowView, "fetchTaskId" | "status">): string => {
    const batchExecutionState = getTaskInstanceBatchExecutionState(row.fetchTaskId);
    if (batchExecutionState?.phase === "queued") {
      return "queued";
    }
    if (batchExecutionState?.phase === "running" || runningTaskIds.includes(row.fetchTaskId)) {
      return "running";
    }
    return row.status;
  };

  const getTaskInstanceDisplayCollectionTaskId = (
    row: Pick<TaskInstanceRowView, "fetchTaskId" | "collectionTaskId">,
  ): string | undefined => {
    const batchExecutionState = getTaskInstanceBatchExecutionState(row.fetchTaskId);
    if (batchExecutionState?.phase === "queued") {
      return undefined;
    }
    if (batchExecutionState?.phase === "running") {
      return batchExecutionState.collectionTaskId;
    }
    return row.collectionTaskId;
  };

  const canSelectTaskInstance = (row: Pick<TaskInstanceRowView, "fetchTaskId" | "status">): boolean => {
    const displayStatus = getTaskInstanceDisplayStatus(row);
    return displayStatus !== "running" && displayStatus !== "queued";
  };

  const getScopedSelectedTaskIds = (scopeKey: string, rows: TaskInstanceRowView[]): string[] => {
    const rowIdSet = new Set(rows.map((row) => row.fetchTaskId));
    return (selectedTaskIdsByScope[scopeKey] ?? []).filter((taskId) => rowIdSet.has(taskId));
  };

  const handleToggleTaskSelection = (scopeKey: string, taskId: string) => {
    setSelectedTaskIdsByScope((prev) => {
      const current = prev[scopeKey] ?? [];
      const next = current.includes(taskId)
        ? current.filter((id) => id !== taskId)
        : [...current, taskId];
      return { ...prev, [scopeKey]: next };
    });
  };

  const handleToggleAllTaskSelection = (scopeKey: string, rows: TaskInstanceRowView[]) => {
    const selectableTaskIds = rows.filter(canSelectTaskInstance).map((row) => row.fetchTaskId);
    setSelectedTaskIdsByScope((prev) => {
      const current = (prev[scopeKey] ?? []).filter((taskId) => selectableTaskIds.includes(taskId));
      const next = current.length === selectableTaskIds.length ? [] : selectableTaskIds;
      return { ...prev, [scopeKey]: next };
    });
  };

  const clearScopedTaskSelection = (scopeKey: string) => {
    setSelectedTaskIdsByScope((prev) => ({ ...prev, [scopeKey]: [] }));
  };

  const dispatchSingleTaskExecution = async (
    taskId: string,
    rowLabel: string,
    options?: {
      refreshAfterExecution?: boolean;
      silent?: boolean;
      optimistic?: boolean;
      preserveRunningState?: boolean;
    },
  ): Promise<DispatchSingleTaskResult> => {
    const {
      refreshAfterExecution: shouldRefresh = true,
      silent = false,
      optimistic = true,
      preserveRunningState = false,
    } = options ?? {};
    const now = new Date().toISOString();
    const targetTask = fetchTasks.find((task) => task.id === taskId);
    if (!targetTask) {
      return { ok: false, error: "Task not found" };
    }
    let keepRunningState = false;

    if (isLocalTaskId(taskId)) {
      applyLocalTaskExecution(taskId, rowLabel);
      return { ok: true };
    }

    let optimisticFetchTasks: FetchTask[] | null = null;
    if (optimistic) {
      const nextAttempt = targetTask.executionRecords.length + 1;
      optimisticFetchTasks = fetchTasks.map((task) => (
        task.id === taskId
          ? {
              ...task,
              status: "running" as const,
              updatedAt: now,
              executionRecords: [
                ...task.executionRecords,
                {
                  id: buildExecutionRecordId(task.id, nextAttempt, "retry"),
                  fetchTaskId: task.id,
                  attempt: nextAttempt,
                  status: "running" as const,
                  triggeredBy: "manual_retry" as const,
                  startedAt: now,
                },
              ],
            }
          : task
      ));
      onFetchTasksChange(optimisticFetchTasks);
      const optimisticTaskGroups: TaskGroup[] = taskGroups.map((taskGroup) => (
        taskGroup.id === targetTask.taskGroupId
          ? {
              ...taskGroup,
              status: "running" as const,
              pendingTasks: Math.max(taskGroup.pendingTasks - 1, 0),
              runningTasks: taskGroup.runningTasks + 1,
              completedTasks: targetTask.status === "completed"
                ? Math.max(taskGroup.completedTasks - 1, 0)
                : taskGroup.completedTasks,
              failedTasks: targetTask.status === "failed"
                ? Math.max(taskGroup.failedTasks - 1, 0)
                : taskGroup.failedTasks,
              updatedAt: now,
            }
          : taskGroup
      ));
      onTaskGroupsChange(optimisticTaskGroups);
    }

    setRunningTaskIds((prev) => (prev.includes(taskId) ? prev : [...prev, taskId]));
    if (!silent) {
      setTaskActionMessage(`已发起任务 ${taskId}（${rowLabel}）的单任务执行，正在同步最新结果。`);
    }
    try {
      const dispatchResult = targetTask.status === "failed"
        ? await retryTask(taskId)
        : await executeTask(taskId);
      if (dispatchResult.collectionTaskId || dispatchResult.status) {
        const sourceFetchTasks = optimisticFetchTasks ?? fetchTasks;
        onFetchTasksChange(
          sourceFetchTasks.map((task) => (
            task.id === taskId
              ? {
                  ...task,
                  collectionTaskId: dispatchResult.collectionTaskId ?? task.collectionTaskId,
                  status: dispatchResult.status ?? task.status,
                  updatedAt: new Date().toISOString(),
                }
              : task
          )),
        );
      }
      if (shouldRefresh) {
        await refreshAfterExecution();
      } else if (preserveRunningState) {
        keepRunningState = true;
      }
      return {
        ok: true,
        collectionTaskId: dispatchResult.collectionTaskId,
        status: dispatchResult.status,
      };
    } catch (error) {
      const errorMessage = formatTaskActionError(error);
      if (!silent) {
        setTaskActionMessage(`执行失败：${errorMessage}`);
      }
      return { ok: false, error: errorMessage };
    } finally {
      if (!keepRunningState) {
        setRunningTaskIds((prev) => prev.filter((id) => id !== taskId));
      }
    }
  };

  const handleBatchExecuteTasks = async (scopeKey: string, rows: TaskInstanceRowView[]) => {
    const selectedTaskIds = getScopedSelectedTaskIds(scopeKey, rows)
      .filter((taskId) => {
        const row = rows.find((item) => item.fetchTaskId === taskId);
        return row ? canSelectTaskInstance(row) : false;
      });

    if (selectedTaskIds.length === 0) {
      setTaskActionMessage("请先选择至少一个可执行的采集实例。");
      return;
    }

    const rowMap = new Map(rows.map((row) => [row.fetchTaskId, row] as const));
    setBulkExecutingScopeKeys((prev) => (prev.includes(scopeKey) ? prev : [...prev, scopeKey]));
    setBatchExecutionStateByTaskId((prev) => ({
      ...prev,
      ...Object.fromEntries(selectedTaskIds.map((taskId) => [taskId, {
        phase: "queued" as const,
        scopeKey,
        rowLabel: rowMap.get(taskId)?.rowLabel ?? taskId,
      }])),
    }));
    setBatchExecutionTaskOrderByScope((prev) => ({
      ...prev,
      [scopeKey]: [
        ...(prev[scopeKey] ?? []),
        ...selectedTaskIds.filter((taskId) => !(prev[scopeKey] ?? []).includes(taskId)),
      ],
    }));
    clearScopedTaskSelection(scopeKey);
    setTaskActionMessage(`已加入 ${selectedTaskIds.length} 个采集实例队列，最多同时执行 ${MAX_BATCH_EXECUTION_CONCURRENCY} 个，其余实例保持排队中。`);
  };

  const handleRequestTaskRerun = async (taskId: string, rowLabel: string) => {
    await dispatchSingleTaskExecution(taskId, rowLabel);
  };

  const removeQueuedTaskFromBatchQueue = (taskId: string): boolean => {
    const queuedState = batchExecutionStateByTaskId[taskId];
    if (!queuedState || queuedState.phase !== "queued") {
      return false;
    }

    const scopeKey = queuedState.scopeKey;
    setBatchExecutionStateByTaskId((prev) => {
      const current = prev[taskId];
      if (!current || current.phase !== "queued") {
        return prev;
      }
      const next = { ...prev };
      delete next[taskId];
      return next;
    });
    setBatchExecutionTaskOrderByScope((prev) => {
      const scopedTaskIds = prev[scopeKey] ?? [];
      if (!scopedTaskIds.includes(taskId)) {
        return prev;
      }
      const nextScopedTaskIds = scopedTaskIds.filter((id) => id !== taskId);
      const next = { ...prev };
      if (nextScopedTaskIds.length > 0) {
        next[scopeKey] = nextScopedTaskIds;
      } else {
        delete next[scopeKey];
      }
      return next;
    });
    return true;
  };

  const handleCancelTask = async (taskId: string, rowLabel: string, collectionTaskIdOverride?: string) => {
    const targetTask = fetchTasks.find((task) => task.id === taskId);
    const displayStatus = targetTask
      ? getTaskInstanceDisplayStatus({ fetchTaskId: taskId, status: targetTask.status })
      : batchExecutionStateByTaskId[taskId]?.phase === "queued"
        ? "queued"
        : undefined;
    const effectiveCollectionTaskId = collectionTaskIdOverride ?? targetTask?.collectionTaskId;
    if (displayStatus === "queued") {
      if (removeQueuedTaskFromBatchQueue(taskId)) {
        setTaskActionMessage(`已将采集任务 ${taskId}（${rowLabel}）从排队队列中移除。`);
      }
      return;
    }
    if (
      !targetTask
      || displayStatus !== "running"
      || !effectiveCollectionTaskId
    ) {
      return;
    }

    setCancellingTaskIds((prev) => (prev.includes(taskId) ? prev : [...prev, taskId]));
    setTaskActionMessage(`正在取消采集任务 ${taskId}（${rowLabel}）...`);
    try {
      await cancelTask(effectiveCollectionTaskId);
      onFetchTasksChange(fetchTasks.map((task) => (
        task.id === taskId
          ? {
              ...task,
              status: "cancelled" as const,
              collectionTaskId: effectiveCollectionTaskId,
              updatedAt: new Date().toISOString(),
            }
          : task
      )));
      setBatchExecutionStateByTaskId((prev) => {
        if (!prev[taskId]) {
          return prev;
        }
        const next = { ...prev };
        delete next[taskId];
        return next;
      });
      setBatchExecutionTaskOrderByScope((prev) => {
        let changed = false;
        const next: Record<string, string[]> = {};
        for (const [scopeKey, taskIds] of Object.entries(prev)) {
          const retainedTaskIds = taskIds.filter((id) => id !== taskId);
          if (retainedTaskIds.length !== taskIds.length) {
            changed = true;
          }
          if (retainedTaskIds.length > 0) {
            next[scopeKey] = retainedTaskIds;
          }
        }
        return changed ? next : prev;
      });
      setRunningTaskIds((prev) => prev.filter((id) => id !== taskId));
      await refreshAfterExecution();
      setTaskActionMessage(`已取消采集任务 ${taskId}（${rowLabel}）。`);
    } catch (error) {
      setTaskActionMessage(`取消失败：${formatTaskActionError(error)}`);
    } finally {
      setCancellingTaskIds((prev) => prev.filter((id) => id !== taskId));
    }
  };

  return {
    runningTaskIds,
    cancellingTaskIds,
    getTaskInstanceDisplayStatus,
    getTaskInstanceDisplayCollectionTaskId,
    canSelectTaskInstance,
    getScopedSelectedTaskIds,
    handleToggleTaskSelection,
    handleToggleAllTaskSelection,
    clearScopedTaskSelection,
    isScopeBulkExecuting: (scopeKey: string) => bulkExecutingScopeKeys.includes(scopeKey),
    handleBatchExecuteTasks,
    handleRequestTaskRerun,
    handleCancelTask,
  };
}
