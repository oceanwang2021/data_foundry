"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ShieldCheck, CheckCircle2, XCircle, Wrench, ArrowRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Project, Requirement } from "@/lib/types";
import type { AcceptanceTicket } from "@/lib/domain";
import {
  fetchAcceptanceTickets,
  fetchProjects,
  fetchRequirementWideTables,
  fetchTaskGroups,
} from "@/lib/api-client";

type AcceptanceReviewStatus = "pending" | "approved" | "rejected";

type TaskGroupRow = {
  projectId: string;
  requirementId: string;
  taskGroup: {
    id: string;
    wideTableId: string;
    businessDate: string;
    businessDateLabel: string;
    status: string;
    updatedAt: string;
  };
};

const reviewStatusLabel: Record<AcceptanceReviewStatus, string> = {
  pending: "待验收",
  approved: "已通过",
  rejected: "已驳回",
};

const reviewStatusClass: Record<AcceptanceReviewStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-rose-100 text-rose-700",
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
  const [taskGroupRows, setTaskGroupRows] = useState<TaskGroupRow[]>([]);
  const [tickets, setTickets] = useState<AcceptanceTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [activeList, setActiveList] = useState<"pending" | "reviewed">("pending");

  const loadData = async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const projectList = await fetchProjects();
      const requirementResults = await Promise.all(
        projectList.map((project) =>
          fetchRequirementWideTables(project.id).catch(() => ({
            requirements: [] as Requirement[],
            wideTables: [],
          })),
        ),
      );
      const requirementList = requirementResults.flatMap((result) => result.requirements);
      const acceptanceTickets = await fetchAcceptanceTickets();

      const taskGroupResults = await Promise.all(
        requirementList.map((req) =>
          fetchTaskGroups(req.projectId, req.id)
            .then((groups) => ({
              projectId: req.projectId,
              requirementId: req.id,
              groups,
            }))
            .catch(() => ({
              projectId: req.projectId,
              requirementId: req.id,
              groups: [],
            })),
        ),
      );
      const rows: TaskGroupRow[] = taskGroupResults.flatMap((result) =>
        result.groups.map((tg) => ({
          projectId: result.projectId,
          requirementId: result.requirementId,
          taskGroup: {
            id: tg.id,
            wideTableId: tg.wideTableId,
            businessDate: tg.businessDate,
            businessDateLabel: tg.businessDateLabel,
            status: tg.status,
            updatedAt: tg.updatedAt,
          },
        })),
      );

      setProjects(projectList);
      setRequirements(requirementList);
      setTaskGroupRows(rows);
      setTickets(acceptanceTickets);
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

  const requirementMap = useMemo(
    () => new Map(requirements.map((requirement) => [requirement.id, requirement])),
    [requirements],
  );

  const projectMap = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );

  const ticketByTaskGroupId = useMemo(() => {
    const map = new Map<string, AcceptanceTicket>();
    for (const ticket of tickets) {
      if (!ticket.taskGroupId) continue;
      map.set(ticket.taskGroupId, ticket);
    }
    return map;
  }, [tickets]);

  const reviewableRows = useMemo(
    () =>
      taskGroupRows.filter((row) =>
        row.taskGroup.status === "completed" || row.taskGroup.status === "partial",
      ),
    [taskGroupRows],
  );

  const viewRows = useMemo(() => {
    const normalized = reviewableRows.map((row) => {
      const ticket = ticketByTaskGroupId.get(row.taskGroup.id);
      const status: AcceptanceReviewStatus =
        ticket?.status === "approved"
          ? "approved"
          : ticket?.status === "rejected" || ticket?.status === "fixing"
          ? "rejected"
          : "pending";
      return { ...row, reviewStatus: status, ticket };
    });
    const pending = normalized.filter((row) => row.reviewStatus === "pending");
    const reviewed = normalized.filter((row) => row.reviewStatus !== "pending");
    // latest first
    pending.sort((a, b) => b.taskGroup.updatedAt.localeCompare(a.taskGroup.updatedAt));
    reviewed.sort((a, b) => {
      const at = a.ticket?.latestActionAt ?? a.taskGroup.updatedAt;
      const bt = b.ticket?.latestActionAt ?? b.taskGroup.updatedAt;
      return bt.localeCompare(at);
    });
    return { pending, reviewed };
  }, [reviewableRows, ticketByTaskGroupId]);

  const pendingCount = viewRows.pending.length;
  const approvedCount = viewRows.reviewed.filter((row) => row.reviewStatus === "approved").length;
  const rejectedCount = viewRows.reviewed.filter((row) => row.reviewStatus === "rejected").length;

  return (
    <div className="p-8 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold flex items-center gap-2">
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
        <MetricCard title="可验收任务组" value={reviewableRows.length} icon={Wrench} tone="warning" />
      </section>

      {errorMessage ? (
        <section className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 space-y-3">
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

      <section className="rounded-xl border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">验收单列表</h2>
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
                : "text-muted-foreground hover:text-foreground hover:border-primary/40",
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
                : "text-muted-foreground hover:text-foreground hover:border-primary/40",
            )}
          >
            已验收列表
          </button>
        </div>

        {!loading && reviewableRows.length === 0 ? (
          <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            暂无可验收任务组数据。
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b">
                <tr>
                  <th className="text-left px-3 py-2">项目 / 需求</th>
                  <th className="text-left px-3 py-2">数据集</th>
                  <th className="text-left px-3 py-2">任务组</th>
                  <th className="text-left px-3 py-2">验收状态</th>
                  <th className="text-left px-3 py-2">更新时间</th>
                  <th className="text-left px-3 py-2">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(activeList === "pending" ? viewRows.pending : viewRows.reviewed).map((row) => {
                  const requirement = requirementMap.get(row.requirementId);
                  const project = projectMap.get(row.projectId);
                  const detailHref = `/projects/${row.projectId}/requirements/${row.requirementId}?nav=acceptance&tab=acceptance&view=acceptance`;
                  const dataset = requirement?.wideTable
                    ? `${requirement.wideTable.name || requirement.wideTable.id}(${requirement.wideTable.id})`
                    : row.ticket?.dataset || row.taskGroup.wideTableId;

                  return (
                    <tr key={`${row.projectId}-${row.requirementId}-${row.taskGroup.id}`}>
                      <td className="px-3 py-2">
                        <div className="space-y-0.5">
                          <div className="font-medium">{project?.name ?? row.projectId}</div>
                          <div className="text-xs text-muted-foreground">
                            {requirement?.title ?? row.requirementId} / {row.requirementId}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2">{dataset}</td>
                      <td className="px-3 py-2">
                        <div className="space-y-0.5">
                          <div className="font-mono text-xs">{row.taskGroup.id}</div>
                          <div className="text-xs text-muted-foreground">{row.taskGroup.businessDateLabel || row.taskGroup.businessDate}</div>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <span className={cn("inline-flex rounded px-2 py-1 text-xs", reviewStatusClass[row.reviewStatus])}>
                          {reviewStatusLabel[row.reviewStatus]}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground text-xs">
                        {formatDate(row.ticket?.latestActionAt ?? row.taskGroup.updatedAt)}
                      </td>
                      <td className="px-3 py-2">
                        <Link
                          href={detailHref}
                          className="inline-flex items-center gap-1 text-primary text-xs hover:underline"
                        >
                          验收数据
                          <ArrowRight className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
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
    ? "text-emerald-600 bg-emerald-100"
    : tone === "danger"
      ? "text-rose-600 bg-rose-100"
      : tone === "warning"
        ? "text-amber-600 bg-amber-100"
        : "text-primary bg-primary/10";

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
