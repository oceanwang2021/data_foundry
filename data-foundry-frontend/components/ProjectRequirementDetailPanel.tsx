"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type {
  Requirement,
  WideTable,
  WideTableRecord,
  TaskGroup,
  FetchTask,
  Project,
} from "@/lib/types";
import type { AcceptanceTicket, ScheduleJob } from "@/lib/domain";
import { loadRequirementDetailData, updateRequirement } from "@/lib/api-client";
import { ArrowLeft, ClipboardList } from "lucide-react";
import { formatBusinessDateLabel } from "@/lib/business-date";
import { hasWideTableBusinessDateDimension } from "@/lib/wide-table-mode";
import { cn } from "@/lib/utils";
import RequirementDefinitionForm from "@/components/RequirementDefinitionForm";
import RequirementTasksPanel from "@/components/RequirementTasksPanel";
import RequirementDataProcessingPanel from "@/components/RequirementDataProcessingPanel";
import RequirementAcceptancePanel from "@/components/RequirementAcceptancePanel";


type TabKey = "requirement" | "tasks" | "processing" | "acceptance";
type NavSource = "projects" | "requirements" | "tasks" | "acceptance";

type Props = {
  project: Project;
  requirementId: string;
  requestedTab?: string;
  requestedGuide?: string;
  viewMode?: "requirement" | "tasks" | "acceptance";
  navSource?: NavSource;
  initialRequirements: Requirement[];
  wideTables: WideTable[];
  wideTableRecords: WideTableRecord[];
  taskGroups: TaskGroup[];
  fetchTasks: FetchTask[];
  acceptanceTickets: AcceptanceTicket[];
  scheduleJobs: ScheduleJob[];
};

const resolveBackTarget = (projectId: string, navSource?: NavSource, viewMode?: Props["viewMode"]) => {
  const source = navSource
    ?? (viewMode === "requirement" ? "requirements" : viewMode === "tasks" ? "tasks" : viewMode === "acceptance" ? "acceptance" : "projects");
  return source === "requirements"
    ? { href: "/requirements", label: "返回需求管理" }
    : source === "tasks"
    ? { href: "/collection-tasks", label: "返回采集任务管理" }
    : source === "acceptance"
    ? { href: "/acceptance", label: "返回验收列表" }
    : { href: `/projects/${projectId}`, label: "返回项目" };
};

export default function ProjectRequirementDetailPanel({
  project,
  requirementId,
  requestedTab,
  requestedGuide,
  viewMode,
  navSource,
  initialRequirements,
  wideTables,
  wideTableRecords,
  taskGroups,
  fetchTasks,
  acceptanceTickets,
  scheduleJobs,
}: Props) {
  const [projectState, setProjectState] = useState<Project>(project);
  const [requirements, setRequirements] = useState<Requirement[]>(initialRequirements);
  const [wideTablesState, setWideTablesState] = useState<WideTable[]>(wideTables);
  const [wideTableRecordsState, setWideTableRecordsState] = useState<WideTableRecord[]>(wideTableRecords);
  const [taskGroupsState, setTaskGroupsState] = useState<TaskGroup[]>(taskGroups);
  const [fetchTasksState, setFetchTasksState] = useState<FetchTask[]>(fetchTasks);
  const [taskGroupRunsState, setTaskGroupRunsState] = useState<ScheduleJob[]>(scheduleJobs);
  const [acceptanceTicketsState, setAcceptanceTicketsState] = useState<AcceptanceTicket[]>(acceptanceTickets);
  const hydrated = true;
  const fallbackBackTarget = resolveBackTarget(project.id, navSource, viewMode);

  useEffect(() => {
    const sanitizedState = sanitizeProjectRequirementState({
      wideTables,
      wideTableRecords,
      taskGroups,
      fetchTasks,
      scheduleJobs,
    });
    setProjectState(project);
    setRequirements(initialRequirements);
    setWideTablesState(sanitizedState.wideTables);
    setWideTableRecordsState(sanitizedState.wideTableRecords);
    setTaskGroupsState(sanitizedState.taskGroups);
    setFetchTasksState(sanitizedState.fetchTasks);
    setTaskGroupRunsState(sanitizedState.scheduleJobs);
    setAcceptanceTicketsState(acceptanceTickets);
  }, [project, initialRequirements, wideTables, wideTableRecords, taskGroups, fetchTasks, scheduleJobs, acceptanceTickets]);

  const requirement = useMemo(
    () => requirements.find((r) => r.id === requirementId) ?? null,
    [requirements, requirementId],
  );

  const handleRequirementChange = (nextRequirement: Requirement) => {
    setRequirements((prev) =>
      prev.map((item) => (item.id === nextRequirement.id ? nextRequirement : item)),
    );

    void updateRequirement(project.id, nextRequirement.id, {
      title: nextRequirement.title,
      status: nextRequirement.status,
      owner: nextRequirement.owner,
      assignee: nextRequirement.assignee,
      businessGoal: nextRequirement.businessGoal,
      backgroundKnowledge: nextRequirement.backgroundKnowledge,
      dataUpdateEnabled: nextRequirement.dataUpdateEnabled,
      dataUpdateMode: nextRequirement.dataUpdateMode,
      processingRuleDrafts: nextRequirement.processingRuleDrafts,
    }).catch(() => {});
  };

  const refreshRequirementData = async () => {
    const data = await loadRequirementDetailData(project.id, requirementId);
    const sanitizedState = sanitizeProjectRequirementState({
      wideTables: data.wideTables,
      wideTableRecords: data.wideTableRecords,
      taskGroups: data.taskGroups,
      fetchTasks: data.fetchTasks,
      scheduleJobs: data.scheduleJobs,
    });
    const refreshedTaskGroupIds = new Set(sanitizedState.taskGroups.map((taskGroup) => taskGroup.id));

    setProjectState(data.project);
    setRequirements(data.requirements);
    setWideTablesState(sanitizedState.wideTables);
    setWideTableRecordsState(sanitizedState.wideTableRecords);
    setTaskGroupsState(sanitizedState.taskGroups);
    setFetchTasksState(sanitizedState.fetchTasks);
    setTaskGroupRunsState((prev) => (
      sanitizedState.scheduleJobs.length > 0
        ? sanitizedState.scheduleJobs
        : prev.filter((run) => refreshedTaskGroupIds.has(run.taskGroupId))
    ));
    setAcceptanceTicketsState(data.acceptanceTickets ?? []);
  };

  if (!requirement) {
    return (
      <div className="p-8 space-y-4">
        <Link
          href={fallbackBackTarget.href}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {fallbackBackTarget.label}
        </Link>
        <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
          {hydrated ? "未找到该需求，请返回项目列表刷新后重试。" : "正在加载需求..."}
        </div>
      </div>
    );
  }

  const availableSchemaTemplates = useMemo(() => {
    const mergedTemplates = new Map<string, WideTable>();
    for (const wideTable of wideTables) {
      mergedTemplates.set(wideTable.id, wideTable);
    }
    for (const wideTable of wideTablesState) {
      mergedTemplates.set(wideTable.id, wideTable);
    }
    return Array.from(mergedTemplates.values());
  }, [wideTables, wideTablesState]);
  const reqWideTables = wideTablesState.filter((wt) => wt.requirementId === requirement.id);
  const containsFullSnapshotTable = reqWideTables.some((wideTable) => !hasWideTableBusinessDateDimension(wideTable));
  const reqWtIds = new Set(reqWideTables.map((wt) => wt.id));
  const reqWideTableRecords = wideTableRecordsState.filter((record) => reqWtIds.has(record.wideTableId));
  const reqTaskGroups = taskGroupsState.filter((tg) => reqWtIds.has(tg.wideTableId));
  const reqTgIds = new Set(reqTaskGroups.map((tg) => tg.id));
  const reqFetchTasks = fetchTasksState.filter((ft) => reqTgIds.has(ft.taskGroupId));
  const reqTaskGroupRuns = taskGroupRunsState.filter((run) => reqTgIds.has(run.taskGroupId));
  const handleReplaceRequirementWideTables = (nextWideTables: WideTable[]) => {
    const nextRequirementWideTables = nextWideTables.slice(-1);
    setWideTablesState([
      ...wideTablesState.filter((wideTable) => wideTable.requirementId !== requirement.id),
      ...nextRequirementWideTables,
    ]);
  };
  const handleUpdateRequirementWideTable = (
    wideTableId: string,
    updater: (wideTable: WideTable) => WideTable,
  ) => {
    handleReplaceRequirementWideTables(
      reqWideTables.map((wideTable) => (
        wideTable.id === wideTableId ? updater(wideTable) : wideTable
      )),
    );
  };
  const handleReplaceRequirementWideTableRecords = (
    wideTableId: string,
    nextWideTableRecords: WideTableRecord[],
  ) => {
    const nextPlanVersion = nextWideTableRecords[0]?._metadata?.planVersion;
    setWideTableRecordsState([
      ...wideTableRecordsState.filter((record) => {
        if (record.wideTableId !== wideTableId) {
          return true;
        }
        if (nextPlanVersion == null) {
          return false;
        }
        return (record._metadata?.planVersion ?? nextPlanVersion) !== nextPlanVersion;
      }),
      ...nextWideTableRecords,
    ]);
  };

  const basePath = `/projects/${project.id}/requirements/${requirement.id}`;
  const isRequirementOnlyView = viewMode === "requirement";
  const isTasksOnlyView = viewMode === "tasks";
  const isAcceptanceOnlyView = viewMode === "acceptance";
  const resolvedNavSource: NavSource | undefined = navSource
    ?? (isRequirementOnlyView ? "requirements" : isTasksOnlyView ? "tasks" : isAcceptanceOnlyView ? "acceptance" : undefined);
  const baseQueryParams = [
    resolvedNavSource ? `nav=${resolvedNavSource}` : "",
    isRequirementOnlyView
      ? "view=requirement"
      : isTasksOnlyView
      ? "view=tasks"
      : isAcceptanceOnlyView
      ? "view=acceptance"
      : "",
  ].filter(Boolean);
  const buildDetailHref = (tab: TabKey) => `${basePath}?${[...baseQueryParams, `tab=${tab}`].join("&")}`;
  const requirementTabHref = buildDetailHref("requirement");
  const tasksTabHref = buildDetailHref("tasks");
  const processingTabHref = buildDetailHref("processing");
  const acceptanceTabHref = buildDetailHref("acceptance");
  const backTarget = resolveBackTarget(project.id, resolvedNavSource, viewMode);
  const isRequirementSubmitted = requirement.status !== "draft";
  const isDownstreamTabRequested = requestedTab === "tasks"
    || requestedTab === "processing"
    || requestedTab === "acceptance"
    || requestedTab === "audit";
  const shouldForceRequirementTab = !isRequirementSubmitted && !isRequirementOnlyView && !isTasksOnlyView && !isAcceptanceOnlyView && isDownstreamTabRequested;
  const activeTab: TabKey =
    isRequirementOnlyView
      ? "requirement"
      : isTasksOnlyView
      ? "tasks"
      : isAcceptanceOnlyView
      ? "acceptance"
      : shouldForceRequirementTab
      ? "requirement"
      : requestedTab === "tasks"
      ? "tasks"
      : requestedTab === "processing"
      ? "processing"
      : requestedTab === "acceptance" || requestedTab === "audit"
      ? "acceptance"
      : "requirement";

  return (
    <div className="p-8 space-y-6">
      <header className="space-y-2">
        <Link
          href={backTarget.href}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {backTarget.label}
        </Link>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-primary" />
          {requirement.title}
        </h1>
        <p className="text-sm text-muted-foreground">
          项目：{projectState.name} | 业务负责人：{requirement.owner} | 执行人：{requirement.assignee}
        </p>
      </header>

      {!isAcceptanceOnlyView ? (
        <section className="rounded-xl border bg-card p-3">
          {isRequirementOnlyView ? (
            <div className="grid auto-rows-fr gap-2 grid-cols-1">
              <TabLink
                href={requirementTabHref}
                active
              >
                需求
              </TabLink>
            </div>
          ) : isTasksOnlyView ? (
            <div className="grid auto-rows-fr gap-2 grid-cols-1">
              <TabLink href={tasksTabHref} active>
                任务
              </TabLink>
            </div>
          ) : (
            <div className="grid auto-rows-fr gap-2 grid-cols-4">
              <TabLink
                href={requirementTabHref}
                active={activeTab === "requirement"}
              >
                需求
              </TabLink>
              <TabLink href={tasksTabHref} active={activeTab === "tasks"} disabled={!isRequirementSubmitted}>
                任务
              </TabLink>
              <TabLink href={processingTabHref} active={activeTab === "processing"} disabled={!isRequirementSubmitted}>
                数据产出
              </TabLink>
              <TabLink href={acceptanceTabHref} active={activeTab === "acceptance"} disabled={!isRequirementSubmitted}>
                验收
              </TabLink>
            </div>
          )}
        </section>
      ) : null}

      {!isRequirementSubmitted && !isRequirementOnlyView && !isTasksOnlyView && !isAcceptanceOnlyView ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          当前需求尚未提交。请先在【需求】Tab 完成录入并点击“提交”，提交后才能进入任务、数据产出与验收环节。
        </div>
      ) : null}

      {activeTab === "requirement" ? (
        <RequirementDefinitionForm
          project={projectState}
          requirement={requirement}
          entryGuide={requestedGuide}
          wideTables={reqWideTables}
          wideTableRecords={reqWideTableRecords}
          taskGroups={reqTaskGroups}
          fetchTasks={reqFetchTasks}
          availableSchemaTemplates={availableSchemaTemplates}
          onRequirementChange={handleRequirementChange}
          onProjectChange={setProjectState}
          onWideTablesChange={handleReplaceRequirementWideTables}
          onWideTableRecordsChange={(nextWideTableRecords) => {
            setWideTableRecordsState((prev) => [
              ...prev.filter((record) => !reqWtIds.has(record.wideTableId)),
              ...nextWideTableRecords,
            ]);
          }}
          onTaskGroupsChange={(nextTaskGroups) => {
            setTaskGroupsState((prev) => [
              ...prev.filter((taskGroup) => !reqWtIds.has(taskGroup.wideTableId)),
              ...nextTaskGroups,
            ]);
          }}
          onFetchTasksChange={(nextFetchTasks) => {
            setFetchTasksState((prev) => [
              ...prev.filter((task) => !reqWtIds.has(task.wideTableId)),
              ...nextFetchTasks,
            ]);
          }}
          onRefreshData={refreshRequirementData}
        />
      ) : null}

      {activeTab === "tasks" ? (
        <RequirementTasksPanel
          requirement={requirement}
          navSource={resolvedNavSource}
          wideTables={reqWideTables}
          wideTableRecords={reqWideTableRecords}
          taskGroups={reqTaskGroups}
          fetchTasks={reqFetchTasks}
          scheduleJobs={reqTaskGroupRuns}
          onUpdateWideTable={handleUpdateRequirementWideTable}
          onReplaceWideTableRecords={handleReplaceRequirementWideTableRecords}
          onRequirementChange={handleRequirementChange}
          onRefreshData={refreshRequirementData}
          onWideTableRecordsChange={(nextWideTableRecords) => {
            setWideTableRecordsState((prev) => [
              ...prev.filter((record) => !reqWtIds.has(record.wideTableId)),
              ...nextWideTableRecords,
            ]);
          }}
          onTaskGroupsChange={(nextTaskGroups) => {
            setTaskGroupsState((prev) => [
              ...prev.filter((taskGroup) => !reqWtIds.has(taskGroup.wideTableId)),
              ...nextTaskGroups,
            ]);
          }}
          onFetchTasksChange={(nextFetchTasks) => {
            setFetchTasksState((prev) => [
              ...prev.filter((task) => !reqTgIds.has(task.taskGroupId)),
              ...nextFetchTasks,
            ]);
          }}
          onTaskGroupRunsChange={(nextTaskGroupRuns) => {
            setTaskGroupRunsState((prev) => [
              ...prev.filter((run) => !reqTgIds.has(run.taskGroupId)),
              ...nextTaskGroupRuns,
            ]);
          }}
        />
      ) : null}

      {activeTab === "processing" ? (
        <RequirementDataProcessingPanel
          requirement={requirement}
          wideTables={reqWideTables}
          wideTableRecords={reqWideTableRecords}
          taskGroups={reqTaskGroups}
          fetchTasks={reqFetchTasks}
          scheduleJobs={reqTaskGroupRuns}
          onRequirementChange={handleRequirementChange}
          onRefreshData={refreshRequirementData}
        />
      ) : null}

      {activeTab === "acceptance" ? (
        <RequirementAcceptancePanel
          requirement={requirement}
          navSource={resolvedNavSource}
          wideTables={reqWideTables}
          wideTableRecords={reqWideTableRecords}
          taskGroups={reqTaskGroups}
          fetchTasks={reqFetchTasks}
          scheduleJobs={reqTaskGroupRuns}
          acceptanceTickets={acceptanceTicketsState.filter((t) => t.requirementId === requirement.id)}
          onRefreshData={refreshRequirementData}
          onWideTableRecordsChange={(nextWideTableRecords) => {
            setWideTableRecordsState((prev) => [
              ...prev.filter((record) => !reqWtIds.has(record.wideTableId)),
              ...nextWideTableRecords,
            ]);
          }}
          onTaskGroupsChange={(nextTaskGroups) => {
            setTaskGroupsState((prev) => [
              ...prev.filter((taskGroup) => !reqWtIds.has(taskGroup.wideTableId)),
              ...nextTaskGroups,
            ]);
          }}
          onFetchTasksChange={(nextFetchTasks) => {
            setFetchTasksState((prev) => [
              ...prev.filter((task) => !reqTgIds.has(task.taskGroupId)),
              ...nextFetchTasks,
            ]);
          }}
        />
      ) : null}
    </div>
  );
}

function TabLink({
  href,
  active,
  emphasized = false,
  disabled = false,
  badge,
  children,
}: {
  href: string;
  active: boolean;
  emphasized?: boolean;
  disabled?: boolean;
  badge?: string;
  children: React.ReactNode;
}) {
  const className = cn(
    "flex min-h-10 items-center justify-center rounded-lg px-3 py-2 text-center text-sm font-medium transition-colors",
    active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
    emphasized && !active ? "border border-amber-300 bg-amber-50 text-amber-900 shadow-sm ring-1 ring-amber-200/80" : "",
    disabled ? "cursor-not-allowed opacity-55 hover:bg-transparent hover:text-muted-foreground" : "",
  );

  const content = (
    <span className="inline-flex items-center gap-2">
      <span>{children}</span>
      {badge ? (
        <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
          {badge}
        </span>
      ) : null}
    </span>
  );

  if (disabled) {
    return <div className={className} aria-disabled="true">{content}</div>;
  }

  return (
    <Link href={href} className={className}>
      {content}
    </Link>
  );
}

function sanitizeProjectRequirementState(params: {
  wideTables: WideTable[];
  wideTableRecords: WideTableRecord[];
  taskGroups: TaskGroup[];
  fetchTasks: FetchTask[];
  scheduleJobs: ScheduleJob[];
}): {
  wideTables: WideTable[];
  wideTableRecords: WideTableRecord[];
  taskGroups: TaskGroup[];
  fetchTasks: FetchTask[];
  scheduleJobs: ScheduleJob[];
} {
  const dedupedWideTables = dedupeWideTables(params.wideTables);
  const keptWideTableIds = new Set(dedupedWideTables.map((wideTable) => wideTable.id));
  const wideTableMap = new Map(dedupedWideTables.map((wideTable) => [wideTable.id, wideTable]));
  const wideTableRecords = params.wideTableRecords
    .filter((record) => keptWideTableIds.has(record.wideTableId))
    .map((record) => normalizeLegacyRecordPlanVersion(record, wideTableMap.get(record.wideTableId)));
  const taskGroups = params.taskGroups
    .filter((taskGroup) => keptWideTableIds.has(taskGroup.wideTableId))
    .map((taskGroup) => normalizeLegacyTaskGroup(taskGroup, wideTableMap.get(taskGroup.wideTableId)));
  const taskGroupIds = new Set(taskGroups.map((taskGroup) => taskGroup.id));
  const taskGroupMap = new Map(taskGroups.map((taskGroup) => [taskGroup.id, taskGroup]));
  const fetchTasks = params.fetchTasks
    .filter((task) => keptWideTableIds.has(task.wideTableId) && taskGroupIds.has(task.taskGroupId))
    .map((task) => normalizeLegacyFetchTask(task, wideTableMap.get(task.wideTableId), taskGroupMap.get(task.taskGroupId)));
  const scheduleJobs = params.scheduleJobs.filter((job) => taskGroupIds.has(job.taskGroupId));

  return {
    wideTables: dedupedWideTables,
    wideTableRecords,
    taskGroups,
    fetchTasks,
    scheduleJobs,
  };
}

function normalizeLegacyRecordPlanVersion(
  record: WideTableRecord,
  wideTable?: WideTable,
): WideTableRecord {
  if (!wideTable || record._metadata?.planVersion != null || (wideTable.currentPlanVersion ?? 1) <= 1) {
    return record;
  }

  return {
    ...record,
    _metadata: {
      ...(record._metadata ?? {}),
      planVersion: 1,
    },
  };
}

function normalizeLegacyTaskGroup(
  taskGroup: TaskGroup,
  wideTable?: WideTable,
): TaskGroup {
  if (!wideTable) {
    return taskGroup;
  }

  const nextPlanVersion = taskGroup.planVersion ?? ((wideTable.currentPlanVersion ?? 1) > 1 ? 1 : undefined);
  const nextBusinessDateLabel = hasWideTableBusinessDateDimension(wideTable)
    ? formatBusinessDateLabel(taskGroup.businessDate, wideTable.businessDateRange.frequency)
    : taskGroup.partitionLabel ?? taskGroup.businessDateLabel;

  if (nextPlanVersion === taskGroup.planVersion && nextBusinessDateLabel === taskGroup.businessDateLabel) {
    return taskGroup;
  }

  return {
    ...taskGroup,
    planVersion: nextPlanVersion,
    businessDateLabel: nextBusinessDateLabel,
  };
}

function normalizeLegacyFetchTask(
  task: FetchTask,
  wideTable?: WideTable,
  taskGroup?: TaskGroup,
): FetchTask {
  if (task.planVersion != null) {
    return task;
  }

  const nextPlanVersion = taskGroup?.planVersion ?? ((wideTable?.currentPlanVersion ?? 1) > 1 ? 1 : undefined);
  if (nextPlanVersion == null) {
    return task;
  }

  return {
    ...task,
    planVersion: nextPlanVersion,
  };
}

function dedupeWideTables(wideTables: WideTable[]): WideTable[] {
  const deduped = new Map<string, WideTable>();

  for (const wideTable of wideTables) {
    const dedupeKey = wideTable.requirementId;
    const current = deduped.get(dedupeKey);
    if (!current || compareWideTablePriority(wideTable, current) < 0) {
      deduped.set(dedupeKey, wideTable);
    }
  }

  return Array.from(deduped.values());
}
function compareWideTablePriority(left: WideTable, right: WideTable): number {
  const leftStatus = wideTableStatusScore(left.status);
  const rightStatus = wideTableStatusScore(right.status);
  if (leftStatus !== rightStatus) {
    return rightStatus - leftStatus;
  }

  if (left.schema.columns.length !== right.schema.columns.length) {
    return right.schema.columns.length - left.schema.columns.length;
  }

  if (left.recordCount !== right.recordCount) {
    return right.recordCount - left.recordCount;
  }

  return left.createdAt.localeCompare(right.createdAt);
}

function wideTableStatusScore(status: WideTable["status"]): number {
  if (status === "active") {
    return 3;
  }
  if (status === "initialized") {
    return 2;
  }
  return 1;
}

