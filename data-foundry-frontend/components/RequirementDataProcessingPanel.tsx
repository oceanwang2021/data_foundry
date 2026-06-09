"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  fetchPreprocessRules,
  fetchTaskGroupResults,
  fetchTaskResults,
  fetchMetricFieldMappings,
  generateMetricFieldMappings,
  materializeMappedResults,
  fetchWideTableResults,
  normalizeFinalReport,
  normalizeTaskGroupFinalReports,
  normalizeWideTableFinalReports,
  updateMetricFieldMapping,
} from "@/lib/api-client";
import type {
  ColumnDefinition,
  CollectionResult,
  FetchTask,
  MetricFieldMapping,
  Requirement,
  TaskGroup,
  WideTable,
  WideTableRecord,
} from "@/lib/types";
import type { PreprocessRule, ScheduleJob } from "@/lib/domain";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import FetchTaskDetailPopup from "@/components/FetchTaskDetailPopup";
import {
  buildFetchTaskCardViews,
  getVisibleNarrowTableContextColumns,
  type FetchTaskCardView,
  type FetchTaskReturnRowView,
} from "@/lib/fetch-task-views";
import {
  buildWideTableProcessingDiffRowMap,
  buildWideTableProcessingRows,
  buildWideTableProcessingViews,
  type WideTableProcessingRow,
} from "@/lib/requirement-data-pipeline";
import { cn } from "@/lib/utils";
import { getWideTableDimensionBindingKey } from "@/lib/wide-table-preview";
import {
  extractBusinessDateMonth,
  extractBusinessDateYear,
  formatBusinessDateForFrequency,
  limitFutureBusinessDates,
  pickDefaultBusinessYear,
} from "@/lib/business-date";
import {
  resolveCurrentPlanVersion,
  resolveRecordPlanVersion,
  resolveTaskGroupPlanVersion,
} from "@/lib/task-plan-reconciliation";
import {
  fillIndicator,
  FILLING_RULES,
  SEMANTIC_KIND_LABELS,
  type IndicatorFillingResult,
  type FillingStatus,
} from "@/lib/indicator-filling";
import {
  getTaskBlockSurfaceClass,
  getTaskStatusRailFillColor,
} from "@/lib/task-status-presentation";
import { hasWideTableBusinessDateDimension } from "@/lib/wide-table-mode";
import {
  buildDisplayableFullSnapshotTaskGroupPages,
  type FullSnapshotTaskGroupPage,
} from "@/lib/task-group-display";

function snapshotPageKey(page: FullSnapshotTaskGroupPage): string {
  return page.scheduleJobId ?? page.taskGroupId;
}

type Props = {
  requirement: Requirement;
  wideTables: WideTable[];
  wideTableRecords: WideTableRecord[];
  taskGroups: TaskGroup[];
  fetchTasks: FetchTask[];
  scheduleJobs: ScheduleJob[];
  onRequirementChange?: (requirement: Requirement) => void;
  onRefreshData?: () => Promise<void>;
};

type IndicatorGroupLike = {
  id: string;
  name: string;
  indicatorColumns: string[];
  priority: number;
};

type ToneDefinition = {
  badge: string;
  header: string;
  filledCell: string;
  emptyCell: string;
};

type SelectedTaskModalState = {
  wideTable: WideTable;
  taskGroup: TaskGroup;
  taskCard: FetchTaskCardView;
};

type SelectedIndicatorValueModalState = {
  wideTable: WideTable;
  taskGroup: TaskGroup;
  taskRowLabel: string;
  returnRow: FetchTaskReturnRowView;
  fillingResult: IndicatorFillingResult;
};

type NarrowTableDisplayRow = {
  key: string;
  taskRowLabel: string;
  taskStatus: FetchTask["status"];
  taskOrder: number;
  taskRowIndex: number;
  taskRowCount: number;
  returnRow: FetchTaskReturnRowView;
  fillingResult: IndicatorFillingResult | null;
  taskCard: FetchTaskCardView;
};

const fillingStatusLabel: Record<FillingStatus, string> = {
  filled: "已填充",
  low_confidence: "待人工确认",
  null_mapped: "空值映射",
  error: "解析失败",
};

const fillingStatusColor: Record<FillingStatus, string> = {
  filled: "text-emerald-700 bg-emerald-50 border-emerald-200",
  low_confidence: "text-amber-700 bg-amber-50 border-amber-200",
  null_mapped: "text-slate-600 bg-slate-50 border-slate-200",
  error: "text-red-700 bg-red-50 border-red-200",
};

const TASK_RANGE_TONES: ToneDefinition[] = [
  {
    badge: "border-sky-200 bg-sky-50 text-sky-700",
    header: "bg-sky-100/80",
    filledCell: "bg-sky-50/85 text-slate-900 hover:bg-sky-100/90",
    emptyCell: "bg-sky-50/45 text-muted-foreground hover:bg-sky-100/75",
  },
  {
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
    header: "bg-emerald-100/75",
    filledCell: "bg-emerald-50/85 text-slate-900 hover:bg-emerald-100/90",
    emptyCell: "bg-emerald-50/45 text-muted-foreground hover:bg-emerald-100/75",
  },
  {
    badge: "border-orange-200 bg-orange-50 text-orange-700",
    header: "bg-orange-100/75",
    filledCell: "bg-orange-50/85 text-slate-900 hover:bg-orange-100/90",
    emptyCell: "bg-orange-50/45 text-muted-foreground hover:bg-orange-100/75",
  },
  {
    badge: "border-rose-200 bg-rose-50 text-rose-700",
    header: "bg-rose-100/75",
    filledCell: "bg-rose-50/85 text-slate-900 hover:bg-rose-100/90",
    emptyCell: "bg-rose-50/45 text-muted-foreground hover:bg-rose-100/75",
  },
  {
    badge: "border-violet-200 bg-violet-50 text-violet-700",
    header: "bg-violet-100/75",
    filledCell: "bg-violet-50/85 text-slate-900 hover:bg-violet-100/90",
    emptyCell: "bg-violet-50/45 text-muted-foreground hover:bg-violet-100/75",
  },
  {
    badge: "border-cyan-200 bg-cyan-50 text-cyan-700",
    header: "bg-cyan-100/75",
    filledCell: "bg-cyan-50/85 text-slate-900 hover:bg-cyan-100/90",
    emptyCell: "bg-cyan-50/45 text-muted-foreground hover:bg-cyan-100/75",
  },
];

function buildRequirementPreprocessRules(requirement: Requirement): PreprocessRule[] {
  if (requirement.projectId === "PROJ-001" && requirement.id === "REQ-2026-001") {
    return [
      {
        id: "PR-OPS-DEMO-001", name: "车队规模统一为整数辆数", source: "platform", enabled: true,
        category: "format_fix", expression: "integer_cast(fleet_size)",
        sampleIssue: "1,159 辆、200台 需要统一为整数",
        indicatorBindings: [{ wideTableId: "WT-AD-OPS", indicatorColumnName: "fleet_size", indicatorLabel: "车队数量" }],
      },
      {
        id: "PR-OPS-DEMO-002", name: "运营里程去掉千分位与文本噪音", source: "platform", enabled: true,
        category: "format_fix", expression: "number_cast(operating_mileage)",
        sampleIssue: "「3,350」「3350公里」需要保留纯数值",
        indicatorBindings: [{ wideTableId: "WT-AD-OPS", indicatorColumnName: "operating_mileage", indicatorLabel: "运营里程" }],
      },
      {
        id: "PR-OPS-DEMO-003", name: "订单数量剥离万单后缀", source: "business", enabled: true,
        category: "format_fix", expression: "strip_suffix(order_count, ['万单','单'])",
        sampleIssue: "「45.2万单」「109.5万单」需要保留纯数值",
        indicatorBindings: [{ wideTableId: "WT-AD-OPS", indicatorColumnName: "order_count", indicatorLabel: "订单数量" }],
      },
    ];
  }
  return [];
}

type DataSubTab = "raw" | "mapping" | "wide";

const dataSubTabMeta: Record<DataSubTab, { title: string; description: string }> = {
  raw: {
    title: "采集明细",
    description: "按任务维度转换 normalized_rows_json",
  },
  mapping: {
    title: "指标映射",
    description: "确认指标到宽表字段",
  },
  wide: {
    title: "结果预览",
    description: "按映射生成回填预览",
  },
};

const dataSubTabs: DataSubTab[] = ["raw", "mapping", "wide"];

export default function RequirementDataProcessingPanel({
  requirement,
  wideTables,
  wideTableRecords,
  taskGroups,
  fetchTasks,
  scheduleJobs,
  onRequirementChange,
  onRefreshData,
}: Props) {
  const [rules, setRules] = useState<PreprocessRule[]>(() => buildRequirementPreprocessRules(requirement));

  useEffect(() => {
    if (rules.length === 0) {
      fetchPreprocessRules()
        .then((apiRules) => {
          if (apiRules.length > 0) setRules(apiRules);
        })
        .catch(() => {});
    }
  }, [rules.length]);
  const [selectedTaskModal, setSelectedTaskModal] = useState<SelectedTaskModalState | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<DataSubTab>("raw");
  const [materializingWideTableId, setMaterializingWideTableId] = useState<string>("");
  const [materializeMessage, setMaterializeMessage] = useState<string>("");

  const enabledCategories = useMemo(
    () => new Set(rules.filter((item) => item.enabled).map((item) => item.category)),
    [rules],
  );
  const currentWideTableRecords = useMemo(
    () =>
      wideTableRecords.filter((record) => {
        const wideTable = wideTables.find((item) => item.id === record.wideTableId);
        if (!wideTable) return false;
        const scopedRecords = wideTableRecords.filter((item) => item.wideTableId === wideTable.id);
        const scopedTaskGroups = taskGroups.filter((item) => item.wideTableId === wideTable.id);
        const currentPlanVersion = resolveCurrentPlanVersion(
          wideTable,
          scopedRecords,
          scopedTaskGroups,
        );
        return resolveRecordPlanVersion(record, currentPlanVersion) === currentPlanVersion;
      }),
    [taskGroups, wideTableRecords, wideTables],
  );
  const currentTaskGroups = useMemo(
    () =>
      taskGroups.filter((taskGroup) => {
        const wideTable = wideTables.find((item) => item.id === taskGroup.wideTableId);
        if (!wideTable) return false;
        const scopedRecords = wideTableRecords.filter((item) => item.wideTableId === wideTable.id);
        const scopedTaskGroups = taskGroups.filter((item) => item.wideTableId === wideTable.id);
        const currentPlanVersion = resolveCurrentPlanVersion(
          wideTable,
          scopedRecords,
          scopedTaskGroups,
        );
        return resolveTaskGroupPlanVersion(taskGroup, currentPlanVersion) === currentPlanVersion;
      }),
    [taskGroups, wideTableRecords, wideTables],
  );
  const currentTaskGroupIds = useMemo(
    () => new Set(currentTaskGroups.map((taskGroup) => taskGroup.id)),
    [currentTaskGroups],
  );
  const currentFetchTasks = useMemo(
    () => fetchTasks.filter((task) => currentTaskGroupIds.has(task.taskGroupId)),
    [currentTaskGroupIds, fetchTasks],
  );
  const requirementWideTables = useMemo(
    () => wideTables.filter((wt) => wt.requirementId === requirement.id),
    [requirement.id, wideTables],
  );
  const wideTableViews = useMemo(
    () => buildWideTableProcessingViews(requirement, wideTables, currentWideTableRecords, enabledCategories),
    [currentWideTableRecords, enabledCategories, requirement, wideTables],
  );

  const materializeWideTable = async (wideTable: WideTable) => {
    setMaterializingWideTableId(wideTable.id);
    setMaterializeMessage("");
    try {
      const outcome = await materializeMappedResults(wideTable.id);
      setMaterializeMessage(
        `${wideTable.name} 已根据映射生成结果预览：明细 ${outcome.collectionResultRows} 行，回填 ${outcome.wideTableCells} 个指标值。`,
      );
      await onRefreshData?.();
    } catch (error) {
      setMaterializeMessage(error instanceof Error ? error.message : "根据映射生成结果预览失败");
    } finally {
      setMaterializingWideTableId("");
    }
  };

  // Demo → 正式转换流程已取消：需求创建后即可直接进入任务与数据产出。

  return (
    <div className="space-y-6">
      <nav aria-label="数据产出流程" className="overflow-x-auto">
        <div className="min-w-[560px] rounded-md border bg-card/80 px-2 py-1.5">
          <div className="grid grid-cols-3 gap-1">
            {dataSubTabs.map((tab, index) => {
              const isActive = activeSubTab === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveSubTab(tab)}
                  aria-current={isActive ? "step" : undefined}
                  className={cn(
                    "group relative flex min-w-0 items-center gap-2 rounded px-2.5 py-1.5 text-left transition-colors",
                    isActive
                      ? "bg-primary/[0.07] text-primary"
                      : "text-muted-foreground hover:bg-muted/30 hover:text-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold transition-colors",
                      isActive
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-muted-foreground group-hover:border-primary/30 group-hover:text-primary",
                    )}
                  >
                    {index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium">
                      {dataSubTabMeta[tab].title}
                    </span>
                    <span className="block truncate text-[10px] leading-4 text-muted-foreground">
                      {dataSubTabMeta[tab].description}
                    </span>
                  </span>
                  {isActive ? (
                    <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {activeSubTab === "raw" ? (
        <RawCollectionResultsPanel
          wideTables={requirementWideTables}
          taskGroups={taskGroups}
          fetchTasks={fetchTasks}
          scheduleJobs={scheduleJobs}
        />
      ) : null}

      {activeSubTab === "mapping" ? (
        <MetricFieldMappingPanel wideTables={requirementWideTables} />
      ) : null}

      {activeSubTab === "wide" ? (
        <div className="space-y-6">
          <section className="rounded-xl border bg-card p-6 space-y-4">
            <h3 className="sr-only">结果预览</h3>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <p className="text-xs text-muted-foreground md:max-w-3xl">
                按需求定义的结构查看当前结果；点亮的指标单元格可直接回溯到对应任务。
              </p>
              {requirementWideTables.length === 1 ? (
                <button
                  type="button"
                  onClick={() => materializeWideTable(requirementWideTables[0])}
                  disabled={materializingWideTableId !== ""}
                  className="inline-flex items-center justify-center rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:border-primary/30 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {materializingWideTableId ? "生成中..." : "根据映射生成结果预览"}
                </button>
              ) : null}
            </div>
            {materializeMessage ? (
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                {materializeMessage}
              </div>
            ) : null}
            {wideTableViews.length === 0 ? <EmptyWideTableState /> : null}
            {wideTableViews.map((view) => {
              const wideTable = wideTables.find((item) => item.id === view.wideTableId);
              if (!wideTable) return null;
              return (
                <WideTableViewSection
                  key={view.wideTableId}
                  requirement={requirement}
                  wideTable={wideTable}
                  rawRows={view.rawRows}
                  processedRows={view.processedRows}
                  wideTableRecords={currentWideTableRecords}
                  taskGroups={currentTaskGroups}
                  fetchTasks={currentFetchTasks}
                  scheduleJobs={scheduleJobs.filter(
                    (job) => job.wideTableId === view.wideTableId || currentTaskGroups.some((tg) => tg.id === job.taskGroupId && tg.wideTableId === view.wideTableId),
                  )}
                  enabledCategories={enabledCategories}
                  showProcessed
                  onOpenTaskModal={setSelectedTaskModal}
                />
              );
            })}
          </section>
        </div>
      ) : null}

      {selectedTaskModal ? (
        <FetchTaskDetailPopup
          wideTable={selectedTaskModal.wideTable}
          taskGroup={selectedTaskModal.taskGroup}
          taskCard={selectedTaskModal.taskCard}
          onClose={() => setSelectedTaskModal(null)}
        />
      ) : null}
    </div>
  );
}

// ==================== 填充规则 Tooltip ====================

function MetricFieldMappingPanel({ wideTables }: { wideTables: WideTable[] }) {
  if (wideTables.length === 0) {
    return (
      <section className="rounded-xl border bg-card p-6">
        <div className="rounded-lg border border-dashed bg-background px-4 py-8 text-center text-xs text-muted-foreground">
          暂无目标宽表，无法配置指标映射。
        </div>
      </section>
    );
  }
  return (
    <div className="space-y-6">
      {wideTables.map((wideTable) => (
        <MetricFieldMappingSection key={wideTable.id} wideTable={wideTable} />
      ))}
    </div>
  );
}

function buildMappingDrafts(mappings: MetricFieldMapping[]): Record<string, string> {
  return Object.fromEntries(mappings.map((mapping) => [mapping.id, mapping.targetIndicatorKey ?? ""]));
}

function MetricFieldMappingSection({ wideTable }: { wideTable: WideTable }) {
  const [mappings, setMappings] = useState<MetricFieldMapping[]>([]);
  const [draftTargetById, setDraftTargetById] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [message, setMessage] = useState<string>("");
  const targetColumns = useMemo(
    () => wideTable.schema.columns.filter((column) => column.category === "indicator"),
    [wideTable.schema.columns],
  );

  const loadMappings = async () => {
    setLoading(true);
    setMessage("");
    try {
      const next = await fetchMetricFieldMappings(wideTable.id);
      setMappings(next);
      setDraftTargetById(buildMappingDrafts(next));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加载指标映射失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMappings();
  }, [wideTable.id]);

  const generateMappings = async () => {
    setLoading(true);
    setMessage("");
    try {
      const next = await generateMetricFieldMappings(wideTable.id);
      setMappings(next);
      setDraftTargetById(buildMappingDrafts(next));
      setMessage(`已从 normalized_rows_json 提取 ${next.length} 个指标搜索名称。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "生成指标映射失败");
    } finally {
      setLoading(false);
    }
  };

  const updateDraftTarget = (mapping: MetricFieldMapping, targetKey: string) => {
    setDraftTargetById((prev) => ({ ...prev, [mapping.id]: targetKey }));
  };

  const confirmMappings = async () => {
    if (mappings.length === 0) return;
    setSavingAll(true);
    setMessage("");
    try {
      const updatedMappings: MetricFieldMapping[] = [];
      for (const mapping of mappings) {
        const targetKey = (draftTargetById[mapping.id] ?? mapping.targetIndicatorKey ?? "").trim();
        const originalTargetKey = (mapping.targetIndicatorKey ?? "").trim();
        const updated = await updateMetricFieldMapping(wideTable.id, mapping.id, {
          targetIndicatorKey: targetKey || null,
          targetIndicatorName: null,
          matchType: targetKey && targetKey === originalTargetKey ? mapping.matchType : "manual",
          status: targetKey ? "confirmed" : "rejected",
        });
        updatedMappings.push(updated);
      }
      setMappings(updatedMappings);
      setDraftTargetById(buildMappingDrafts(updatedMappings));
      setMessage("映射关系已确认保存，未选择目标字段的指标已标记为不转换。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存映射关系失败");
    } finally {
      setSavingAll(false);
    }
  };

  const confirmedCount = mappings.filter((item) => item.status === "confirmed").length;
  const skippedCount = mappings.filter((item) => item.status === "rejected").length;

  return (
    <section className="rounded-xl border bg-card p-6 space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold">{wideTable.name}</h2>
          <p className="text-xs text-muted-foreground">
            指标搜索名称来自 normalized_rows_json，目标字段来自当前宽表 indicator 列。只有确认后的映射才应进入后续物化回填。
          </p>
        </div>
        <button
          type="button"
          onClick={generateMappings}
          disabled={loading || savingAll}
          className="inline-flex items-center justify-center rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:border-primary/30 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "处理中..." : "从原始结果生成映射"}
        </button>
      </div>

      <div className="text-xs text-muted-foreground">
        映射项 {mappings.length} · 已确认 {confirmedCount} · 目标字段 {targetColumns.length}
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          {"不转换"} {skippedCount} {"项。目标字段留空后确认保存，会标记为 rejected。"}
        </div>
        <button
          type="button"
          onClick={confirmMappings}
          disabled={loading || savingAll || mappings.length === 0}
          className="inline-flex items-center justify-center rounded-md border border-primary/30 bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {savingAll ? "保存中..." : "确认并保存映射"}
        </button>
      </div>
      {message ? (
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">{message}</div>
      ) : null}

      <div className="overflow-x-auto rounded-md border">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">指标搜索名称</th>
              <th className="px-3 py-2 font-medium">目标字段</th>
              <th className="px-3 py-2 font-medium">字段说明</th>
              <th className="px-3 py-2 font-medium">状态</th>
              <th className="px-3 py-2 font-medium">匹配方式</th>
            </tr>
          </thead>
          <tbody>
            {mappings.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                  暂无映射。请先在“采集明细”完成转换，再点击“从原始结果生成映射”。
                </td>
              </tr>
            ) : mappings.map((mapping) => {
              const draftTargetKey = draftTargetById[mapping.id] ?? mapping.targetIndicatorKey ?? "";
              const target = targetColumns.find((column) => column.name === draftTargetKey);
              const displayStatus = draftTargetKey ? mapping.status : "rejected";
              return (
                <tr key={mapping.id} className="border-t">
                  <td className="min-w-48 px-3 py-2 text-foreground">{mapping.sourceMetricName}</td>
                  <td className="min-w-56 px-3 py-2">
                    <TargetIndicatorCombobox
                      mappingId={mapping.id}
                      value={draftTargetKey}
                      columns={targetColumns}
                      disabled={savingAll}
                      onChange={(targetKey) => updateDraftTarget(mapping, targetKey)}
                    />
                  </td>
                  <td className="min-w-48 px-3 py-2 text-muted-foreground">
                    {draftTargetKey ? mapping.targetIndicatorName ?? (target ? target.chineseName ?? target.description ?? target.name : "-") : "不转换"}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{displayStatus}</td>
                  <td className="px-3 py-2 text-muted-foreground">{mapping.matchType}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TargetIndicatorCombobox({
  mappingId,
  value,
  columns,
  disabled,
  onChange,
}: {
  mappingId: string;
  value: string;
  columns: ColumnDefinition[];
  disabled: boolean;
  onChange: (targetKey: string) => void;
}) {
  const [inputValue, setInputValue] = useState(value);
  const datalistId = `target-indicator-options-${mappingId}`;

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const resolveInput = (rawValue: string) => {
    const trimmed = rawValue.trim();
    if (!trimmed) {
      if (value) onChange("");
      return;
    }
    const normalized = trimmed.toLowerCase();
    const matched = columns.find((column) =>
      column.name.toLowerCase() === normalized
      || (column.chineseName ?? "").toLowerCase() === normalized
      || (column.description ?? "").toLowerCase() === normalized,
    );
    if (matched && matched.name !== value) {
      onChange(matched.name);
    }
  };

  return (
    <div className="space-y-1">
      <input
        list={datalistId}
        value={inputValue}
        onChange={(event) => {
          const nextValue = event.target.value;
          setInputValue(nextValue);
          const matched = columns.find((column) => column.name === nextValue);
          if (matched && matched.name !== value) {
            onChange(matched.name);
          }
          if (nextValue === "" && value) {
            onChange("");
          }
        }}
        onBlur={() => resolveInput(inputValue)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
        }}
        disabled={disabled}
        placeholder="输入字段名或中文说明搜索"
        className="w-full rounded-md border bg-background px-2 py-1 text-xs outline-none transition-colors focus:border-primary/50 focus:ring-1 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
      />
      <datalist id={datalistId}>
        <option value="">未映射</option>
        {columns.map((column) => (
          <option
            key={column.name}
            value={column.name}
            label={[column.chineseName, column.description].filter(Boolean).join(" · ")}
          />
        ))}
      </datalist>
    </div>
  );
}

function RawCollectionResultsPanel({
  wideTables,
  taskGroups,
  fetchTasks,
  scheduleJobs,
}: {
  wideTables: WideTable[];
  taskGroups: TaskGroup[];
  fetchTasks: FetchTask[];
  scheduleJobs: ScheduleJob[];
}) {
  if (wideTables.length === 0) {
    return (
      <section className="rounded-xl border bg-card p-6">
        <div className="rounded-lg border border-dashed bg-background px-4 py-8 text-center text-xs text-muted-foreground">
          当前需求暂无可展示的宽表。
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      {wideTables.map((wideTable) => (
        <RawCollectionResultsSection
          key={wideTable.id}
          wideTable={wideTable}
          taskGroups={taskGroups.filter((taskGroup) => taskGroup.wideTableId === wideTable.id)}
          fetchTasks={fetchTasks.filter((task) => task.wideTableId === wideTable.id)}
          scheduleJobs={scheduleJobs.filter(
            (job) => job.wideTableId === wideTable.id || taskGroups.some((tg) => tg.id === job.taskGroupId && tg.wideTableId === wideTable.id),
          )}
        />
      ))}
    </div>
  );
}

function RawCollectionResultsSection({
  wideTable,
  taskGroups,
  fetchTasks,
  scheduleJobs,
}: {
  wideTable: WideTable;
  taskGroups: TaskGroup[];
  fetchTasks: FetchTask[];
  scheduleJobs: ScheduleJob[];
}) {
  const fullSnapshotPages = useMemo(
    () => buildDisplayableFullSnapshotTaskGroupPages(taskGroups, scheduleJobs),
    [scheduleJobs, taskGroups],
  );
  const [selectedPageKey, setSelectedPageKey] = useState<string>(() => {
    const first = fullSnapshotPages[0];
    return first ? snapshotPageKey(first) : "";
  });
  const [resultsByTask, setResultsByTask] = useState<Record<string, CollectionResult[]>>({});
  const [loading, setLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string>("");
  const [normalizingIds, setNormalizingIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (fullSnapshotPages.length === 0) {
      if (selectedPageKey) setSelectedPageKey("");
      return;
    }
    if (!fullSnapshotPages.some((page) => snapshotPageKey(page) === selectedPageKey)) {
      setSelectedPageKey(snapshotPageKey(fullSnapshotPages[0]));
    }
  }, [fullSnapshotPages, selectedPageKey]);

  const activePage = useMemo(
    () => fullSnapshotPages.find((page) => snapshotPageKey(page) === selectedPageKey) ?? fullSnapshotPages[0] ?? null,
    [fullSnapshotPages, selectedPageKey],
  );
  const activeTaskGroup = useMemo(
    () => activePage ? taskGroups.find((taskGroup) => taskGroup.id === activePage.taskGroupId) ?? null : null,
    [activePage, taskGroups],
  );
  const activeFetchTasks = useMemo(
    () => activeTaskGroup ? fetchTasks.filter((task) => task.taskGroupId === activeTaskGroup.id) : [],
    [activeTaskGroup, fetchTasks],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setActionMessage("");
    const taskResultRequests = activeFetchTasks.map((task) =>
      fetchTaskResults(task.id)
        .then((payload) => [task.id, payload.collectionResults] as const)
        .catch(() => [task.id, []] as const),
    );
    const groupResultsRequest = activeTaskGroup
      ? fetchTaskGroupResults(activeTaskGroup.id).catch(() => ({ collectionResults: [], collectionResultRows: [] }))
      : Promise.resolve({ collectionResults: [], collectionResultRows: [] });
    Promise.all([
      fetchWideTableResults(wideTable.id).catch(() => ({ collectionResults: [], collectionResultRows: [] })),
      groupResultsRequest,
      Promise.all(taskResultRequests),
    ])
      .then(([wideTablePayload, groupPayload, taskEntries]) => {
        if (cancelled) return;
        const next = Object.fromEntries(taskEntries);
        for (const result of [...wideTablePayload.collectionResults, ...groupPayload.collectionResults]) {
          const key = result.fetchTaskId || `__result__${result.id}`;
          next[key] = [...(next[key] ?? []), result];
        }
        setResultsByTask(next);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeFetchTasks, activeTaskGroup, wideTable.id]);

  const resultItems = useMemo(
    () => {
      const taskById = new Map(activeFetchTasks.map((task) => [task.id, task]));
      const seen = new Set<string>();
      const items: Array<{ task?: FetchTask; result: CollectionResult }> = [];
      Object.entries(resultsByTask).forEach(([taskId, results]) => {
        results.forEach((result) => {
          if (seen.has(result.id)) return;
          seen.add(result.id);
          items.push({ task: taskById.get(result.fetchTaskId || taskId), result });
        });
      });
      return items.sort((left, right) => (left.result.rowId ?? 0) - (right.result.rowId ?? 0));
    },
    [activeFetchTasks, resultsByTask],
  );
  const aggregatedRows = useMemo(() => buildAggregatedNormalizedRows(resultItems), [resultItems]);
  const aggregatedColumns = useMemo(() => buildNormalizedPreviewColumns(aggregatedRows), [aggregatedRows]);

  const normalizeOne = async (taskId: string, resultId: string) => {
    setNormalizingIds((prev) => new Set(prev).add(resultId));
    setActionMessage("");
    try {
      const updated = await normalizeFinalReport(taskId, resultId);
      setResultsByTask((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((key) => {
          next[key] = next[key].map((item) => item.id === resultId ? updated : item);
        });
        if (!Object.values(next).some((items) => items.some((item) => item.id === resultId))) {
          next[taskId] = [updated];
        }
        return next;
      });
      setActionMessage("已按任务维度统一转换 normalized_rows_json。");
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "转换失败");
    } finally {
      setNormalizingIds((prev) => {
        const next = new Set(prev);
        next.delete(resultId);
        return next;
      });
    }
  };

  const normalizeAll = async () => {
    const candidates = resultItems.filter((item) => item.result.finalReport && item.result.id);
    if (candidates.length === 0) {
      setActionMessage("当前任务组暂无可转换的 final_report。");
      return;
    }
    setNormalizingIds(new Set(candidates.map((item) => item.result.id)));
    setActionMessage("");
    try {
      let payload = activeTaskGroup
        ? await normalizeTaskGroupFinalReports(activeTaskGroup.id)
        : await normalizeWideTableFinalReports(wideTable.id);
      if (activeTaskGroup && payload.collectionResults.length === 0 && candidates.length > 0) {
        payload = await normalizeWideTableFinalReports(wideTable.id);
      }
      setResultsByTask((prev) => {
        const next = { ...prev };
        for (const updated of payload.collectionResults) {
          const key = updated.fetchTaskId || `__result__${updated.id}`;
          let replaced = false;
          Object.keys(next).forEach((entryKey) => {
            next[entryKey] = next[entryKey].map((item) => {
              if (item.id === updated.id) {
                replaced = true;
                return updated;
              }
              return item;
            });
          });
          if (!replaced) {
            next[key] = [...(next[key] ?? []), updated];
          }
        }
        return next;
      });
      setActionMessage(`已按任务维度统一转换 ${payload.collectionResults.length} 条原始结果。`);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "转换失败");
    } finally {
      setNormalizingIds(new Set());
    }
  };

  return (
    <section className="rounded-xl border bg-card p-6 space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold">{wideTable.name}</h2>
          <p className="text-xs text-muted-foreground">
            查看 collection_results.final_report，并按任务维度统一转换 normalized_rows_json。
          </p>
        </div>
        <button
          type="button"
          onClick={normalizeAll}
          disabled={loading || resultItems.length === 0 || normalizingIds.size > 0}
          className="inline-flex items-center justify-center rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:border-primary/30 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          转换当前页全部原始结果
        </button>
      </div>

      {fullSnapshotPages.length > 0 ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {fullSnapshotPages.map((page) => (
            <button
              key={snapshotPageKey(page)}
              type="button"
              onClick={() => setSelectedPageKey(snapshotPageKey(page))}
              className={cn(
                "shrink-0 rounded-md border px-3 py-1.5 text-xs transition-colors",
                snapshotPageKey(page) === selectedPageKey
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-background text-muted-foreground hover:border-primary/30 hover:text-primary",
              )}
            >
              {page.pageLabel}
            </button>
          ))}
        </div>
      ) : null}

      <div className="text-xs text-muted-foreground">
        {activeTaskGroup
          ? `任务组 ${activeTaskGroup.id} · 任务 ${activeFetchTasks.length} · 原始结果 ${resultItems.length}`
          : `按宽表读取原始结果 · 原始结果 ${resultItems.length}`}
      </div>

      {actionMessage ? (
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">{actionMessage}</div>
      ) : null}

      {aggregatedRows && aggregatedRows.length > 0 && aggregatedColumns.length > 0 ? (
        <NormalizedRowsTable
          columns={aggregatedColumns}
          rows={aggregatedRows}
          title="normalized_rows_json 汇总预览"
          maxRows={200}
        />
      ) : null}

      {loading ? (
        <div className="rounded-lg border border-dashed bg-background px-4 py-8 text-center text-xs text-muted-foreground">
          正在加载原始结果...
        </div>
      ) : resultItems.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-background px-4 py-8 text-center text-xs text-muted-foreground">
          当前宽表暂无 collection_results.final_report 可转换数据。
        </div>
      ) : (
        <div className="space-y-3">
          {resultItems.map(({ task, result }) => (
            <RawCollectionResultCard
              key={result.id}
              task={task}
              result={result}
              isNormalizing={normalizingIds.has(result.id)}
              onNormalize={() => normalizeOne(result.fetchTaskId || task?.id || "", result.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function RawCollectionResultCard({
  task,
  result,
  isNormalizing,
  onNormalize,
}: {
  task?: FetchTask;
  result: CollectionResult;
  isNormalizing: boolean;
  onNormalize: () => void;
}) {
  const normalizedRows = useMemo(() => parseNormalizedRows(result.normalizedRowsJson), [result.normalizedRowsJson]);
  const previewColumns = useMemo(() => buildNormalizedPreviewColumns(normalizedRows), [normalizedRows]);
  const finalReportSummary = summarizeText(result.finalReport);

  return (
    <article className="rounded-lg border bg-background p-4 space-y-3">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-1 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">row_id {task?.rowId ?? result.rowId ?? "—"}</span>
            <span className="text-muted-foreground">任务 {task?.id ?? result.fetchTaskId ?? "未绑定 fetch_task"}</span>
            {result.externalTaskId ? <span className="text-muted-foreground">外部任务 {result.externalTaskId}</span> : null}
            {result.status ? <span className="rounded border px-1.5 py-0.5 text-[11px] text-muted-foreground">{result.status}</span> : null}
          </div>
          <div className="text-muted-foreground">
            采集时间 {formatNullable(result.collectedAt ?? result.createdAt)} · JSON 行数 {normalizedRows?.length ?? 0}
          </div>
        </div>
        <button
          type="button"
          onClick={onNormalize}
          disabled={isNormalizing || !result.finalReport || !result.fetchTaskId}
          className="inline-flex items-center justify-center rounded-md border px-3 py-1.5 text-xs font-medium transition-colors hover:border-primary/30 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isNormalizing ? "转换中..." : "转换"}
        </button>
      </div>

      <div className="rounded-md bg-muted/25 px-3 py-2 text-xs leading-5 text-muted-foreground">
        {finalReportSummary || "final_report 为空"}
      </div>

      {normalizedRows && normalizedRows.length > 0 && previewColumns.length > 0 ? (
        <NormalizedRowsTable columns={previewColumns} rows={normalizedRows} maxRows={5} />
      ) : (
        <div className="rounded-md border border-dashed px-3 py-3 text-xs text-muted-foreground">
          normalized_rows_json 暂无可预览数据。
        </div>
      )}
    </article>
  );
}

function NormalizedRowsTable({
  columns,
  rows,
  title,
  maxRows,
}: {
  columns: string[];
  rows: Array<Record<string, unknown>>;
  title?: string;
  maxRows: number;
}) {
  const visibleRows = rows.slice(0, maxRows);
  return (
    <div className="overflow-x-auto rounded-md border">
      {title ? (
        <div className="border-b bg-muted/20 px-3 py-2 text-xs font-medium text-foreground">
          {title} · 共 {rows.length} 行
        </div>
      ) : null}
      <table className="min-w-full text-left text-xs">
        <thead className="bg-muted/40 text-muted-foreground">
          <tr>
            {columns.map((column) => (
              <th key={column} className="whitespace-nowrap px-3 py-2 font-medium">{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row, index) => (
            <tr key={index} className="border-t">
              {columns.map((column) => (
                <td key={column} className="max-w-[320px] truncate px-3 py-2 text-muted-foreground" title={String(row[column] ?? "")}>
                  {String(row[column] ?? "") || "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > maxRows ? (
        <div className="border-t px-3 py-2 text-xs text-muted-foreground">
          仅预览前 {maxRows} 行，共 {rows.length} 行。
        </div>
      ) : null}
    </div>
  );
}

function buildAggregatedNormalizedRows(
  items: Array<{ task?: FetchTask; result: CollectionResult }>,
): Array<Record<string, unknown>> | null {
  const rows: Array<Record<string, unknown>> = [];
  items.forEach(({ task, result }) => {
    const parsedRows = parseNormalizedRows(result.normalizedRowsJson);
    if (!parsedRows || parsedRows.length === 0) return;
    parsedRows.forEach((row) => {
      rows.push({
        ...row,
        row_id: task?.rowId ?? result.rowId ?? "",
        fetch_task_id: result.fetchTaskId ?? task?.id ?? "",
        collection_result_id: result.id,
      });
    });
  });
  return rows.length > 0 ? rows : null;
}

function parseNormalizedRows(value?: string | Array<Record<string, unknown>> | null): Array<Record<string, unknown>> | null {
  if (Array.isArray(value)) {
    return filterNormalizedRows(value);
  }
  if (!value || String(value).trim() === "") {
    return null;
  }
  try {
    const parsed = JSON.parse(String(value));
    if (Array.isArray(parsed)) {
      return filterNormalizedRows(parsed);
    }
    if (typeof parsed === "string") {
      const reparsed = JSON.parse(parsed);
      return Array.isArray(reparsed) ? filterNormalizedRows(reparsed) : null;
    }
    return null;
  } catch {
    return null;
  }
}

function filterNormalizedRows(value: unknown[]): Array<Record<string, unknown>> | null {
  const rows = value.filter((item): item is Record<string, unknown> => item != null && typeof item === "object" && !Array.isArray(item));
  return rows.length > 0 ? rows : null;
}

function buildNormalizedPreviewColumns(rows: Array<Record<string, unknown>> | null): string[] {
  if (!rows || rows.length === 0) {
    return [];
  }
  const discoveredColumns: string[] = [];
  rows.forEach((row) => {
    Object.keys(row).forEach((key) => {
      if (!discoveredColumns.includes(key)) discoveredColumns.push(key);
    });
  });
  const fixedMetricColumns = [
    "指标名称 (Metric Name)",
    "指标值 (Value)",
    "单位 (Unit)",
    "数据时间 (Data Period)",
    "数据来源 (Data Source)",
    "逻辑说明及补充 (Notes)",
    "Min_Value",
    "Max_Value",
    "Source_URL",
    "Source_Evidence",
  ];
  const technicalColumns = ["row_id", "fetch_task_id", "collection_result_id"];
  const orderedSet = new Set([...fixedMetricColumns, ...technicalColumns]);
  const dimensionColumns = discoveredColumns.filter((column) => !orderedSet.has(column));
  return [
    ...dimensionColumns,
    ...fixedMetricColumns.filter((column) => discoveredColumns.includes(column)),
    ...technicalColumns.filter((column) => discoveredColumns.includes(column)),
  ];
}

function summarizeText(value?: string | null): string {
  if (!value) {
    return "";
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 260 ? `${normalized.slice(0, 260)}...` : normalized;
}

function formatNullable(value?: string | null): string {
  return value && String(value).trim() !== "" ? String(value) : "—";
}

function FillingRulesTooltip() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    if (open) {
      window.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center rounded-md border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
        aria-label="查看填充规则说明"
      >
        查看填充规则
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="填充规则说明"
        >
          <div
            className="w-full max-w-2xl rounded-xl border bg-card shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div>
                <div className="text-sm font-semibold text-foreground">填充规则</div>
                <div className="mt-1 text-xs text-muted-foreground leading-relaxed">
                  原始指标值会先做语义判断，再由规则引擎落成最终值。置信度低于 <span className="font-mono font-medium text-amber-700">70%</span> 的结果需要人工确认。
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                关闭
              </button>
            </div>
            <div className="space-y-3 px-5 py-4">
              <div className="space-y-1">
                {FILLING_RULES.map((rule) => (
                  <div key={rule.id} className="flex items-start gap-2 text-xs">
                    <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] text-primary">{rule.id}</span>
                    <div>
                      <span className="font-medium text-foreground">{rule.name}</span>
                      <span className="ml-1 text-muted-foreground">{rule.description}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

// ==================== 窄表视图（带业务日期分页） ====================

function NarrowTableViewSection({
  wideTable,
  wideTableRecords,
  taskGroups,
  fetchTasks,
  scheduleJobs,
  onOpenTaskModal,
}: {
  wideTable: WideTable;
  wideTableRecords: WideTableRecord[];
  taskGroups: TaskGroup[];
  fetchTasks: FetchTask[];
  scheduleJobs: ScheduleJob[];
  onOpenTaskModal: (state: SelectedTaskModalState) => void;
}) {
  const usesBusinessDateAxis = hasWideTableBusinessDateDimension(wideTable);
  const businessDateColumnName = wideTable.schema.columns.find((column) => column.isBusinessDate)?.name ?? "BIZ_DATE";

  const businessDates = useMemo(() => {
    if (!usesBusinessDateAxis) {
      return [];
    }
    const values = Array.from(
      new Set(
        wideTableRecords
          .map((r) => String(r[businessDateColumnName] ?? ""))
          .filter((v) => v && v.trim() !== ""),
      ),
    );
    return values.sort((left, right) => right.localeCompare(left));
  }, [businessDateColumnName, usesBusinessDateAxis, wideTableRecords]);
  const fetchTasksByTaskGroupId = useMemo(() => {
    const grouped = new Map<string, FetchTask[]>();
    for (const task of fetchTasks) {
      grouped.set(task.taskGroupId, [...(grouped.get(task.taskGroupId) ?? []), task]);
    }
    return grouped;
  }, [fetchTasks]);
  const trialTaskGroups = useMemo(
    () => taskGroups.filter((taskGroup) => (
      taskGroup.triggeredBy === "trial"
      && (Boolean(taskGroup.rowSnapshots?.length) || Boolean(fetchTasksByTaskGroupId.get(taskGroup.id)?.length))
    )),
    [fetchTasksByTaskGroupId, taskGroups],
  );

  const visibleAllBusinessDates = useMemo(
    () => limitFutureBusinessDates(businessDates, { now: new Date(), maxFuturePeriods: 1 }),
    [businessDates],
  );
  const fullSnapshotPages = useMemo(
    () => (usesBusinessDateAxis ? [] : buildDisplayableFullSnapshotTaskGroupPages(taskGroups, scheduleJobs)),
    [scheduleJobs, taskGroups, usesBusinessDateAxis],
  );

  const [selectedBusinessDate, setSelectedBusinessDate] = useState<string>(businessDates[0] ?? "");
  const [selectedYear, setSelectedYear] = useState<string>("");
  const [selectedNarrowPageKey, setSelectedNarrowPageKey] = useState<string>(() => {
    const first = fullSnapshotPages[0];
    return first ? snapshotPageKey(first) : "";
  });
  const isMonthlyFrequency = usesBusinessDateAxis && wideTable.businessDateRange.frequency === "monthly";

  const businessYears = useMemo(() => {
    if (!isMonthlyFrequency) return [];
    const years = Array.from(new Set(
      visibleAllBusinessDates.map((d) => extractBusinessDateYear(d)).filter((y): y is string => Boolean(y)),
    ));
    return years.sort((a, b) => b.localeCompare(a));
  }, [isMonthlyFrequency, visibleAllBusinessDates]);

  const effectiveSelectedYear = useMemo(() => {
    if (!isMonthlyFrequency || businessYears.length === 0) return "";
    if (selectedYear && businessYears.includes(selectedYear)) return selectedYear;
    return pickDefaultBusinessYear(businessYears, { now: new Date() });
  }, [businessYears, isMonthlyFrequency, selectedYear]);

  useEffect(() => {
    if (!isMonthlyFrequency) return;
    if (businessYears.length === 0) { if (selectedYear) setSelectedYear(""); return; }
    if (selectedYear !== effectiveSelectedYear) setSelectedYear(effectiveSelectedYear);
  }, [businessYears, effectiveSelectedYear, isMonthlyFrequency, selectedYear]);

  const visibleBusinessDates = useMemo(() => {
    const scopedDates = visibleAllBusinessDates;
    if (!isMonthlyFrequency || !effectiveSelectedYear) return scopedDates;
    return scopedDates.filter((d) => String(d).slice(0, 4) === effectiveSelectedYear);
  }, [effectiveSelectedYear, isMonthlyFrequency, visibleAllBusinessDates]);
  const visibleBusinessDateOptions = useMemo(
    () => [
      ...trialTaskGroups.map((taskGroup) => ({
        key: taskGroup.id,
        label: `试运行 ${taskGroup.businessDateLabel || taskGroup.businessDate || ""}`.trim(),
        isTrial: true,
      })),
      ...visibleBusinessDates.map((businessDate) => ({
        key: businessDate,
        label: isMonthlyFrequency ? `${extractBusinessDateMonth(businessDate) ?? String(businessDate).slice(5, 7)}月` : businessDate,
        isTrial: false,
      })),
    ],
    [isMonthlyFrequency, trialTaskGroups, visibleBusinessDates],
  );

  useEffect(() => {
    if (visibleBusinessDateOptions.length > 0 && !visibleBusinessDateOptions.some((item) => item.key === selectedBusinessDate)) {
      setSelectedBusinessDate(visibleBusinessDateOptions[0]?.key ?? "");
    }
  }, [visibleBusinessDateOptions, selectedBusinessDate]);

  useEffect(() => {
    if (usesBusinessDateAxis) return;
    if (fullSnapshotPages.length === 0) {
      if (selectedNarrowPageKey) setSelectedNarrowPageKey("");
      return;
    }
    if (!fullSnapshotPages.some((p) => snapshotPageKey(p) === selectedNarrowPageKey)) {
      setSelectedNarrowPageKey(snapshotPageKey(fullSnapshotPages[0]));
    }
  }, [fullSnapshotPages, selectedNarrowPageKey, usesBusinessDateAxis]);

  const activeSnapshotPage = useMemo(
    () => fullSnapshotPages.find((p) => snapshotPageKey(p) === selectedNarrowPageKey) ?? fullSnapshotPages[0] ?? null,
    [fullSnapshotPages, selectedNarrowPageKey],
  );

  const filteredRecords = useMemo(
    () => {
      if (usesBusinessDateAxis) {
        const trialTaskGroup = trialTaskGroups.find((taskGroup) => taskGroup.id === selectedBusinessDate);
        if (trialTaskGroup) {
          return trialTaskGroup.rowSnapshots ?? [];
        }
        return selectedBusinessDate
          ? wideTableRecords.filter((r) => String(r[businessDateColumnName] ?? "") === selectedBusinessDate)
          : wideTableRecords;
      }

      if (!activeSnapshotPage) {
        return wideTableRecords;
      }

      const snapshotTaskGroup = taskGroups.find((taskGroup) => taskGroup.id === activeSnapshotPage.taskGroupId);
      if (!snapshotTaskGroup) {
        return wideTableRecords;
      }

      return snapshotTaskGroup.rowSnapshots?.length ? snapshotTaskGroup.rowSnapshots : wideTableRecords;
    },
    [activeSnapshotPage, businessDateColumnName, selectedBusinessDate, taskGroups, trialTaskGroups, usesBusinessDateAxis, wideTableRecords],
  );

  const dateScopedTaskGroups = useMemo(
    () => {
      if (usesBusinessDateAxis) {
        const trialTaskGroup = trialTaskGroups.find((taskGroup) => taskGroup.id === selectedBusinessDate);
        if (trialTaskGroup) {
          return [trialTaskGroup];
        }
        return [...taskGroups.filter((taskGroup) => taskGroup.businessDate === selectedBusinessDate && taskGroup.triggeredBy !== "trial")]
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
      }

      if (!activeSnapshotPage) {
        return [];
      }

      return taskGroups.filter((taskGroup) => taskGroup.id === activeSnapshotPage.taskGroupId);
    },
    [activeSnapshotPage, selectedBusinessDate, taskGroups, trialTaskGroups, usesBusinessDateAxis],
  );

  const activeTaskGroup = useMemo(
    () => dateScopedTaskGroups.find((taskGroup) => taskGroup.status !== "pending") ?? dateScopedTaskGroups[0],
    [dateScopedTaskGroups],
  );

  const activeFetchTasks = useMemo(
    () => (activeTaskGroup ? fetchTasks.filter((ft) => ft.taskGroupId === activeTaskGroup.id) : []),
    [activeTaskGroup, fetchTasks],
  );

  const contextColumns = useMemo(
    () => getVisibleNarrowTableContextColumns(wideTable),
    [wideTable],
  );

  const displayRows = useMemo<NarrowTableDisplayRow[]>(() => {
    if (!activeTaskGroup) {
      return [];
    }

    return buildFetchTaskCardViews({
      wideTable,
      taskGroup: activeTaskGroup,
      fetchTasks: activeFetchTasks,
      wideTableRecords: filteredRecords,
    }).flatMap((taskCard, taskOrder) =>
      taskCard.returnRows.map((returnRow, taskRowIndex) => {
        const fillingResult = returnRow.rawIndicatorValue
          ? {
              ...fillIndicator(returnRow.rawIndicatorValue, returnRow.indicatorUnit),
              rowId: `${wideTable.id}::${taskCard.rowId}`,
              columnName: returnRow.indicatorName,
            }
          : null;

        return {
          key: `${taskCard.id}-${returnRow.indicatorName}`,
          taskRowLabel: taskCard.rowLabel,
          taskStatus: taskCard.status,
          taskOrder,
          taskRowIndex,
          taskRowCount: taskCard.returnRows.length,
          returnRow,
          fillingResult,
          taskCard,
        };
      }),
    );
  }, [activeFetchTasks, activeTaskGroup, filteredRecords, wideTable]);

  const [selectedIndicatorDetail, setSelectedIndicatorDetail] = useState<SelectedIndicatorValueModalState | null>(null);

  return (
    <div className="rounded-lg border bg-background p-4 space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-1">
          <h4 className="text-sm font-semibold">{wideTable.name}</h4>
          <p className="text-xs text-muted-foreground">{wideTable.description}</p>
        </div>
        <div className="text-xs text-muted-foreground">
          {usesBusinessDateAxis
            ? "按业务日期分页查看，与任务执行记录保持一致的采集明细。"
            : "按任务组开始调度时间分页查看，每页对应一次全量快照任务组。"}
        </div>
      </div>

      {usesBusinessDateAxis && visibleBusinessDateOptions.length > 0 ? (
        <div className="space-y-2">
          {isMonthlyFrequency && businessYears.length > 0 ? (
            <div className={cn("flex gap-2 overflow-x-auto pb-1", businessYears.length > 1 ? "border-b" : "")}>
              {businessYears.length > 1 ? (
                businessYears.map((year) => (
                  <button key={year} type="button" onClick={() => setSelectedYear(year)}
                    className={cn("shrink-0 px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors",
                      effectiveSelectedYear === year ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted",
                    )}>
                    {year}年
                  </button>
                ))
              ) : (
                <div className="shrink-0 px-3 py-1.5 text-xs font-medium text-muted-foreground">{businessYears[0]}年</div>
              )}
            </div>
          ) : null}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {visibleBusinessDateOptions.map((item) => (
              <button key={item.key} type="button" onClick={() => setSelectedBusinessDate(item.key)}
                className={cn("shrink-0 rounded-md border px-3 py-1.5 text-xs",
                  selectedBusinessDate === item.key ? "border-primary bg-primary/10 text-primary" : "bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
                  item.isTrial && "border-sky-300 bg-sky-50 text-sky-700",
                )}>
                {item.label}
              </button>
            ))}
          </div>
        </div>
      ) : !usesBusinessDateAxis && fullSnapshotPages.length > 0 ? (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">
            每次执行对应一个快照版本，分页标签展示的是该次执行的开始时间。
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {fullSnapshotPages.map((page) => (
              <button
                key={snapshotPageKey(page)}
                type="button"
                onClick={() => setSelectedNarrowPageKey(snapshotPageKey(page))}
                className={cn(
                  "shrink-0 rounded-md border px-3 py-1.5 text-xs",
                  selectedNarrowPageKey === snapshotPageKey(page)
                    ? "border-primary bg-primary/10 text-primary"
                    : "bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
                )}
                title={`${page.pageHint} · ${page.taskGroupId}`}
              >
                {page.pageLabel}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {activeTaskGroup ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
            <div className="flex flex-wrap items-center gap-4">
              {!usesBusinessDateAxis && activeSnapshotPage ? (
                <span>
                  开始调度 <span className="font-medium text-foreground">{activeSnapshotPage.pageLabel}</span>
                </span>
              ) : null}
              <span>
                任务组 <span className="font-medium text-foreground">{activeTaskGroup.id}</span>
              </span>
              {activeTaskGroup.triggeredBy === "trial" ? (
                <span className="rounded border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700">
                  试运行数据
                </span>
              ) : null}
              <span>
                明细行数 <span className="font-medium text-foreground">{displayRows.length}</span>
              </span>
            </div>
            <span>
              运行状态 <span className="font-medium text-foreground">{activeTaskGroup.status}</span>
            </span>
          </div>

          <div className="overflow-x-auto rounded-md border">
            <table className="w-full border-separate border-spacing-0 text-xs">
              <thead>
                <tr>
                  <th className="p-0" style={{ width: 3 }} />
                  {contextColumns.map((column) => (
                    <th key={column.id} className="border-b border-muted/60 bg-muted/40 px-2 py-1.5 text-left">
                      {column.name}
                    </th>
                  ))}
                  <th className="border-b border-muted/60 bg-muted/40 px-2 py-1.5 text-left">指标名</th>
                  <th className="border-b border-muted/60 bg-muted/40 px-2 py-1.5 text-left">指标值</th>
                  <th className="border-b border-muted/60 bg-muted/40 px-2 py-1.5 text-left">原始指标值</th>
                  <th className="border-b border-muted/60 bg-muted/40 px-2 py-1.5 text-left">单位</th>
                  <th className="border-b border-muted/60 bg-muted/40 px-2 py-1.5 text-left">数据发布时间</th>
                  <th className="border-b border-muted/60 bg-muted/40 px-2 py-1.5 text-left">数据来源站点</th>
                  <th className="border-b border-muted/60 bg-muted/40 px-2 py-1.5 text-left">最大值</th>
                  <th className="border-b border-muted/60 bg-muted/40 px-2 py-1.5 text-left">最小值</th>
                  <th className="border-b border-muted/60 bg-muted/40 px-2 py-1.5 text-left">来源URL</th>
                  <th className="border-b border-muted/60 bg-muted/40 px-2 py-1.5 text-left">原文摘录</th>
                  <th className="border-b border-muted/60 bg-muted/40 px-2 py-1.5 text-left">指标逻辑</th>
                  <th className="border-b border-muted/60 bg-muted/40 px-2 py-1.5 text-left">逻辑补充</th>
                </tr>
              </thead>
              <tbody>
                {displayRows.length === 0 ? (
                  <tr>
                    <td colSpan={contextColumns.length + 13} className="px-3 py-6 text-center text-xs text-muted-foreground">
                      {usesBusinessDateAxis ? "当前业务日期下暂无可展示的采集明细。" : "当前任务组下暂无可展示的采集明细。"}
                    </td>
                  </tr>
                ) : (
                  (() => {
                    return displayRows.map((displayRow, globalIdx) => {
                      const isTaskFirst = displayRow.taskRowIndex === 0;
                      const isTaskLast = displayRow.taskRowIndex === displayRow.taskRowCount - 1;
                      const isTableFirst = globalIdx === 0;
                      const dataCellBorder = isTaskFirst
                        ? "border-t-2 border-t-slate-200"
                        : "border-t border-dashed border-t-slate-200/90";

                      const railColor = getTaskStatusRailFillColor(displayRow.taskStatus);
                      const railStyle: React.CSSProperties = {
                        width: 3,
                        padding: 0,
                        paddingTop: isTaskFirst ? 3 : 0,
                        paddingBottom: isTaskLast ? 3 : 0,
                        backgroundImage: `linear-gradient(${railColor},${railColor})`,
                        backgroundOrigin: "content-box",
                        backgroundClip: "content-box",
                        backgroundSize: "100% 100%",
                        borderRadius: isTaskFirst && isTaskLast ? 1.5 : isTaskFirst ? "1.5px 1.5px 0 0" : isTaskLast ? "0 0 1.5px 1.5px" : 0,
                      };

                      return (
                        <tr
                          key={displayRow.key}
                          className={cn(
                            "cursor-pointer hover:bg-accent/40 transition-colors",
                            getTaskBlockSurfaceClass(displayRow.taskOrder),
                          )}
                          onClick={() => {
                            if (activeTaskGroup) {
                              onOpenTaskModal({
                                wideTable,
                                taskGroup: activeTaskGroup,
                                taskCard: displayRow.taskCard,
                              });
                            }
                          }}
                        >
                          <td style={railStyle} />
                          {contextColumns.map((column) => (
                            <td key={column.id} className={cn("px-2 py-1.5 text-slate-700 align-top", isTableFirst ? "" : dataCellBorder)}>
                              {displayRow.returnRow.contextValues[column.name] ?? ""}
                            </td>
                          ))}
                          <td className={cn("px-2 py-1.5 align-top", isTableFirst ? "" : dataCellBorder)}>
                            {displayRow.returnRow.indicatorName}
                          </td>
                          <td className={cn("px-2 py-1.5", isTableFirst ? "" : dataCellBorder)}>
                            {displayRow.fillingResult ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedIndicatorDetail({
                                    wideTable,
                                    taskGroup: activeTaskGroup,
                                    taskRowLabel: displayRow.taskRowLabel,
                                    returnRow: displayRow.returnRow,
                                    fillingResult: displayRow.fillingResult!,
                                  });
                                }}
                                className="rounded-sm text-left text-primary hover:underline"
                                title={`查看 ${displayRow.returnRow.indicatorName} 的填充详情`}
                              >
                                {displayRow.fillingResult.finalValue || displayRow.returnRow.indicatorValue || "—"}
                              </button>
                            ) : (
                              <span className="text-slate-700">{displayRow.returnRow.indicatorValue || "—"}</span>
                            )}
                          </td>
                          <td className={cn("px-2 py-1.5 text-slate-700 align-top", isTableFirst ? "" : dataCellBorder)}>{displayRow.returnRow.rawIndicatorValue}</td>
                          <td className={cn("px-2 py-1.5 text-slate-700 align-top", isTableFirst ? "" : dataCellBorder)}>{displayRow.returnRow.indicatorUnit}</td>
                          <td className={cn("px-2 py-1.5 text-slate-700 align-top", isTableFirst ? "" : dataCellBorder)}>{displayRow.returnRow.publishedAt}</td>
                          <td className={cn("px-2 py-1.5 text-slate-700 align-top", isTableFirst ? "" : dataCellBorder)}>{displayRow.returnRow.sourceSite}</td>
                          <td className={cn("px-2 py-1.5 text-slate-700 align-top", isTableFirst ? "" : dataCellBorder)}>{displayRow.returnRow.maxValue}</td>
                          <td className={cn("px-2 py-1.5 text-slate-700 align-top", isTableFirst ? "" : dataCellBorder)}>{displayRow.returnRow.minValue}</td>
                          <td className={cn("px-2 py-1.5 text-primary", isTableFirst ? "" : dataCellBorder)}>
                            {displayRow.returnRow.sourceUrl ? (
                              <a href={displayRow.returnRow.sourceUrl} target="_blank" rel="noreferrer" className="hover:underline" onClick={(e) => e.stopPropagation()}>
                                {displayRow.returnRow.sourceUrl}
                              </a>
                            ) : (
                              ""
                            )}
                          </td>
                          <td className={cn("px-2 py-1.5 text-slate-700 align-top", isTableFirst ? "" : dataCellBorder)}>{displayRow.returnRow.quoteText}</td>
                          <td className={cn("px-2 py-1.5 text-slate-700 align-top", isTableFirst ? "" : dataCellBorder)}>{displayRow.returnRow.indicatorLogic}</td>
                          <td className={cn("px-2 py-1.5 text-slate-700 align-top", isTableFirst ? "" : dataCellBorder)}>{displayRow.returnRow.indicatorLogicSupplement}</td>
                        </tr>
                      );
                    });
                  })()
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed bg-background px-4 py-8 text-center text-xs text-muted-foreground">
          {usesBusinessDateAxis ? "当前业务日期下还没有任务执行记录。" : "当前还没有全量快照任务组执行记录。"}
        </div>
      )}

      {selectedIndicatorDetail ? (
        <IndicatorValueDetailPopup
          state={selectedIndicatorDetail}
          onClose={() => setSelectedIndicatorDetail(null)}
        />
      ) : null}
    </div>
  );
}

function IndicatorValueDetailPopup({
  state,
  onClose,
}: {
  state: SelectedIndicatorValueModalState;
  onClose: () => void;
}) {
  const { taskGroup, taskRowLabel, returnRow, fillingResult } = state;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="指标值填充详情"
    >
      <div
        className="w-full max-w-3xl rounded-xl border bg-card shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h4 className="text-sm font-semibold">指标值填充详情</h4>
            <div className="mt-1 text-xs text-muted-foreground">
              {returnRow.indicatorName} · {taskRowLabel} · 任务组 {taskGroup.id}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            关闭
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="grid gap-3 md:grid-cols-3">
            <PopupMetaField
              label={taskGroup.businessDate ? "业务日期" : "任务组分区"}
              value={taskGroup.businessDate || taskGroup.partitionLabel || "全量快照"}
            />
            <PopupMetaField label="语义类型" value={SEMANTIC_KIND_LABELS[fillingResult.semantic.kind]} />
            <PopupMetaField label="置信度" value={`${(fillingResult.semantic.confidence * 100).toFixed(0)}%`} />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <div className="text-[11px] text-muted-foreground">原始值</div>
              <div className="font-mono text-xs break-words">{fillingResult.rawValue || "—"}</div>
            </div>
            <div className="space-y-1">
              <div className="text-[11px] text-muted-foreground">最终值</div>
              <div className="font-mono text-xs font-medium break-words">{fillingResult.finalValue || "—"}</div>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <div className="text-[11px] text-muted-foreground">状态</div>
              <div>
                <span className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]",
                  fillingStatusColor[fillingResult.status],
                )}>
                  {fillingResult.status === "filled" ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : fillingResult.status === "low_confidence" ? (
                    <AlertTriangle className="h-3 w-3" />
                  ) : fillingResult.status === "error" ? (
                    <XCircle className="h-3 w-3" />
                  ) : null}
                  {fillingStatusLabel[fillingResult.status]}
                </span>
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-[11px] text-muted-foreground">命中规则</div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] text-primary">{fillingResult.ruleId}</span>
                <span className="text-muted-foreground">{fillingResult.ruleName}</span>
              </div>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <PopupMetaField label="单位" value={returnRow.indicatorUnit || "—"} />
            <PopupMetaField label="来源站点" value={returnRow.sourceSite || "—"} />
          </div>
          <div className="space-y-1">
            <div className="text-[11px] text-muted-foreground">语义判断说明</div>
            <div className="text-xs text-muted-foreground leading-relaxed">{fillingResult.semantic.reasoning}</div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <div className="text-[11px] text-muted-foreground">原文摘录</div>
              <div className="text-xs text-muted-foreground leading-relaxed">{returnRow.quoteText || "—"}</div>
            </div>
            <div className="space-y-1">
              <div className="text-[11px] text-muted-foreground">来源 URL</div>
              <div className="text-xs break-all">
                {returnRow.sourceUrl ? (
                  <a href={returnRow.sourceUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                    {returnRow.sourceUrl}
                  </a>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </div>
            </div>
          </div>
          <pre className="max-h-[55vh] overflow-auto rounded-md border bg-background p-3 text-[11px] font-mono leading-relaxed">
            {JSON.stringify(fillingResult.semantic, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}

function PopupMetaField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/10 px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm">{value}</div>
    </div>
  );
}

// ==================== 宽表视图 ====================

function WideTableViewSection({
  requirement,
  wideTable,
  rawRows,
  processedRows,
  wideTableRecords,
  taskGroups,
  fetchTasks,
  scheduleJobs,
  enabledCategories,
  showProcessed,
  onOpenTaskModal,
}: {
  requirement: Requirement;
  wideTable: WideTable;
  rawRows: WideTableProcessingRow[];
  processedRows: WideTableProcessingRow[];
  wideTableRecords: WideTableRecord[];
  taskGroups: TaskGroup[];
  fetchTasks: FetchTask[];
  scheduleJobs: ScheduleJob[];
  enabledCategories: Set<PreprocessRule["category"]>;
  showProcessed: boolean;
  onOpenTaskModal: (state: SelectedTaskModalState) => void;
}) {
  const usesBusinessDateAxis = hasWideTableBusinessDateDimension(wideTable);
  const businessDateColumnName = wideTable.schema.columns.find((column) => column.isBusinessDate)?.name ?? "BIZ_DATE";
  const businessDates = useMemo(() => {
    if (!usesBusinessDateAxis) {
      return [];
    }
    const values = Array.from(
      new Set(rawRows.map((row) => row.values[businessDateColumnName]).filter((value) => value && value.trim() !== "")),
    );
    return values.sort((left, right) => right.localeCompare(left));
  }, [businessDateColumnName, rawRows, usesBusinessDateAxis]);
  const fetchTasksByTaskGroupId = useMemo(() => {
    const grouped = new Map<string, FetchTask[]>();
    for (const task of fetchTasks) {
      grouped.set(task.taskGroupId, [...(grouped.get(task.taskGroupId) ?? []), task]);
    }
    return grouped;
  }, [fetchTasks]);
  const trialTaskGroups = useMemo(
    () => taskGroups.filter((taskGroup) => (
      taskGroup.triggeredBy === "trial"
      && (Boolean(taskGroup.rowSnapshots?.length) || Boolean(fetchTasksByTaskGroupId.get(taskGroup.id)?.length))
    )),
    [fetchTasksByTaskGroupId, taskGroups],
  );
  const visibleAllBusinessDates = useMemo(
    () => limitFutureBusinessDates(businessDates, { now: new Date(), maxFuturePeriods: 1 }),
    [businessDates],
  );
  const fullSnapshotPages = useMemo(
    () => (usesBusinessDateAxis ? [] : buildDisplayableFullSnapshotTaskGroupPages(taskGroups, scheduleJobs)),
    [scheduleJobs, taskGroups, usesBusinessDateAxis],
  );
  const [selectedBusinessDate, setSelectedBusinessDate] = useState<string>(businessDates[0] ?? "");
  const [selectedYear, setSelectedYear] = useState<string>("");
  const [selectedPageKey, setSelectedPageKey] = useState<string>(() => {
    const first = fullSnapshotPages[0];
    return first ? (first.scheduleJobId ?? first.taskGroupId) : "";
  });
  const [showDiff, setShowDiff] = useState(false);
  const isMonthlyFrequency = usesBusinessDateAxis && wideTable.businessDateRange.frequency === "monthly";

  const businessYears = useMemo(() => {
    if (!isMonthlyFrequency) return [];
    const years = Array.from(new Set(
      visibleAllBusinessDates.map((d) => extractBusinessDateYear(d)).filter((y): y is string => Boolean(y)),
    ));
    return years.sort((a, b) => b.localeCompare(a));
  }, [isMonthlyFrequency, visibleAllBusinessDates]);

  const effectiveSelectedYear = useMemo(() => {
    if (!isMonthlyFrequency || businessYears.length === 0) return "";
    if (selectedYear && businessYears.includes(selectedYear)) return selectedYear;
    return pickDefaultBusinessYear(businessYears, { now: new Date() });
  }, [businessYears, isMonthlyFrequency, selectedYear]);

  useEffect(() => {
    if (!isMonthlyFrequency) return;
    if (businessYears.length === 0) { if (selectedYear) setSelectedYear(""); return; }
    if (selectedYear !== effectiveSelectedYear) setSelectedYear(effectiveSelectedYear);
  }, [businessYears, effectiveSelectedYear, isMonthlyFrequency, selectedYear]);

  const visibleBusinessDates = useMemo(() => {
    const scopedDates = visibleAllBusinessDates;
    if (!isMonthlyFrequency || !effectiveSelectedYear) return scopedDates;
    return scopedDates.filter((d) => String(d).slice(0, 4) === effectiveSelectedYear);
  }, [effectiveSelectedYear, isMonthlyFrequency, visibleAllBusinessDates]);
  const visibleBusinessDateOptions = useMemo(
    () => [
      ...trialTaskGroups.map((taskGroup) => ({
        key: taskGroup.id,
        label: `试运行 ${taskGroup.businessDateLabel || taskGroup.businessDate || ""}`.trim(),
        isTrial: true,
      })),
      ...visibleBusinessDates.map((businessDate) => ({
        key: businessDate,
        label: isMonthlyFrequency ? `${extractBusinessDateMonth(businessDate) ?? String(businessDate).slice(5, 7)}月` : businessDate,
        isTrial: false,
      })),
    ],
    [isMonthlyFrequency, trialTaskGroups, visibleBusinessDates],
  );

  useEffect(() => {
    if (visibleBusinessDateOptions.length > 0 && !visibleBusinessDateOptions.some((item) => item.key === selectedBusinessDate)) {
      setSelectedBusinessDate(visibleBusinessDateOptions[0]?.key ?? "");
    }
  }, [visibleBusinessDateOptions, selectedBusinessDate]);

  useEffect(() => {
    if (usesBusinessDateAxis) return;
    if (fullSnapshotPages.length === 0) {
      if (selectedPageKey) setSelectedPageKey("");
      return;
    }
    if (!fullSnapshotPages.some((p) => snapshotPageKey(p) === selectedPageKey)) {
      setSelectedPageKey(snapshotPageKey(fullSnapshotPages[0]));
    }
  }, [fullSnapshotPages, selectedPageKey, usesBusinessDateAxis]);

  const activeSnapshotPage = useMemo(
    () => fullSnapshotPages.find((p) => snapshotPageKey(p) === selectedPageKey) ?? fullSnapshotPages[0] ?? null,
    [fullSnapshotPages, selectedPageKey],
  );
  const activeSnapshotTaskGroup = useMemo(
    () => taskGroups.find((taskGroup) => taskGroup.id === activeSnapshotPage?.taskGroupId) ?? null,
    [activeSnapshotPage, taskGroups],
  );
  const activeSnapshotRecords = useMemo(() => {
    if (!activeSnapshotTaskGroup) {
      return wideTableRecords.filter((record) => record.wideTableId === wideTable.id);
    }
    return activeSnapshotTaskGroup.rowSnapshots?.length
      ? activeSnapshotTaskGroup.rowSnapshots
      : wideTableRecords.filter((record) => record.wideTableId === wideTable.id);
  }, [activeSnapshotTaskGroup, wideTable.id, wideTableRecords]);
  const activeSnapshotRows = useMemo(
    () => (
      usesBusinessDateAxis
        ? null
        : buildWideTableProcessingRows(wideTable, activeSnapshotRecords, enabledCategories)
    ),
    [activeSnapshotRecords, enabledCategories, usesBusinessDateAxis, wideTable],
  );

  // 上一个快照的行数据（用于全量更新 diff）
  const previousSnapshotRowMap = useMemo(() => {
    if (usesBusinessDateAxis || fullSnapshotPages.length < 2 || !activeSnapshotPage) return null;
    const currentIndex = fullSnapshotPages.findIndex((p) => snapshotPageKey(p) === snapshotPageKey(activeSnapshotPage));
    const previousPage = fullSnapshotPages[currentIndex + 1];
    if (!previousPage) return null;
    const previousTaskGroup = taskGroups.find((tg) => tg.id === previousPage.taskGroupId);
    if (!previousTaskGroup) return null;
    const previousRecords = previousTaskGroup.rowSnapshots?.length
      ? previousTaskGroup.rowSnapshots
      : wideTableRecords.filter((r) => r.wideTableId === wideTable.id);
    return buildWideTableProcessingDiffRowMap(wideTable, previousRecords, enabledCategories);
  }, [activeSnapshotPage, enabledCategories, fullSnapshotPages, taskGroups, usesBusinessDateAxis, wideTable, wideTableRecords]);

  const activeBusinessDateTaskGroups = useMemo(
    () => {
      if (!usesBusinessDateAxis || !selectedBusinessDate) {
        return [];
      }
      return taskGroups
        .filter((taskGroup) => taskGroup.businessDate === selectedBusinessDate && taskGroup.triggeredBy !== "trial")
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    },
    [selectedBusinessDate, taskGroups, usesBusinessDateAxis],
  );
  const activeBusinessDateTaskGroupIds = useMemo(
    () => new Set(activeBusinessDateTaskGroups.map((taskGroup) => taskGroup.id)),
    [activeBusinessDateTaskGroups],
  );
  const activeBusinessDateFetchTasks = useMemo(
    () => fetchTasks.filter((task) => activeBusinessDateTaskGroupIds.has(task.taskGroupId)),
    [activeBusinessDateTaskGroupIds, fetchTasks],
  );
  const activeTrialTaskGroup = useMemo(
    () => trialTaskGroups.find((taskGroup) => taskGroup.id === selectedBusinessDate) ?? null,
    [selectedBusinessDate, trialTaskGroups],
  );
  const activeTrialFetchTasks = useMemo(
    () => (activeTrialTaskGroup ? fetchTasksByTaskGroupId.get(activeTrialTaskGroup.id) ?? [] : []),
    [activeTrialTaskGroup, fetchTasksByTaskGroupId],
  );
  const visibleTaskGroups = activeTrialTaskGroup ? [activeTrialTaskGroup] : activeBusinessDateTaskGroups;
  const visibleFetchTasks = activeTrialTaskGroup ? activeTrialFetchTasks : activeBusinessDateFetchTasks;

  const visibleRawRows = useMemo(
    () => {
      if (!usesBusinessDateAxis) {
        return activeSnapshotRows?.rawRows ?? rawRows;
      }
      const trialTaskGroup = trialTaskGroups.find((taskGroup) => taskGroup.id === selectedBusinessDate);
      if (trialTaskGroup) {
        if (trialTaskGroup.rowSnapshots?.length) {
          return buildWideTableProcessingRows(wideTable, trialTaskGroup.rowSnapshots, enabledCategories).rawRows;
        }
        const trialRowIds = new Set((fetchTasksByTaskGroupId.get(trialTaskGroup.id) ?? []).map((task) => task.rowId));
        return rawRows.filter((row) => trialRowIds.has(resolveProcessingRowId(row)));
      }
      const dateRows = selectedBusinessDate
        ? rawRows.filter((row) => row.values[businessDateColumnName] === selectedBusinessDate)
        : rawRows;
      return dateRows;
    },
    [activeSnapshotRows, businessDateColumnName, enabledCategories, fetchTasksByTaskGroupId, rawRows, selectedBusinessDate, trialTaskGroups, usesBusinessDateAxis, wideTable],
  );
  const visibleProcessedRows = useMemo(
    () => {
      if (!usesBusinessDateAxis) {
        return activeSnapshotRows?.processedRows ?? processedRows;
      }
      const trialTaskGroup = trialTaskGroups.find((taskGroup) => taskGroup.id === selectedBusinessDate);
      if (trialTaskGroup) {
        if (trialTaskGroup.rowSnapshots?.length) {
          return buildWideTableProcessingRows(wideTable, trialTaskGroup.rowSnapshots, enabledCategories).processedRows;
        }
        const trialRowIds = new Set((fetchTasksByTaskGroupId.get(trialTaskGroup.id) ?? []).map((task) => task.rowId));
        return processedRows.filter((row) => trialRowIds.has(resolveProcessingRowId(row)));
      }
      const dateRows = selectedBusinessDate
        ? processedRows.filter((row) => row.values[businessDateColumnName] === selectedBusinessDate)
        : processedRows;
      return dateRows;
    },
    [activeSnapshotRows, businessDateColumnName, enabledCategories, fetchTasksByTaskGroupId, processedRows, selectedBusinessDate, trialTaskGroups, usesBusinessDateAxis, wideTable],
  );

  return (
    <div className="rounded-lg border bg-background p-4 space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-1">
          <h4 className="text-sm font-semibold">{wideTable.name}</h4>
          <p className="text-xs text-muted-foreground">{wideTable.description}</p>
        </div>
        <div className="text-xs text-muted-foreground">
          {usesBusinessDateAxis ? "按业务日期分页查看，点亮的指标单元格可查看对应任务。" : "按任务组开始调度时间分页查看，点亮的指标单元格可查看对应任务。"}
        </div>
      </div>

      {usesBusinessDateAxis && visibleBusinessDateOptions.length > 0 ? (
        <div className="space-y-2">
          {isMonthlyFrequency && businessYears.length > 0 ? (
            <div className={cn("flex gap-2 overflow-x-auto pb-1", businessYears.length > 1 ? "border-b" : "")}>
              {businessYears.length > 1 ? (
                businessYears.map((year) => (
                  <button key={year} type="button" onClick={() => setSelectedYear(year)}
                    className={cn("shrink-0 px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors",
                      effectiveSelectedYear === year ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted",
                    )}>
                    {year}年
                  </button>
                ))
              ) : (
                <div className="shrink-0 px-3 py-1.5 text-xs font-medium text-muted-foreground">{businessYears[0]}年</div>
              )}
            </div>
          ) : null}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {visibleBusinessDateOptions.map((item) => (
              <button key={item.key} type="button" onClick={() => setSelectedBusinessDate(item.key)}
                className={cn("shrink-0 rounded-md border px-3 py-1.5 text-xs",
                  selectedBusinessDate === item.key ? "border-primary bg-primary/10 text-primary" : "bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
                  item.isTrial && "border-sky-300 bg-sky-50 text-sky-700",
                )}>
                {item.label}
              </button>
            ))}
          </div>
        </div>
      ) : !usesBusinessDateAxis && fullSnapshotPages.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              每次执行对应一个快照版本，分页标签展示的是该次执行的开始时间。
            </div>
            {previousSnapshotRowMap && (
              <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground shrink-0 ml-4">
                <input type="checkbox" checked={showDiff} onChange={(e) => setShowDiff(e.target.checked)} />
                <span>展示差异</span>
              </label>
            )}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {fullSnapshotPages.map((page) => (
              <button
                key={snapshotPageKey(page)}
                type="button"
                onClick={() => setSelectedPageKey(snapshotPageKey(page))}
                className={cn(
                  "shrink-0 rounded-md border px-3 py-1.5 text-xs",
                  selectedPageKey === snapshotPageKey(page)
                    ? "border-primary bg-primary/10 text-primary"
                    : "bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
                )}
                title={`${page.pageHint} · ${page.taskGroupId}`}
              >
                {page.pageLabel}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {showProcessed ? (
        <WideTableCard title="结果预览" requirement={requirement} wideTable={wideTable}
          rows={visibleProcessedRows} rawRows={visibleRawRows} wideTableRecords={usesBusinessDateAxis ? wideTableRecords : activeSnapshotRecords}
          taskGroups={usesBusinessDateAxis ? visibleTaskGroups : activeSnapshotTaskGroup ? [activeSnapshotTaskGroup] : []}
          fetchTasks={usesBusinessDateAxis ? visibleFetchTasks : activeSnapshotTaskGroup ? fetchTasks.filter((task) => task.taskGroupId === activeSnapshotTaskGroup.id) : []}
          onOpenTaskModal={onOpenTaskModal} annotateRawDifference compact
          diffMode={showDiff && !usesBusinessDateAxis ? previousSnapshotRowMap ?? undefined : undefined}
          emptyMessage={usesBusinessDateAxis ? "当前业务日期下还没有可展示的结果预览。" : "当前任务组下还没有可展示的结果预览。"} />
      ) : (
        <WideTableCard title="结果预览" requirement={requirement} wideTable={wideTable}
          rows={visibleRawRows} rawRows={visibleRawRows} wideTableRecords={usesBusinessDateAxis ? wideTableRecords : activeSnapshotRecords}
          taskGroups={usesBusinessDateAxis ? visibleTaskGroups : activeSnapshotTaskGroup ? [activeSnapshotTaskGroup] : []}
          fetchTasks={usesBusinessDateAxis ? visibleFetchTasks : activeSnapshotTaskGroup ? fetchTasks.filter((task) => task.taskGroupId === activeSnapshotTaskGroup.id) : []}
          onOpenTaskModal={onOpenTaskModal}
          diffMode={showDiff && !usesBusinessDateAxis ? previousSnapshotRowMap ?? undefined : undefined}
          emptyMessage={usesBusinessDateAxis ? "当前业务日期下还没有可展示的结果预览。" : "当前任务组下还没有可展示的结果预览。"} />
      )}
    </div>
  );
}

function WideTableCard({
  title, requirement, wideTable, rows, rawRows, wideTableRecords, taskGroups, fetchTasks,
  onOpenTaskModal, annotateRawDifference = false, compact = false, emptyMessage, diffMode,
}: {
  title: string; requirement: Requirement; wideTable: WideTable;
  rows: WideTableProcessingRow[]; rawRows: WideTableProcessingRow[];
  wideTableRecords: WideTableRecord[]; taskGroups: TaskGroup[]; fetchTasks: FetchTask[];
  onOpenTaskModal: (state: SelectedTaskModalState) => void;
  annotateRawDifference?: boolean; compact?: boolean;
  emptyMessage?: string;
  diffMode?: Map<string, WideTableProcessingRow>;
}) {
  const columns = wideTable.schema.columns;
  const indicatorColumns = columns.filter((column) => column.category === "indicator");

  // diff 模式：只保留有差异的行，并构建 previousValue 查找
  const { displayRows, diffPreviousMap } = useMemo(() => {
    if (!diffMode) return { displayRows: rows, diffPreviousMap: null };
    const indicatorNames = new Set(indicatorColumns.map((c) => c.name));
    const filteredRows: WideTableProcessingRow[] = [];
    const prevMap = new Map<number, Record<string, string>>();
    for (const row of rows) {
      const key = getWideTableDimensionBindingKey(wideTable, row.values);
      const prevRow = diffMode.get(key);
      if (!prevRow) {
        // 新增行，全部视为差异
        filteredRows.push(row);
        prevMap.set(row.recordId, {});
        continue;
      }
      const changedCols: Record<string, string> = {};
      let hasDiff = false;
      for (const colName of Array.from(indicatorNames)) {
        const cur = (row.values[colName] ?? "").trim();
        const prev = (prevRow.values[colName] ?? "").trim();
        if (cur !== prev) {
          changedCols[colName] = prev;
          hasDiff = true;
        }
      }
      if (hasDiff) {
        filteredRows.push(row);
        prevMap.set(row.recordId, changedCols);
      }
    }
    return { displayRows: filteredRows, diffPreviousMap: prevMap };
  }, [diffMode, indicatorColumns, rows, wideTable]);

  const totalIndicatorCells = displayRows.length * indicatorColumns.length;
  const filledIndicatorCells = displayRows.reduce((sum, row) => sum + row.filledIndicatorCount, 0);
  const taskRangeContext = useMemo(
    () => buildTaskRangeContext(requirement, wideTable, taskGroups, fetchTasks),
    [fetchTasks, requirement, taskGroups, wideTable],
  );
  const rawRowMap = useMemo(() => new Map(rawRows.map((row) => [row.recordId, row])), [rawRows]);

  const recordCardsMap = useMemo(() => {
    const map = new Map<number, FetchTaskCardView[]>();
    for (const row of rows) {
      // Find active tasks based on cell binding later if needed, but we can compute card sets per row context
      // To save compute, we compute on demand in the column loop or grouped by taskGroup.
    }
    return map;
  }, [rows]);

  const handleOpenTask = (row: WideTableProcessingRow, taskGroup: TaskGroup, indicatorGroupId: string) => {
    const rowId = resolveProcessingRowId(row);
    const snapshotRecord: WideTableRecord = { id: rowId, wideTableId: wideTable.id, ...row.values, ROW_ID: row.values.ROW_ID ?? rowId };
    const cards = buildFetchTaskCardViews({
      wideTable, taskGroup,
      fetchTasks: fetchTasks.filter((task) => task.taskGroupId === taskGroup.id),
      wideTableRecords: [...wideTableRecords, snapshotRecord],
    });
    const taskCard = cards.find((task) => task.rowId === rowId && task.indicatorGroupId === indicatorGroupId);
    if (!taskCard) return;
    onOpenTaskModal({ wideTable, taskGroup, taskCard: hydrateTaskCardFromRowSnapshot(wideTable, taskCard, row, indicatorGroupId) });
  };

  return (
    <div className={cn("rounded-lg border bg-background space-y-3", compact ? "p-3" : "p-4")}>
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <h5 className="text-sm font-semibold">{title}</h5>
        <div className="space-y-1 text-xs text-muted-foreground md:text-right">
          <div>当前展示 {displayRows.length} 行{diffPreviousMap ? `（${displayRows.length} 行有差异）` : ""}，已填充 {filledIndicatorCells}/{totalIndicatorCells} 个指标值</div>
          {taskRangeContext.indicatorGroups.length > 0 ? (
            <div className="flex items-center gap-2 md:justify-end whitespace-nowrap">
              <span className="shrink-0">指标组：</span>
              <div className="flex items-center gap-2 overflow-x-auto">
                {taskRangeContext.indicatorGroups.map((group, index) => (
                  <span key={group.id} className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-[11px]", taskRangeTone(index).badge)}>
                    {group.name}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-max text-xs">
          <thead className="border-b">
            <tr>
              {columns.map((column) => {
                const headerBinding = resolveIndicatorGroupBinding(column, taskRangeContext);
                return (
                  <th key={column.id}
                    className={cn("min-w-28 px-2 py-2 text-left align-bottom", columnHeaderClassName(column, headerBinding?.tone))}
                    title={headerBinding ? `指标组：${headerBinding.group.name}` : undefined}>
                    <div className="font-medium text-foreground">{column.chineseName ?? column.name}</div>
                    <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">{column.name}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y">
            {displayRows.length === 0 ? (
              <tr><td colSpan={columns.length} className="px-3 py-6 text-center text-xs text-muted-foreground">{diffPreviousMap ? "当前快照与上一快照无差异。" : (emptyMessage ?? "当前业务日期下还没有可展示的结果预览。")}</td></tr>
            ) : displayRows.map((row) => (
              <tr key={row.recordId}>
                {columns.map((column) => {
                  let value = row.values[column.name] ?? "";
                  let rawValue = rawRowMap.get(row.recordId)?.values[column.name] ?? "";
                  const cellBinding = resolveIndicatorCellBinding(row, column, taskRangeContext);
                  const taskGroup = cellBinding?.taskGroup;
                  
                  if (taskGroup && column.category === "indicator") {
                    const cards = buildFetchTaskCardViews({
                      wideTable, taskGroup,
                      fetchTasks: fetchTasks.filter((task) => task.taskGroupId === taskGroup.id),
                      wideTableRecords,
                    });
                    
                    const colName = column.chineseName ?? column.name;
                    const matchingTask = cards.find(
                      (task) => task.rowId === resolveProcessingRowId(row) && task.indicatorGroupId === cellBinding.group.id
                    );

                    if (matchingTask && matchingTask.status === "completed") {
                      const returnRow = matchingTask.returnRows.find(rr => rr.indicatorName === colName);
                      if (returnRow) {
                        value = returnRow.indicatorValue || returnRow.rawIndicatorValue || value;
                        rawValue = returnRow.rawIndicatorValue || rawValue;
                      }
                    }
                  }

                  const diffPrev = diffPreviousMap?.get(row.recordId);
                  const isDiffCell = diffPrev != null && column.category === "indicator" && column.name in diffPrev;
                  const cellClassName = columnCellClassName(column, value, cellBinding?.tone);
                  const showRawDifference = !diffPreviousMap && annotateRawDifference && column.category === "indicator" && rawValue && value && rawValue !== value;
                  const cellContent = (
                    <>
                      <span>{value || "\u00A0"}</span>
                      {isDiffCell ? <span className="ml-1 text-[11px] text-orange-500 line-through">{diffPrev[column.name] || "空"}</span> : null}
                      {showRawDifference ? <span className="ml-1 text-[11px] text-red-600">({rawValue})</span> : null}
                    </>
                  );

                  if (taskGroup) {
                    return (
                      <td key={column.id} className="p-0 align-top">
                        <button type="button" onClick={() => handleOpenTask(row, taskGroup, cellBinding.group.id)}
                          className={cn("block w-full px-2 py-2 text-left transition-colors", cellClassName, "hover:underline")}
                          title={`任务范围：${cellBinding.group.name}；点击查看对应任务`}>
                          {cellContent}
                        </button>
                      </td>
                    );
                  }

                  return (
                    <td key={column.id} className={cn("px-2 py-2 align-top text-muted-foreground", cellClassName)}
                      title={cellBinding ? `任务范围：${cellBinding.group.name}` : undefined}>
                      {cellContent}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EmptyWideTableState() {
  return (
    <div className="rounded-lg border border-dashed bg-background px-4 py-8 text-center text-xs text-muted-foreground">
      当前需求暂无可展示的结果预览。
    </div>
  );
}

// ==================== 辅助函数 ====================

function hydrateTaskCardFromRowSnapshot(
  wideTable: WideTable, taskCard: FetchTaskCardView, row: WideTableProcessingRow, indicatorGroupId: string,
): FetchTaskCardView {
  if (taskCard.returnRows.some((item) => item.indicatorValue || item.rawIndicatorValue)) return taskCard;
  const indicatorGroup = wideTable.indicatorGroups.find((group) => group.id === indicatorGroupId);
  const indicatorColumnNames = indicatorGroup?.indicatorColumns ?? wideTable.schema.columns.filter((c) => c.category === "indicator").map((c) => c.name);
  const indicatorColumns = wideTable.schema.columns.filter((c) => c.category === "indicator" && indicatorColumnNames.includes(c.name));
  if (indicatorColumns.length === 0) return taskCard;
  return {
    ...taskCard,
    returnRows: taskCard.returnRows.map((returnRow, index) => {
      const column = indicatorColumns[index];
      if (!column) return returnRow;
      const snapshotValue = row.values[column.name] ?? "";
      if (!snapshotValue) return returnRow;
      return { ...returnRow, indicatorValue: returnRow.indicatorValue || snapshotValue, rawIndicatorValue: returnRow.rawIndicatorValue || snapshotValue };
    }),
  };
}

function buildTaskRangeContext(requirement: Requirement, wideTable: WideTable, taskGroups: TaskGroup[], fetchTasks: FetchTask[]) {
  const indicatorGroups = resolveIndicatorGroups(wideTable);
  const columnGroupMap = new Map<string, IndicatorGroupLike>();
  indicatorGroups.forEach((group) => { group.indicatorColumns.forEach((columnName) => { columnGroupMap.set(columnName, group); }); });

  const currentPlanVersion = wideTable.currentPlanVersion ?? Math.max(
    1, ...taskGroups.filter((item) => item.wideTableId === wideTable.id).map((tg) => resolveTaskGroupPlanVersion(tg, 1)),
  );
  const scopedTaskGroups = taskGroups
    .filter((item) => item.wideTableId === wideTable.id && resolveTaskGroupPlanVersion(item, currentPlanVersion) === currentPlanVersion)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const taskGroupByBindingKey = new Map<string, TaskGroup>();
  const taskGroupByRowIdKey = new Map<string, TaskGroup>();

  for (const taskGroup of scopedTaskGroups) {
    for (const record of taskGroup.rowSnapshots ?? []) {
      const bindingKey = buildTaskGroupBindingKey(wideTable, taskGroup.businessDate, record);
      if (!taskGroupByBindingKey.has(bindingKey)) taskGroupByBindingKey.set(bindingKey, taskGroup);
      const rowIdKey = buildTaskGroupRowIdKey(taskGroup.businessDate, Number(record.ROW_ID ?? record.id));
      if (!taskGroupByRowIdKey.has(rowIdKey)) taskGroupByRowIdKey.set(rowIdKey, taskGroup);
    }
    for (const task of fetchTasks.filter((item) => item.taskGroupId === taskGroup.id)) {
      const rowIdKey = buildTaskGroupRowIdKey(taskGroup.businessDate, task.rowId);
      if (!taskGroupByRowIdKey.has(rowIdKey)) taskGroupByRowIdKey.set(rowIdKey, taskGroup);
    }
  }

  return { requirement, wideTable, indicatorGroups, columnGroupMap, currentPlanVersion, taskGroupByBindingKey, taskGroupByRowIdKey };
}

function resolveIndicatorGroups(wideTable: WideTable): IndicatorGroupLike[] {
  if (wideTable.indicatorGroups.length > 0) {
    return [...wideTable.indicatorGroups].sort((a, b) => a.priority - b.priority).map((g) => ({
      id: g.id, name: g.name, indicatorColumns: g.indicatorColumns, priority: g.priority,
    }));
  }
  return [];
}

function resolveIndicatorGroupBinding(column: ColumnDefinition, context: ReturnType<typeof buildTaskRangeContext>): { group: IndicatorGroupLike; tone: ToneDefinition } | null {
  if (column.category !== "indicator") return null;
  const group = context.columnGroupMap.get(column.name);
  if (!group) return null;
  const toneIndex = context.indicatorGroups.findIndex((item) => item.id === group.id);
  return { group, tone: taskRangeTone(toneIndex) };
}

function resolveIndicatorCellBinding(
  row: WideTableProcessingRow, column: ColumnDefinition, context: ReturnType<typeof buildTaskRangeContext>,
): { group: IndicatorGroupLike; taskGroup?: TaskGroup; tone: ToneDefinition } | null {
  const headerBinding = resolveIndicatorGroupBinding(column, context);
  if (!headerBinding) return null;
  const businessDateColumnName = context.wideTable.schema.columns.find((item) => item.isBusinessDate)?.name ?? "BIZ_DATE";
  const businessDate = String(row.values[businessDateColumnName] ?? "");
  if (hasWideTableBusinessDateDimension(context.wideTable) && !businessDate) return { ...headerBinding };
  const bindingKey = buildTaskGroupBindingKey(context.wideTable, businessDate, row.values);
  const rowId = resolveProcessingRowId(row);
  const today = formatBusinessDateForFrequency(
    new Date(),
    context.wideTable.businessDateRange.frequency,
  );
  const taskGroup = context.taskGroupByBindingKey.get(bindingKey)
    ?? context.taskGroupByRowIdKey.get(buildTaskGroupRowIdKey(businessDate, rowId))
    ?? (businessDate > today
      ? buildPlannedTaskGroup(context.wideTable.id, businessDate, context.currentPlanVersion, today)
      : undefined);
  return { ...headerBinding, taskGroup };
}

function buildPlannedTaskGroup(wideTableId: string, businessDate: string, planVersion: number, today: string): TaskGroup {
  const triggeredBy = businessDate <= today ? "backfill" : "schedule";
  return { id: `tg_planned_${businessDate}`, wideTableId, businessDate, businessDateLabel: businessDate, planVersion, status: "pending", totalTasks: 0, pendingTasks: 0, runningTasks: 0, completedTasks: 0, failedTasks: 0, cancelledTasks: 0, invalidatedTasks: 0, triggeredBy, createdAt: "", updatedAt: "" };
}

function taskRangeTone(index: number): ToneDefinition { return TASK_RANGE_TONES[Math.max(0, index) % TASK_RANGE_TONES.length]; }

function buildTaskGroupBindingKey(wideTable: WideTable, businessDate: string, record: Record<string, unknown>): string {
  if (!hasWideTableBusinessDateDimension(wideTable)) {
    return getWideTableDimensionBindingKey(wideTable, record);
  }
  return `${businessDate}::${getWideTableDimensionBindingKey(wideTable, record)}`;
}

function buildTaskGroupRowIdKey(businessDate: string, rowId: number): string { return `${businessDate}::${rowId}`; }

function resolveProcessingRowId(row: WideTableProcessingRow): number {
  const rowId = Number(row.values.ROW_ID ?? row.recordId);
  return Number.isFinite(rowId) ? rowId : row.recordId;
}

function columnHeaderClassName(column: ColumnDefinition, tone?: ToneDefinition): string {
  if (column.category !== "indicator") return "bg-background";
  return tone?.header ?? "bg-amber-50/35";
}

function columnCellClassName(column: ColumnDefinition, value: string, tone?: ToneDefinition): string {
  if (column.category === "indicator" && tone) return value ? tone.filledCell : tone.emptyCell;
  if (column.category === "indicator") return value ? "bg-amber-50/40 text-foreground" : "bg-amber-50/20 text-muted-foreground";
  if (column.category === "id") return "font-mono text-foreground";
  if (column.category === "dimension") return "text-foreground";
  return "";
}
