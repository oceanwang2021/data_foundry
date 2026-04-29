"use client";

import { useEffect, useMemo, useState } from "react";
import type { Project, Requirement, WideTable, TaskGroup, FetchTask } from "@/lib/types";
import {
  ensureTaskGroupTasks,
  fetchProjects,
  fetchRequirementWideTables,
  fetchTaskGroups,
  fetchFetchTasks,
} from "@/lib/api-client";
import Link from "next/link";
import { Boxes, ChevronDown, ChevronRight, Loader2, Workflow } from "lucide-react";
import { cn } from "@/lib/utils";

const statusStyle: Record<string, string> = {
  pending: "bg-gray-100 text-gray-700",
  running: "bg-amber-100 text-amber-700",
  completed: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  paused: "bg-gray-100 text-gray-500",
};

const statusLabel: Record<string, string> = {
  pending: "待执行",
  running: "执行中",
  completed: "已完成",
  failed: "失败",
  paused: "已暂停",
};

const triggerLabel: Record<string, string> = {
  schedule: "定时调度",
  backfill: "补采",
  manual: "手动触发",
};

const COLLECTION_TASK_DEFAULT_KEY = "__default__";
const COLLECTION_TASK_DEFAULT_LABEL = "统一提示词";

function resolveCollectionTaskKey(taskGroup: TaskGroup): string {
  return taskGroup.partitionKey ?? COLLECTION_TASK_DEFAULT_KEY;
}

function resolveCollectionTaskLabel(taskGroup: TaskGroup): string {
  return taskGroup.partitionLabel ?? taskGroup.partitionKey ?? COLLECTION_TASK_DEFAULT_LABEL;
}

function resolveAggregateStatus(statuses: Array<TaskGroup["status"]>): keyof typeof statusStyle {
  if (statuses.some((s) => s === "running")) return "running";
  if (statuses.some((s) => s === "partial")) return "failed";
  if (statuses.some((s) => s === "invalidated")) return "paused";
  if (statuses.length > 0 && statuses.every((s) => s === "completed")) return "completed";
  return "pending";
}

export default function CollectionTasksPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [wideTables, setWideTables] = useState<WideTable[]>([]);
  const [taskGroups, setTaskGroups] = useState<TaskGroup[]>([]);
  const [allFetchTasks, setAllFetchTasks] = useState<FetchTask[]>([]);
  const [expandedRequirementId, setExpandedRequirementId] = useState<string | null>(null);
  const [expandedCollectionTaskKey, setExpandedCollectionTaskKey] = useState<string | null>(null);
  const [expandedTaskGroupId, setExpandedTaskGroupId] = useState<string | null>(null);
  const [loadingTaskGroupId, setLoadingTaskGroupId] = useState<string | null>(null);

  useEffect(() => {
    fetchProjects()
      .then(async (ps) => {
        setProjects(ps);
        const results = await Promise.all(
          ps.map((p) => fetchRequirementWideTables(p.id).catch(() => ({ requirements: [] as Requirement[], wideTables: [] as WideTable[] }))),
        );
        const reqs = results.flatMap((r) => r.requirements);
        const wts = results.flatMap((r) => r.wideTables);
        setRequirements(reqs);
        setWideTables(wts);

        const tgArrays = await Promise.all(
          ps.flatMap((p) => reqs.filter((r) => r.projectId === p.id).map((r) => fetchTaskGroups(p.id, r.id).catch(() => [] as TaskGroup[]))),
        );
        setTaskGroups(tgArrays.flat());

        const ftArrays = await Promise.all(
          ps.flatMap((p) => reqs.filter((r) => r.projectId === p.id).map((r) => fetchFetchTasks(p.id, r.id).catch(() => [] as FetchTask[]))),
        );
        setAllFetchTasks(ftArrays.flat());
      })
      .catch(() => {});
  }, []);

  const projectMap = useMemo(
    () => new Map(projects.map((p) => [p.id, p] as const)),
    [projects],
  );

  const wideTableById = useMemo(
    () => new Map(wideTables.map((wt) => [wt.id, wt] as const)),
    [wideTables],
  );

  const taskGroupsByRequirementId = useMemo(() => {
    const map = new Map<string, TaskGroup[]>();
    for (const tg of taskGroups) {
      const wt = wideTableById.get(tg.wideTableId);
      const requirementId = wt?.requirementId;
      if (!requirementId) continue;
      const bucket = map.get(requirementId) ?? [];
      bucket.push(tg);
      map.set(requirementId, bucket);
    }
    Array.from(map.entries()).forEach(([reqId, list]) => {
      map.set(reqId, [...list].sort((a, b) => (b.businessDate ?? "").localeCompare(a.businessDate ?? "")));
    });
    return map;
  }, [taskGroups, wideTableById]);

  const fetchTasksByTaskGroupId = useMemo(() => {
    const map = new Map<string, FetchTask[]>();
    for (const ft of allFetchTasks) {
      const bucket = map.get(ft.taskGroupId) ?? [];
      bucket.push(ft);
      map.set(ft.taskGroupId, bucket);
    }
    return map;
  }, [allFetchTasks]);

  const requirementsSorted = useMemo(
    () => [...requirements].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "")),
    [requirements],
  );

  const refreshFetchTasksForRequirement = async (requirement: Requirement) => {
    const latest = await fetchFetchTasks(requirement.projectId, requirement.id).catch(() => [] as FetchTask[]);
    setAllFetchTasks((prev) => {
      const keep = prev.filter((ft) => ft.wideTableId && ft.taskGroupId && !latest.some((next) => next.id === ft.id));
      return [...keep, ...latest];
    });
  };

  type CollectionTaskBucket = {
    requirementId: string;
    key: string;
    label: string;
    taskGroups: TaskGroup[];
    status: keyof typeof statusStyle;
  };

  const buildCollectionTaskBuckets = (requirementId: string): CollectionTaskBucket[] => {
    const tgs = taskGroupsByRequirementId.get(requirementId) ?? [];
    const map = new Map<string, { requirementId: string; key: string; label: string; taskGroups: TaskGroup[] }>();

    for (const tg of tgs) {
      const key = resolveCollectionTaskKey(tg);
      const label = resolveCollectionTaskLabel(tg);
      const bucket = map.get(key) ?? { requirementId, key, label, taskGroups: [] as TaskGroup[] };
      bucket.taskGroups.push(tg);
      map.set(key, bucket);
    }

    const buckets: CollectionTaskBucket[] = [];
    Array.from(map.values()).forEach((b) => {
      buckets.push({
        ...b,
        taskGroups: [...b.taskGroups].sort((a, b2) => (b2.businessDate ?? "").localeCompare(a.businessDate ?? "")),
        status: resolveAggregateStatus(b.taskGroups.map((tg: TaskGroup) => tg.status)),
      });
    });

    buckets.sort((a, b) => a.label.localeCompare(b.label));
    return buckets;
  };

  const toggleRequirement = (requirementId: string) => {
    setExpandedRequirementId((prev) => (prev === requirementId ? null : requirementId));
    setExpandedCollectionTaskKey(null);
    setExpandedTaskGroupId(null);
  };

  const toggleCollectionTask = (requirementId: string, key: string) => {
    const composite = `${requirementId}:${key}`;
    setExpandedCollectionTaskKey((prev) => (prev === composite ? null : composite));
    setExpandedTaskGroupId(null);
  };

  const toggleTaskGroup = async (requirement: Requirement, taskGroup: TaskGroup) => {
    if (expandedTaskGroupId === taskGroup.id) {
      setExpandedTaskGroupId(null);
      return;
    }

    setLoadingTaskGroupId(taskGroup.id);
    try {
      await ensureTaskGroupTasks(taskGroup.id);
      await refreshFetchTasksForRequirement(requirement);
      setExpandedTaskGroupId(taskGroup.id);
    } finally {
      setLoadingTaskGroupId(null);
    }
  };

  return (
    <div className="p-8 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Workflow className="h-5 w-5 text-primary" />
          采集任务管理
        </h1>
        <p className="text-sm text-muted-foreground">
          展示需求及其下关联的采集任务列表，并支持按层级展开查看任务实例。
        </p>
      </header>

      <section className="rounded-xl border bg-card p-6">
        <div>
          <div className="grid grid-cols-12 gap-4 px-4 py-2 text-xs font-medium text-muted-foreground bg-muted/30">
            <div className="col-span-5">需求</div>
            <div className="col-span-3">项目</div>
            <div className="col-span-2">宽表</div>
            <div className="col-span-2 text-right">采集任务</div>
          </div>

          <div className="divide-y">
            {requirementsSorted.map((req) => {
              const project = projectMap.get(req.projectId);
              const wts = wideTables.filter((wt) => wt.requirementId === req.id);
              const buckets = buildCollectionTaskBuckets(req.id);
              const isExpanded = expandedRequirementId === req.id;

              return (
                <div key={req.id} className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => toggleRequirement(req.id)}
                    className="w-full grid grid-cols-12 gap-4 items-center text-left"
                  >
                    <div className="col-span-5 flex items-center gap-2 min-w-0">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <div className="min-w-0">
                        <div className="font-medium truncate">{req.title ?? req.id}</div>
                        <div className="text-xs text-muted-foreground truncate">{req.id}</div>
                      </div>
                    </div>
                    <div className="col-span-3 text-sm truncate">{project?.name ?? req.projectId}</div>
                    <div className="col-span-2 text-sm truncate">{wts[0]?.name ?? "-"}</div>
                    <div className="col-span-2 text-sm text-right">
                      <span className="text-xs px-2 py-1 rounded border bg-background">{buckets.length}</span>
                    </div>
                  </button>

                  {isExpanded ? (
                    <div className="mt-3 pl-6 space-y-3">
                      {buckets.length === 0 ? (
                        <div className="text-sm text-muted-foreground">该需求下暂无采集任务。</div>
                      ) : (
                        buckets.map((bucket) => {
                          const compositeKey = `${req.id}:${bucket.key}`;
                          const bucketExpanded = expandedCollectionTaskKey === compositeKey;

                          return (
                            <div key={compositeKey} className="rounded-lg border bg-background">
                              <button
                                type="button"
                                onClick={() => toggleCollectionTask(req.id, bucket.key)}
                                className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  {bucketExpanded ? (
                                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                                  )}
                                  <div className="min-w-0">
                                    <div className="font-medium truncate">采集任务：{bucket.label}</div>
                                    <div className="text-xs text-muted-foreground truncate">
                                      任务实例 {bucket.taskGroups.length}
                                    </div>
                                  </div>
                                </div>
                                <span className={cn("text-xs px-2 py-1 rounded", statusStyle[bucket.status])}>
                                  {statusLabel[bucket.status] ?? bucket.status}
                                </span>
                              </button>

                              {bucketExpanded ? (
                                <div className="px-4 pb-4 space-y-2">
                                  {bucket.taskGroups.map((tg) => {
                                    const wt = wideTableById.get(tg.wideTableId);
                                    const progressPercent =
                                      tg.totalTasks > 0 ? Math.round((tg.completedTasks / tg.totalTasks) * 100) : 0;
                                    const tgExpanded = expandedTaskGroupId === tg.id;
                                    const isLoading = loadingTaskGroupId === tg.id;
                                    const fetchTasks = fetchTasksByTaskGroupId.get(tg.id) ?? [];

                                    return (
                                      <div key={tg.id} className="rounded-md border bg-muted/10">
                                        <button
                                          type="button"
                                          onClick={() => toggleTaskGroup(req, tg)}
                                          className="w-full px-3 py-3 flex items-center justify-between gap-3 text-left"
                                        >
                                          <div className="flex items-center gap-2 min-w-0">
                                            {tgExpanded ? (
                                              <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                                            ) : (
                                              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                                            )}
                                            <div className="min-w-0">
                                              <div className="flex flex-wrap items-center gap-2">
                                                <div className="font-medium">{tg.businessDateLabel ?? tg.businessDate ?? tg.id}</div>
                                                <span className={cn("text-xs px-2 py-1 rounded", statusStyle[tg.status])}>
                                                  {statusLabel[tg.status] ?? tg.status}
                                                </span>
                                                <span className="text-xs px-2 py-1 rounded border bg-background">
                                                  {triggerLabel[tg.triggeredBy] ?? tg.triggeredBy}
                                                </span>
                                                {isLoading ? (
                                                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                                    <Loader2 className="h-3 w-3 animate-spin" />
                                                    生成中
                                                  </span>
                                                ) : null}
                                              </div>
                                              <div className="text-xs text-muted-foreground mt-1 truncate">
                                                总任务 {tg.totalTasks} | 完成 {tg.completedTasks} | 失败 {tg.failedTasks} | 进度 {progressPercent}%
                                              </div>
                                            </div>
                                          </div>

                                          <Link
                                            href={`/projects/${req.projectId}/requirements/${req.id}?nav=projects&tab=tasks${wt ? `&wt=${encodeURIComponent(wt.id)}` : ""}&tg=${encodeURIComponent(tg.id)}`}
                                            className="shrink-0 text-xs text-primary hover:underline"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            查看详情
                                          </Link>
                                        </button>

                                        {tgExpanded ? (
                                          <div className="px-3 pb-3">
                                            <div className="text-xs font-semibold mb-2 flex items-center gap-1">
                                              <Boxes className="h-3 w-3" />
                                              采集任务（FetchTask）
                                            </div>
                                            {fetchTasks.length === 0 ? (
                                              <div className="text-xs text-muted-foreground">暂无采集任务。</div>
                                            ) : (
                                              <div className="grid gap-2 md:grid-cols-2">
                                                {fetchTasks.slice(0, 6).map((ft) => (
                                                  <div key={ft.id} className="rounded border bg-background p-2">
                                                    <div className="text-xs font-medium truncate">
                                                      {ft.id} - 行 {ft.rowId} - {ft.indicatorGroupName}
                                                    </div>
                                                    <div className="text-[11px] text-muted-foreground mt-1">
                                                      状态：{statusLabel[ft.status] ?? ft.status}
                                                      {ft.confidence != null
                                                        ? ` | 置信度：${(ft.confidence * 100).toFixed(0)}%`
                                                        : ""}
                                                    </div>
                                                  </div>
                                                ))}
                                                {fetchTasks.length > 6 ? (
                                                  <div className="text-xs text-muted-foreground p-2">
                                                    ... 共 {fetchTasks.length} 个采集任务
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
                              ) : null}
                            </div>
                          );
                        })
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </section>

    </div>
  );
}
