"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, ShieldCheck, Wrench, XCircle, type LucideIcon } from "lucide-react";
import CollectionTaskIndicatorsPopup from "@/components/CollectionTaskIndicatorsPopup";
import {
  buildAcceptanceRequirementRows,
  buildDefaultAcceptanceFilters,
  filterAcceptanceRequirementRows,
  filterTrialConfirmationRows,
  flattenAcceptanceCollectionTasks,
  type AcceptanceCollectionTaskRow,
  type AcceptanceFilters,
  type AcceptanceReviewStatus,
} from "@/lib/acceptance-list";
import { fetchAcceptanceOverview, fetchCollectionTasksOverview } from "@/lib/api-client";
import type { AcceptanceTicket } from "@/lib/domain";
import type { FetchTask, Project, Requirement, TaskGroup, WideTable } from "@/lib/types";
import { cn } from "@/lib/utils";

const reviewStatusLabel: Record<AcceptanceReviewStatus, string> = {
  pending: "待验收",
  approved: "已通过",
  partial_approved: "部分通过",
  rejected: "已驳回",
};

const reviewStatusClass: Record<AcceptanceReviewStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-700",
  partial_approved: "bg-sky-100 text-sky-700",
  rejected: "bg-rose-100 text-rose-700",
};

type SelectedIndicatorTaskState = {
  collectionTaskLabel: string;
  requirementTitle: string;
  wideTableName: string;
  indicatorNames: string[];
};

function formatDate(value: string): string {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("zh-CN", { hour12: false });
}

export default function AcceptancePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [wideTables, setWideTables] = useState<WideTable[]>([]);
  const [taskGroups, setTaskGroups] = useState<TaskGroup[]>([]);
  const [fetchTasks, setFetchTasks] = useState<FetchTask[]>([]);
  const [tickets, setTickets] = useState<AcceptanceTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [activeList, setActiveList] = useState<"pending" | "reviewed">("pending");
  const [draftFilters, setDraftFilters] = useState<AcceptanceFilters>(() => buildDefaultAcceptanceFilters());
  const [filters, setFilters] = useState<AcceptanceFilters>(() => buildDefaultAcceptanceFilters());
  const [selectedIndicatorTask, setSelectedIndicatorTask] = useState<SelectedIndicatorTaskState | null>(null);

  const loadData = async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const [acceptanceOverview, collectionOverview] = await Promise.all([
        fetchAcceptanceOverview(),
        fetchCollectionTasksOverview(),
      ]);
      setProjects(collectionOverview.projects);
      setRequirements(collectionOverview.requirements);
      setWideTables(collectionOverview.wideTables);
      setTaskGroups(collectionOverview.taskGroups);
      setFetchTasks(collectionOverview.fetchTasks);
      setTickets(acceptanceOverview.tickets);
    } catch (error) {
      const message = error instanceof Error ? error.message : "加载失败，请稍后重试。";
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const acceptanceRequirementRows = useMemo(
    () =>
      buildAcceptanceRequirementRows({
        projects,
        requirements,
        wideTables,
        taskGroups,
        fetchTasks,
        tickets,
      }),
    [projects, requirements, wideTables, taskGroups, fetchTasks, tickets],
  );

  const filteredRows = useMemo(
    () => filterAcceptanceRequirementRows(acceptanceRequirementRows, filters, activeList),
    [acceptanceRequirementRows, filters, activeList],
  );

  const filteredTrialRows = useMemo(
    () => filterTrialConfirmationRows(acceptanceRequirementRows, filters),
    [acceptanceRequirementRows, filters],
  );

  const allCollectionTasks = useMemo(
    () => flattenAcceptanceCollectionTasks(acceptanceRequirementRows, "formal"),
    [acceptanceRequirementRows],
  );

  const allTrialTasks = useMemo(
    () => flattenAcceptanceCollectionTasks(acceptanceRequirementRows, "trial"),
    [acceptanceRequirementRows],
  );

  const pendingCount = allCollectionTasks.filter((row) => row.reviewStatus === "pending").length;
  const approvedCount = allCollectionTasks.filter((row) => row.reviewStatus === "approved").length;
  const rejectedCount = allCollectionTasks.filter((row) => row.reviewStatus === "rejected").length;
  const reviewableCount = allCollectionTasks.length;

  const toggleStatus = (next: AcceptanceReviewStatus) => {
    setDraftFilters((prev) => ({
      ...prev,
      statuses: prev.statuses.includes(next)
        ? prev.statuses.filter((status) => status !== next)
        : [...prev.statuses, next],
    }));
  };

  const applyFilters = () => {
    setFilters(draftFilters);
  };

  const resetFilters = () => {
    const nextFilters = buildDefaultAcceptanceFilters();
    setDraftFilters(nextFilters);
    setFilters(nextFilters);
  };

  return (
    <div className="p-8 space-y-6">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <ShieldCheck className="h-5 w-5 text-primary" />
          数据验收
        </h1>
        <p className="text-sm text-muted-foreground">
          跨项目查看验收单状态，快速进入对应需求的验收页处理问题。
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-4">
        <MetricCard title="待验收" value={pendingCount} icon={ShieldCheck} />
        <MetricCard title="已通过" value={approvedCount} icon={CheckCircle2} tone="success" />
        <MetricCard title="已驳回" value={rejectedCount} icon={XCircle} tone="danger" />
        <MetricCard title="可验收采集任务" value={reviewableCount} icon={Wrench} tone="warning" />
      </section>

      {errorMessage ? (
        <section className="space-y-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <div>加载失败：{errorMessage}</div>
          <button
            type="button"
            onClick={() => void loadData()}
            className="rounded-md border border-rose-300 px-3 py-1.5 text-xs hover:bg-rose-100"
          >
            重试
          </button>
        </section>
      ) : null}

      <section className="space-y-4 rounded-xl border bg-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-semibold">验收单列表</h2>
            <p className="mt-1 text-xs text-muted-foreground">仅展示正式采集任务，不展示试运行任务。</p>
          </div>
          {loading ? <span className="text-xs text-muted-foreground">加载中...</span> : null}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveList("pending")}
            className={cn(
              "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
              activeList === "pending"
                ? "border-primary bg-primary/10 text-primary"
                : "text-muted-foreground hover:border-primary/40 hover:text-foreground",
            )}
          >
            待验收列表
          </button>
          <button
            type="button"
            onClick={() => setActiveList("reviewed")}
            className={cn(
              "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
              activeList === "reviewed"
                ? "border-primary bg-primary/10 text-primary"
                : "text-muted-foreground hover:border-primary/40 hover:text-foreground",
            )}
          >
            已验收列表
          </button>
        </div>

        <div className="rounded-lg border bg-muted/10 p-4">
          <div className="grid gap-3 md:grid-cols-6">
            <div className="md:col-span-2">
              <div className="text-xs font-medium text-muted-foreground">查询</div>
              <input
                value={draftFilters.keyword}
                onChange={(event) => {
                  setDraftFilters((prev) => ({ ...prev, keyword: event.target.value }));
                }}
                placeholder="按需求/项目/人员/采集任务关键词查询"
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <div className="text-xs font-medium text-muted-foreground">所属项目</div>
              <select
                value={draftFilters.projectId}
                onChange={(event) => {
                  setDraftFilters((prev) => ({ ...prev, projectId: event.target.value }));
                }}
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="">全部</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-xs font-medium text-muted-foreground">负责人</div>
              <input
                value={draftFilters.owner}
                onChange={(event) => {
                  setDraftFilters((prev) => ({ ...prev, owner: event.target.value }));
                }}
                placeholder="负责人"
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <div className="text-xs font-medium text-muted-foreground">执行人</div>
              <input
                value={draftFilters.assignee}
                onChange={(event) => {
                  setDraftFilters((prev) => ({ ...prev, assignee: event.target.value }));
                }}
                placeholder="执行人"
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <div className="text-xs font-medium text-muted-foreground">采集任务</div>
              <input
                value={draftFilters.taskKeyword}
                onChange={(event) => {
                  setDraftFilters((prev) => ({ ...prev, taskKeyword: event.target.value }));
                }}
                placeholder="采集任务/指标/任务组ID/业务日期"
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted-foreground">验收状态：</span>
              {(["pending", "approved", "partial_approved", "rejected"] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => toggleStatus(status)}
                  className={cn(
                    "rounded-md border px-2 py-1",
                    draftFilters.statuses.includes(status)
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "bg-background text-muted-foreground hover:text-foreground",
                  )}
                >
                  {reviewStatusLabel[status]}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={applyFilters}
                className="rounded-md border px-3 py-2 text-xs text-primary hover:bg-primary/5"
              >
                查询
              </button>
              <button
                type="button"
                onClick={resetFilters}
                className="rounded-md border px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
              >
                重置
              </button>
            </div>
          </div>
        </div>

        {!loading && reviewableCount === 0 ? (
          <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            暂无可验收采集任务数据。
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1160px] text-sm">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className="px-3 py-2 text-left">需求</th>
                  <th className="px-3 py-2 text-left">项目</th>
                  <th className="px-3 py-2 text-left">采集任务</th>
                  <th className="px-3 py-2 text-left">验收状态</th>
                  <th className="px-3 py-2 text-left">更新时间</th>
                  <th className="px-3 py-2 text-left">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredRows.map((row) =>
                  row.collectionTasks.map((collectionTask, index) => (
                    <tr key={`${row.requirementId}-${collectionTask.key}`}>
                      {index === 0 ? (
                        <td rowSpan={row.collectionTasks.length} className="px-3 py-3 align-top">
                          <div className="space-y-1">
                            <div className="font-medium">{row.requirementTitle}</div>
                            <div className="text-xs text-muted-foreground">{row.requirementId}</div>
                          </div>
                        </td>
                      ) : null}

                      {index === 0 ? (
                        <td rowSpan={row.collectionTasks.length} className="px-3 py-3 align-top">
                          <div className="space-y-1">
                            <div className="font-medium">{row.projectName}</div>
                            <div className="text-xs text-muted-foreground">负责人：{row.owner || "-"}</div>
                            <div className="text-xs text-muted-foreground">执行人：{row.assignee || "-"}</div>
                          </div>
                        </td>
                      ) : null}

                      <td className="px-3 py-3 align-top">
                        <CollectionTaskCell
                          row={collectionTask}
                          requirementTitle={row.requirementTitle}
                          onOpenIndicators={(indicatorNames) =>
                            setSelectedIndicatorTask({
                              collectionTaskLabel: collectionTask.collectionTaskLabel,
                              requirementTitle: row.requirementTitle,
                              wideTableName: collectionTask.wideTableName,
                              indicatorNames,
                            })
                          }
                        />
                      </td>
                      <td className="px-3 py-3 align-top">
                        <span className={cn("inline-flex rounded px-2 py-1 text-xs", reviewStatusClass[collectionTask.reviewStatus])}>
                          {reviewStatusLabel[collectionTask.reviewStatus]}
                        </span>
                      </td>
                      <td className="px-3 py-3 align-top text-xs text-muted-foreground">
                        {formatDate(collectionTask.updatedAt)}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <Link
                          href={`/projects/${collectionTask.projectId}/requirements/${collectionTask.requirementId}?nav=acceptance&tab=acceptance&view=acceptance&wt=${encodeURIComponent(collectionTask.wideTableId)}`}
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          验收数据
                          <ArrowRight className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  )),
                )}
                {!loading && filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-sm text-muted-foreground">
                      当前筛选条件下暂无验收单数据。
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-4 rounded-xl border bg-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-semibold">试运行效果确认</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              仅展示试运行任务，用于进入任务页确认试运行效果，不纳入正式验收。
            </p>
          </div>
          <span className="text-xs text-muted-foreground">{allTrialTasks.length} 个试运行任务</span>
        </div>

        {allTrialTasks.length === 0 ? (
          <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            暂无可确认的试运行任务。
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className="px-3 py-2 text-left">需求</th>
                  <th className="px-3 py-2 text-left">项目</th>
                  <th className="px-3 py-2 text-left">试运行任务</th>
                  <th className="px-3 py-2 text-left">更新时间</th>
                  <th className="px-3 py-2 text-left">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredTrialRows.map((row) =>
                  row.collectionTasks.map((collectionTask, index) => (
                    <tr key={`trial-${row.requirementId}-${collectionTask.key}`}>
                      {index === 0 ? (
                        <td rowSpan={row.collectionTasks.length} className="px-3 py-3 align-top">
                          <div className="space-y-1">
                            <div className="font-medium">{row.requirementTitle}</div>
                            <div className="text-xs text-muted-foreground">{row.requirementId}</div>
                          </div>
                        </td>
                      ) : null}

                      {index === 0 ? (
                        <td rowSpan={row.collectionTasks.length} className="px-3 py-3 align-top">
                          <div className="space-y-1">
                            <div className="font-medium">{row.projectName}</div>
                            <div className="text-xs text-muted-foreground">负责人：{row.owner || "-"}</div>
                            <div className="text-xs text-muted-foreground">执行人：{row.assignee || "-"}</div>
                          </div>
                        </td>
                      ) : null}

                      <td className="px-3 py-3 align-top">
                        <TrialTaskCell row={collectionTask} />
                      </td>
                      <td className="px-3 py-3 align-top text-xs text-muted-foreground">
                        {formatDate(collectionTask.updatedAt)}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <Link
                          href={buildTrialConfirmationHref(collectionTask)}
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          确认试运行效果
                          <ArrowRight className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  )),
                )}
                {filteredTrialRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-sm text-muted-foreground">
                      当前筛选条件下暂无试运行任务。
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
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

function CollectionTaskCell({
  row,
  requirementTitle,
  onOpenIndicators,
}: {
  row: AcceptanceCollectionTaskRow;
  requirementTitle: string;
  onOpenIndicators: (indicatorNames: string[]) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="font-medium">{row.collectionTaskLabel}</div>
      <div className="text-xs text-muted-foreground">
        {row.indicatorCount} 个指标 · {row.fetchTaskCount} 个实例 · {row.taskGroupCount} 个任务组
      </div>
      <div className="text-xs text-muted-foreground">{row.indicatorSummary}</div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="font-mono">{row.wideTableName || row.wideTableId}</span>
        {row.indicatorCount > 3 ? (
          <button
            type="button"
            className="text-primary hover:underline"
            onClick={() => onOpenIndicators(row.indicatorNames)}
            aria-label={`查看 ${requirementTitle} 的 ${row.collectionTaskLabel} 全部指标`}
          >
            查看全部
          </button>
        ) : null}
      </div>
    </div>
  );
}

function TrialTaskCell({ row }: { row: AcceptanceCollectionTaskRow }) {
  return (
    <div className="space-y-1.5">
      <div className="font-medium">{row.collectionTaskLabel}</div>
      <div className="text-xs text-muted-foreground">
        {row.indicatorCount} 个指标 · {row.fetchTaskCount} 个实例 · {row.taskGroupCount} 个任务组
      </div>
      <div className="text-xs text-muted-foreground">{row.indicatorSummary}</div>
      <div className="text-xs text-muted-foreground font-mono">{row.wideTableName || row.wideTableId}</div>
    </div>
  );
}

function buildTrialConfirmationHref(row: AcceptanceCollectionTaskRow): string {
  const taskGroupId = row.taskGroups[0]?.id;
  const params = new URLSearchParams({
    nav: "acceptance",
    tab: "tasks",
    view: "tasks",
    wt: row.wideTableId,
  });
  if (taskGroupId) {
    params.set("tg", taskGroupId);
  }
  return `/projects/${row.projectId}/requirements/${row.requirementId}?${params.toString()}`;
}

function MetricCard({
  title,
  value,
  icon: Icon,
  tone = "default",
}: {
  title: string;
  value: number;
  icon: LucideIcon;
  tone?: "default" | "success" | "danger" | "warning";
}) {
  const toneClass = tone === "success"
    ? "bg-emerald-100 text-emerald-600"
    : tone === "danger"
      ? "bg-rose-100 text-rose-600"
      : tone === "warning"
        ? "bg-amber-100 text-amber-600"
        : "bg-primary/10 text-primary";

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">{title}</div>
        <span className={cn("inline-flex rounded-md p-1.5", toneClass)}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-3 text-2xl font-semibold">{value}</div>
    </div>
  );
}
