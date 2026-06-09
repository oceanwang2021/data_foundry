import { describe, expect, it } from "vitest";

import {
  buildBusinessDateSlots,
  buildDefaultDateRange,
  businessDatePeriodEnd,
  formatBusinessDateForFrequency,
  normalizeBusinessDateForFrequency,
  normalizeBusinessDateToken,
} from "@/lib/business-date";

describe("canonical business date tokens", () => {
  it("preserves canonical tokens instead of converting them to period-end dates", () => {
    expect(normalizeBusinessDateToken("2025-12")).toBe("2025-12");
    expect(normalizeBusinessDateToken("2025-Q4")).toBe("2025-Q4");
    expect(normalizeBusinessDateToken("2025")).toBe("2025");
  });

  it("formats dates for all five frequencies", () => {
    const date = new Date(Date.UTC(2026, 5, 9));
    expect(formatBusinessDateForFrequency(date, "daily")).toBe("2026-06-09");
    expect(formatBusinessDateForFrequency(date, "weekly")).toBe("2026-W24");
    expect(formatBusinessDateForFrequency(date, "monthly")).toBe("2026-06");
    expect(formatBusinessDateForFrequency(date, "quarterly")).toBe("2026-Q2");
    expect(formatBusinessDateForFrequency(date, "yearly")).toBe("2026");
  });

  it("uses ISO week-based years across calendar-year boundaries", () => {
    expect(normalizeBusinessDateForFrequency("2025-12-29", "weekly")).toBe("2026-W01");
    expect(businessDatePeriodEnd("2026-W01", "weekly")?.toISOString())
      .toBe("2026-01-04T00:00:00.000Z");
  });

  it("rejects nonexistent ISO weeks", () => {
    expect(normalizeBusinessDateForFrequency("2025-W53", "weekly")).toBe("");
    expect(normalizeBusinessDateForFrequency("2026-W54", "weekly")).toBe("");
  });

  it("builds canonical slots for daily, weekly, monthly, quarterly and yearly ranges", () => {
    expect(buildBusinessDateSlots({
      start: "2026-06-08",
      end: "2026-06-10",
      frequency: "daily",
    })).toEqual(["2026-06-08", "2026-06-09", "2026-06-10"]);

    expect(buildBusinessDateSlots({
      start: "2025-W52",
      end: "2026-W02",
      frequency: "weekly",
    })).toEqual(["2025-W52", "2026-W01", "2026-W02"]);

    expect(buildBusinessDateSlots({
      start: "2025-12",
      end: "2026-02",
      frequency: "monthly",
    })).toEqual(["2025-12", "2026-01", "2026-02"]);

    expect(buildBusinessDateSlots({
      start: "2025-Q4",
      end: "2026-Q2",
      frequency: "quarterly",
    })).toEqual(["2025-Q4", "2026-Q1", "2026-Q2"]);

    expect(buildBusinessDateSlots({
      start: "2024",
      end: "2026",
      frequency: "yearly",
    })).toEqual(["2024", "2025", "2026"]);
  });

  it("builds a canonical current ISO week default", () => {
    expect(buildDefaultDateRange(
      "weekly",
      new Date(Date.UTC(2025, 11, 29)),
    )).toEqual({ start: "2026-W01", end: "2026-W01" });
  });
});
