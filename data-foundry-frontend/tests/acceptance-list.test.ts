import { describe, expect, it } from "vitest";
import {
  buildAcceptanceRequirementRows,
  buildDefaultAcceptanceFilters,
  filterAcceptanceRequirementRows,
  filterTrialConfirmationRows,
  flattenAcceptanceCollectionTasks,
  resolveAcceptanceReviewStatus,
  type AcceptanceReviewStatus,
} from "@/lib/acceptance-list";
import type { AcceptanceTicket } from "@/lib/domain";
import type { FetchTask, Project, Requirement, TaskGroup, WideTable } from "@/lib/types";

function buildProject(): Project {
  return {
    id: "PROJ-001",
    name: "自动驾驶",
    description: "",
    status: "active",
    ownerTeam: "team",
    dataSource: {
      search: { engines: [], sites: [], sitePolicy: "preferred" },
      knowledgeBases: [],
      fixedUrls: [],
    },
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function buildRequirement(): Requirement {
  return {
    id: "REQ-2026-004",
    projectId: "PROJ-001",
    requirementType: "production",
    title: "自动驾驶安全月度采集",
    status: "running",
    owner: "张宁",
    assignee: "陈飞",
    businessGoal: "",
    wideTable: buildWideTable(),
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-05-29T14:44:42.000Z",
  };
}

function buildWideTable(): WideTable {
  return {
    id: "WT-AD-SAFE",
    requirementId: "REQ-2026-004",
    name: "自动驾驶安全宽表",
    description: "",
    schema: {
      columns: [
        { id: "mpi_takeover_miles", name: "mpi_takeover_miles", chineseName: "MPI接管里程", type: "NUMBER", category: "indicator", description: "", required: false },
        { id: "incident_rate", name: "incident_rate", chineseName: "事故率", type: "NUMBER", category: "indicator", description: "", required: false },
      ],
    },
    dimensionRanges: [],
    businessDateRange: { start: "2025-12", end: "never", frequency: "monthly" },
    indicatorGroups: [
      {
        id: "IG-AD-SAFE-MPI",
        wideTableId: "WT-AD-SAFE",
        name: "接管里程指标组",
        indicatorColumns: ["mpi_takeover_miles"],
        priority: 1,
        description: "",
      },
      {
        id: "IG-AD-SAFE-INCIDENT",
        wideTableId: "WT-AD-SAFE",
        name: "事故率指标组",
        indicatorColumns: ["incident_rate"],
        priority: 2,
        description: "",
      },
    ],
    recordCount: 22,
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function buildTaskGroups(): TaskGroup[] {
  const baseTaskGroup = {
    requirementId: "REQ-2026-004",
    wideTableId: "WT-AD-SAFE",
    batchId: "BATCH-001",
    partitionType: "business_date" as const,
    totalTasks: 1,
    pendingTasks: 0,
    runningTasks: 0,
    completedTasks: 1,
    failedTasks: 0,
    cancelledTasks: 0,
    invalidatedTasks: 0,
    triggeredBy: "manual" as const,
    createdAt: "2026-05-29T14:44:40.000Z",
  };

  return [
    {
      ...baseTaskGroup,
      id: "TG-MPI-202602",
      partitionKey: "IG-AD-SAFE-MPI",
      partitionLabel: "默认分组",
      businessDate: "2026-02-28",
      businessDateLabel: "2026-02-28",
      status: "completed",
      updatedAt: "2026-05-29T14:44:42.000Z",
    },
    {
      ...baseTaskGroup,
      id: "TG-MPI-202601",
      partitionKey: "IG-AD-SAFE-MPI",
      partitionLabel: "默认分组",
      businessDate: "2026-01-31",
      businessDateLabel: "2026-01-31",
      status: "partial",
      failedTasks: 1,
      updatedAt: "2026-05-29T14:44:41.000Z",
    },
    {
      ...baseTaskGroup,
      id: "TG-INC-202601",
      partitionKey: "IG-AD-SAFE-INCIDENT",
      partitionLabel: "事故率任务",
      businessDate: "2026-01-31",
      businessDateLabel: "2026-01-31",
      status: "completed",
      updatedAt: "2026-05-29T14:44:39.000Z",
    },
    {
      ...baseTaskGroup,
      id: "TG-RUN-202603",
      partitionKey: "IG-AD-SAFE-MPI",
      partitionLabel: "默认分组",
      businessDate: "2026-03-31",
      businessDateLabel: "2026-03-31",
      status: "running",
      runningTasks: 1,
      completedTasks: 0,
      updatedAt: "2026-05-29T14:44:45.000Z",
    },
    {
      ...baseTaskGroup,
      id: "TG-TRIAL-202601",
      partitionKey: "IG-AD-SAFE-MPI",
      partitionLabel: "试运行默认分组",
      businessDate: "2026-01-15",
      businessDateLabel: "2026-01-15",
      status: "completed",
      triggeredBy: "trial" as const,
      updatedAt: "2026-05-29T14:44:38.000Z",
    },
  ];
}

function buildFetchTasks(): FetchTask[] {
  const baseFetchTask = {
    wideTableId: "WT-AD-SAFE",
    batchId: "BATCH-001",
    rowId: 1,
    status: "completed" as const,
    executionRecords: [],
    createdAt: "2026-05-29T14:44:40.000Z",
    updatedAt: "2026-05-29T14:44:40.000Z",
  };

  return [
    {
      ...baseFetchTask,
      id: "FT-MPI-1",
      taskGroupId: "TG-MPI-202602",
      indicatorGroupId: "IG-AD-SAFE-MPI",
      indicatorGroupName: "接管里程指标组",
      indicatorKeys: ["mpi_takeover_miles"],
    },
    {
      ...baseFetchTask,
      id: "FT-MPI-2",
      taskGroupId: "TG-MPI-202601",
      indicatorGroupId: "IG-AD-SAFE-MPI",
      indicatorGroupName: "接管里程指标组",
      indicatorKeys: ["mpi_takeover_miles"],
    },
    {
      ...baseFetchTask,
      id: "FT-INC-1",
      taskGroupId: "TG-INC-202601",
      indicatorGroupId: "IG-AD-SAFE-INCIDENT",
      indicatorGroupName: "事故率指标组",
      indicatorKeys: ["incident_rate"],
    },
    {
      ...baseFetchTask,
      id: "FT-TRIAL-1",
      taskGroupId: "TG-TRIAL-202601",
      indicatorGroupId: "IG-AD-SAFE-MPI",
      indicatorGroupName: "接管里程指标组",
      indicatorKeys: ["mpi_takeover_miles"],
    },
  ];
}

function buildTickets(): AcceptanceTicket[] {
  return [
    {
      id: "AT-MPI-1",
      taskGroupId: "TG-MPI-202602",
      requirementId: "REQ-2026-004",
      dataset: "自动驾驶安全宽表(WT-AD-SAFE)",
      status: "approved",
      owner: "张宁",
      feedback: "",
      latestActionAt: "2026-05-30T11:00:00.000Z",
    },
    {
      id: "AT-MPI-2",
      taskGroupId: "TG-MPI-202601",
      requirementId: "REQ-2026-004",
      dataset: "自动驾驶安全宽表(WT-AD-SAFE)",
      status: "pending",
      owner: "张宁",
      feedback: "",
      latestActionAt: "2026-05-30T10:00:00.000Z",
    },
    {
      id: "AT-INC-1",
      taskGroupId: "TG-INC-202601",
      requirementId: "REQ-2026-004",
      dataset: "自动驾驶安全宽表(WT-AD-SAFE)",
      status: "approved",
      owner: "张宁",
      feedback: "",
      latestActionAt: "2026-05-30T09:00:00.000Z",
    },
  ];
}

describe("acceptance-list helpers", () => {
  it("groups reviewable task groups into acceptance collection tasks by requirement", () => {
    const rows = buildAcceptanceRequirementRows({
      projects: [buildProject()],
      requirements: [buildRequirement()],
      wideTables: [buildWideTable()],
      taskGroups: buildTaskGroups(),
      fetchTasks: buildFetchTasks(),
      tickets: buildTickets(),
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].collectionTasks).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      projectName: "自动驾驶",
      requirementTitle: "自动驾驶安全月度采集",
    });

    const formalRows = flattenAcceptanceCollectionTasks(rows, "formal");
    const trialRows = flattenAcceptanceCollectionTasks(rows, "trial");
    expect(formalRows).toHaveLength(2);
    expect(trialRows).toHaveLength(1);

    const mpiTask = formalRows.find((row) => row.collectionTaskKey === "IG-AD-SAFE-MPI");
    expect(mpiTask).toMatchObject({
      collectionTaskLabel: "默认分组",
      indicatorSummary: "1 个指标 | MPI接管里程",
      taskGroupCount: 2,
      reviewStatus: "partial_approved",
    });

    const incidentTask = formalRows.find((row) => row.collectionTaskKey === "IG-AD-SAFE-INCIDENT");
    expect(incidentTask?.reviewStatus).toBe("approved");
    expect(trialRows[0]).toMatchObject({
      collectionTaskLabel: "试运行默认分组",
      executionMode: "trial",
    });
  });

  it("filters formal acceptance rows separately from trial confirmation rows", () => {
    const rows = buildAcceptanceRequirementRows({
      projects: [buildProject()],
      requirements: [buildRequirement()],
      wideTables: [buildWideTable()],
      taskGroups: buildTaskGroups(),
      fetchTasks: buildFetchTasks(),
      tickets: buildTickets(),
    });
    const filters = buildDefaultAcceptanceFilters();

    const pendingRows = filterAcceptanceRequirementRows(rows, filters, "pending");
    expect(flattenAcceptanceCollectionTasks(pendingRows)).toHaveLength(0);

    const reviewedFilters = {
      ...filters,
      statuses: ["approved"] as AcceptanceReviewStatus[],
      taskKeyword: "事故率",
    };
    const reviewedRows = filterAcceptanceRequirementRows(rows, reviewedFilters, "reviewed");
    expect(flattenAcceptanceCollectionTasks(reviewedRows).map((row) => row.collectionTaskKey)).toEqual(["IG-AD-SAFE-INCIDENT"]);

    const partialFilters = {
      ...filters,
      statuses: ["partial_approved"] as AcceptanceReviewStatus[],
      taskKeyword: "默认分组",
    };
    const partialRows = filterAcceptanceRequirementRows(rows, partialFilters, "reviewed");
    expect(flattenAcceptanceCollectionTasks(partialRows).map((row) => row.collectionTaskKey)).toEqual(["IG-AD-SAFE-MPI"]);

    const trialFilters = {
      ...filters,
      keyword: "试运行",
      statuses: ["approved"] as AcceptanceReviewStatus[],
    };
    const trialRows = filterTrialConfirmationRows(rows, trialFilters);
    expect(flattenAcceptanceCollectionTasks(trialRows, "trial").map((row) => row.collectionTaskLabel)).toEqual(["试运行默认分组"]);
  });

  it("normalizes acceptance ticket status into page review status", () => {
    expect(resolveAcceptanceReviewStatus(undefined)).toBe("pending");
    expect(resolveAcceptanceReviewStatus({ status: "approved" })).toBe("approved");
    expect(resolveAcceptanceReviewStatus({ status: "partial_approved" })).toBe("partial_approved");
    expect(resolveAcceptanceReviewStatus({ status: "fixing" })).toBe("rejected");
  });
});
