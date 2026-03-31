import { describe, expect, it } from "vitest";
import {
  canShowTaskGroupRunAction,
  isLocalTaskGroupId,
  isLocalTaskId,
} from "@/lib/requirement-task-group-actions";

describe("task group action visibility", () => {
  it("shows the execute action for demo planned task groups", () => {
    expect(canShowTaskGroupRunAction({
      id: "tg_planned_2026-02-28",
      isReal: false,
      displayStatus: "pending",
      requirementType: "demo",
    })).toBe(true);
  });

  it("keeps production planned task groups non-runnable", () => {
    expect(canShowTaskGroupRunAction({
      id: "tg_planned_2026-02-28",
      isReal: false,
      displayStatus: "pending",
      requirementType: "production",
    })).toBe(false);
  });
});

describe("local task identifiers", () => {
  it("recognizes planned task-group and local task ids", () => {
    expect(isLocalTaskGroupId("tg_planned_2026-02-28")).toBe(true);
    expect(isLocalTaskId("ft_local_tg_planned_2026-02-28_ig_1_1001")).toBe(true);
  });
});
