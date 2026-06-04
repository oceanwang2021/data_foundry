import {
  resolveRequirementDataUpdateMode,
} from "@/lib/requirement-data-update";
import {
  hasWideTableBusinessDateDimension,
  normalizeWideTableMode,
} from "@/lib/wide-table-mode";
import {
  buildDefaultDateRange,
} from "@/lib/business-date";
import type {
  Requirement,
  WideTable,
} from "@/lib/types";
import type { StepStatus } from "@/lib/step-status";
import { UNLINKED_DATA_TABLE_NAME } from "./requirementDefinitionConstants";

export function cloneWideTable(wideTable: WideTable): WideTable {
  return {
    ...wideTable,
    schema: {
      columns: wideTable.schema.columns.map((column) => ({ ...column })),
    },
    dimensionRanges: wideTable.dimensionRanges.map((range) => ({
      ...range,
      values: [...range.values],
    })),
    businessDateRange: {
      ...wideTable.businessDateRange,
    },
    indicatorGroups: wideTable.indicatorGroups.map((group) => ({
      ...group,
      indicatorColumns: [...group.indicatorColumns],
    })),
    scheduleRule: wideTable.scheduleRule ? { ...wideTable.scheduleRule } : undefined,
  };
}

export function deriveDataUpdateSectionStatus(
  requirement: Requirement,
  wideTable?: WideTable,
): StepStatus {
  if (requirement.dataUpdateEnabled == null) {
    return "pending";
  }

  if (requirement.dataUpdateEnabled === false) {
    return "completed";
  }

  const resolvedMode = resolveRequirementDataUpdateMode(requirement, wideTable);
  if (!resolvedMode || !wideTable?.scheduleRule) {
    return "pending";
  }

  if (resolvedMode === "incremental" && !hasWideTableBusinessDateDimension(wideTable)) {
    return "invalidated";
  }

  return "completed";
}

export function parseMultilineList(value: string): string[] {
  return value
    .split(/\n/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function buildDraftWideTable(requirementId: string): WideTable {
  const timestamp = Date.now();
  return normalizeWideTableMode({
    id: `wt_${requirementId}_${timestamp}`,
    requirementId,
    name: UNLINKED_DATA_TABLE_NAME,
    description: "请选择要关联的数据表 Schema。",
    schema: {
      columns: [],
    },
    dimensionRanges: [],
    businessDateRange: {
      ...buildDefaultDateRange("monthly"),
      frequency: "monthly",
    },
    indicatorGroups: [],
    recordCount: 0,
    status: "draft",
    createdAt: new Date(timestamp).toISOString(),
    updatedAt: new Date(timestamp).toISOString(),
  });
}

export function isTransientDraftWideTable(requirementId: string, wideTableId: string): boolean {
  return wideTableId.startsWith(`wt_${requirementId}_`);
}
