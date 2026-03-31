"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { Project, Requirement, WideTable, TaskGroup, FetchTask, WideTableRecord } from "@/lib/types";
import type { ScheduleJob } from "@/lib/domain";
import { loadRequirementDetailData } from "@/lib/api-client";
import { ArrowLeft, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";
import { buildFetchTaskCardViews, getVisibleNarrowTableContextColumns } from "@/lib/fetch-task-views";

const statusStyle: Record<string, string> = {
  pending: "bg-gray-100 text-gray-700",
  running: "bg-amber-100 text-amber-700",
  completed: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  paused: "bg-gray-100 text-gray-500",
  queued: "bg-gray-100 text-gray-700",
  skipped: "bg-gray-100 text-gray-500",
};

const statusLabel: Record<string, string> = {
  pending: "待执行",
  running: "执行中",
  completed: "已完成",
  failed: "失败",
  paused: "已暂停",
  queued: "排队中",
  skipped: "跳过",
  success: "成功",
  failure: "失败",
  timeout: "超时",
};

const triggerLabel: Record<string, string> = {
  schedule: "定时调度",
  backfill: "补采",
  manual: "手动触发",
  manual_retry: "手动重试",
  cron: "定时执行",
};

export default function RequirementTaskDetailPage() {
  const params = useParams<{ id: string; reqId: string; taskId: string }>();
  const id = params?.id ?? "";
  const reqId = params?.reqId ?? "";
  const taskId = params?.taskId ?? "";

  const [project, setProject] = useState<Project | null>(null);
  const [requirement, setRequirement] = useState<Requirement | null>(null);
  const [wideTables, setWideTables] = useState<WideTable[]>([]);
  const [taskGroups, setTaskGroups] = useState<TaskGroup[]>([]);
  const [fetchTasks, setFetchTasks] = useState<FetchTask[]>([]);
  const [wideTableRecords, setWideTableRecords] = useState<WideTableRecord[]>([]);
  const [scheduleJobs, setScheduleJobs] = useState<ScheduleJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id || !reqId) {
      setProject(null);
      setRequirement(null);
      setLoading(false);
      return;
    }

    loadRequirementDetailData(id, reqId)
      .then((data) => {
        setProject(data.project);
        const req = data.requirements.find((r) => r.id === reqId) ?? null;
        setRequirement(req);
        setWideTables(data.wideTables);
        setTaskGroups(data.taskGroups);
        setFetchTasks(data.fetchTasks);
        setWideTableRecords(data.wideTableRecords);
        setScheduleJobs(data.scheduleJobs);
      })
      .catch(() => {
        setProject(null);
        setRequirement(null);
      })
      .finally(() => setLoading(false));
  }, [id, reqId]);

  if (loading) {
    return <div className="p-8 text-sm text-muted-foreground">正在加载任务数据...</div>;
  }

  if (!project || !requirement) {
    return <div className="p-8 text-sm text-muted-foreground">未找到该任务。</div>;
  }

  const reqWideTables = wideTables.filter((wt) => wt.requirementId === requirement.id);
  const reqWideTableIds = new Set(reqWideTables.map((wt) => wt.id));
  const reqTaskGroups = taskGroups.filter((tg) => reqWideTableIds.has(tg.wideTableId));

  let matched: {
    wideTable: WideTable;
    taskGroup: TaskGroup;
    taskCard: ReturnType<typeof buildFetchTaskCardViews>[number];
  } | null = null;

  for (const taskGroup of reqTaskGroups) {
    const wideTable = reqWideTables.find((item) => item.id === taskGroup.wideTableId);
    if (!wideTable) continue;
    const taskCards = buildFetchTaskCardViews({
      requirement,
      wideTable,
      taskGroup,
      fetchTasks: fetchTasks.filter((task) => task.taskGroupId === taskGroup.id),
      wideTableRecords,
    });
    const taskCard = taskCards.find((task) => task.id === taskId);
    if (!taskCard) continue;
    matched = { wideTable, taskGroup, taskCard };
    break;
  }

  if (!matched) {
    return <div className="p-8 text-sm text-muted-foreground">未找到该采集任务。</div>;
  }

  const { wideTable, taskGroup, taskCard } = matched;
  const contextColumns = getVisibleNarrowTableContextColumns(wideTable);
  const runs = scheduleJobs.filter((job) => job.taskGroupId === taskGroup.id);

  return (
    <div className="p-8 space-y-6">
      <header className="space-y-2">
        <Link
          href={`/projects/${project.id}/requirements/${requirement.id}?tab=tasks`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          返回采集任务
        </Link>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-primary" />
          采集任务：{taskCard.rowLabel}
        </h1>
        <p className="text-sm text-muted-foreground">
          项目：{project.name} | 需求：{requirement.title} | 宽表：{wideTable.name} | 任务组：{taskGroup.businessDateLabel}
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-4">
        <MetricCard title="窄表返回行数" value={String(taskCard.returnRows.length)} />
        <MetricCard title="执行次数" value={String(taskCard.attempts)} />
        <MetricCard title="持续时间" value={taskCard.cumulativeDurationLabel} />
        <MetricCard title="置信度" value={taskCard.confidenceLabel} />
      </section>

      <section className="rounded-xl border bg-card p-6 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs px-2 py-1 rounded border bg-muted/20 font-mono">{taskCard.id}</span>
          <span className={cn("text-xs px-2 py-1 rounded", statusStyle[taskCard.status])}>
            {statusLabel[taskCard.status] ?? taskCard.status}
          </span>
          <span className="text-xs px-2 py-1 rounded border">
            {triggerLabel[taskCard.latestTrigger] ?? taskCard.latestTrigger}
          </span>
          <span className="text-xs px-2 py-1 rounded border">
            {taskCard.isSynthetic ? "系统生成任务" : "执行任务"}
          </span>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border bg-muted/10 p-4 text-xs text-muted-foreground space-y-1">
            <p>任务组：{taskGroup.id}</p>
            <p>业务日期：{taskGroup.businessDate}</p>
            <p>行ID：{taskCard.rowId}</p>
            <p>开始时间：{formatDateTime(taskCard.startedAt)}</p>
            <p>结束时间：{formatDateTime(taskCard.endedAt)}</p>
          </div>
          <div className="rounded-lg border bg-muted/10 p-4 text-xs text-muted-foreground space-y-1">
            <p>Agent：{taskCard.agent}</p>
            <p>提示词：{taskCard.promptMarkdown ? "已生成" : taskCard.promptTemplate}</p>
            <p>最近错误：{taskCard.latestError || ""}</p>
            <p>关联宽表：{wideTable.name} ({wideTable.id})</p>
            <p>任务组触发次数：{runs.length}</p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-6 space-y-4">
        <h2 className="font-semibold">Agent 提示词</h2>
        <pre className="overflow-x-auto rounded-lg border bg-muted/10 px-4 py-3 text-xs leading-6 whitespace-pre-wrap">
          {taskCard.promptMarkdown || taskCard.promptTemplate}
        </pre>
      </section>

      <section className="rounded-xl border bg-card p-6 space-y-4">
        <h2 className="font-semibold">执行记录</h2>
        {taskCard.executionRecords.length === 0 ? (
          <div className="text-sm text-muted-foreground">当前任务还没有执行记录。</div>
        ) : (
          <div className="space-y-2">
            {taskCard.executionRecords.map((record) => (
              <div key={record.id} className="rounded-md border bg-muted/10 p-3 text-xs text-muted-foreground space-y-1">
                <div className="font-medium text-foreground">第 {record.attempt} 次执行</div>
                <div>触发方式：{triggerLabel[record.triggeredBy] ?? record.triggeredBy}</div>
                <div>状态：{statusLabel[record.status] ?? record.status}</div>
                <div>所属批次：{record.taskGroupRunId ?? "单任务重试"}</div>
                <div>开始：{formatDateTime(record.startedAt)}</div>
                <div>结束：{formatDateTime(record.endedAt ?? "")}</div>
                {record.errorMessage ? <div>错误：{record.errorMessage}</div> : null}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-card p-6 space-y-4">
        <h2 className="font-semibold">窄表数据</h2>
        <p className="text-xs text-muted-foreground">
          展示该任务返回的完整窄表结果：宽表行全部非指标字段 + 指标名/指标值/原始指标值 + 单位/发布时间/来源站点/来源URL + 逻辑说明与摘录。未返回字段留空。
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 border-b">
              <tr>
                {contextColumns.map((column) => (
                  <th key={column.id} className="px-2 py-1.5 text-left">
                    {column.name}
                  </th>
                ))}
                <th className="px-2 py-1.5 text-left">指标名</th>
                <th className="px-2 py-1.5 text-left">指标值</th>
                <th className="px-2 py-1.5 text-left">原始指标值</th>
                <th className="px-2 py-1.5 text-left">单位</th>
                <th className="px-2 py-1.5 text-left">数据发布时间</th>
                <th className="px-2 py-1.5 text-left">数据来源站点</th>
                <th className="px-2 py-1.5 text-left">最大值</th>
                <th className="px-2 py-1.5 text-left">最小值</th>
                <th className="px-2 py-1.5 text-left">来源URL</th>
                <th className="px-2 py-1.5 text-left">原文摘录</th>
                <th className="px-2 py-1.5 text-left">指标逻辑</th>
                <th className="px-2 py-1.5 text-left">逻辑补充</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {taskCard.returnRows.map((row) => (
                <tr key={`${taskCard.id}-${row.indicatorName}`}>
                  {contextColumns.map((column) => (
                    <td key={column.id} className="px-2 py-1.5 text-muted-foreground">
                      {row.contextValues[column.name] ?? ""}
                    </td>
                  ))}
                  <td className="px-2 py-1.5">{row.indicatorName}</td>
                  <td className="px-2 py-1.5 text-muted-foreground">{row.indicatorValue}</td>
                  <td className="px-2 py-1.5 text-muted-foreground">{row.rawIndicatorValue}</td>
                  <td className="px-2 py-1.5 text-muted-foreground">{row.indicatorUnit}</td>
                  <td className="px-2 py-1.5 text-muted-foreground">{row.publishedAt}</td>
                  <td className="px-2 py-1.5 text-muted-foreground">{row.sourceSite}</td>
                  <td className="px-2 py-1.5 text-muted-foreground">{row.maxValue}</td>
                  <td className="px-2 py-1.5 text-muted-foreground">{row.minValue}</td>
                  <td className="px-2 py-1.5 text-primary">
                    {row.sourceUrl ? (
                      <a href={row.sourceUrl} target="_blank" rel="noreferrer" className="hover:underline">
                        {row.sourceUrl}
                      </a>
                    ) : (
                      ""
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-muted-foreground">{row.quoteText}</td>
                  <td className="px-2 py-1.5 text-muted-foreground">{row.indicatorLogic}</td>
                  <td className="px-2 py-1.5 text-muted-foreground">{row.indicatorLogicSupplement}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function MetricCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-sm text-muted-foreground">{title}</div>
      <div className="text-2xl font-bold mt-1">{value || ""}</div>
    </div>
  );
}

function formatDateTime(value: string): string {
  if (!value) {
    return "";
  }
  return value.replace("T", " ").replace("Z", "");
}
