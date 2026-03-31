"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import type { Project, Requirement, WideTable, WideTableRecord, TaskGroup, FetchTask } from "@/lib/types";
import type { AcceptanceTicket, ScheduleJob } from "@/lib/domain";
import { loadRequirementDetailData } from "@/lib/api-client";
import ProjectRequirementDetailPanel from "@/components/ProjectRequirementDetailPanel";

export default function ProjectRequirementDetailPage() {
  const params = useParams<{ id: string; reqId: string }>();
  const searchParams = useSearchParams();
  const id = params?.id ?? "";
  const reqId = params?.reqId ?? "";
  const requestedTab = searchParams?.get("tab") ?? undefined;
  const requestedGuide = searchParams?.get("guide") ?? undefined;

  const [project, setProject] = useState<Project | null>(null);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [wideTables, setWideTables] = useState<WideTable[]>([]);
  const [wideTableRecords, setWideTableRecords] = useState<WideTableRecord[]>([]);
  const [taskGroups, setTaskGroups] = useState<TaskGroup[]>([]);
  const [fetchTasks, setFetchTasks] = useState<FetchTask[]>([]);
  const [acceptanceTickets, setAcceptanceTickets] = useState<AcceptanceTicket[]>([]);
  const [scheduleJobs, setScheduleJobs] = useState<ScheduleJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id || !reqId) {
      setProject(null);
      setLoading(false);
      return;
    }

    loadRequirementDetailData(id, reqId)
      .then((data) => {
        setProject(data.project);
        setRequirements(data.requirements);
        setWideTables(data.wideTables);
        setWideTableRecords(data.wideTableRecords);
        setTaskGroups(data.taskGroups);
        setFetchTasks(data.fetchTasks);
        setAcceptanceTickets(data.acceptanceTickets);
        setScheduleJobs(data.scheduleJobs);
      })
      .catch(() => {
        setProject(null);
      })
      .finally(() => setLoading(false));
  }, [id, reqId]);

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-sm text-muted-foreground">正在加载需求数据...</div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-8">
        <div className="text-sm text-muted-foreground">未找到该项目。</div>
      </div>
    );
  }

  return (
    <ProjectRequirementDetailPanel
      project={project}
      requirementId={reqId}
      requestedTab={requestedTab}
      requestedGuide={requestedGuide}
      initialRequirements={requirements}
      wideTables={wideTables}
      wideTableRecords={wideTableRecords}
      taskGroups={taskGroups}
      fetchTasks={fetchTasks}
      acceptanceTickets={acceptanceTickets}
      scheduleJobs={scheduleJobs}
    />
  );
}
