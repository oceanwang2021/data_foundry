import type { Requirement, RequirementDataUpdateMode, WideTable } from "./types";
import { hasWideTableBusinessDateDimension } from "./wide-table-mode";

export function inferRequirementDataUpdateMode(
  wideTable?: Pick<WideTable, "schema">,
): RequirementDataUpdateMode | null {
  if (!wideTable) {
    return null;
  }

  return hasWideTableBusinessDateDimension(wideTable) ? "incremental" : "full";
}

export function resolveRequirementDataUpdateEnabled(
  requirement: Pick<Requirement, "dataUpdateEnabled">,
): boolean {
  return requirement.dataUpdateEnabled === true;
}

export function resolveRequirementDataUpdateMode(
  requirement: Pick<Requirement, "dataUpdateMode">,
  wideTable?: Pick<WideTable, "schema">,
): RequirementDataUpdateMode | null {
  return requirement.dataUpdateMode ?? inferRequirementDataUpdateMode(wideTable);
}

export function formatRequirementDataUpdateMode(
  mode: RequirementDataUpdateMode | null | undefined,
): string {
  if (mode === "full") {
    return "全量更新";
  }
  if (mode === "incremental") {
    return "增量更新";
  }
  return "未配置";
}
