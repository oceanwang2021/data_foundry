import type { AcceptanceTicket } from "./domain";
import {
  buildCollectionTaskListRows,
  type CollectionTaskExecutionMode,
  type CollectionTaskListRowView,
} from "./collection-task-list-view";
import type { FetchTask, Project, Requirement, TaskGroup, WideTable } from "./types";

export type AcceptanceReviewStatus = "pending" | "approved" | "partial_approved" | "rejected";
export type AcceptanceListType = "pending" | "reviewed";
export type AcceptanceExecutionMode = "formal" | "trial";

export type AcceptanceFilters = {
  keyword: string;
  projectId: string;
  owner: string;
  assignee: string;
  taskKeyword: string;
  statuses: AcceptanceReviewStatus[];
};

export type AcceptanceCollectionTaskRow = {
  key: string;
  collectionTaskKey: string;
  collectionTaskLabel: string;
  executionMode: CollectionTaskExecutionMode;
  requirementId: string;
  requirementTitle: string;
  projectId: string;
  projectName: string;
  owner: string;
  assignee: string;
  wideTableId: string;
  wideTableName: string;
  indicatorNames: string[];
  indicatorCount: number;
  indicatorSummary: string;
  taskGroups: TaskGroup[];
  taskGroupCount: number;
  fetchTaskCount: number;
  reviewStatus: AcceptanceReviewStatus;
  updatedAt: string;
};

export type AcceptanceRequirementRow = {
  requirementId: string;
  requirementTitle: string;
  projectId: string;
  projectName: string;
  owner: string;
  assignee: string;
  collectionTasks: AcceptanceCollectionTaskRow[];
  updatedAt: string;
};

export function buildDefaultAcceptanceFilters(): AcceptanceFilters {
  return {
    keyword: "",
    projectId: "",
    owner: "",
    assignee: "",
    taskKeyword: "",
    statuses: [],
  };
}

export function resolveAcceptanceReviewStatus(
  ticket?: Pick<AcceptanceTicket, "status"> | null,
): AcceptanceReviewStatus {
  if (ticket?.status === "approved") {
    return "approved";
  }
  if (ticket?.status === "partial_approved") {
    return "partial_approved";
  }
  if (ticket?.status === "rejected" || ticket?.status === "fixing" || ticket?.status === "publish_failed") {
    return "rejected";
  }
  return "pending";
}

export function buildAcceptanceRequirementRows(params: {
  projects: Project[];
  requirements: Requirement[];
  wideTables: WideTable[];
  taskGroups: TaskGroup[];
  fetchTasks: FetchTask[];
  tickets: AcceptanceTicket[];
}): AcceptanceRequirementRow[] {
  const collectionTaskRows = buildCollectionTaskListRows({
    projects: params.projects,
    requirements: params.requirements,
    wideTables: params.wideTables,
    taskGroups: params.taskGroups.filter((taskGroup) => taskGroup.status === "completed" || taskGroup.status === "partial"),
    fetchTasks: params.fetchTasks,
  });
  const ticketByTaskGroupId = new Map(
    params.tickets
      .filter((ticket) => ticket.taskGroupId)
      .map((ticket) => [ticket.taskGroupId, ticket] as const),
  );
  const grouped = new Map<string, AcceptanceRequirementRow>();

  for (const collectionTaskRow of collectionTaskRows) {
    const reviewStatus = aggregateCollectionTaskReviewStatus(collectionTaskRow, ticketByTaskGroupId);
    const updatedAt = resolveCollectionTaskUpdatedAt(collectionTaskRow, ticketByTaskGroupId);
    const nextCollectionTask: AcceptanceCollectionTaskRow = {
      key: collectionTaskRow.key,
      collectionTaskKey: collectionTaskRow.collectionTaskKey,
      collectionTaskLabel: collectionTaskRow.collectionTaskLabel,
      executionMode: collectionTaskRow.executionMode,
      requirementId: collectionTaskRow.requirementId,
      requirementTitle: collectionTaskRow.requirementTitle,
      projectId: collectionTaskRow.projectId,
      projectName: collectionTaskRow.projectName,
      owner: resolveRequirementOwner(params.requirements, collectionTaskRow.requirementId),
      assignee: resolveRequirementAssignee(params.requirements, collectionTaskRow.requirementId),
      wideTableId: collectionTaskRow.wideTableId,
      wideTableName: collectionTaskRow.wideTableName,
      indicatorNames: collectionTaskRow.indicatorNames,
      indicatorCount: collectionTaskRow.indicatorCount,
      indicatorSummary: collectionTaskRow.indicatorSummary,
      taskGroups: collectionTaskRow.taskGroups,
      taskGroupCount: collectionTaskRow.taskGroupCount,
      fetchTaskCount: collectionTaskRow.fetchTaskCount,
      reviewStatus,
      updatedAt,
    };

    const existing = grouped.get(collectionTaskRow.requirementId);
    if (existing) {
      existing.collectionTasks.push(nextCollectionTask);
      existing.updatedAt = [existing.updatedAt, updatedAt].sort((left, right) => right.localeCompare(left))[0] ?? existing.updatedAt;
      continue;
    }

    grouped.set(collectionTaskRow.requirementId, {
      requirementId: collectionTaskRow.requirementId,
      requirementTitle: collectionTaskRow.requirementTitle,
      projectId: collectionTaskRow.projectId,
      projectName: collectionTaskRow.projectName,
      owner: nextCollectionTask.owner,
      assignee: nextCollectionTask.assignee,
      collectionTasks: [nextCollectionTask],
      updatedAt,
    });
  }

  return Array.from(grouped.values())
    .map((row) => ({
      ...row,
      collectionTasks: [...row.collectionTasks].sort((left, right) => {
        if (left.updatedAt !== right.updatedAt) {
          return right.updatedAt.localeCompare(left.updatedAt);
        }
        return left.collectionTaskLabel.localeCompare(right.collectionTaskLabel, "zh-Hans-CN");
      }),
    }))
    .sort((left, right) => {
      if (left.updatedAt !== right.updatedAt) {
        return right.updatedAt.localeCompare(left.updatedAt);
      }
      if (left.projectName !== right.projectName) {
        return left.projectName.localeCompare(right.projectName, "zh-Hans-CN");
      }
      return left.requirementTitle.localeCompare(right.requirementTitle, "zh-Hans-CN");
    });
}

export function filterAcceptanceRequirementRows(
  rows: AcceptanceRequirementRow[],
  filters: AcceptanceFilters,
  listType: AcceptanceListType,
): AcceptanceRequirementRow[] {
  return filterRequirementRows(rows, filters, (collectionTask) =>
    collectionTask.executionMode === "formal"
    && isCollectionTaskInList(collectionTask, listType)
    && matchesStatuses(collectionTask.reviewStatus, filters.statuses),
  );
}

export function filterTrialConfirmationRows(
  rows: AcceptanceRequirementRow[],
  filters: AcceptanceFilters,
): AcceptanceRequirementRow[] {
  return filterRequirementRows(rows, filters, (collectionTask) => collectionTask.executionMode === "trial");
}

export function flattenAcceptanceCollectionTasks(
  rows: AcceptanceRequirementRow[],
  executionMode?: AcceptanceExecutionMode,
): AcceptanceCollectionTaskRow[] {
  const collectionTasks = rows.flatMap((row) => row.collectionTasks);
  if (!executionMode) {
    return collectionTasks;
  }
  return collectionTasks.filter((row) => row.executionMode === executionMode);
}

function filterRequirementRows(
  rows: AcceptanceRequirementRow[],
  filters: AcceptanceFilters,
  predicate: (collectionTask: AcceptanceCollectionTaskRow) => boolean,
): AcceptanceRequirementRow[] {
  return rows
    .filter((row) => matchesProject(row, filters.projectId))
    .filter((row) => matchesField(row.owner, filters.owner))
    .filter((row) => matchesField(row.assignee, filters.assignee))
    .map((row) => {
      const matchesRequirementKeyword = matchesRequirementKeywordText(row, filters.keyword);
      const collectionTasks = row.collectionTasks
        .filter((collectionTask) => predicate(collectionTask))
        .filter((collectionTask) => matchesTaskKeyword(collectionTask, filters.taskKeyword))
        .filter((collectionTask) => {
          if (normalizeText(filters.keyword) === "") {
            return true;
          }
          return matchesRequirementKeyword || matchesCollectionTaskKeyword(collectionTask, filters.keyword);
        });

      return {
        ...row,
        collectionTasks,
        updatedAt: collectionTasks[0]?.updatedAt ?? row.updatedAt,
      };
    })
    .filter((row) => row.collectionTasks.length > 0)
    .sort((left, right) => {
      if (left.updatedAt !== right.updatedAt) {
        return right.updatedAt.localeCompare(left.updatedAt);
      }
      return left.requirementTitle.localeCompare(right.requirementTitle, "zh-Hans-CN");
    });
}

function resolveRequirementOwner(requirements: Requirement[], requirementId: string): string {
  return requirements.find((requirement) => requirement.id === requirementId)?.owner ?? "";
}

function resolveRequirementAssignee(requirements: Requirement[], requirementId: string): string {
  return requirements.find((requirement) => requirement.id === requirementId)?.assignee ?? "";
}

function aggregateCollectionTaskReviewStatus(
  row: CollectionTaskListRowView,
  ticketByTaskGroupId: Map<string, AcceptanceTicket>,
): AcceptanceReviewStatus {
  const statuses = row.taskGroups.map((taskGroup) => resolveAcceptanceReviewStatus(ticketByTaskGroupId.get(taskGroup.id)));
  if (statuses.length === 0) {
    return "pending";
  }
  if (statuses.every((status) => status === "approved")) {
    return "approved";
  }
  if (statuses.every((status) => status === "rejected")) {
    return "rejected";
  }
  if (statuses.every((status) => status === "pending")) {
    return "pending";
  }
  return "partial_approved";
}

function resolveCollectionTaskUpdatedAt(
  row: CollectionTaskListRowView,
  ticketByTaskGroupId: Map<string, AcceptanceTicket>,
): string {
  const ticketTimes = row.taskGroups
    .map((taskGroup) => ticketByTaskGroupId.get(taskGroup.id)?.latestActionAt ?? "")
    .filter((value) => value.trim() !== "");
  if (ticketTimes.length > 0) {
    return [...ticketTimes].sort((left, right) => right.localeCompare(left))[0];
  }
  return row.lastUpdatedAt;
}

function isCollectionTaskInList(row: AcceptanceCollectionTaskRow, listType: AcceptanceListType): boolean {
  return listType === "pending" ? row.reviewStatus === "pending" : row.reviewStatus !== "pending";
}

function matchesProject(row: AcceptanceRequirementRow, projectId: string): boolean {
  return projectId.trim() === "" || row.projectId === projectId;
}

function matchesField(fieldValue: string, input: string): boolean {
  const keyword = normalizeText(input);
  if (keyword === "") {
    return true;
  }
  return normalizeText(fieldValue).includes(keyword);
}

function matchesStatuses(status: AcceptanceReviewStatus, statuses: AcceptanceReviewStatus[]): boolean {
  return statuses.length === 0 || statuses.includes(status);
}

function matchesRequirementKeywordText(row: AcceptanceRequirementRow, keyword: string): boolean {
  const normalizedKeyword = normalizeText(keyword);
  if (normalizedKeyword === "") {
    return true;
  }
  return [
    row.requirementTitle,
    row.requirementId,
    row.projectName,
    row.projectId,
    row.owner,
    row.assignee,
  ].some((value) => normalizeText(value).includes(normalizedKeyword));
}

function matchesCollectionTaskKeyword(row: AcceptanceCollectionTaskRow, keyword: string): boolean {
  const normalizedKeyword = normalizeText(keyword);
  if (normalizedKeyword === "") {
    return true;
  }
  return [
    row.collectionTaskLabel,
    row.collectionTaskKey,
    row.wideTableName,
    row.wideTableId,
    row.indicatorSummary,
    ...row.indicatorNames,
    ...row.taskGroups.map((taskGroup) => taskGroup.id),
    ...row.taskGroups.map((taskGroup) => taskGroup.businessDateLabel ?? taskGroup.businessDate ?? ""),
  ].some((value) => normalizeText(value).includes(normalizedKeyword));
}

function matchesTaskKeyword(row: AcceptanceCollectionTaskRow, keyword: string): boolean {
  return matchesCollectionTaskKeyword(row, keyword);
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}
