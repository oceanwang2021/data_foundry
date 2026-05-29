"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";
import type { OpsMonitoringDistributionItem, OpsMonitoringRiskCard, OpsMonitoringServiceHealth, OpsMonitoringSummary } from "@/lib/domain";
import { fetchOpsMonitoringSummary } from "@/lib/api-client";
import { Activity, AlertTriangle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

const metricMeta = [
  {
    key: "healthScore",
    title: "运行健康度",
    description: "综合服务探活、任务成功率和审核推进率形成的大盘评分。",
    color: "bg-blue-500",
  },
  {
    key: "taskCompletionRate",
    title: "任务完成率",
    description: "已完成采集任务占全部正式任务的比例。",
    color: "bg-teal-600",
  },
  {
    key: "dataCollectionRate",
    title: "数据采集完成率",
    description: "已经完成采集的任务组占全部监控单元的比例。",
    color: "bg-amber-500",
  },
  {
    key: "dataReviewRate",
    title: "数据审核完成率",
    description: "已经通过验收的任务组占全部监控单元的比例。",
    color: "bg-violet-500",
  },
] as const;

const serviceStatusClass: Record<OpsMonitoringServiceHealth["status"], string> = {
  healthy: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  error: "bg-rose-50 text-rose-700",
};

const riskStatusClass: Record<OpsMonitoringRiskCard["severity"], string> = {
  low: "text-slate-700",
  medium: "text-amber-700",
  high: "text-rose-700",
};

export default function OpsMonitoringPage() {
  const [summary, setSummary] = useState<OpsMonitoringSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const loadData = async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const next = await fetchOpsMonitoringSummary();
      setSummary(next);
    } catch (error) {
      const message = error instanceof Error ? error.message : "监控数据加载失败";
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  return (
    <div className="space-y-6 p-8">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-5">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Activity className="h-5 w-5 text-primary" />
            监控
          </h1>
          <p className="max-w-4xl text-sm text-muted-foreground">
            统一查看系统健康、任务运行健康和数据推进进度，不展开任务或验收明细。
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadData()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={cn("h-4 w-4", loading ? "animate-spin" : "")} />
          刷新监控
        </button>
      </header>

      {errorMessage ? (
        <section className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          监控数据加载失败：{errorMessage}
        </section>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metricMeta.map((metric) => {
          const value = summary?.overview[metric.key] ?? 0;
          return (
            <div key={metric.key} className="rounded-xl border bg-card p-5">
              <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div className={cn("h-full rounded-full", metric.color)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
              </div>
              <div className="text-sm text-muted-foreground">{metric.title}</div>
              <div className="mt-2 text-4xl font-semibold tracking-tight">{formatPercent(value)}</div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{metric.description}</p>
            </div>
          );
        })}
      </section>

      <section className="rounded-xl border bg-card">
        <div className="border-b px-5 py-4">
          <h2 className="text-base font-semibold">系统健康</h2>
        </div>
        <div className="divide-y">
          {(summary?.serviceHealth ?? []).map((service) => (
            <div key={service.service} className="grid gap-3 px-5 py-4 md:grid-cols-[160px_100px_minmax(0,1fr)] md:items-start">
              <div className="font-medium">{service.label}</div>
              <div>
                <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-medium", serviceStatusClass[service.status])}>
                  {service.status === "healthy" ? "健康" : service.status === "warning" ? "预警" : "异常"}
                </span>
              </div>
              <div className="text-sm leading-6 text-muted-foreground">{service.detail}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Panel
          title="任务运行状态监控"
          description="聚合查看采集任务运行健康，突出异常和积压。"
          actionHref="/collection-tasks"
          actionLabel="查看采集任务明细"
        >
          <div className="grid gap-4 sm:grid-cols-4">
            <SimpleMetric title="总任务数" value={String(summary?.taskMonitoring.total ?? 0)} />
            <SimpleMetric title="运行中" value={String(summary?.taskMonitoring.runningTaskCount ?? 0)} />
            <SimpleMetric title="异常" value={String(summary?.taskMonitoring.failedTaskCount ?? 0)} tone="danger" />
            <SimpleMetric title="成功率" value={formatPercent(summary?.taskMonitoring.successRate ?? 0)} />
          </div>

          <div className="mt-5">
            <SectionLabel title="任务状态占比" />
            <StackedProgress
              rows={summary?.taskMonitoring.statusCounts ?? []}
              colors={["bg-slate-400", "bg-blue-500", "bg-emerald-500", "bg-rose-500"]}
            />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {(summary?.taskMonitoring.statusCounts ?? []).map((item) => (
              <CompactStat key={item.status} label={item.label} count={item.count} ratio={item.ratio} />
            ))}
          </div>

          <div className="mt-5">
            <SectionLabel title="异常关注" />
            <PlainList
              items={buildTaskInsights(summary)}
              emptyText="当前没有任务异常，运行状态整体稳定。"
            />
          </div>
        </Panel>

        <Panel
          title="数据状态监控"
          description="聚合查看数据从采集到审核的推进情况，关注进度和积压。"
          actionHref="/acceptance"
          actionLabel="查看数据验收明细"
        >
          <div className="grid gap-4 sm:grid-cols-4">
            <SimpleMetric title="待采集" value={String(findStageCount(summary, "pending_collection"))} />
            <SimpleMetric title="待审核" value={String(findStageCount(summary, "pending_review"))} />
            <SimpleMetric title="已完成" value={String(findStageCount(summary, "completed"))} tone="success" />
            <SimpleMetric title="审核通过率" value={formatPercent(summary?.dataMonitoring.approvalRate ?? 0)} />
          </div>

          <div className="mt-5">
            <SectionLabel title="数据推进链路" />
            <StageRow rows={summary?.dataMonitoring.stageCounts ?? []} />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <CompactStat label="采集推进率" count={summary?.dataMonitoring.totalUnits ?? 0} ratio={summary?.dataMonitoring.collectionRate ?? 0} unit="个监控单元" />
            <CompactStat label="审核推进率" count={summary?.dataMonitoring.totalUnits ?? 0} ratio={summary?.dataMonitoring.reviewRate ?? 0} unit="个监控单元" />
          </div>

          <div className="mt-5">
            <SectionLabel title="推进卡点" />
            <PlainList
              items={buildDataInsights(summary)}
              emptyText="当前没有明显的采集或审核积压。"
            />
          </div>
        </Panel>
      </section>

      <section className="rounded-xl border bg-card">
        <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">风险关注</h2>
            <p className="mt-1 text-sm text-muted-foreground">只聚焦当前最需要处理的异常、积压和系统告警。</p>
          </div>
        </div>
        <div className="divide-y">
          {(summary?.riskCards ?? []).map((riskCard) => (
            <Link
              key={riskCard.code}
              href={riskCard.target}
              className="grid gap-3 px-5 py-4 transition-colors hover:bg-slate-50 md:grid-cols-[180px_80px_minmax(0,1fr)_140px] md:items-center"
            >
              <div className="flex items-center gap-2 font-medium">
                <AlertTriangle className={cn("h-4 w-4", riskStatusClass[riskCard.severity])} />
                {riskCard.label}
              </div>
              <div className={cn("text-lg font-semibold", riskStatusClass[riskCard.severity])}>{riskCard.count}</div>
              <div className="text-sm leading-6 text-muted-foreground">{riskCard.description}</div>
              <div className="text-sm text-primary md:text-right">进入处理页面</div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function Panel({
  title,
  description,
  actionHref,
  actionLabel,
  children,
}: {
  title: string;
  description: string;
  actionHref: string;
  actionLabel: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card p-5">
      <div className="mb-5 flex items-start justify-between gap-3 border-b pb-4">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <Link href={actionHref} className="text-sm text-primary hover:underline">
          {actionLabel}
        </Link>
      </div>
      {children}
    </section>
  );
}

function SectionLabel({ title }: { title: string }) {
  return <div className="mb-3 text-sm font-medium text-foreground">{title}</div>;
}

function SimpleMetric({
  title,
  value,
  tone = "default",
}: {
  title: string;
  value: string;
  tone?: "default" | "success" | "danger";
}) {
  const toneClass = tone === "success"
    ? "text-emerald-700"
    : tone === "danger"
      ? "text-rose-700"
      : "text-foreground";

  return (
    <div className="rounded-lg bg-slate-50 px-4 py-3">
      <div className="text-xs text-muted-foreground">{title}</div>
      <div className={cn("mt-2 text-2xl font-semibold", toneClass)}>{value}</div>
    </div>
  );
}

function StackedProgress({
  rows,
  colors,
}: {
  rows: OpsMonitoringDistributionItem[];
  colors: string[];
}) {
  return (
    <div className="overflow-hidden rounded-full bg-slate-100">
      <div className="flex h-3 w-full">
        {rows.map((row, index) => (
          <div
            key={row.status}
            className={cn("h-full", colors[index % colors.length])}
            style={{ width: `${Math.max(0, Math.min(100, row.ratio))}%` }}
          />
        ))}
      </div>
    </div>
  );
}

function CompactStat({
  label,
  count,
  ratio,
  unit,
}: {
  label: string;
  count: number;
  ratio: number;
  unit?: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border px-4 py-3">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="mt-1 text-xs text-muted-foreground">{unit ? `${count} ${unit}` : `${count} 个`}</div>
      </div>
      <div className="text-lg font-semibold">{formatPercent(ratio)}</div>
    </div>
  );
}

function StageRow({ rows }: { rows: OpsMonitoringDistributionItem[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {rows
        .filter((row) => row.status !== "exception")
        .map((row, index, filteredRows) => (
          <div key={row.status} className="relative rounded-lg border px-4 py-3">
            {index < filteredRows.length - 1 ? (
              <div className="absolute right-[-8px] top-1/2 hidden h-px w-4 bg-slate-300 sm:block" />
            ) : null}
            <div className="text-xs text-muted-foreground">阶段 {index + 1}</div>
            <div className="mt-1 text-sm font-medium">{row.label}</div>
            <div className="mt-2 text-2xl font-semibold">{row.count}</div>
          </div>
        ))}
    </div>
  );
}

function PlainList({
  items,
  emptyText,
}: {
  items: string[];
  emptyText: string;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed px-4 py-5 text-sm text-muted-foreground">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="divide-y rounded-lg border">
      {items.map((item) => (
        <div key={item} className="px-4 py-3 text-sm leading-6 text-slate-700">
          {item}
        </div>
      ))}
    </div>
  );
}

function buildTaskInsights(summary: OpsMonitoringSummary | null): string[] {
  if (!summary) {
    return [];
  }
  const items: string[] = [];
  if (summary.taskMonitoring.failedTaskCount > 0) {
    items.push(`当前存在 ${summary.taskMonitoring.failedTaskCount} 个异常任务，建议优先查看失败、取消或失效原因。`);
  }
  if (summary.taskMonitoring.runningTaskCount > 0) {
    items.push(`当前有 ${summary.taskMonitoring.runningTaskCount} 个任务运行中，需要继续关注回调同步和结果落库。`);
  }
  const serviceAlerts = countAlerts(summary.serviceHealth);
  if (serviceAlerts > 0) {
    items.push(`系统侧有 ${serviceAlerts} 项服务告警，可能影响任务调度或采集结果回传。`);
  }
  return items;
}

function buildDataInsights(summary: OpsMonitoringSummary | null): string[] {
  if (!summary) {
    return [];
  }
  const items: string[] = [];
  const pendingCollection = findStageCount(summary, "pending_collection");
  const pendingReview = findStageCount(summary, "pending_review");
  const exception = findStageCount(summary, "exception");

  if (pendingCollection > 0) {
    items.push(`仍有 ${pendingCollection} 个监控单元待采集，采集推进尚未闭环。`);
  }
  if (pendingReview > 0) {
    items.push(`已有 ${pendingReview} 个监控单元进入待审核阶段，可转到数据验收继续处理。`);
  }
  if (exception > 0) {
    items.push(`有 ${exception} 个监控单元处于异常状态，需要结合任务和验收信息排查。`);
  }
  return items;
}

function findStageCount(summary: OpsMonitoringSummary | null, status: string) {
  return summary?.dataMonitoring.stageCounts.find((item) => item.status === status)?.count ?? 0;
}

function countAlerts(serviceHealth: OpsMonitoringServiceHealth[]) {
  return serviceHealth.filter((item) => item.status === "warning" || item.status === "error").length;
}

function formatPercent(value: number) {
  return `${Number.isFinite(value) ? value.toFixed(1) : "0.0"}%`;
}
