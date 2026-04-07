"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Layers3,
  Pencil,
  Save,
  SkipForward,
  X,
  XCircle,
} from "lucide-react";
import {
  createAcceptanceTicket,
  updateAcceptanceTicket,
  updateWideTableRow,
} from "@/lib/api-client";
import {
  extractBusinessDateMonth,
  extractBusinessDateYear,
  formatBusinessDateLabel,
  limitFutureBusinessDates,
  pickDefaultBusinessYear,
} from "@/lib/business-date";
import {
  resolveRecordPlanVersion,
  resolveTaskGroupPlanVersion,
} from "@/lib/task-plan-reconciliation";
import {
  getTaskStatusBadgeClass,
  taskStatusLabel,
} from "@/lib/task-status-presentation";
import type {
  ColumnDefinition,
  FetchTask,
  Requirement,
  TaskGroup,
  WideTable,
  WideTableRecord,
} from "@/lib/types";
import type { AcceptanceTicket, ScheduleJob } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { hasWideTableBusinessDateDimension } from "@/lib/wide-table-mode";
import {
  buildDisplayableFullSnapshotTaskGroupPages,
  filterFullSnapshotScopedRows,
} from "@/lib/task-group-display";

// ==================== 验收状态类型 ====================

type TaskGroupReviewStatus = "pending" | "approved" | "rejected";

type TaskGroupReviewState = {
  status: TaskGroupReviewStatus;
  feedback?: string;
  reviewedAt?: string;
};

type IndicatorAction = "skip" | "fix_value";

type Props = {
  requirement: Requirement;
  wideTables: WideTable[];
  wideTableRecords: WideTableRecord[];
  taskGroups: TaskGroup[];
  fetchTasks: FetchTask[];
  scheduleJobs: ScheduleJob[];
  acceptanceTickets: AcceptanceTicket[];
  onRefreshData?: () => Promise<void>;
  onWideTableRecordsChange: (nextWideTableRecords: WideTableRecord[]) => void;
  onTaskGroupsChange: (nextTaskGroups: TaskGroup[]) => void;
  onFetchTasksChange: (nextFetchTasks: FetchTask[]) => void;
  navSource?: "projects" | "requirements" | "tasks" | "acceptance";
};

type AcceptanceCellBinding = {
  task?: FetchTask;
  taskGroup?: TaskGroup;
  indicatorColumns: string[];
  indicatorGroupName: string;
};

type AcceptanceRowView = {
  record: WideTableRecord;
  rowId: number;
  businessDate: string;
  businessDateLabel: string;
  rowLabel: string;
};

type AcceptanceWideTableView = {
  wideTable: WideTable;
  rows: AcceptanceRowView[];
  taskGroups: TaskGroup[];
  fetchTasks: FetchTask[];
  cellBindingMap: Map<string, AcceptanceCellBinding>;
  scheduleJobs: ScheduleJob[];
  usesBusinessDateAxis: boolean;
};

type SelectedCellState = {
  wideTableId: string;
  rowId: number;
  businessDate: string;
  columnName: string;
};

type ActiveCellTarget = {
  view: AcceptanceWideTableView;
  row: AcceptanceRowView;
  column: ColumnDefinition;
  binding?: AcceptanceCellBinding;
};

export default function RequirementAcceptancePanel({
  requirement,
  wideTables,
  wideTableRecords,
  taskGroups,
  fetchTasks,
  scheduleJobs,
  acceptanceTickets,
  onRefreshData,
  onWideTableRecordsChange,
  onTaskGroupsChange,
  onFetchTasksChange,
  navSource,
}: Props) {
  const [message, setMessage] = useState("");
  const [selectedCell, setSelectedCell] = useState<SelectedCellState | null>(null);
  const [modalDraftValue, setModalDraftValue] = useState("");
  const [modalAction, setModalAction] = useState<IndicatorAction>("skip");
  const [savingCellKeys, setSavingCellKeys] = useState<string[]>([]);
  const [reviewStates, setReviewStates] = useState<Map<string, TaskGroupReviewState>>(new Map());
  const [rejectFeedback, setRejectFeedback] = useState("");
  const [showRejectDialog, setShowRejectDialog] = useState<string | null>(null);
  const [showDiff, setShowDiff] = useState(false);

  const ticketByTaskGroupId = useMemo(() => {
    const map = new Map<string, AcceptanceTicket>();
    for (const ticket of acceptanceTickets) {
      if (!ticket.taskGroupId) continue;
      map.set(ticket.taskGroupId, ticket);
    }
    return map;
  }, [acceptanceTickets]);

  useEffect(() => {
    // Sync persisted acceptance statuses into local UI state.
    const next = new Map<string, TaskGroupReviewState>();
    ticketByTaskGroupId.forEach((ticket, taskGroupId) => {
      const normalized: TaskGroupReviewStatus =
        ticket.status === "approved"
          ? "approved"
          : ticket.status === "rejected" || ticket.status === "fixing"
          ? "rejected"
          : "pending";
      if (normalized === "pending") return;
      next.set(taskGroupId, {
        status: normalized,
        feedback: ticket.feedback || undefined,
        reviewedAt: ticket.latestActionAt || undefined,
      });
    });
    setReviewStates(next);
  }, [ticketByTaskGroupId]);

  const views = useMemo(
    () =>
      buildAcceptanceWideTableViews({
        wideTables,
        wideTableRecords,
        taskGroups,
        fetchTasks,
        scheduleJobs,
      }),
    [fetchTasks, scheduleJobs, taskGroups, wideTableRecords, wideTables],
  );

  const summary = useMemo(() => {
    const allTaskGroupIds = views.flatMap((v) => v.taskGroups.map((tg) => tg.id));
    const total = allTaskGroupIds.length;
    const approved = allTaskGroupIds.filter((id) => reviewStates.get(id)?.status === "approved").length;
    const rejected = allTaskGroupIds.filter((id) => reviewStates.get(id)?.status === "rejected").length;
    return { total, approved, rejected, pending: total - approved - rejected };
  }, [views, reviewStates]);

  const activeCellTarget = useMemo(
    () => resolveActiveCellTarget(views, selectedCell),
    [selectedCell, views],
  );

  useEffect(() => {
    if (!activeCellTarget) return;
    const currentValue = formatInputValue(activeCellTarget.row.record[activeCellTarget.column.name]);
    setModalDraftValue((prev) => (prev === "" ? currentValue : prev));
  }, [activeCellTarget]);

  const activeCellKey = activeCellTarget
    ? buildCellKey(
        activeCellTarget.view.wideTable.id,
        activeCellTarget.row.rowId,
        activeCellTarget.row.businessDate,
        activeCellTarget.column.name,
      )
    : null;
  const isSavingActiveCell = activeCellKey ? savingCellKeys.includes(activeCellKey) : false;

  const openCellModal = (target: ActiveCellTarget) => {
    setSelectedCell({
      wideTableId: target.view.wideTable.id,
      rowId: target.row.rowId,
      businessDate: target.row.businessDate,
      columnName: target.column.name,
    });
    setModalDraftValue(formatInputValue(target.row.record[target.column.name]));
    setModalAction("skip");
  };

  const closeCellModal = () => {
    setSelectedCell(null);
    setModalDraftValue("");
    setModalAction("skip");
  };

  const replaceRecordValueLocally = (
    wideTableId: string, rowId: number, columnName: string, value: string,
  ) => {
    onWideTableRecordsChange(
      wideTableRecords.map((record) =>
        record.wideTableId === wideTableId && getRecordRowId(record) === rowId
          ? {
              ...record,
              [columnName]: normalizePersistedValue(value),
              updated_at: new Date().toISOString(),
              _metadata: { ...record._metadata, auditChanged: true },
            }
          : record,
      ),
    );
  };

  const handleSaveActiveCell = async (nextValueOverride?: string) => {
    if (!activeCellTarget || !activeCellKey) return;
    const nextValue = nextValueOverride ?? modalDraftValue;
    setSavingCellKeys((prev) => (prev.includes(activeCellKey) ? prev : [...prev, activeCellKey]));
    replaceRecordValueLocally(activeCellTarget.view.wideTable.id, activeCellTarget.row.rowId, activeCellTarget.column.name, nextValue);
    try {
      await updateWideTableRow(activeCellTarget.view.wideTable.id, activeCellTarget.row.rowId, {
        indicatorValues: {
          [activeCellTarget.column.name]: {
            value: normalizePersistedValue(nextValue),
            valueDescription: "验收页人工修正",
            dataSource: "acceptance-manual",
          },
        },
      });
      setModalDraftValue(nextValue);
      setMessage(`已保存 ${activeCellTarget.column.chineseName ?? activeCellTarget.column.name} 的修正值。`);
    } catch (error) {
      setMessage(`已更新页面数据，但后端保存失败：${formatActionError(error)}`);
    } finally {
      setSavingCellKeys((prev) => prev.filter((k) => k !== activeCellKey));
    }
  };

  const resolveDatasetLabel = (): string => {
    const wideTable = wideTables[0] ?? requirement.wideTable;
    if (!wideTable) return requirement.id;
    const name = wideTable.name?.trim();
    return name ? `${name}(${wideTable.id})` : wideTable.id;
  };

  const persistTaskGroupReview = async (
    taskGroupId: string,
    data: { status: "approved" | "rejected"; feedback?: string },
  ) => {
    const existing = ticketByTaskGroupId.get(taskGroupId);
    try {
      if (existing?.id) {
        await updateAcceptanceTicket(existing.id, {
          status: data.status,
          feedback: data.feedback,
        });
      } else {
        await createAcceptanceTicket({
          dataset: resolveDatasetLabel(),
          requirementId: requirement.id,
          taskGroupId,
          owner: requirement.owner,
          feedback: data.feedback,
          status: data.status,
        });
      }
      await onRefreshData?.();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setMessage(`验收状态保存失败：${msg}`);
    }
  };

  const handleApproveTaskGroup = (taskGroupId: string) => {
    setReviewStates((prev) => new Map(prev).set(taskGroupId, { status: "approved", reviewedAt: new Date().toISOString() }));
    setMessage("已通过该任务组的验收。");
    void persistTaskGroupReview(taskGroupId, { status: "approved" });
  };

  const handleRejectTaskGroup = (taskGroupId: string) => {
    setShowRejectDialog(taskGroupId);
    setRejectFeedback("");
  };

  const confirmRejectTaskGroup = () => {
    if (!showRejectDialog) return;
    setReviewStates((prev) => new Map(prev).set(showRejectDialog, { status: "rejected", feedback: rejectFeedback || undefined, reviewedAt: new Date().toISOString() }));
    setMessage("已驳回该任务组，请在指标级别标注问题后通知执行人处理。");
    void persistTaskGroupReview(showRejectDialog, { status: "rejected", feedback: rejectFeedback || undefined });
    setShowRejectDialog(null);
    setRejectFeedback("");
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Layers3 className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">验收</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          按快照分页查看宽表数据，每页对应一个任务组。点击指标单元格可查看任务详情并执行操作。
        </p>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setShowDiff((v) => !v)}
            className={cn("inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
              showDiff ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:border-primary/40")}>
            {showDiff ? "隐藏差异" : "展示差异"}
          </button>
          {showDiff ? <span className="text-[11px] text-muted-foreground">对比当前值与上一轮采集值</span> : null}
        </div>
        {message ? <div className="text-xs text-primary">{message}</div> : null}
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <SummaryCard title="待验收" value={String(summary.pending)} />
        <SummaryCard title="已通过" value={String(summary.approved)} accent="green" />
        <SummaryCard title="已驳回" value={String(summary.rejected)} accent="red" />
        <SummaryCard title="任务组总数" value={String(summary.total)} />
      </section>

      {views.map((view) => (
        <AcceptanceWideTableSection
          key={view.wideTable.id}
          requirement={requirement}
          view={view}
          reviewStates={reviewStates}
          showDiff={showDiff}
          navSource={navSource}
          onOpenCellModal={openCellModal}
          onApprove={handleApproveTaskGroup}
          onReject={handleRejectTaskGroup}
        />
      ))}

      {activeCellTarget ? (
        <IndicatorActionModal
          target={activeCellTarget}
          draftValue={modalDraftValue}
          action={modalAction}
          saving={isSavingActiveCell}
          onDraftValueChange={setModalDraftValue}
          onActionChange={setModalAction}
          onClose={closeCellModal}
          onSave={() => void handleSaveActiveCell()}
        />
      ) : null}

      {showRejectDialog ? (
        <RejectDialog
          feedback={rejectFeedback}
          onFeedbackChange={setRejectFeedback}
          onConfirm={confirmRejectTaskGroup}
          onCancel={() => { setShowRejectDialog(null); setRejectFeedback(""); }}
        />
      ) : null}
    </div>
  );
}

// ==================== 宽表验收区域（按快照/业务日期分页） ====================

function AcceptanceWideTableSection({
  view,
  requirement,
  reviewStates,
  showDiff,
  navSource,
  onOpenCellModal,
  onApprove,
  onReject,
}: {
  view: AcceptanceWideTableView;
  requirement: Requirement;
  reviewStates: Map<string, TaskGroupReviewState>;
  showDiff: boolean;
  navSource?: "projects" | "requirements" | "tasks" | "acceptance";
  onOpenCellModal: (target: ActiveCellTarget) => void;
  onApprove: (taskGroupId: string) => void;
  onReject: (taskGroupId: string) => void;
}) {
  const usesBusinessDateAxis = view.usesBusinessDateAxis;

  // ---- 业务日期分页 ----
  const businessDates = useMemo(
    () =>
      usesBusinessDateAxis
        ? Array.from(new Set(view.rows.map((row) => row.businessDate))).sort((a, b) => b.localeCompare(a))
        : [],
    [usesBusinessDateAxis, view.rows],
  );
  const trialTaskGroups = useMemo(
    () => view.taskGroups.filter((taskGroup) => taskGroup.triggeredBy === "trial"),
    [view.taskGroups],
  );
  const visibleAllBusinessDates = useMemo(
    () => limitFutureBusinessDates(businessDates, { now: new Date(), maxFuturePeriods: 1 }),
    [businessDates],
  );
  const isMonthlyFrequency = usesBusinessDateAxis && view.wideTable.businessDateRange.frequency === "monthly";

  const businessYears = useMemo(() => {
    if (!isMonthlyFrequency) return [];
    const years = Array.from(
      new Set(visibleAllBusinessDates.map((d) => extractBusinessDateYear(d)).filter((y): y is string => Boolean(y))),
    );
    return years.sort((a, b) => b.localeCompare(a));
  }, [isMonthlyFrequency, visibleAllBusinessDates]);

  const [selectedYear, setSelectedYear] = useState("");
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
    if (!isMonthlyFrequency || !effectiveSelectedYear) return visibleAllBusinessDates;
    return visibleAllBusinessDates.filter((d) => !d.startsWith("TG-TRIAL-") && d.slice(0, 4) === effectiveSelectedYear);
  }, [effectiveSelectedYear, isMonthlyFrequency, visibleAllBusinessDates]);
  const visibleBusinessDateOptions = useMemo(
    () => [
      ...trialTaskGroups.map((taskGroup) => ({
        key: taskGroup.id,
        label: `试运行 ${taskGroup.businessDateLabel || taskGroup.businessDate || ""}`.trim(),
        isTrial: true,
      })),
      ...visibleBusinessDates
        .filter((businessDate) => !businessDate.startsWith("TG-TRIAL-"))
        .map((businessDate) => ({
          key: businessDate,
          label: isMonthlyFrequency ? `${extractBusinessDateMonth(businessDate) ?? businessDate.slice(5, 7)}月` : businessDate,
          isTrial: false,
        })),
    ],
    [isMonthlyFrequency, trialTaskGroups, visibleBusinessDates],
  );

  const [selectedBusinessDate, setSelectedBusinessDate] = useState<string>(visibleAllBusinessDates[0] ?? "");
  useEffect(() => {
    if (visibleBusinessDateOptions.length > 0 && !visibleBusinessDateOptions.some((item) => item.key === selectedBusinessDate)) {
      setSelectedBusinessDate(visibleBusinessDateOptions[0]?.key ?? "");
    }
  }, [selectedBusinessDate, visibleBusinessDateOptions]);

  // ---- 全量快照分页 ----
  const fullSnapshotPages = useMemo(
    () => (usesBusinessDateAxis ? [] : buildDisplayableFullSnapshotTaskGroupPages(view.taskGroups, view.scheduleJobs)),
    [usesBusinessDateAxis, view.scheduleJobs, view.taskGroups],
  );
  const [selectedAcceptPageKey, setSelectedAcceptPageKey] = useState<string>(() => {
    const first = fullSnapshotPages[0];
    return first ? (first.scheduleJobId ?? first.taskGroupId) : "";
  });
  useEffect(() => {
    if (usesBusinessDateAxis) return;
    if (fullSnapshotPages.length === 0) { if (selectedAcceptPageKey) setSelectedAcceptPageKey(""); return; }
    const pageKey = (p: typeof fullSnapshotPages[0]) => p.scheduleJobId ?? p.taskGroupId;
    if (!fullSnapshotPages.some((p) => pageKey(p) === selectedAcceptPageKey)) {
      setSelectedAcceptPageKey(pageKey(fullSnapshotPages[0]));
    }
  }, [fullSnapshotPages, selectedAcceptPageKey, usesBusinessDateAxis]);

  // ---- 当前选中的任务组 ----
  const currentTaskGroup = useMemo(() => {
    if (usesBusinessDateAxis) {
      return view.taskGroups.find((tg) => tg.id === selectedBusinessDate)
        ?? view.taskGroups.find((tg) => tg.businessDate === selectedBusinessDate && tg.triggeredBy !== "trial")
        ?? null;
    }
    const page = fullSnapshotPages.find((p) => (p.scheduleJobId ?? p.taskGroupId) === selectedAcceptPageKey);
    return page ? (view.taskGroups.find((tg) => tg.id === page.taskGroupId) ?? null) : null;
  }, [usesBusinessDateAxis, selectedBusinessDate, selectedAcceptPageKey, view.taskGroups, fullSnapshotPages]);

  const currentReviewState = currentTaskGroup ? reviewStates.get(currentTaskGroup.id) : undefined;
  const currentReviewStatus = currentReviewState?.status ?? "pending";

  // ---- 当前页可见行 ----
  const visibleRows = useMemo(() => {
    if (usesBusinessDateAxis) {
      return selectedBusinessDate ? view.rows.filter((row) => row.businessDate === selectedBusinessDate) : view.rows;
    }
    return filterFullSnapshotScopedRows(view.rows, currentTaskGroup?.id ?? null);
  }, [currentTaskGroup?.id, selectedBusinessDate, usesBusinessDateAxis, view.rows]);

  return (
    <section className="rounded-xl border bg-card p-6 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h3 className="font-semibold">{view.wideTable.name}</h3>
          <p className="text-xs text-muted-foreground">{view.wideTable.description}</p>
        </div>
        <div className="text-xs text-muted-foreground">
          当前页 {visibleRows.length} 行 / 全部 {view.rows.length} 行 · 任务组 {view.taskGroups.length} · 任务 {view.fetchTasks.length}
        </div>
      </div>

      {/* 业务日期分页 Tab */}
      {usesBusinessDateAxis && businessDates.length > 0 ? (
        <div className="space-y-2">
          {isMonthlyFrequency && businessYears.length > 1 ? (
            <div className="flex gap-2 overflow-x-auto pb-1 border-b">
              {businessYears.map((year) => (
                <button key={year} type="button" onClick={() => setSelectedYear(year)}
                  className={cn("shrink-0 border-b-2 -mb-px px-3 py-1.5 text-xs font-medium transition-colors",
                    effectiveSelectedYear === year ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:border-muted hover:text-foreground")}>
                  {year}年
                </button>
              ))}
            </div>
          ) : isMonthlyFrequency && businessYears.length === 1 ? (
            <div className="shrink-0 px-3 py-1.5 text-xs font-medium text-muted-foreground">{businessYears[0]}年</div>
          ) : null}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {visibleBusinessDateOptions.map((item) => (
              <button key={item.key} type="button" onClick={() => setSelectedBusinessDate(item.key)}
                className={cn("shrink-0 rounded-md border px-3 py-1.5 text-xs",
                  selectedBusinessDate === item.key ? "border-primary bg-primary/10 text-primary" : "bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
                  item.isTrial && "border-sky-300 bg-sky-50 text-sky-700")}>
                {item.label}
              </button>
            ))}
          </div>
        </div>
      ) : !usesBusinessDateAxis && fullSnapshotPages.length > 0 ? (
        <div className="space-y-2">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {fullSnapshotPages.map((page) => {
              const key = page.scheduleJobId ?? page.taskGroupId;
              return (
                <button key={key} type="button" onClick={() => setSelectedAcceptPageKey(key)}
                  className={cn("shrink-0 rounded-md border px-3 py-1.5 text-xs",
                    selectedAcceptPageKey === key ? "border-primary bg-primary/10 text-primary" : "bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground")}
                  title={`${page.pageHint} · ${page.taskGroupId}`}>
                  {page.pageLabel}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* 当前任务组验收操作栏 */}
      {currentTaskGroup ? (
        <TaskGroupReviewBar
          taskGroup={currentTaskGroup}
          reviewState={currentReviewState}
          fetchTasks={view.fetchTasks.filter((ft) => ft.taskGroupId === currentTaskGroup.id)}
          returnToTasksHref={`/projects/${requirement.projectId}/requirements/${requirement.id}?${navSource ? `nav=${navSource}&` : ""}view=tasks&tab=tasks&tg=${currentTaskGroup.id}`}
          onApprove={() => onApprove(currentTaskGroup.id)}
          onReject={() => onReject(currentTaskGroup.id)}
        />
      ) : null}

      {/* 宽表数据 */}
      {view.rows.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-background px-4 py-8 text-center text-xs text-muted-foreground">
          当前宽表暂无可展示数据。
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-max text-xs">
            <thead className="border-b">
              <tr>
                {view.wideTable.schema.columns.map((column) => (
                  <th key={column.id} className="min-w-28 px-2 py-2 text-left align-bottom">
                    <div className="font-medium text-foreground">{column.chineseName ?? column.name}</div>
                    <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">{column.name}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={view.wideTable.schema.columns.length} className="px-3 py-6 text-center text-xs text-muted-foreground">
                    {usesBusinessDateAxis ? "当前业务日期下还没有可展示的验收数据。" : "当前快照下还没有可展示的验收数据。"}
                  </td>
                </tr>
              ) : visibleRows.map((row) => (
                <tr key={`${view.wideTable.id}-${row.rowId}-${row.businessDate}`}>
                  {view.wideTable.schema.columns.map((column) => {
                    const isIndicator = column.category === "indicator";
                    const binding = isIndicator
                      ? view.cellBindingMap.get(buildScopedCellKey(row.rowId, row.businessDate, column.name))
                      : undefined;
                    const cellValue = formatDisplayValue(row.record[column.name]);

                    if (isIndicator) {
                      const cellTarget: ActiveCellTarget = { view, row, column, binding };
                      const prevValue = row.record._metadata?.previousValues?.[column.name];
                      const curValue = row.record[column.name];
                      const hasDiff = showDiff && prevValue !== undefined && hasIndicatorDiff(curValue, prevValue);
                      const prevDisplay = prevValue != null ? String(prevValue) : null;
                      return (
                        <td key={column.id} className="p-0 align-top">
                          <button type="button" onClick={() => onOpenCellModal(cellTarget)}
                            className={cn(
                              "block w-full px-2 py-1.5 text-left transition-colors hover:bg-primary/5",
                              binding?.task?.status === "failed" ? "bg-red-50 text-red-700"
                                : binding?.task ? "bg-primary/5 text-foreground" : "text-foreground",
                              hasDiff && "ring-1 ring-inset ring-amber-300",
                            )}
                            title={binding?.task
                              ? `任务：${binding.task.id}；指标组：${binding.indicatorGroupName}；状态：${taskStatusLabel[binding.task.status] ?? binding.task.status}`
                              : "未关联采集任务，可人工修正"}>
                            <div>{cellValue || "\u00A0"}</div>
                            {hasDiff ? (
                              <div className="mt-0.5 text-[10px] text-amber-600 truncate" title={`上一轮：${prevDisplay ?? "NULL"}`}>
                                上一轮：{prevDisplay ?? "NULL"}
                              </div>
                            ) : null}
                          </button>
                        </td>
                      );
                    }
                    return (
                      <td key={column.id} className="px-2 py-2 align-top text-muted-foreground">{cellValue}</td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ==================== 任务组验收操作栏 ====================

function TaskGroupReviewBar({
  taskGroup,
  reviewState,
  fetchTasks,
  returnToTasksHref,
  onApprove,
  onReject,
}: {
  taskGroup: TaskGroup;
  reviewState?: TaskGroupReviewState;
  fetchTasks: FetchTask[];
  returnToTasksHref: string;
  onApprove: () => void;
  onReject: () => void;
}) {
  const status = reviewState?.status ?? "pending";
  const completedTasks = fetchTasks.filter((ft) => ft.status === "completed").length;
  const failedTasks = fetchTasks.filter((ft) => ft.status === "failed").length;

  const statusConfig = {
    pending: { label: "待验收", badgeClass: "bg-amber-50 text-amber-700 border-amber-200", barClass: "border-amber-200 bg-amber-50/50" },
    approved: { label: "已通过", badgeClass: "bg-green-50 text-green-700 border-green-200", barClass: "border-green-200 bg-green-50/50" },
    rejected: { label: "已驳回", badgeClass: "bg-red-50 text-red-700 border-red-200", barClass: "border-red-200 bg-red-50/50" },
  }[status];

  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3", statusConfig.barClass)}>
      <div className="flex items-center gap-3 text-xs min-w-0">
        <span className={cn("inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium", statusConfig.badgeClass)}>
          {statusConfig.label}
        </span>
        <span className="text-muted-foreground">
          任务组 {taskGroup.id} · 共 {fetchTasks.length} 个任务 · 已完成 {completedTasks}
          {failedTasks > 0 ? ` · 失败 ${failedTasks}` : ""}
        </span>
        {taskGroup.triggeredBy === "trial" ? (
          <span className="rounded border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700">
            试运行数据
          </span>
        ) : null}
        {reviewState?.feedback ? (
          <span className="text-red-600">驳回原因：{reviewState.feedback}</span>
        ) : null}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {status === "pending" ? (
          <>
            <button type="button" onClick={onApprove}
              className="inline-flex items-center gap-1 rounded-md border border-green-300 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100 transition-colors">
              <CheckCircle2 className="h-3.5 w-3.5" />
              通过
            </button>
            <button type="button" onClick={onReject}
              className="inline-flex items-center gap-1 rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 transition-colors">
              <XCircle className="h-3.5 w-3.5" />
              驳回
            </button>
          </>
        ) : status === "approved" ? (
          <>
            <span className="inline-flex items-center gap-1 text-xs text-green-600">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {reviewState?.reviewedAt ? formatReviewTime(reviewState.reviewedAt) : "已通过"}
            </span>
            {taskGroup.triggeredBy === "trial" ? (
              <a href={returnToTasksHref} className="rounded-md border px-3 py-1.5 text-xs text-primary hover:bg-primary/5">
                返回采集任务
              </a>
            ) : null}
          </>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-red-600">
            <XCircle className="h-3.5 w-3.5" />
            {reviewState?.reviewedAt ? formatReviewTime(reviewState.reviewedAt) : "已驳回"}
          </span>
        )}
      </div>
    </div>
  );
}

// ==================== 指标操作弹窗 ====================

function IndicatorActionModal({
  target, draftValue, action, saving,
  onDraftValueChange, onActionChange, onClose, onSave,
}: {
  target: ActiveCellTarget; draftValue: string; action: IndicatorAction;
  saving: boolean;
  onDraftValueChange: (v: string) => void;
  onActionChange: (a: IndicatorAction) => void; onClose: () => void; onSave: () => void;
}) {
  const currentValue = formatDisplayValue(target.row.record[target.column.name]);
  const task = target.binding?.task;
  const taskGroup = target.binding?.taskGroup;
  const agentRaw = target.row.record._metadata?.agentRawValues?.[target.column.name];
  const rawValueStr = agentRaw?.rawValue != null ? String(agentRaw.rawValue) : null;
  const prevValue = target.row.record._metadata?.previousValues?.[target.column.name];
  const prevValueStr = prevValue != null ? String(prevValue) : null;
  const hasDiff = prevValue !== undefined && hasIndicatorDiff(target.row.record[target.column.name], prevValue);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-xl border bg-background shadow-xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 border-b px-6 py-4">
          <div className="space-y-1">
            <h3 className="text-lg font-semibold">{target.column.chineseName ?? target.column.name}</h3>
            <div className="text-xs text-muted-foreground">
              {target.view.wideTable.name} · {target.row.rowLabel} · {target.row.businessDateLabel}
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-md border p-1.5 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          {/* 值对比 */}
          <div className="grid gap-3 md:grid-cols-2">
            <InfoCard label="当前值" value={currentValue} />
            <InfoCard label="上一轮值" value={prevValueStr ?? "无历史数据"}
              valueClassName={hasDiff ? "text-amber-600 font-medium" : ""} />
          </div>

          {hasDiff ? (
            <div className="rounded border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-700">
              当前值与上一轮采集值存在差异，请确认变化是否合理。
            </div>
          ) : null}

          {/* Agent 来源详情 */}
          {agentRaw ? (
            <div className="rounded-lg border bg-muted/20 px-4 py-3 space-y-2">
              <div className="text-xs font-medium text-muted-foreground">采集来源</div>
              <div className="grid gap-2 md:grid-cols-2 text-xs">
                {agentRaw.dataSource ? <div><span className="text-muted-foreground">数据源：</span>{agentRaw.dataSource}</div> : null}
                {agentRaw.confidence != null ? <div><span className="text-muted-foreground">置信度：</span>{(agentRaw.confidence * 100).toFixed(0)}%</div> : null}
              </div>
              {agentRaw.sourceUrl ? (
                <div className="text-xs"><span className="text-muted-foreground">来源链接：</span>
                  <a href={agentRaw.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all">{agentRaw.sourceUrl}</a>
                </div>
              ) : null}
              {agentRaw.quoteText ? (
                <div className="text-xs"><span className="text-muted-foreground">原文摘录：</span>
                  <span className="italic text-foreground/80">&ldquo;{agentRaw.quoteText}&rdquo;</span>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* 任务信息 */}
          <div className="grid gap-3 md:grid-cols-2">
            <InfoCard label="任务状态"
              value={task ? (taskStatusLabel[task.status] ?? task.status) : "未关联任务"}
              valueClassName={task ? cn("inline-flex rounded border px-2 py-0.5 text-[11px]", getTaskStatusBadgeClass(task.status)) : ""} />
            <InfoCard label="任务 ID" value={task?.id ?? "-"} />
            <InfoCard label="任务组" value={taskGroup?.id ?? "-"} />
            {task?.confidence != null ? <InfoCard label="任务置信度" value={`${(task.confidence * 100).toFixed(0)}%`} /> : null}
            {task?.executionRecords?.length ? <InfoCard label="执行次数" value={String(task.executionRecords.length)} /> : null}
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">选择操作</div>
            <div className="grid gap-2 md:grid-cols-2">
              <ActionOption icon={<SkipForward className="h-4 w-4" />} label="跳过" description="当前指标无需处理"
                selected={action === "skip"} onClick={() => onActionChange("skip")} />
              <ActionOption icon={<Pencil className="h-4 w-4" />} label="直接修正" description="手动填入正确值"
                selected={action === "fix_value"} onClick={() => onActionChange("fix_value")} />
            </div>
          </div>

          {action === "fix_value" ? (
            <label className="block space-y-1">
              <div className="text-xs font-medium text-muted-foreground">修正值</div>
              <input value={draftValue} onChange={(e) => onDraftValueChange(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="输入正确的指标值" />
            </label>
          ) : null}

        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-md border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">关闭</button>
          {action === "skip" ? (
            <button type="button" onClick={onClose} className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs text-foreground hover:bg-muted">
              <SkipForward className="h-3.5 w-3.5" />确认跳过
            </button>
          ) : null}
          {action === "fix_value" ? (
            <button type="button" onClick={onSave} disabled={saving}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60">
              <Save className="h-3.5 w-3.5" />{saving ? "保存中..." : "保存修正"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ==================== 操作选项卡片 ====================

function ActionOption({
  icon, label, description, selected, onClick, disabled, disabledReason,
}: {
  icon: React.ReactNode; label: string; description: string; selected: boolean;
  onClick: () => void; disabled?: boolean; disabledReason?: string;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={disabled ? disabledReason : undefined}
      className={cn(
        "flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors",
        selected ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
        disabled && "opacity-40 cursor-not-allowed hover:border-border hover:text-muted-foreground",
      )}>
      <div className="flex items-center gap-1.5">{icon}<span className="text-xs font-medium">{label}</span></div>
      <span className="text-[11px]">{description}</span>
    </button>
  );
}

// ==================== 驳回对话框 ====================

function RejectDialog({
  feedback, onFeedbackChange, onConfirm, onCancel,
}: {
  feedback: string; onFeedbackChange: (v: string) => void; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl border bg-background shadow-xl overflow-hidden">
        <div className="border-b px-6 py-4">
          <h3 className="text-lg font-semibold">驳回任务组</h3>
          <p className="text-xs text-muted-foreground mt-1">驳回后可在指标级别标注具体问题，通知执行人处理。</p>
        </div>
        <div className="px-6 py-5 space-y-3">
          <label className="block space-y-1">
            <div className="text-xs font-medium text-muted-foreground">驳回原因（可选）</div>
            <textarea value={feedback} onChange={(e) => onFeedbackChange(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[80px] resize-y"
              placeholder="简要说明驳回原因，例如：部分指标来源不可靠、数值偏差较大..." />
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t px-6 py-4">
          <button type="button" onClick={onCancel} className="rounded-md border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">取消</button>
          <button type="button" onClick={onConfirm}
            className="inline-flex items-center gap-1 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700">
            <XCircle className="h-3.5 w-3.5" />确认驳回
          </button>
        </div>
      </div>
    </div>
  );
}

// ==================== 通用 UI ====================

function InfoCard({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="rounded-md border bg-muted/10 px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm">{valueClassName ? <span className={valueClassName}>{value}</span> : value}</div>
    </div>
  );
}

function SummaryCard({ title, value, accent }: { title: string; value: string; accent?: "green" | "red" }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <div className="text-xs text-muted-foreground">{title}</div>
      <div className={cn("mt-1 text-xl font-semibold", accent === "green" && "text-green-600", accent === "red" && "text-red-600")}>{value}</div>
    </div>
  );
}

// ==================== 数据构建 ====================

function buildAcceptanceWideTableViews(params: {
  wideTables: WideTable[]; wideTableRecords: WideTableRecord[]; taskGroups: TaskGroup[]; fetchTasks: FetchTask[]; scheduleJobs: ScheduleJob[];
}): AcceptanceWideTableView[] {
  return params.wideTables.map((wideTable) => {
    const usesBusinessDateAxis = hasWideTableBusinessDateDimension(wideTable);
    const currentPlanVersion = wideTable.currentPlanVersion ?? Math.max(
      1,
      ...params.taskGroups.filter((tg) => tg.wideTableId === wideTable.id).map((tg) => resolveTaskGroupPlanVersion(tg, 1)),
      ...params.wideTableRecords.filter((r) => r.wideTableId === wideTable.id).map((r) => resolveRecordPlanVersion(r, 1)),
    );
    const scopedRecords = params.wideTableRecords.filter(
      (r) => r.wideTableId === wideTable.id && resolveRecordPlanVersion(r, currentPlanVersion) === currentPlanVersion,
    );
    const tgs = params.taskGroups.filter(
      (tg) => tg.wideTableId === wideTable.id && resolveTaskGroupPlanVersion(tg, currentPlanVersion) === currentPlanVersion,
    );
    const scopedJobs = params.scheduleJobs.filter(
      (job) => job.wideTableId === wideTable.id || tgs.some((tg) => tg.id === job.taskGroupId),
    );
    const fullSnapshotPages = usesBusinessDateAxis ? [] : buildDisplayableFullSnapshotTaskGroupPages(tgs, scopedJobs);
    const trialTaskGroups = tgs.filter((tg) => tg.triggeredBy === "trial");
    const orderedTaskGroups = usesBusinessDateAxis
      ? [...tgs].sort((a, b) => {
          if (a.triggeredBy === "trial" && b.triggeredBy !== "trial") return -1;
          if (a.triggeredBy !== "trial" && b.triggeredBy === "trial") return 1;
          return b.businessDate.localeCompare(a.businessDate);
        })
      : fullSnapshotPages.map((p) => tgs.find((tg) => tg.id === p.taskGroupId)).filter((tg): tg is TaskGroup => Boolean(tg));
    const tgMap = new Map(tgs.map((tg) => [tg.id, tg]));
    const rows = usesBusinessDateAxis
      ? [
          ...trialTaskGroups.flatMap((tg) =>
            buildAcceptanceRowsFromRecords(
              wideTable,
              tg.rowSnapshots ?? [],
              {
                scopeKey: tg.id,
                scopeLabel: `试运行 ${tg.businessDateLabel || tg.businessDate || ""}`.trim(),
              },
            ),
          ),
          ...buildAcceptanceRowsFromRecords(wideTable, scopedRecords),
        ]
      : fullSnapshotPages.length > 0
        ? fullSnapshotPages.flatMap((page) => {
            const tg = tgMap.get(page.taskGroupId);
            const snaps = tg?.rowSnapshots?.length ? tg.rowSnapshots : scopedRecords;
            return buildAcceptanceRowsFromRecords(wideTable, snaps, { scopeKey: page.taskGroupId, scopeLabel: page.pageLabel });
          })
        : buildAcceptanceRowsFromRecords(wideTable, scopedRecords, { scopeKey: "current_snapshot", scopeLabel: "当前快照" });
    const fts = params.fetchTasks.filter((ft) => tgMap.has(ft.taskGroupId));
    const cellBindingMap = new Map<string, AcceptanceCellBinding>();
    for (const task of fts) {
      const tg = tgMap.get(task.taskGroupId);
      if (!tg) continue;
      const cols = resolveIndicatorColumnNames(wideTable, task.indicatorGroupId);
      const groupName = wideTable.indicatorGroups.find((g) => g.id === task.indicatorGroupId)?.name ?? task.indicatorGroupName;
      for (const col of cols) {
        const scopeKey = usesBusinessDateAxis && tg.triggeredBy !== "trial" ? tg.businessDate : tg.id;
        const key = buildScopedCellKey(task.rowId, scopeKey, col);
        if (!cellBindingMap.has(key)) cellBindingMap.set(key, { task, taskGroup: tg, indicatorColumns: cols, indicatorGroupName: groupName });
      }
    }
    // 计算 previousValues：同维度组合上一个业务日期/快照的指标值
    const indicatorColNames = wideTable.schema.columns.filter((c) => c.category === "indicator").map((c) => c.name);
    if (indicatorColNames.length > 0) {
      if (usesBusinessDateAxis) {
        // 增量模式：按 rowLabel 分组，按 businessDate 排序，前一个就是上一轮
        const groupedByLabel = new Map<string, AcceptanceRowView[]>();
        for (const row of rows) {
          const group = groupedByLabel.get(row.rowLabel) ?? [];
          group.push(row);
          groupedByLabel.set(row.rowLabel, group);
        }
        for (const group of Array.from(groupedByLabel.values())) {
          const sorted = [...group].sort((a, b) => a.businessDate.localeCompare(b.businessDate));
          for (let i = 1; i < sorted.length; i++) {
            const prev = sorted[i - 1];
            const cur = sorted[i];
            const pv: Record<string, string | number | null> = {};
            for (const col of indicatorColNames) pv[col] = prev.record[col] ?? null;
            cur.record = { ...cur.record, _metadata: { ...(cur.record._metadata ?? {}), previousValues: cur.record._metadata?.previousValues ?? pv } };
          }
        }
      } else if (fullSnapshotPages.length > 1) {
        // 全量快照模式：按 ROW_ID 在相邻快照间对比
        const pageKeys = fullSnapshotPages.map((p) => p.taskGroupId);
        for (let pi = 1; pi < pageKeys.length; pi++) {
          const prevPageKey = pageKeys[pi]; // pages 按时间倒序，pi 更大 = 更早
          const curPageKey = pageKeys[pi - 1];
          const prevRows = rows.filter((r) => r.businessDate === prevPageKey);
          const prevByRowId = new Map(prevRows.map((r) => [r.rowId, r]));
          for (const row of rows) {
            if (row.businessDate !== curPageKey) continue;
            const prevRow = prevByRowId.get(row.rowId);
            if (!prevRow) continue;
            const pv: Record<string, string | number | null> = {};
            for (const col of indicatorColNames) pv[col] = prevRow.record[col] ?? null;
            row.record = { ...row.record, _metadata: { ...(row.record._metadata ?? {}), previousValues: row.record._metadata?.previousValues ?? pv } };
          }
        }
      }
    }

    return { wideTable, rows, taskGroups: orderedTaskGroups, fetchTasks: fts, cellBindingMap, scheduleJobs: scopedJobs, usesBusinessDateAxis };
  });
}

function buildAcceptanceRowsFromRecords(
  wideTable: WideTable, records: WideTableRecord[], options?: { scopeKey?: string; scopeLabel?: string },
): AcceptanceRowView[] {
  return records
    .map((record) => {
      const businessDate = options?.scopeKey ?? resolveRecordBusinessDate(wideTable, record);
      const businessDateLabel = options?.scopeLabel ?? formatBusinessDateLabel(businessDate, wideTable.businessDateRange.frequency);
      return { record, rowId: getRecordRowId(record), businessDate, businessDateLabel, rowLabel: buildRowLabel(wideTable, record) };
    })
    .sort((a, b) => a.businessDate !== b.businessDate ? b.businessDate.localeCompare(a.businessDate) : a.rowId - b.rowId);
}

function resolveActiveCellTarget(views: AcceptanceWideTableView[], selectedCell: SelectedCellState | null): ActiveCellTarget | null {
  if (!selectedCell) return null;
  const view = views.find((v) => v.wideTable.id === selectedCell.wideTableId);
  if (!view) return null;
  const row = view.rows.find((r) => r.rowId === selectedCell.rowId && r.businessDate === selectedCell.businessDate);
  if (!row) return null;
  const column = view.wideTable.schema.columns.find((c) => c.name === selectedCell.columnName);
  if (!column) return null;
  return { view, row, column, binding: view.cellBindingMap.get(buildScopedCellKey(row.rowId, row.businessDate, column.name)) };
}

// ==================== 工具函数 ====================

function resolveIndicatorColumnNames(wt: WideTable, igId: string): string[] {
  return wt.indicatorGroups.find((g) => g.id === igId)?.indicatorColumns
    ?? wt.schema.columns.filter((c) => c.category === "indicator").map((c) => c.name);
}
function resolveRecordBusinessDate(wt: WideTable, record: WideTableRecord): string {
  const col = wt.schema.columns.find((c) => c.isBusinessDate)?.name ?? "BIZ_DATE";
  return String(record[col] ?? record.BIZ_DATE ?? "");
}
function buildRowLabel(wt: WideTable, record: WideTableRecord): string {
  const vals = wt.schema.columns
    .filter((c) => (c.category === "dimension" && !c.isBusinessDate) || c.category === "attribute")
    .map((c) => formatDisplayValue(record[c.name]))
    .filter((v) => v !== "-" && v !== "NULL");
  return vals.length > 0 ? vals.slice(0, 3).join(" / ") : `ROW ${getRecordRowId(record)}`;
}
function getRecordRowId(record: WideTableRecord): number { return Number(record.ROW_ID ?? record.id); }
function buildCellKey(wtId: string, rowId: number, bd: string, col: string): string { return `${wtId}:${rowId}:${bd}:${col}`; }
function buildScopedCellKey(rowId: number, bd: string, col: string): string { return `${rowId}:${bd}:${col}`; }
function formatInputValue(v: unknown): string { return v == null ? "" : String(v); }
function formatDisplayValue(v: unknown): string { return v == null || v === "" ? "NULL" : String(v); }

/** 判断 Agent 原始值与宽表当前值是否存在差异（排除双 null、空值修复等场景） */
function hasIndicatorDiff(currentValue: unknown, rawValue: unknown): boolean {
  // 双方都为空不算差异
  if (currentValue == null && rawValue == null) return false;
  // 一方为空另一方不为空算差异
  if (currentValue == null || rawValue == null) return true;
  const curStr = String(currentValue).trim();
  const rawStr = String(rawValue).trim();
  // 字符串完全相同不算差异
  if (curStr === rawStr) return false;
  // 尝试数值比较：两边都能解析为相同数值则不算差异
  const curNum = Number(curStr);
  const rawNum = Number(rawStr);
  if (Number.isFinite(curNum) && Number.isFinite(rawNum) && curNum === rawNum) return false;
  return true;
}
function normalizePersistedValue(v: string): string | null { return v.trim() === "" ? null : v.trim(); }
function formatActionError(error: unknown): string {
  if (error instanceof Error && error.message === "Failed to fetch") return "无法连接后端接口，请确认服务可访问。";
  if (error instanceof Error && error.message.trim() !== "") return error.message;
  return "未知错误";
}
function formatReviewTime(value: string): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
