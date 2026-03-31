"use client";

import { useEffect, useState } from "react";
import type { OpsOverview } from "@/lib/domain";
import {
  fetchOpsOverview,
  fetchTaskStatusCounts,
  fetchDataStatusCounts,
} from "@/lib/api-client";
import { Activity } from "lucide-react";
import { cn } from "@/lib/utils";

const envStyle: Record<string, string> = {
  healthy: "bg-green-100 text-green-700",
  warning: "bg-amber-100 text-amber-700",
  error: "bg-red-100 text-red-700",
};

export default function OpsMonitoringPage() {
  const [opsOverview, setOpsOverview] = useState<OpsOverview[]>([]);
  const [taskStatusCounts, setTaskStatusCounts] = useState<Array<{ status: string; count: number }>>([]);
  const [dataStatusCounts, setDataStatusCounts] = useState<Array<{ status: string; count: number }>>([]);

  const loadData = () => {
    fetchOpsOverview().then(setOpsOverview).catch(() => {});
    fetchTaskStatusCounts().then(setTaskStatusCounts).catch(() => {});
    fetchDataStatusCounts().then(setDataStatusCounts).catch(() => {});
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div className="p-8 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          监控
        </h1>
        <p className="text-sm text-muted-foreground">
          运行中心下的监控视图，统一查看环境健康、任务状态和数据状态。系统级数据操作已归入【设置】。
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        {opsOverview.map((item) => (
          <div key={item.environment} className="rounded-xl border bg-card p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{item.stage}</h2>
              <span className={cn("text-xs px-2 py-1 rounded", envStyle[item.status])}>{item.status}</span>
            </div>
            <div className="mt-3 text-sm text-muted-foreground space-y-1">
              <p>运行中任务：{item.runningTasks}</p>
              <p>失败任务：{item.failedTasks}</p>
            </div>
          </div>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <CountPanel title="任务运行状态监控" rows={taskStatusCounts} />
        <CountPanel title="数据状态监控" rows={dataStatusCounts} />
      </section>
    </div>
  );
}

function CountPanel({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ status: string; count: number }>;
}) {
  return (
    <div className="rounded-xl border bg-card p-6">
      <h2 className="font-semibold mb-4">{title}</h2>
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.status} className="flex items-center justify-between rounded border p-3 bg-muted/10">
            <span className="text-sm">{row.status}</span>
            <span className="font-semibold">{row.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
