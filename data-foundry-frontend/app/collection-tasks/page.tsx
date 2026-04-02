"use client";

import { useEffect, useState } from "react";
import {
  AGENT_NODES,
} from "@/lib/mock-platform";
import type { Requirement, WideTable, TaskGroup, FetchTask } from "@/lib/types";
import { fetchProjects, fetchRequirementWideTables, fetchTaskGroups, fetchFetchTasks } from "@/lib/api-client";
import Link from "next/link";
import { Boxes, FileCode2, Workflow } from "lucide-react";
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

export default function CollectionTasksPage() {
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [wideTables, setWideTables] = useState<WideTable[]>([]);
  const [taskGroups, setTaskGroups] = useState<TaskGroup[]>([]);
  const [allFetchTasks, setAllFetchTasks] = useState<FetchTask[]>([]);

  useEffect(() => {
    fetchProjects()
      .then(async (ps) => {
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

  return (
    <div className="p-8 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Workflow className="h-5 w-5 text-primary" />
          采集任务管理
        </h1>
        <p className="text-sm text-muted-foreground">
          管理需求关联宽表下的任务组与采集任务。
        </p>
      </header>

      <section className="rounded-xl border bg-card p-6">
        <h2 className="font-semibold mb-4">任务组列表</h2>
        <div className="space-y-4">
          {taskGroups.map((tg) => {
            const wt = wideTables.find((w) => w.id === tg.wideTableId);
            const req = wt ? requirements.find((r) => r.id === wt.requirementId) : null;
            const fetchTasks = allFetchTasks.filter((ft) => ft.taskGroupId === tg.id);
            const progressPercent = tg.totalTasks > 0
              ? Math.round((tg.completedTasks / tg.totalTasks) * 100)
              : 0;
            return (
              <div key={tg.id} className="rounded-lg border p-4 bg-muted/10">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs px-2 py-1 rounded border bg-background">{tg.id}</span>
                  <h3 className="font-semibold">{tg.businessDateLabel}</h3>
                  <span className={cn("text-xs px-2 py-1 rounded", statusStyle[tg.status])}>{statusLabel[tg.status] ?? tg.status}</span>
                  <span className="text-xs px-2 py-1 rounded border">{triggerLabel[tg.triggeredBy] ?? tg.triggeredBy}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  宽表：{wt?.name ?? "-"} | 需求：{req?.title ?? "-"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  总任务 {tg.totalTasks} | 完成 {tg.completedTasks} | 失败 {tg.failedTasks} | 进度 {progressPercent}%
                </p>
                {req && (
                  <Link
                    href={`/projects/${req.projectId}/requirements/${req.id}?view=tasks&tab=tasks${wt ? `&wt=${encodeURIComponent(wt.id)}` : ""}&tg=${encodeURIComponent(tg.id)}`}
                    className="mt-2 inline-flex text-xs text-primary hover:underline"
                  >
                    查看任务详情
                  </Link>
                )}
                <div className="mt-3 rounded-md border bg-background p-3">
                  <div className="text-xs font-semibold mb-2 flex items-center gap-1">
                    <Boxes className="h-3 w-3" />
                    采集任务（FetchTask）
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    {fetchTasks.length === 0 ? (
                      <div className="text-xs text-muted-foreground">暂无采集任务</div>
                    ) : (
                      fetchTasks.slice(0, 4).map((ft) => (
                        <div key={ft.id} className="rounded border p-2">
                          <div className="text-xs font-medium">{ft.id} – 行{ft.rowId} × {ft.indicatorGroupName}</div>
                          <div className="text-[11px] text-muted-foreground mt-1">
                            状态：{statusLabel[ft.status] ?? ft.status}
                            {ft.confidence != null ? ` | 置信度：${(ft.confidence * 100).toFixed(0)}%` : ""}
                          </div>
                        </div>
                      ))
                    )}
                    {fetchTasks.length > 4 ? (
                      <div className="text-xs text-muted-foreground p-2">
                        ... 共 {fetchTasks.length} 个采集任务
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-xl border bg-card p-6 space-y-4">
        <h2 className="font-semibold">采集能力</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <FeatureCard title="指标组驱动" desc="采集任务按 '行ID × 指标组' 展开，确保同组指标由同一 Agent 一并处理。" />
          <FeatureCard title="调度与补采" desc="支持定期调度和按需补采，任务组按业务日期管理。" />
          <FeatureCard title="窄表与宽表" desc="Agent 先输出窄表（指标+元信息），回填后合并为宽表。" />
          <FeatureCard title="执行记录" desc="每次 FetchTask 执行产生 ExecutionRecord，记录成功/失败/重试等详情。" />
        </div>
      </section>

      <section className="rounded-xl border bg-card p-6">
        <h2 className="font-semibold mb-4">采集Agent 8节点配置说明</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {AGENT_NODES.map((node) => (
            <div key={node.id} className="rounded-lg border p-3 bg-muted/10">
              <div className="text-xs text-muted-foreground">{node.id}</div>
              <div className="font-medium text-sm mt-1">{node.name}</div>
              <p className="text-xs text-muted-foreground mt-2">{node.purpose}</p>
              <p className="text-[11px] mt-2 text-primary">参数：{node.keyParams.join(" / ")}</p>
              <p className="text-[11px] mt-1 text-muted-foreground">影响：{node.impact}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border bg-card p-6">
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <FileCode2 className="h-4 w-4 text-primary" />
          自动Query策略
        </h2>
        <p className="text-sm text-muted-foreground">
          平台根据"指标组 + 维度范围 + 背景知识 + Prompt模板"自动生成 Agent 入参；属性列不会参与拆分，只会随任务上下文一路携带。
        </p>
      </section>
    </div>
  );
}

function FeatureCard({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-lg border p-4 bg-muted/10">
      <div className="text-sm font-semibold">{title}</div>
      <p className="text-xs text-muted-foreground mt-2">{desc}</p>
    </div>
  );
}
