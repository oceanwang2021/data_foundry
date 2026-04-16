"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Project, Requirement, WideTable, TaskGroup, FetchTask } from "@/lib/types";
import { Layers } from "lucide-react";
import CreateRequirementModal from "@/components/CreateRequirementModal";

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
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const sortedRequirements = useMemo(
    () => [...requirements].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    [requirements],
  );
  const wideTableCount = wideTables.length;
  const taskGroupCount = taskGroups.length;
  const runningTaskGroups = taskGroups.filter((taskGroup) => taskGroup.status === "running").length;

  const handleSaved = (createdRequirement: Requirement) => {
    setRequirements((prev) => [...prev, createdRequirement]);
    if (createdRequirement.wideTable) {
      setWideTables((prev) => [...prev, createdRequirement.wideTable!]);
    }
    setMessage(`已创建需求：${createdRequirement.id}`);
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
             onClick={() => setCreateDialogOpen(true)}
             className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
           >
             创建需求
           </button>
         </div>

        <p className="text-xs text-muted-foreground">创建需求后即可直接录入需求、任务、数据产出与验收配置。</p>
        {message ? <div className="text-xs text-primary">{message}</div> : null}

        <div className="rounded-md border bg-muted/10 p-3 text-xs text-muted-foreground space-y-1">
          <div>每个需求只关联一张数据表；创建需求后先关联数据表，再维护 Schema、指标组与范围定义。</div>
          <div>Schema 在首次运行前可调整；进入运行态后将锁定 Schema，避免影响历史数据一致性。</div>
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
                  <th className="text-left px-3 py-2">背景知识</th>
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

      <CreateRequirementModal
        project={project}
        projectId={projectId}
        isOpen={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        onSaved={handleSaved}
      />
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

  return (
    <tr>
      <td className="px-3 py-2 align-top">
        <div className="flex items-center gap-2">
          <div className="font-medium">{requirement.title}</div>
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
        {requirement.backgroundKnowledge || requirement.businessGoal || "-"}
      </td>
      <td className="px-3 py-2 align-top text-xs text-muted-foreground">
        {requirement.status === "running" ? "运行中" : requirement.status === "ready" ? "就绪" : "未运行"}
      </td>
      <td className="px-3 py-2 align-top">
        <Link
          href={`/projects/${projectId}/requirements/${requirement.id}?nav=projects`}
          className="text-xs text-primary hover:underline"
        >
          进入需求
        </Link>
      </td>
    </tr>
  );
}


