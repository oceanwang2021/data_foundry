import type { Requirement, RequirementDataUpdateMode, WideTable } from "./types";

export function inferRequirementDataUpdateMode(
  wideTable?: Pick<WideTable, "schema">,
): RequirementDataUpdateMode | null {
  // Deprecated: dataUpdateMode is now a user selection, not inferred from schema.
  return null;
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
  return requirement.dataUpdateMode ?? null;
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
