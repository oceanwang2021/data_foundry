"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Boxes, ChevronDown, ChevronRight, Loader2, Workflow } from "lucide-react";
import CollectionTaskIndicatorsPopup from "@/components/CollectionTaskIndicatorsPopup";
import {
  buildCollectionTaskListRows,
  formatCollectionTaskDateTime,
  getCollectionTaskStatusLabel,
  type CollectionTaskListRowView,
} from "@/lib/collection-task-list-view";
import {
  ensureTaskGroupTasks,
  fetchCollectionTasksOverview,
} from "@/lib/api-client";
import type { FetchTask, Project, Requirement, TaskGroup, WideTable } from "@/lib/types";
import { cn } from "@/lib/utils";

const statusStyle: Record<string, string> = {
  pending: "bg-gray-100 text-gray-700",
  running: "bg-amber-100 text-amber-700",
  completed: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  invalidated: "bg-slate-100 text-slate-600",
};

const triggerLabel: Record<string, string> = {
  schedule: "定时调度",
  backfill: "补采",
  manual: "手动触发",
  trial: "试运行",
};

const executionModeBadgeStyle: Record<"formal" | "trial", string> = {
  formal: "border-slate-200 bg-slate-50 text-slate-700",
  trial: "border-sky-200 bg-sky-50 text-sky-700",
};

const executionModeLabel: Record<"formal" | "trial", string> = {
  formal: "正式",
  trial: "试运行",
};

type SelectedIndicatorTaskState = {
  collectionTaskLabel: string;
  requirementTitle: string;
  wideTableName: string;
  indicatorNames: string[];
};

type SectionOptions = {
  description?: string;
  emptyText?: string;
  collapsible?: boolean;
  expanded?: boolean;
  onToggleExpanded?: () => void;
};

export default function CollectionTasksPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [wideTables, setWideTables] = useState<WideTable[]>([]);
  const [taskGroups, setTaskGroups] = useState<TaskGroup[]>([]);
  const [allFetchTasks, setAllFetchTasks] = useState<FetchTask[]>([]);
  const [expandedCollectionTaskKey, setExpandedCollectionTaskKey] = useState<string | null>(null);
  const [expandedTaskGroupId, setExpandedTaskGroupId] = useState<string | null>(null);
  const [loadingTaskGroupId, setLoadingTaskGroupId] = useState<string | null>(null);
  const [selectedIndicatorTask, setSelectedIndicatorTask] =
    useState<SelectedIndicatorTaskState | null>(null);
  const [isTrialSectionExpanded, setIsTrialSectionExpanded] = useState(false);

  useEffect(() => {
    fetchCollectionTasksOverview()
      .then((data) => {
        setProjects(data.projects);
        setRequirements(data.requirements);
        setWideTables(data.wideTables);
        setTaskGroups(data.taskGroups);
        setAllFetchTasks(data.fetchTasks);
      })
      .catch(() => {});
  }, []);

  const wideTableById = useMemo(
    () => new Map(wideTables.map((wideTable) => [wideTable.id, wideTable] as const)),
    [wideTables],
  );

  const fetchTasksByTaskGroupId = useMemo(() => {
    const taskMap = new Map<string, FetchTask[]>();
    for (const fetchTask of allFetchTasks) {
      const scopedTasks = taskMap.get(fetchTask.taskGroupId) ?? [];
      scopedTasks.push(fetchTask);
      taskMap.set(fetchTask.taskGroupId, scopedTasks);
    }
    return taskMap;
  }, [allFetchTasks]);

  const collectionTaskRows = useMemo(
    () =>
      buildCollectionTaskListRows({
        projects,
        requirements,
        wideTables,
        taskGroups,
        fetchTasks: allFetchTasks,
      }),
    [projects, requirements, wideTables, taskGroups, allFetchTasks],
  );

  const formalCollectionTaskRows = useMemo(
    () => collectionTaskRows.filter((row) => row.executionMode === "formal"),
    [collectionTaskRows],
  );

  const trialCollectionTaskRows = useMemo(
    () => collectionTaskRows.filter((row) => row.executionMode === "trial"),
    [collectionTaskRows],
  );

  const toggleCollectionTask = (rowKey: string) => {
    setExpandedCollectionTaskKey((prev) => (prev === rowKey ? null : rowKey));
    setExpandedTaskGroupId(null);
  };

  const toggleTaskGroup = async (_row: CollectionTaskListRowView, taskGroup: TaskGroup) => {
    if (expandedTaskGroupId === taskGroup.id) {
      setExpandedTaskGroupId(null);
      return;
    }

    setLoadingTaskGroupId(taskGroup.id);
    try {
      const result = await ensureTaskGroupTasks(taskGroup.id);
      if (result.taskGroup) {
        setTaskGroups((prev) => prev.map((item) => (
          item.id === result.taskGroupId
            ? {
                ...item,
                ...result.taskGroup,
              }
            : item
        )));
      }
      if (result.fetchTasks.length > 0) {
        const ensuredTaskIds = new Set(result.fetchTasks.map((task) => task.id));
        setAllFetchTasks((prev) => [
          ...prev.filter((task) => !ensuredTaskIds.has(task.id)),
          ...result.fetchTasks,
        ]);
      }
      setExpandedTaskGroupId(taskGroup.id);
    } finally {
      setLoadingTaskGroupId(null);
    }
  };

  const renderCollectionTaskSection = (
    title: string,
    rows: CollectionTaskListRowView[],
    options?: SectionOptions,
  ) => {
    const {
      description = "",
      emptyText = "当前暂无可展示的采集任务。",
      collapsible = false,
      expanded = true,
      onToggleExpanded,
    } = options ?? {};

    return (
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-0.5">
            <div className="text-base font-semibold">{title}</div>
            {description ? <div className="text-xs text-muted-foreground">{description}</div> : null}
          </div>
          <div className="flex items-center gap-3">
            <div className="text-xs text-muted-foreground">{rows.length} 个采集任务</div>
            {collapsible ? (
              <button
                type="button"
                onClick={onToggleExpanded}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                {expanded ? "收起" : "展开"}
              </button>
            ) : null}
          </div>
        </div>

        {collapsible && !expanded ? null : (
          <div>
            <div className="grid grid-cols-[minmax(0,2.2fr)_minmax(0,1.9fr)_minmax(0,1.4fr)_minmax(0,2.6fr)_minmax(0,1.8fr)_minmax(0,1.2fr)_auto] gap-4 bg-muted/30 px-4 py-2.5 text-xs font-medium text-muted-foreground">
              <div>采集任务</div>
              <div>关联需求</div>
              <div>所属项目</div>
              <div>指标摘要</div>
              <div>运行状态</div>
              <div>最近更新</div>
              <div className="text-right">操作</div>
            </div>

            <div className="divide-y divide-slate-200/80">
              {rows.length === 0 ? (
                <div className="px-4 py-12 text-center text-sm text-muted-foreground">{emptyText}</div>
              ) : (
                rows.map((row) => {
                  const isExpanded = expandedCollectionTaskKey === row.key;

                  return (
                    <div key={row.key} className="px-4 py-3">
                      <div className="grid grid-cols-[minmax(0,2.2fr)_minmax(0,1.9fr)_minmax(0,1.4fr)_minmax(0,2.6fr)_minmax(0,1.8fr)_minmax(0,1.2fr)_auto] items-start gap-4">
                        <button
                          type="button"
                          onClick={() => toggleCollectionTask(row.key)}
                          className="flex min-w-0 items-start gap-2 text-left"
                        >
                          {isExpanded ? (
                            <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="truncate font-medium">{row.collectionTaskLabel}</div>
                              <span
                                className={cn(
                                  "inline-flex shrink-0 rounded border px-1.5 py-0.5 text-[10px]",
                                  executionModeBadgeStyle[row.executionMode],
                                )}
                              >
                                {executionModeLabel[row.executionMode]}
                              </span>
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {row.indicatorCount} 个指标 · {row.fetchTaskCount} 个实例 · {row.taskGroupCount} 个任务组
                            </div>
                          </div>
                        </button>

                        <div className="min-w-0">
                          <div className="truncate text-sm">{row.requirementTitle}</div>
                          <div className="mt-1 truncate text-xs text-muted-foreground">{row.requirementId}</div>
                        </div>

                        <div className="truncate text-sm">{row.projectName}</div>

                        <div className="min-w-0">
                          <div className="truncate text-sm">{row.indicatorSummary}</div>
                          {row.indicatorCount > 3 ? (
                            <button
                              type="button"
                              className="mt-1 text-xs text-primary hover:underline"
                              onClick={() =>
                                setSelectedIndicatorTask({
                                  collectionTaskLabel: row.collectionTaskLabel,
                                  requirementTitle: row.requirementTitle,
                                  wideTableName: row.wideTableName,
                                  indicatorNames: row.indicatorNames,
                                })
                              }
                            >
                              查看全部
                            </button>
                          ) : null}
                        </div>

                        <div className="min-w-0">
                          <span className={cn("inline-flex rounded px-2 py-1 text-xs", statusStyle[row.aggregateStatus])}>
                            {getCollectionTaskStatusLabel(row.aggregateStatus)}
                          </span>
                          <div className="mt-1 text-xs text-muted-foreground">{row.statusSummary}</div>
                        </div>

                        <div className="text-sm text-muted-foreground">
                          {formatCollectionTaskDateTime(row.lastUpdatedAt)}
                        </div>

                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => toggleCollectionTask(row.key)}
                            className="text-xs text-muted-foreground hover:text-foreground"
                          >
                            {isExpanded ? "收起实例" : "展开实例"}
                          </button>
                          <Link
                            href={`/projects/${row.projectId}/requirements/${row.requirementId}?nav=projects&tab=tasks&wt=${encodeURIComponent(row.wideTableId)}`}
                            className="text-xs text-primary hover:underline"
                          >
                            查看详情
                          </Link>
                        </div>
                      </div>

                      {isExpanded ? (
                        <div className="mt-4 border-t border-slate-200/70 bg-muted/10 pb-1 pl-7 pt-4">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold">任务实例</div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                按任务组查看当前采集任务下的业务日期批次与实例执行情况。
                              </div>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              共 {row.taskGroupCount} 个任务组 · {row.totalTasks} 个实例
                            </div>
                          </div>

                          <div className="space-y-2">
                            {row.taskGroups.map((taskGroup) => {
                              const wideTable = wideTableById.get(taskGroup.wideTableId);
                              const progressPercent =
                                taskGroup.totalTasks > 0
                                  ? Math.round((taskGroup.completedTasks / taskGroup.totalTasks) * 100)
                                  : 0;
                              const isTaskGroupExpanded = expandedTaskGroupId === taskGroup.id;
                              const isLoading = loadingTaskGroupId === taskGroup.id;
                              const scopedFetchTasks = fetchTasksByTaskGroupId.get(taskGroup.id) ?? [];
                              const taskGroupDisplayStatus =
                                taskGroup.status === "partial"
                                  ? "failed"
                                  : taskGroup.status === "cancelled"
                                    ? "invalidated"
                                    : taskGroup.status;

                              return (
                                <div key={taskGroup.id} className="border-b border-slate-200/70 last:border-b-0">
                                  <button
                                    type="button"
                                    onClick={() => void toggleTaskGroup(row, taskGroup)}
                                    className="flex w-full items-center justify-between gap-3 py-3 text-left"
                                  >
                                    <div className="flex min-w-0 items-center gap-2">
                                      {isTaskGroupExpanded ? (
                                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                                      ) : (
                                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                                      )}
                                      <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <div className="font-medium">
                                            {taskGroup.businessDateLabel ?? taskGroup.businessDate ?? taskGroup.id}
                                          </div>
                                          <span className={cn("rounded px-2 py-1 text-xs", statusStyle[taskGroupDisplayStatus])}>
                                            {getCollectionTaskStatusLabel(taskGroupDisplayStatus)}
                                          </span>
                                          <span className="rounded border bg-background px-2 py-1 text-xs text-muted-foreground">
                                            {triggerLabel[taskGroup.triggeredBy] ?? taskGroup.triggeredBy}
                                          </span>
                                          {isLoading ? (
                                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                              <Loader2 className="h-3 w-3 animate-spin" />
                                              加载中...
                                            </span>
                                          ) : null}
                                        </div>
                                        <div className="mt-1 truncate text-xs text-muted-foreground">
                                          总实例 {taskGroup.totalTasks} · 完成 {taskGroup.completedTasks} · 失败 {taskGroup.failedTasks} · 进度 {progressPercent}%
                                        </div>
                                      </div>
                                    </div>

                                    <Link
                                      href={`/projects/${row.projectId}/requirements/${row.requirementId}?nav=projects&tab=tasks${wideTable ? `&wt=${encodeURIComponent(wideTable.id)}` : ""}&tg=${encodeURIComponent(taskGroup.id)}`}
                                      className="shrink-0 text-xs text-primary hover:underline"
                                      onClick={(event) => event.stopPropagation()}
                                    >
                                      查看详情
                                    </Link>
                                  </button>

                                  {isTaskGroupExpanded ? (
                                    <div className="pb-3 pl-6">
                                      <div className="mb-2 flex items-center gap-1 text-xs font-semibold">
                                        <Boxes className="h-3 w-3" />
                                        采集实例
                                      </div>

                                      {scopedFetchTasks.length === 0 ? (
                                        <div className="text-xs text-muted-foreground">当前任务组暂无采集实例。</div>
                                      ) : (
                                        <div className="grid gap-2 md:grid-cols-2">
                                          {scopedFetchTasks.slice(0, 6).map((fetchTask) => (
                                            <div key={fetchTask.id} className="rounded-md bg-background/70 p-3">
                                              <div className="truncate text-xs font-medium">
                                                {fetchTask.id} · 行 {fetchTask.rowId} · {fetchTask.indicatorGroupName}
                                              </div>
                                              <div className="mt-1 text-[11px] text-muted-foreground">
                                                状态：{fetchTask.status}
                                                {fetchTask.confidence != null
                                                  ? ` · 置信度 ${(fetchTask.confidence * 100).toFixed(0)}%`
                                                  : ""}
                                              </div>
                                              <div className="mt-1 truncate text-[11px] text-muted-foreground">
                                                外部任务 ID：{fetchTask.collectionTaskId ?? "-"}
                                              </div>
                                            </div>
                                          ))}

                                          {scopedFetchTasks.length > 6 ? (
                                            <div className="rounded-md bg-background/50 p-3 text-xs text-muted-foreground">
                                              其余 {scopedFetchTasks.length - 6} 个实例请进入详情页查看。
                                            </div>
                                          ) : null}
                                        </div>
                                      )}
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 p-8">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Workflow className="h-5 w-5 text-primary" />
          采集任务管理
        </h1>
        <p className="text-sm text-muted-foreground">
          直接展示采集任务清单，并查看任务关联需求、所属项目、指标摘要与任务实例。
        </p>
      </header>

      <section className="space-y-5">
        <div className="rounded-xl border bg-card p-5">
          {renderCollectionTaskSection("正式采集任务", formalCollectionTaskRows, {
            description: "仅展示正式生成的采集任务、任务组和正式实例，不混入试运行数据。",
            emptyText: "当前暂无正式采集任务。",
          })}
        </div>

        {trialCollectionTaskRows.length > 0 ? (
          <div className="rounded-xl border bg-card p-5">
            {renderCollectionTaskSection("试运行任务", trialCollectionTaskRows, {
              description: "仅用于验证提示词或参数，不计入正式采集进度与正式实例统计。",
              emptyText: "当前暂无试运行任务。",
              collapsible: true,
              expanded: isTrialSectionExpanded,
              onToggleExpanded: () => setIsTrialSectionExpanded((current) => !current),
            })}
          </div>
        ) : null}
      </section>

      {selectedIndicatorTask ? (
        <CollectionTaskIndicatorsPopup
          collectionTaskLabel={selectedIndicatorTask.collectionTaskLabel}
          requirementTitle={selectedIndicatorTask.requirementTitle}
          wideTableName={selectedIndicatorTask.wideTableName}
          indicatorNames={selectedIndicatorTask.indicatorNames}
          onClose={() => setSelectedIndicatorTask(null)}
        />
      ) : null}
    </div>
  );
}
