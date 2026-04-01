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
} from "@/lib/api-client";

const statusLabel: Record<AcceptanceTicket["status"], string> = {
  approved: "已通过",
  rejected: "已驳回",
  fixing: "修复中",
  deleted: "已删除",
};

const statusClass: Record<AcceptanceTicket["status"], string> = {
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-rose-100 text-rose-700",
  fixing: "bg-amber-100 text-amber-700",
  deleted: "bg-gray-100 text-gray-600",
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
  const [tickets, setTickets] = useState<AcceptanceTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

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

      setProjects(projectList);
      setRequirements(requirementList);
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

  const approvedCount = tickets.filter((ticket) => ticket.status === "approved").length;
  const rejectedCount = tickets.filter((ticket) => ticket.status === "rejected").length;
  const fixingCount = tickets.filter((ticket) => ticket.status === "fixing").length;

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
        <MetricCard title="验收单总数" value={tickets.length} icon={ShieldCheck} />
        <MetricCard title="已通过" value={approvedCount} icon={CheckCircle2} tone="success" />
        <MetricCard title="已驳回" value={rejectedCount} icon={XCircle} tone="danger" />
        <MetricCard title="修复中" value={fixingCount} icon={Wrench} tone="warning" />
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

      <section className="rounded-xl border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">验收单列表</h2>
          {loading ? <span className="text-xs text-muted-foreground">加载中...</span> : null}
        </div>

        {!loading && tickets.length === 0 ? (
          <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            暂无验收单数据。
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b">
                <tr>
                  <th className="text-left px-3 py-2">ticketId</th>
                  <th className="text-left px-3 py-2">dataset</th>
                  <th className="text-left px-3 py-2">requirement</th>
                  <th className="text-left px-3 py-2">owner</th>
                  <th className="text-left px-3 py-2">status</th>
                  <th className="text-left px-3 py-2">latestActionAt</th>
                  <th className="text-left px-3 py-2">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {tickets.map((ticket) => {
                  const requirement = requirementMap.get(ticket.requirementId);
                  const project = requirement ? projectMap.get(requirement.projectId) : undefined;
                  const detailHref = requirement
                    ? `/projects/${requirement.projectId}/requirements/${requirement.id}?tab=acceptance`
                    : null;

                  return (
                    <tr key={ticket.id}>
                      <td className="px-3 py-2 font-mono text-xs">{ticket.id}</td>
                      <td className="px-3 py-2">{ticket.dataset}</td>
                      <td className="px-3 py-2">
                        {requirement ? (
                          <div className="space-y-0.5">
                            <div className="font-medium">{requirement.title}</div>
                            <div className="text-xs text-muted-foreground">
                              {project?.name ?? requirement.projectId} / {requirement.id}
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">{ticket.requirementId}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">{ticket.owner}</td>
                      <td className="px-3 py-2">
                        <span className={cn("inline-flex rounded px-2 py-1 text-xs", statusClass[ticket.status])}>
                          {statusLabel[ticket.status]}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground text-xs">{formatDate(ticket.latestActionAt)}</td>
                      <td className="px-3 py-2">
                        {detailHref ? (
                          <Link
                            href={detailHref}
                            className="inline-flex items-center gap-1 text-primary text-xs hover:underline"
                          >
                            进入需求验收
                            <ArrowRight className="h-3 w-3" />
                          </Link>
                        ) : (
                          <span className="text-xs text-muted-foreground">需求不存在</span>
                        )}
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
