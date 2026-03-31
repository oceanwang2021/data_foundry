import { describe, expect, it } from "vitest";

import {
  buildBusinessDateSlots,
  normalizeBusinessDateToken,
  parseBusinessDate,
} from "@/lib/business-date";

describe("business-date legacy token normalization", () => {
  it("normalizes monthly and yearly tokens to period-end dates", () => {
    expect(normalizeBusinessDateToken("2025-12")).toBe("2025-12-31");
    expect(normalizeBusinessDateToken("2025")).toBe("2025-12-31");
  });

  it("parses quarter tokens as quarter-end dates", () => {
    const parsed = parseBusinessDate("2025-Q1");
    expect(parsed?.toISOString()).toBe("2025-03-31T00:00:00.000Z");
  });

  it("builds monthly slots from legacy month tokens", () => {
    expect(buildBusinessDateSlots({
      start: "2025-12",
      end: "2026-03",
      frequency: "monthly",
    })).toEqual([
      "2025-12-31",
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
    ]);
  });
});
