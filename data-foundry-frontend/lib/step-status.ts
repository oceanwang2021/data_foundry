import type {
  WideTable,
  WideTableRecord,
  TaskGroup,
  FetchTask,
} from "./types";

// ==================== 类型定义 ====================

export type StepId = "A" | "B" | "C" | "D";
export type StepStatus = "pending" | "completed" | "invalidated";
export type StepStatusMap = Record<StepId, StepStatus>;

// ==================== 常量 ====================

/** 依赖链定义：每个步骤的下游步骤 */
export const DOWNSTREAM_STEPS: Record<StepId, StepId[]> = {
  A: ["B", "C", "D"],
  B: [],
  C: ["D"],
  D: [],
};

/** 每个步骤的直接前置步骤 */
export const PREREQUISITE_STEP: Record<StepId, StepId | null> = {
  A: null,
  B: "A",
  C: "A",
  D: "C",
};

/** 步骤中文标签 */
export const STEP_LABELS: Record<StepId, string> = {
  A: "Schema 关联",
  B: "执行分组定义",
  C: "数据范围定义",
  D: "预览（可选）",
};

// ==================== 任务 1：核心状态管理函数 ====================

/** 初始化步骤状态：全部 pending */
export function initStepStatus(): StepStatusMap {
  return { A: "pending", B: "pending", C: "pending", D: "pending" };
}

/** 从已有 WideTable 数据推导步骤状态 */
export function deriveStepStatus(wideTable: WideTable): StepStatusMap {
  const statuses = initStepStatus();

  // Step A
  statuses.A = isStepAComplete(wideTable) ? "completed" : "pending";

  // Step B: requires A completed
  if (statuses.A === "completed" && isStepBComplete(wideTable)) {
    statuses.B = "completed";
  } else {
    statuses.B = "pending";
  }

  // Step C: requires A completed
  if (statuses.A === "completed" && isStepCComplete(wideTable)) {
    statuses.C = "completed";
  } else {
    statuses.C = "pending";
  }

  // Step D:
  // - persisted completed state must be recoverable after reload, so rely on backend fields
  // - local invalidated state is still represented by draft + bumped currentPlanVersion
  if (isStepDComplete(wideTable)) {
    statuses.D = "completed";
  } else if (
    wideTable.status === "draft" &&
    wideTable.currentPlanVersion !== undefined &&
    wideTable.currentPlanVersion > 0
  ) {
    statuses.D = "invalidated";
  } else {
    statuses.D = "pending";
  }

  return statuses;
}

/** 将指定步骤标记为 completed，返回新状态 */
export function completeStep(
  current: StepStatusMap,
  step: StepId,
): StepStatusMap {
  return { ...current, [step]: "completed" };
}

/** 触发上游变更，将所有下游步骤标记为 invalidated */
export function invalidateDownstream(
  current: StepStatusMap,
  changedStep: StepId,
): StepStatusMap {
  const next = { ...current };
  for (const downstream of DOWNSTREAM_STEPS[changedStep]) {
    next[downstream] = "invalidated";
  }
  return next;
}

/** 判断指定步骤是否可编辑 */
export function isStepEditable(
  statuses: StepStatusMap,
  step: StepId,
): boolean {
  const prereq = PREREQUISITE_STEP[step];
  // A has no prerequisite — always editable
  if (prereq === null) return true;
  // Other steps: editable only when direct prerequisite is completed
  return statuses[prereq] === "completed";
}

/** 判断是否需要弹出失效确认对话框 */
export function shouldConfirmInvalidation(
  statuses: StepStatusMap,
  changedStep: StepId,
): boolean {
  return DOWNSTREAM_STEPS[changedStep].some(
    (s) => statuses[s] === "completed",
  );
}

/** 获取将被失效的步骤列表（下游中状态为 completed 的步骤） */
export function getAffectedSteps(
  statuses: StepStatusMap,
  changedStep: StepId,
): StepId[] {
  return DOWNSTREAM_STEPS[changedStep].filter(
    (s) => statuses[s] === "completed",
  );
}

// ==================== 任务 2：步骤完成条件判定函数 ====================

/** 步骤 A 完成条件：schema 中有列 */
export function isStepAComplete(wideTable: WideTable): boolean {
  return wideTable.schema.columns.length > 0;
}

/** 步骤 B 完成条件：有指标组且所有 indicator 列均已分配；无 indicator 列时自动完成 */
export function isStepBComplete(wideTable: WideTable): boolean {
  const indicatorColumns = wideTable.schema.columns.filter(
    (col) => col.category === "indicator",
  );

  // No indicator columns → auto-completed
  if (indicatorColumns.length === 0) return true;

  // Must have at least one indicator group
  if (wideTable.indicatorGroups.length === 0) return false;

  // All indicator columns must be assigned to some indicator group
  const assignedColumns = new Set(
    wideTable.indicatorGroups.flatMap((g) => g.indicatorColumns),
  );
  return indicatorColumns.every((col) => assignedColumns.has(col.name));
}

/** 步骤 C 完成条件：所有非业务日期维度列有枚举值，且业务日期范围有效 */
export function isStepCComplete(wideTable: WideTable): boolean {
  const regularDimensionColumns = wideTable.schema.columns.filter(
    (col) => col.category === "dimension" && !col.isBusinessDate,
  );
  const hasTimeRange =
    Boolean(wideTable.businessDateRange.start?.trim())
    && Boolean(String(wideTable.businessDateRange.end ?? "").trim());

  if (!hasTimeRange) {
    return false;
  }

  if (regularDimensionColumns.length === 0) {
    return true;
  }

  const parameterRows = wideTable.parameterRows ?? [];
  if (parameterRows.length === 0) {
    return false;
  }

  return parameterRows.every((row) =>
    regularDimensionColumns.every((column) => {
      const value = row.values?.[column.name];
      return String(value ?? "").trim() !== "";
    }),
  );
}

/** 步骤 D 完成条件：status 为 initialized/active 且 planFingerprint 存在 */
export function isStepDComplete(wideTable: WideTable): boolean {
  return (
    (wideTable.status === "initialized" || wideTable.status === "active") &&
    wideTable.recordCount > 0
  );
}

// ==================== 任务 3：产物生命周期管理函数 ====================

/** 将匹配 wideTableId 和当前版本的 TaskGroup 标记为 stale */
export function markTaskGroupsAsStale(
  taskGroups: TaskGroup[],
  wideTableId: string,
  currentPlanVersion: number,
): TaskGroup[] {
  return taskGroups.map((tg) => {
    if (
      tg.wideTableId === wideTableId &&
      (tg.planVersion === currentPlanVersion || tg.planVersion === undefined)
    ) {
      return { ...tg, coverageStatus: "stale" as const };
    }
    return tg;
  });
}

/** 仅返回 planVersion 匹配当前版本的记录 */
export function filterCurrentVersionRecords(
  records: WideTableRecord[],
  currentPlanVersion: number,
): WideTableRecord[] {
  return records.filter(
    (r) => r._metadata?.planVersion === currentPlanVersion,
  );
}

/** 判断 TaskGroup 是否为归档状态（旧版本） */
export function isArchivedTaskGroup(
  taskGroup: TaskGroup,
  currentPlanVersion: number,
): boolean {
  return (
    taskGroup.planVersion !== undefined &&
    taskGroup.planVersion < currentPlanVersion
  );
}

/** 构建失效影响摘要：统计将被归档的产物数量 */
export function buildInvalidationImpactSummary(
  wideTable: WideTable,
  taskGroups: TaskGroup[],
  fetchTasks: FetchTask[],
): {
  taskGroupCount: number;
  fetchTaskCount: number;
  completedExecutionCount: number;
} {
  const currentVersion = wideTable.currentPlanVersion ?? 0;

  const affectedTaskGroups = taskGroups.filter(
    (tg) =>
      tg.wideTableId === wideTable.id &&
      (tg.planVersion === currentVersion || tg.planVersion === undefined),
  );

  const affectedTaskGroupIds = new Set(affectedTaskGroups.map((tg) => tg.id));

  const affectedFetchTasks = fetchTasks.filter(
    (ft) =>
      ft.wideTableId === wideTable.id &&
      affectedTaskGroupIds.has(ft.taskGroupId),
  );

  const completedExecutionCount = affectedFetchTasks.reduce(
    (count, ft) =>
      count +
      ft.executionRecords.filter((er) => er.status === "success").length,
    0,
  );

  return {
    taskGroupCount: affectedTaskGroups.length,
    fetchTaskCount: affectedFetchTasks.length,
    completedExecutionCount,
  };
}
