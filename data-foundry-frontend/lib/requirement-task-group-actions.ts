import type { Requirement } from "@/lib/types";

export const LOCAL_TASK_GROUP_PREFIX = "tg_planned_";
export const LOCAL_FETCH_TASK_PREFIX = "ft_local_";

export function isLocalTaskGroupId(taskGroupId: string): boolean {
  return taskGroupId.startsWith(LOCAL_TASK_GROUP_PREFIX);
}

export function isLocalTaskId(taskId: string): boolean {
  return taskId.startsWith(LOCAL_FETCH_TASK_PREFIX);
}

export function canShowTaskGroupRunAction(params: {
  id: string;
  isReal: boolean;
  displayStatus: string;
  requirementType: Requirement["requirementType"];
}): boolean {
  const { id, isReal, displayStatus, requirementType } = params;

  if (requirementType === "demo") {
    const runnableStatuses = new Set(["pending", "invalidated", "running", "completed", "partial"]);
    return (isReal || isLocalTaskGroupId(id)) && runnableStatuses.has(displayStatus);
  }

  return isReal && (displayStatus === "completed" || displayStatus === "partial");
}
