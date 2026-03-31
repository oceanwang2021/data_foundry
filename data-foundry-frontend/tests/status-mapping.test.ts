import { describe, it, expect } from "vitest";
import { mapFetchTaskStatus, mapTaskGroup, mapTaskGroupStatus } from "@/lib/api-client";

describe("mapFetchTaskStatus", () => {
  it("maps pending to pending", () => {
    expect(mapFetchTaskStatus("pending")).toBe("pending");
  });
  it("maps running to running", () => {
    expect(mapFetchTaskStatus("running")).toBe("running");
  });
  it("maps completed to completed", () => {
    expect(mapFetchTaskStatus("completed")).toBe("completed");
  });
  it("maps failed to failed", () => {
    expect(mapFetchTaskStatus("failed")).toBe("failed");
  });
  it("maps invalidated to invalidated", () => {
    expect(mapFetchTaskStatus("invalidated")).toBe("invalidated");
  });
  it("defaults unknown status to pending", () => {
    expect(mapFetchTaskStatus("unknown")).toBe("pending");
  });
});

describe("mapTaskGroupStatus", () => {
  it("maps pending to pending", () => {
    expect(mapTaskGroupStatus("pending")).toBe("pending");
  });
  it("maps running to running", () => {
    expect(mapTaskGroupStatus("running")).toBe("running");
  });
  it("maps partial to partial", () => {
    expect(mapTaskGroupStatus("partial")).toBe("partial");
  });
  it("maps completed to completed", () => {
    expect(mapTaskGroupStatus("completed")).toBe("completed");
  });
  it("maps invalidated to invalidated", () => {
    expect(mapTaskGroupStatus("invalidated")).toBe("invalidated");
  });
  it("defaults unknown status to pending", () => {
    expect(mapTaskGroupStatus("unknown")).toBe("pending");
  });
});

describe("mapTaskGroup", () => {
  it("maps row snapshots into frontend task group records", () => {
    const taskGroup = mapTaskGroup({
      id: "TG-WT-AD-OPS-20260327",
      wide_table_id: "WT-AD-OPS",
      business_date: null,
      batch_id: "CB-WT-AD-OPS-20260327",
      source_type: "scheduled",
      status: "completed",
      partition_type: "full_table",
      partition_key: "full_table",
      partition_label: "2026-03-27",
      total_tasks: 5,
      completed_tasks: 5,
      failed_tasks: 0,
      triggered_by: "schedule",
      created_at: "2026-03-27T13:56:46.037402",
      updated_at: "2026-03-27T13:56:46.045714",
      row_snapshots: [
        {
          row_id: 1,
          wide_table_id: "WT-AD-OPS",
          business_date: null,
          dimension_values: { company: "Waymo" },
          indicator_values: {
            order_volume: {
              value: 12128,
              source_link: "https://waymo.com/",
            },
          },
          system_values: {
            row_status: "completed",
          },
          plan_version: 1,
        },
      ],
    });

    expect(taskGroup.rowSnapshots).toHaveLength(1);
    expect(taskGroup.rowSnapshots?.[0]?.ROW_ID).toBe(1);
    expect(taskGroup.rowSnapshots?.[0]?.company).toBe("Waymo");
    expect(taskGroup.rowSnapshots?.[0]?.order_volume).toBe(12128);
  });
});
