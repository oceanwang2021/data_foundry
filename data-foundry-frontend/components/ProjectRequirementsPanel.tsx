"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { createRequirement } from "@/lib/api-client";
import type { Project, Requirement, WideTable, TaskGroup, FetchTask } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Layers } from "lucide-react";

type Props = {
  project: Project;
  projectId: string;
  initialRequirements: Requirement[];
  initialWideTables: WideTable[];
  initialTaskGroups: TaskGroup[];
  initialFetchTasks: FetchTask[];
};

export default function ProjectRequirementsPanel({
  project,
  projectId,
  initialRequirements,
  initialWideTables,
  initialTaskGroups,
}: Props) {
  const [requirements, setRequirements] = useState<Requirement[]>(initialRequirements);
  const [wideTables, setWideTables] = useState<WideTable[]>(initialWideTables);
  const [taskGroups, setTaskGroups] = useState<TaskGroup[]>(initialTaskGroups);
  const [message, setMessage] = useState("");
  const [creating, setCreating] = useState(false);

  const sortedRequirements = useMemo(
    () => [...requirements].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    [requirements],
  );
  const wideTableCount = wideTables.length;
  const taskGroupCount = taskGroups.length;
  const runningTaskGroups = taskGroups.filter((taskGroup) => taskGroup.status === "running").length;

  const handleCreateDemoRequirement = async () => {
    setCreating(true);
    setMessage("");
    try {
      const createdRequirement = await createRequirement(projectId, {
        title: "需求待命名",
        owner: "业务-待定",
        assignee: "算法-待定",
        businessGoal: "",
        businessBoundary: "",
        deliveryScope: "",
        projectDataSource: project.dataSource,
      });
      setRequirements((prev) => [...prev, createdRequirement]);
      setMessage(`已创建需求：${createdRequirement.id}（当前处于 Demo 阶段）`);
    } catch (error: any) {
      setMessage(`创建失败：${error.message}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <section className="grid gap-4 md:grid-cols-4">
        <MetricCard title="需求数" value={String(requirements.length)} />
        <MetricCard title="宽表数量" value={String(wideTableCount)} />
        <MetricCard title="任务组数量" value={String(taskGroupCount)} />
        <MetricCard title="运行中任务组" value={String(runningTaskGroups)} />
      </section>

      <section className="rounded-xl border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            需求清单
          </h2>
          <button
            type="button"
            onClick={handleCreateDemoRequirement}
            disabled={creating}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
          >
            {creating ? "创建中..." : "创建需求"}
          </button>
        </div>

        <p className="text-xs text-muted-foreground">
          新需求总是先以 Demo 状态创建。Demo 通过后，需要进入该需求的【数据产出】Tab，在原需求上直接转为正式需求，不再额外新建正式需求记录。
        </p>
        {message ? <div className="text-xs text-primary">{message}</div> : null}

        <div className="rounded-md border bg-muted/10 p-3 text-xs text-muted-foreground space-y-1">
          <div>每个需求只关联一张数据表；创建需求后先关联数据表，再维护 Schema、指标组与范围定义。</div>
          <div>正式需求由 Demo 原地转换而来；Schema 与指标组只读，仅允许调整范围定义、未来调度和补采。</div>
        </div>

        {sortedRequirements.length === 0 ? (
          <div className="text-sm text-muted-foreground">当前项目暂无需求。</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b">
                <tr>
                  <th className="text-left px-3 py-2">需求</th>
                  <th className="text-left px-3 py-2">负责人/执行人</th>
                  <th className="text-left px-3 py-2">关联宽表</th>
                  <th className="text-left px-3 py-2">业务目标</th>
                  <th className="text-left px-3 py-2">状态流转</th>
                  <th className="text-left px-3 py-2">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sortedRequirements.map((requirement) => (
                  <RequirementRow
                    key={requirement.id}
                    projectId={projectId}
                    requirement={requirement}
                    wideTables={wideTables}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function MetricCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-sm text-muted-foreground">{title}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}

function RequirementRow({
  projectId,
  requirement,
  wideTables,
}: {
  projectId: string;
  requirement: Requirement;
  wideTables: WideTable[];
}) {
  const reqWideTable = requirement.wideTable ?? wideTables.find((wideTable) => wideTable.requirementId === requirement.id);
  const typeLabel = requirement.requirementType === "demo" ? "Demo" : "正式生产";
  const typeClassName = requirement.requirementType === "demo"
    ? "border-blue-200 bg-blue-50 text-blue-700"
    : "border-emerald-200 bg-emerald-50 text-emerald-700";

  return (
    <tr>
      <td className="px-3 py-2 align-top">
        <div className="flex items-center gap-2">
          <div className="font-medium">{requirement.title}</div>
          <span className={cn("text-[11px] px-2 py-0.5 rounded border", typeClassName)}>
            {typeLabel}
          </span>
        </div>
        <div className="text-xs text-muted-foreground mt-1">{requirement.id}</div>
      </td>
      <td className="px-3 py-2 align-top text-xs text-muted-foreground">
        <div>业务：{requirement.owner}</div>
        <div>执行：{requirement.assignee}</div>
      </td>
      <td className="px-3 py-2 align-top text-xs text-muted-foreground">
        {reqWideTable ? `${reqWideTable.name}（${reqWideTable.id}）` : "未配置"}
      </td>
      <td className="px-3 py-2 align-top text-xs text-muted-foreground max-w-xs truncate">
        {requirement.businessGoal || "-"}
      </td>
      <td className="px-3 py-2 align-top text-xs text-muted-foreground">
        {requirement.requirementType === "demo"
          ? requirement.status === "ready"
            ? "已完成 Demo，可转换正式"
            : "仍处于 Demo 阶段"
          : "已进入正式需求阶段"}
      </td>
      <td className="px-3 py-2 align-top">
        <Link
          href={`/projects/${projectId}/requirements/${requirement.id}`}
          className="text-xs text-primary hover:underline"
        >
          进入需求
        </Link>
      </td>
    </tr>
  );
}
