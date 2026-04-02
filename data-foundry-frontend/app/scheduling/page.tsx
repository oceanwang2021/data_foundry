"use client";

import { useCallback, useEffect, useState } from "react";
import type { TaskGroup } from "@/lib/types";
import type { ScheduleJob } from "@/lib/domain";
import {
  fetchProjects,
  fetchRequirementWideTables,
  fetchScheduleJobs,
  fetchTaskGroups,
  createScheduleJob,
} from "@/lib/api-client";
import { ComponentType } from "react";
import { CalendarClock, PlayCircle, RefreshCw, Timer } from "lucide-react";
import { cn } from "@/lib/utils";

const triggerLabel: Record<string, string> = {
  manual: "手动执行",
  cron: "定时执行",
  backfill: "补采重跑",
  resample: "重试",
};

const statusStyle: Record<string, string> = {
  queued: "bg-gray-100 text-gray-700",
  running: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

export default function SchedulingPage() {
  const [scheduleJobs, setScheduleJobs] = useState<ScheduleJob[]>([]);
  const [taskGroups, setTaskGroups] = useState<TaskGroup[]>([]);
  const [filterTrigger, setFilterTrigger] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const jobs = await fetchScheduleJobs(
        filterTrigger || undefined,
        filterStatus || undefined,
      );
      setScheduleJobs(jobs);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [filterTrigger, filterStatus]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  useEffect(() => {
    fetchProjects()
      .then(async (ps) => {
        const results = await Promise.all(
          ps.map((p) =>
            fetchRequirementWideTables(p.id).catch(() => ({
              requirements: [],
              wideTables: [],
            })),
          ),
        );
        const reqs = results.flatMap((r) => r.requirements);
        const tgArrays = await Promise.all(
          ps.flatMap((p) =>
            reqs
              .filter((r) => r.projectId === p.id)
              .map((r) =>
                fetchTaskGroups(p.id, r.id).catch(() => [] as TaskGroup[]),
              ),
          ),
        );
        setTaskGroups(tgArrays.flat());
      })
      .catch(() => {});
  }, []);

  const handleManualTrigger = async (taskGroupId: string) => {
    await createScheduleJob({ taskGroupId, triggerType: "manual", operator: "manual" });
    await loadJobs();
  };

  return (
    <div className="p-8 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <CalendarClock className="h-5 w-5 text-primary" />
          调度
        </h1>
        <p className="text-sm text-muted-foreground">
          运行中心下的调度视图，负责定期调度、手动触发和按需补采。
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ActionCard icon={PlayCircle} title="手动触发" desc="支持单个或批量触发任务组执行。" />
        <ActionCard icon={Timer} title="定时调度" desc="基于 ScheduleRule 的周期配置自动创建任务组。" />
        <ActionCard icon={RefreshCw} title="补采重跑" desc="发起 BackfillRequest 重新采集指定日期范围数据。" />
        <ActionCard icon={PlayCircle} title="试运行" desc="对采集内容做小样本验证，评估模型表现。" />
      </section>

      <section className="rounded-xl border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">调度执行记录</h2>
          <div className="flex items-center gap-3">
            <select
              className="text-sm border rounded px-2 py-1"
              value={filterTrigger}
              onChange={(e) => setFilterTrigger(e.target.value)}
              aria-label="筛选触发方式"
            >
              <option value="">全部触发方式</option>
              <option value="manual">手动执行</option>
              <option value="cron">定时执行</option>
              <option value="backfill">补采重跑</option>
              <option value="resample">重试</option>
            </select>
            <select
              className="text-sm border rounded px-2 py-1"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              aria-label="筛选状态"
            >
              <option value="">全部状态</option>
              <option value="queued">排队中</option>
              <option value="running">执行中</option>
              <option value="completed">已完成</option>
              <option value="failed">失败</option>
            </select>
            <button
              className="text-sm bg-primary text-primary-foreground px-3 py-1 rounded hover:opacity-90"
              onClick={loadJobs}
              disabled={loading}
            >
              {loading ? "加载中..." : "刷新"}
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 border-b">
              <tr>
                <th className="text-left px-3 py-2">运行ID</th>
                <th className="text-left px-3 py-2">任务组</th>
                <th className="text-left px-3 py-2">宽表</th>
                <th className="text-left px-3 py-2">触发方式</th>
                <th className="text-left px-3 py-2">状态</th>
                <th className="text-left px-3 py-2">开始</th>
                <th className="text-left px-3 py-2">结束</th>
                <th className="text-left px-3 py-2">操作者</th>
                <th className="text-left px-3 py-2">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {scheduleJobs.map((job) => {
                const tg = taskGroups.find((t) => t.id === job.taskGroupId);
                return (
                  <tr key={job.id}>
                    <td className="px-3 py-2 font-mono text-xs">{job.id.slice(0, 8)}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{tg?.businessDateLabel ?? job.taskGroupId}</div>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{job.wideTableId ?? "-"}</td>
                    <td className="px-3 py-2">{triggerLabel[job.triggerType] ?? job.triggerType}</td>
                    <td className="px-3 py-2">
                      <span className={cn("text-xs px-2 py-1 rounded", statusStyle[job.status])}>{job.status}</span>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{job.startedAt}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{job.endedAt ?? "-"}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{job.operator}</td>
                    <td className="px-3 py-2">
                      <button
                        className="text-xs text-primary hover:underline"
                        onClick={() => handleManualTrigger(job.taskGroupId)}
                      >
                        重新触发
                      </button>
                    </td>
                  </tr>
                );
              })}
              {scheduleJobs.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                    {loading ? "加载中..." : "暂无调度记录"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-6">
        <h2 className="font-semibold mb-3">任务流转</h2>
        <p className="text-sm text-muted-foreground">
          宽表可将结束日期设为 never，并通过"业务日期后偏移天数"自动生成未来任务组。
        </p>
      </section>
    </div>
  );
}

function ActionCard({
  icon: Icon,
  title,
  desc,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 font-semibold">
        <Icon className="h-4 w-4 text-primary" />
        {title}
      </div>
      <p className="text-xs text-muted-foreground mt-2">{desc}</p>
    </div>
  );
}
