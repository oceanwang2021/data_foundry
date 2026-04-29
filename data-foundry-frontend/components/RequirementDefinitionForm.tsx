"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { buildApiUrl } from "@/lib/api-base";
import {
  downloadWideTableScopeImport,
  fetchRuntimeSettings,
  listTargetTableColumns,
  persistWideTablePreview,
  updateRequirementWideTable,
} from "@/lib/api-client";
import KnowledgeBaseSelectorModal from "@/components/KnowledgeBaseSelectorModal";
import SchemaSelectorModal from "@/components/SchemaSelectorModal";
import type {
  Requirement,
  WideTable,
  WideTableRecord,
  ColumnDefinition,
  TaskGroup,
  FetchTask,
  Project,
  KnowledgeBase,
  TargetTableSummary,
  TargetTableColumn,
} from "@/lib/types";
import { DEFAULT_RUNTIME_SETTINGS, formatSearchEngineLabel } from "@/lib/runtime-settings";
import { cn } from "@/lib/utils";
import { StageSummaryCard } from "@/components/StageSummaryCard";
import {
  definitionSectionIds,
  type DefinitionSectionId,
  parseDefinitionSectionHash,
  resolveActiveDefinitionSection,
} from "@/lib/requirement-definition-navigation";
import {
  formatRequirementDataUpdateMode,
  inferRequirementDataUpdateMode,
  resolveRequirementDataUpdateEnabled,
  resolveRequirementDataUpdateMode,
} from "@/lib/requirement-data-update";
import {
  hasWideTableBusinessDateDimension,
  normalizeWideTableMode,
} from "@/lib/wide-table-mode";
import {
  describeFullSnapshotScheduleRule,
} from "@/lib/task-group-display";
import {
  buildDefaultDateRange,
  buildSelectableBusinessDates,
  extractBusinessDateMonth,
  extractBusinessDateYear,
  formatBusinessDateLabel,
  isOpenEndedBusinessDateRange,
  limitFutureBusinessDates,
  OPEN_ENDED_PREVIEW_PERIODS,
  pickDefaultBusinessYear,
  snapToPeriodEnd,
} from "@/lib/business-date";
import {
  generateWideTablePreviewRecords,
  generateWideTablePreviewRecordsFromDimensionRows,
} from "@/lib/wide-table-preview";
import {
  resolveRecordPlanVersion,
  resolveCurrentPlanVersion,
  reconcileTaskPlanChange,
} from "@/lib/task-plan-reconciliation";
import {
  type StepStatusMap,
  type StepId,
  type StepStatus,
  deriveStepStatus,
  initStepStatus,
  completeStep,
  invalidateDownstream,
  isStepEditable,
  isStepCComplete,
  shouldConfirmInvalidation,
  getAffectedSteps,
  STEP_LABELS,
  buildInvalidationImpactSummary,
  markTaskGroupsAsStale,
} from "@/lib/step-status";

type Props = {
  project: Project;
  requirement: Requirement;
  entryGuide?: string;
  wideTables: WideTable[];
  wideTableRecords: WideTableRecord[];
  taskGroups?: TaskGroup[];
  fetchTasks?: FetchTask[];
  onWideTablesChange?: (wideTables: WideTable[]) => void;
  onWideTableRecordsChange?: (wideTableRecords: WideTableRecord[]) => void;
  onTaskGroupsChange?: (taskGroups: TaskGroup[]) => void;
  onFetchTasksChange?: (fetchTasks: FetchTask[]) => void;
  onRequirementChange?: (requirement: Requirement) => void;
  onProjectChange?: (project: Project) => void;
  onRefreshData?: () => Promise<void>;
};

const UNLINKED_DATA_TABLE_NAME = "待关联数据表";
const MAX_PERSISTED_DIMENSION_ROWS = 5000;

type DimensionExcelImportState = {
  fileName: string;
  fileType: "text/csv";
  fileContent: string;
  headers: string[];
  rows: Array<Record<string, string>>;
};

type SchemaTemplateOption = {
  key: string;
  value: string;
  meta: string;
  template: WideTable;
};

type SchemaTemplateSearchResult =
  | { kind: "matched"; template: WideTable }
  | { kind: "ambiguous"; matches: SchemaTemplateOption[] }
  | { kind: "missing" };

const definitionNavTopOffset = 0;
type ScrollContainer = Window | HTMLElement;

function isWindowScrollContainer(container: ScrollContainer): container is Window {
  return container === window;
}

function resolveScrollContainer(): ScrollContainer {
  const main = document.querySelector("main");
  if (!(main instanceof HTMLElement)) {
    return window;
  }

  const mainStyle = window.getComputedStyle(main);
  const mainAllowsScroll = mainStyle.overflowY === "auto" || mainStyle.overflowY === "scroll";
  const mainIsActuallyScrollable = mainAllowsScroll && main.scrollHeight > main.clientHeight;
  const documentIsScrollable =
    document.documentElement.scrollHeight > document.documentElement.clientHeight
    || document.body.scrollHeight > document.body.clientHeight;

  return mainIsActuallyScrollable && !documentIsScrollable ? main : window;
}

function getScrollContainerViewportTop(container: ScrollContainer): number {
  return isWindowScrollContainer(container) ? 0 : container.getBoundingClientRect().top;
}

function getScrollContainerOffset(container: ScrollContainer): number {
  return isWindowScrollContainer(container) ? window.scrollY : container.scrollTop;
}

function scrollContainerTo(container: ScrollContainer, top: number, behavior: ScrollBehavior) {
  if (isWindowScrollContainer(container)) {
    window.scrollTo({ top, behavior });
    return;
  }
  container.scrollTo({ top, behavior });
}

export default function RequirementDefinitionForm({
  project,
  requirement,
  entryGuide,
  wideTables,
  wideTableRecords,
  taskGroups,
  fetchTasks,
  onWideTablesChange,
  onWideTableRecordsChange,
  onTaskGroupsChange,
  onFetchTasksChange,
  onRequirementChange,
  onProjectChange,
  onRefreshData,
}: Props) {
  const [selectedWtId, setSelectedWtId] = useState<string>(wideTables[0]?.id ?? "");
  const [stepStatuses, setStepStatuses] = useState<StepStatusMap>(() => {
    const wt = wideTables.find((w) => w.id === (wideTables[0]?.id ?? ""));
    return wt ? deriveStepStatus(wt) : initStepStatus();
  });
  const [invalidationDialog, setInvalidationDialog] = useState<{
    open: boolean;
    changedStep: StepId;
    onConfirm: () => void;
  } | null>(null);
  const [activeSection, setActiveSection] = useState<DefinitionSectionId>("business-definition");
  const [isNavPinned, setIsNavPinned] = useState(false);
  const [highlightedSections, setHighlightedSections] = useState<DefinitionSectionId[]>([]);
  const [navFrame, setNavFrame] = useState<{ top: number; left: number; width: number; height: number }>({
    top: 0,
    left: 0,
    width: 0,
    height: 0,
  });
  const navShellRef = useRef<HTMLDivElement | null>(null);
  const navRef = useRef<HTMLElement | null>(null);
  const pendingNavigationRef = useRef<{ sectionId: DefinitionSectionId; targetTop: number } | null>(null);
  const pendingNavigationTimeoutRef = useRef<number | null>(null);
  const selectedWt = useMemo(() => wideTables.find((wt) => wt.id === selectedWtId), [wideTables, selectedWtId]);
  const visibleDefinitionSectionIds = definitionSectionIds;
  const dataUpdateStatus = useMemo(
    () => deriveDataUpdateSectionStatus(requirement, selectedWt),
    [requirement, selectedWt],
  );
  const selectedWideTableAllRecords = useMemo(
    () => wideTableRecords.filter((record) => record.wideTableId === selectedWtId),
    [wideTableRecords, selectedWtId],
  );
  const selectedWideTablePlanVersion = useMemo(
    () => (
      selectedWt
        ? resolveCurrentPlanVersion(selectedWt, selectedWideTableAllRecords, taskGroups ?? [])
        : 0
    ),
    [selectedWideTableAllRecords, selectedWt, taskGroups],
  );
  const selectedWideTableRecords = useMemo(
    () => {
      if (!selectedWt) {
        return [];
      }
      return selectedWideTableAllRecords.filter(
        (record) => resolveRecordPlanVersion(record, selectedWideTablePlanVersion) === selectedWideTablePlanVersion,
      );
    },
    [selectedWideTableAllRecords, selectedWideTablePlanVersion, selectedWt],
  );
  const [submitMessage, setSubmitMessage] = useState("");
  const [isSavingDefinition, setIsSavingDefinition] = useState(false);
  const [isSubmittingDefinition, setIsSubmittingDefinition] = useState(false);
  const [dimensionExcelImports, setDimensionExcelImports] = useState<
    Record<string, DimensionExcelImportState>
  >({});
  const [scopePreviewDirtyByWideTableId, setScopePreviewDirtyByWideTableId] = useState<Record<string, boolean>>({});
  const usesBusinessDateAxis = Boolean(selectedWt && hasWideTableBusinessDateDimension(selectedWt));
  const isOpenEndedRange = Boolean(selectedWt && usesBusinessDateAxis && isOpenEndedBusinessDateRange(selectedWt.businessDateRange));
  const canSubmit = !requirement.schemaLocked && (requirement.status === "draft" || requirement.status === "aligning");
  const submitBlockerMessage = useMemo(() => {
    if (!selectedWt) {
      return "请先关联 Schema 并完成宽表配置。";
    }
    if (stepStatuses.A !== "completed") {
      return "请先在【表结构定义】里关联 Schema，并补齐字段定义后再提交。";
    }
    if (stepStatuses.C !== "completed") {
      return "请先在【数据范围】里补齐时间范围与维度取值后再提交。";
    }
    if (requirement.dataUpdateEnabled == null) {
      return "请先在【数据更新】里确认是否持续更新后再提交。";
    }
    if (requirement.dataUpdateEnabled === true && !selectedWt.scheduleRule) {
      return "请先在【数据更新】里配置调度规则后再提交。";
    }
    if (dataUpdateStatus !== "completed") {
      return "数据更新配置尚未完成或存在冲突，请先修正后再提交。";
    }
    if (usesBusinessDateAxis && requirement.dataUpdateEnabled === true && !isOpenEndedRange) {
      return "持续更新需求需要把结束方式设为“永不”。请先到【数据范围】调整时间范围后再提交。";
    }
    if (usesBusinessDateAxis && requirement.dataUpdateEnabled === false && isOpenEndedRange) {
      return "一次性交付需求需要给出固定结束时间。请先到【数据范围】调整时间范围后再提交。";
    }
    return "";
  }, [
    dataUpdateStatus,
    isOpenEndedRange,
    requirement.dataUpdateEnabled,
    selectedWt,
    stepStatuses.A,
    stepStatuses.C,
    usesBusinessDateAxis,
  ]);

  const persistDefinition = async () => {
    if (!selectedWt) {
      throw new Error("尚未关联数据表，无法保存。");
    }

    const persistWideTableDimensionRows = async (wideTable: WideTable) => {
      const allRecordsForTable = wideTableRecords.filter((record) => record.wideTableId === wideTable.id);
      const currentPlanVersion = resolveCurrentPlanVersion(wideTable, allRecordsForTable, taskGroups ?? []);
      const currentPlanRecords = allRecordsForTable.filter(
        (record) => resolveRecordPlanVersion(record, currentPlanVersion) === currentPlanVersion,
      );

      const excelImport = dimensionExcelImports[wideTable.id];
      const excelRows = excelImport?.rows ?? [];
      const hasUnsavedScopePreviewChanges = scopePreviewDirtyByWideTableId[wideTable.id] ?? false;
      const useExcelRows = excelRows.length > 0;
      const shouldReusePersistedDimensionRows = Boolean(
        !useExcelRows
        && !hasUnsavedScopePreviewChanges
        && wideTable.scopeImport?.importMode === "dimension_rows_csv"
        && currentPlanRecords.length > 0,
      );
      const preview = shouldReusePersistedDimensionRows
        ? { records: currentPlanRecords, totalCount: currentPlanRecords.length }
        : useExcelRows
          ? generateWideTablePreviewRecordsFromDimensionRows(wideTable, excelRows, currentPlanRecords, wideTableRecords)
          : generateWideTablePreviewRecords(wideTable, currentPlanRecords, wideTableRecords);

      if (preview.totalCount > MAX_PERSISTED_DIMENSION_ROWS) {
        throw new Error(`维度组合行数过大（${preview.totalCount}），请缩小业务日期范围或维度枚举值后再保存。`);
      }

      const reconcile = reconcileTaskPlanChange({
        requirement,
        wideTable,
        previousRecords: currentPlanRecords,
        nextRecords: preview.records,
        taskGroups: taskGroups ?? [],
        fetchTasks: fetchTasks ?? [],
      });
      const nextPlanVersion = reconcile.nextPlanVersion;

      const recordsWithPlanVersion = preview.records.map((record) => ({
        ...record,
        _metadata: {
          ...record._metadata,
          planVersion: nextPlanVersion,
        },
      }));

      await persistWideTablePreview(
        requirement.id,
        { ...wideTable, currentPlanVersion: nextPlanVersion },
        recordsWithPlanVersion,
        excelImport
          ? {
              fileName: excelImport.fileName,
              fileType: excelImport.fileType,
              rowCount: excelImport.rows.length,
              fileContent: excelImport.fileContent,
              headers: excelImport.headers,
              rows: excelImport.rows,
            }
          : hasUnsavedScopePreviewChanges
            ? null
            : undefined,
      );
      setScopePreviewDirtyByWideTableId((prev) => ({
        ...prev,
        [wideTable.id]: false,
      }));
      handleReplaceWideTableRecords(wideTable.id, recordsWithPlanVersion);
    };

    // Persist every wide table (even if only one) so the backend always has a consistent snapshot.
    await Promise.all(
      wideTables.map(async (wt) => {
        await updateRequirementWideTable(requirement.id, wt);
        await persistWideTableDimensionRows(wt);
      }),
    );
  };

  const handleSaveDefinition = async () => {
    setSubmitMessage("");
    if (requirement.schemaLocked) {
      setSubmitMessage("当前需求已提交并锁定，无法再保存修改。");
      return;
    }
    setIsSavingDefinition(true);
    try {
      await persistDefinition();
      setSubmitMessage("已保存需求配置。");
      await onRefreshData?.();
    } catch (error) {
      setSubmitMessage(`保存失败：${formatPersistError(error)}`);
    } finally {
      setIsSavingDefinition(false);
    }
  };

  const handleSubmitDefinition = async () => {
    setSubmitMessage("");
    const blocker = submitBlockerMessage;
    if (blocker) {
      setSubmitMessage(blocker);
      return;
    }
    if (!canSubmit) {
      setSubmitMessage("当前需求已提交，无需重复提交。");
      return;
    }

    setIsSubmittingDefinition(true);
    try {
      await persistDefinition();
      onRequirementChange?.({
        ...requirement,
        status: "ready",
        schemaLocked: true,
        updatedAt: new Date().toISOString(),
      });
      setSubmitMessage("已提交需求。现在可以进入【任务】配置指标分组并生成任务组。");
      await onRefreshData?.();
    } catch (error) {
      setSubmitMessage(`提交失败：${formatPersistError(error)}`);
    } finally {
      setIsSubmittingDefinition(false);
    }
  };
  const handleReplaceWideTables = (nextWideTables: WideTable[]) => {
    if (!onWideTablesChange) {
      return;
    }
    onWideTablesChange(nextWideTables);
  };
  const handleUpdateWideTable = (wideTableId: string, updater: (wideTable: WideTable) => WideTable) => {
    if (!onWideTablesChange) {
      return;
    }

    onWideTablesChange(
      wideTables.map((wt) => (wt.id === wideTableId ? updater(cloneWideTable(wt)) : wt)),
    );
  };
  const handleReplaceWideTableRecords = (wideTableId: string, nextWideTableRecords: WideTableRecord[]) => {
    if (!onWideTableRecordsChange) {
      return;
    }

    const nextPlanVersion = nextWideTableRecords[0]?._metadata?.planVersion;
    onWideTableRecordsChange([
      ...wideTableRecords.filter((record) => {
        if (record.wideTableId !== wideTableId) {
          return true;
        }
        if (nextPlanVersion == null) {
          return false;
        }
        return resolveRecordPlanVersion(record, nextPlanVersion) !== nextPlanVersion;
      }),
      ...nextWideTableRecords,
    ]);
  };
  useEffect(() => {
    if (wideTables.length === 0) {
      if (selectedWtId) {
        setSelectedWtId("");
      }
      return;
    }

    if (!wideTables.some((wt) => wt.id === selectedWtId)) {
      setSelectedWtId(wideTables[0].id);
    }
  }, [wideTables, selectedWtId]);

  useEffect(() => {
    const wt = wideTables.find((w) => w.id === selectedWtId);
    setStepStatuses(wt ? deriveStepStatus(wt) : initStepStatus());
  }, [selectedWtId, wideTables]);

  useEffect(() => {
    if (
      requirement.status !== "aligning"
      || !selectedWt
      || selectedWt.businessDateRange.end !== "never"
    ) {
      return;
    }

    setStepStatuses((current) => (
      current.D === "completed" ? invalidateDownstream(current, "C") : current
    ));
  }, [requirement.status, selectedWt?.businessDateRange.end, selectedWt?.id]);

  const submitDisabledReason = useMemo(() => {
    if (isSavingDefinition) return "正在保存中，请稍后再提交。";
    if (isSubmittingDefinition) return "正在提交中，请稍后。";
    if (!canSubmit) {
      return requirement.schemaLocked ? "需求已提交并锁定，无法再次提交。" : "当前需求状态不支持提交。";
    }
    if (submitBlockerMessage) return submitBlockerMessage;
    return "";
  }, [
    canSubmit,
    isSavingDefinition,
    isSubmittingDefinition,
    requirement.schemaLocked,
    submitBlockerMessage,
  ]);

  useEffect(() => {
    const clearPendingNavigation = () => {
      pendingNavigationRef.current = null;
      if (pendingNavigationTimeoutRef.current != null) {
        window.clearTimeout(pendingNavigationTimeoutRef.current);
        pendingNavigationTimeoutRef.current = null;
      }
    };

    const scrollContainer = resolveScrollContainer();
    const scrollEventTarget = isWindowScrollContainer(scrollContainer) ? window : scrollContainer;
    const resolveActiveSection = () => {
      const anchorOffset = (navRef.current?.offsetHeight ?? 0) + 16;
      const containerTop = getScrollContainerViewportTop(scrollContainer);
      const currentScrollTop = getScrollContainerOffset(scrollContainer);
      const pendingNavigation = pendingNavigationRef.current;

      if (pendingNavigation) {
        if (Math.abs(currentScrollTop - pendingNavigation.targetTop) <= 8) {
          clearPendingNavigation();
        } else {
          setActiveSection((current) => (
            current === pendingNavigation.sectionId ? current : pendingNavigation.sectionId
          ));
          return;
        }
      }

      const sectionViewportTops = visibleDefinitionSectionIds.reduce<Partial<Record<DefinitionSectionId, number>>>(
        (accumulator, sectionId) => {
          const section = document.getElementById(sectionId);
          if (!section) {
            return accumulator;
          }

          accumulator[sectionId] = section.getBoundingClientRect().top - containerTop;
          return accumulator;
        },
        {},
      );
      const nextActiveSection = resolveActiveDefinitionSection(
        sectionViewportTops,
        anchorOffset,
        undefined,
        visibleDefinitionSectionIds,
      );

      setActiveSection((current) => (current === nextActiveSection ? current : nextActiveSection));
    };

    resolveActiveSection();
    scrollEventTarget.addEventListener("scroll", resolveActiveSection, { passive: true });
    window.addEventListener("resize", resolveActiveSection);

    return () => {
      clearPendingNavigation();
      scrollEventTarget.removeEventListener("scroll", resolveActiveSection);
      window.removeEventListener("resize", resolveActiveSection);
    };
  }, [visibleDefinitionSectionIds]);

  useEffect(() => {
    const scrollContainer = resolveScrollContainer();
    const scrollEventTarget = isWindowScrollContainer(scrollContainer) ? window : scrollContainer;
    const resolveNavFrame = () => {
      const navShell = navShellRef.current;
      const nav = navRef.current;
      if (!navShell || !nav) {
        return;
      }

      const shellRect = navShell.getBoundingClientRect();
      const containerTop = getScrollContainerViewportTop(scrollContainer);
      const nextPinned = shellRect.top <= containerTop + definitionNavTopOffset;
      const nextFrame = {
        top: containerTop + definitionNavTopOffset,
        left: shellRect.left,
        width: shellRect.width,
        height: nav.offsetHeight,
      };

      setIsNavPinned((current) => (current === nextPinned ? current : nextPinned));
      setNavFrame((current) =>
        current.top === nextFrame.top &&
        current.left === nextFrame.left &&
        current.width === nextFrame.width &&
        current.height === nextFrame.height
          ? current
          : nextFrame,
      );
    };

    resolveNavFrame();
    scrollEventTarget.addEventListener("scroll", resolveNavFrame, { passive: true });
    window.addEventListener("resize", resolveNavFrame);

    return () => {
      scrollEventTarget.removeEventListener("scroll", resolveNavFrame);
      window.removeEventListener("resize", resolveNavFrame);
    };
  }, []);

  const normalizedActiveSection = visibleDefinitionSectionIds.includes(activeSection)
    ? activeSection
    : visibleDefinitionSectionIds[0];
  const activeSectionIndex = Math.max(0, visibleDefinitionSectionIds.indexOf(normalizedActiveSection));
  const scrollToSection = (sectionId: DefinitionSectionId, behavior: ScrollBehavior = "smooth") => {
    if (!visibleDefinitionSectionIds.includes(sectionId)) {
      return;
    }

    const section = document.getElementById(sectionId);
    if (!section) {
      return;
    }

    const scrollContainer = resolveScrollContainer();
    const navShell = navShellRef.current;
    const navHeight = navRef.current?.offsetHeight ?? 0;
    const gap = 16;
    const containerTop = getScrollContainerViewportTop(scrollContainer);
    const currentScrollTop = getScrollContainerOffset(scrollContainer);
    const sectionTop = currentScrollTop + section.getBoundingClientRect().top - containerTop;
    const navShellTop = navShell
      ? currentScrollTop + navShell.getBoundingClientRect().top - containerTop
      : sectionTop;
    const targetTop = sectionId === visibleDefinitionSectionIds[0]
      ? navShellTop - definitionNavTopOffset
      : Math.max(navShellTop - definitionNavTopOffset, sectionTop - navHeight - gap - definitionNavTopOffset);
    const nextTargetTop = Math.max(0, targetTop);

    pendingNavigationRef.current = { sectionId, targetTop: nextTargetTop };
    if (pendingNavigationTimeoutRef.current != null) {
      window.clearTimeout(pendingNavigationTimeoutRef.current);
    }
    pendingNavigationTimeoutRef.current = window.setTimeout(() => {
      pendingNavigationRef.current = null;
      pendingNavigationTimeoutRef.current = null;
    }, 700);

    window.history.replaceState(null, "", `#${sectionId}`);
    scrollContainerTo(scrollContainer, nextTargetTop, behavior);
    setActiveSection(sectionId);
  };
  const handleSectionNavigation = (sectionId: DefinitionSectionId) => (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    scrollToSection(sectionId, "smooth");
  };

  useEffect(() => {
    const applyHashSectionNavigation = (behavior: ScrollBehavior = "auto") => {
      const targetSection = parseDefinitionSectionHash(window.location.hash);
      if (!targetSection || !visibleDefinitionSectionIds.includes(targetSection)) {
        return;
      }

      window.requestAnimationFrame(() => {
        scrollToSection(targetSection, behavior);
      });
    };

    applyHashSectionNavigation("auto");

    const handleHashChange = () => {
      applyHashSectionNavigation("smooth");
    };

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [visibleDefinitionSectionIds]);

  useEffect(() => {
    if (entryGuide !== "production-scope") {
      return;
    }

    const targetSection: DefinitionSectionId = "scope-generation";
    setHighlightedSections(["scope-generation", "data-update"]);
    const frameId = window.requestAnimationFrame(() => {
      scrollToSection(targetSection, "smooth");
    });
    const timeoutId = window.setTimeout(() => {
      setHighlightedSections([]);
    }, 5000);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(timeoutId);
    };
  }, [entryGuide, visibleDefinitionSectionIds]);

  return (
    <div className="space-y-4">
      <div
        ref={navShellRef}
        style={isNavPinned ? { height: navFrame.height } : undefined}
      >
        <nav
          ref={navRef}
          aria-label="需求页面导航"
          className={cn(
            "relative z-20 grid overflow-hidden rounded-xl border border-border/80 bg-background/98 shadow-md backdrop-blur-md supports-[backdrop-filter]:bg-background/92",
            "grid-cols-5",
            isNavPinned ? "fixed" : "relative",
          )}
          style={isNavPinned ? { top: navFrame.top, left: navFrame.left, width: navFrame.width } : undefined}
        >
          <StageSummaryCard
            href="#business-definition"
            index={1}
            title="业务需求"
            description="查看需求背景和角色分工。"
            isActive={activeSection === "business-definition"}
            onNavigate={handleSectionNavigation("business-definition")}
          />
          <StageSummaryCard
            href="#data-source"
            index={2}
            title="数据来源"
            description="维护项目级检索引擎和知识库。"
            isActive={activeSection === "data-source"}
            onNavigate={handleSectionNavigation("data-source")}
          />
          <StageSummaryCard
            href="#structure-config"
            index={3}
            title="表结构定义"
            description="关联 Schema，并维护字段元数据。"
            isActive={activeSection === "structure-config"}
            onNavigate={handleSectionNavigation("structure-config")}
            trailing={<SectionStatusBadge label="Schema 定义" status={stepStatuses.A} />}
          />
          <StageSummaryCard
            href="#scope-generation"
            index={4}
            title="数据范围"
            description="配置范围，预览可选。"
            isActive={activeSection === "scope-generation"}
            onNavigate={handleSectionNavigation("scope-generation")}
            trailing={<SectionStatusBadge label="数据范围" status={stepStatuses.C} />}
          />
          <StageSummaryCard
            href="#data-update"
            index={5}
            title="数据更新"
            description="确认是否持续更新，以及更新方式。"
            isActive={activeSection === "data-update"}
            onNavigate={handleSectionNavigation("data-update")}
            trailing={<SectionStatusBadge label="数据更新配置" status={dataUpdateStatus} />}
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] bg-border/80">
            <div
              className="h-full bg-primary transition-transform duration-200 ease-out"
              style={{
                width: `${100 / visibleDefinitionSectionIds.length}%`,
                transform: `translateX(${activeSectionIndex * 100}%)`,
              }}
            />
          </div>
        </nav>
      </div>

      <BasicInfoSection requirement={requirement} wideTables={wideTables} onRequirementChange={onRequirementChange} />

      <DataSourceSection
        project={project}
        requirement={requirement}
        onRequirementChange={onRequirementChange}
      />

      <WideTableSchemaSection
        requirementId={requirement.id}
        wideTables={wideTables}
        taskGroups={taskGroups ?? []}
        fetchTasks={fetchTasks ?? []}
        selectedWtId={selectedWtId}
        selectedWt={selectedWt}
        onSelectWt={setSelectedWtId}
        schemaLocked={requirement.schemaLocked}
        onReplaceWideTables={handleReplaceWideTables}
        onUpdateWideTable={handleUpdateWideTable}
        onTaskGroupsChange={onTaskGroupsChange}
        onFetchTasksChange={onFetchTasksChange}
        stepStatuses={stepStatuses}
        onStepStatusesChange={setStepStatuses}
        onShowInvalidationDialog={(changedStep, onConfirm) =>
          setInvalidationDialog({ open: true, changedStep, onConfirm })
        }
      />

      <ScopeAndGroupSection
        requirement={requirement}
        highlightedSections={highlightedSections}
        wideTables={wideTables}
        wideTableRecords={wideTableRecords}
        dimensionExcelImports={dimensionExcelImports}
        onDimensionExcelImportsChange={setDimensionExcelImports}
        scopePreviewDirtyByWideTableId={scopePreviewDirtyByWideTableId}
        onScopePreviewDirtyChange={setScopePreviewDirtyByWideTableId}
        selectedWtId={selectedWtId}
        selectedWt={selectedWt}
        selectedWideTableRecords={selectedWideTableRecords}
        onSelectWt={setSelectedWtId}
        onUpdateWideTable={handleUpdateWideTable}
        onReplaceWideTableRecords={handleReplaceWideTableRecords}
        taskGroups={taskGroups ?? []}
        fetchTasks={fetchTasks ?? []}
        onTaskGroupsChange={onTaskGroupsChange}
        onFetchTasksChange={onFetchTasksChange}
        stepStatuses={stepStatuses}
        onStepStatusesChange={setStepStatuses}
      />

      <DataUpdateSection
        requirement={requirement}
        entryGuide={entryGuide}
        highlightedSections={highlightedSections}
        status={dataUpdateStatus}
        selectedWt={selectedWt}
        onRequirementChange={onRequirementChange}
        onUpdateWideTable={handleUpdateWideTable}
      />

      <section className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">需求操作</div>
            <div className="mt-1 text-xs text-muted-foreground">
              保存用于落库当前配置；提交后才能进入任务环节并生成任务组。
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSaveDefinition}
              disabled={requirement.schemaLocked || isSavingDefinition || isSubmittingDefinition || stepStatuses.A !== "completed"}
              className={cn(
                "rounded-md border px-3 py-2 text-xs font-medium",
                requirement.schemaLocked || isSavingDefinition || isSubmittingDefinition || stepStatuses.A !== "completed"
                  ? "cursor-not-allowed bg-muted text-muted-foreground"
                  : "bg-background hover:bg-muted/30",
              )}
            >
              {isSavingDefinition ? "保存中..." : "保存"}
            </button>
            <button
              type="button"
              onClick={handleSubmitDefinition}
              disabled={!canSubmit || Boolean(submitBlockerMessage) || isSavingDefinition || isSubmittingDefinition}
              className={cn(
                "rounded-md px-3 py-2 text-xs font-medium",
                !canSubmit || Boolean(submitBlockerMessage) || isSavingDefinition || isSubmittingDefinition
                  ? "cursor-not-allowed bg-muted text-muted-foreground"
                  : "bg-primary text-primary-foreground hover:opacity-90",
              )}
            >
              {isSubmittingDefinition ? "提交中..." : "提交"}
            </button>
          </div>
        </div>

        {submitDisabledReason ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {submitDisabledReason}
          </div>
        ) : null}

        {submitMessage ? (
          <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
            {submitMessage}
          </div>
        ) : null}
      </section>

      {invalidationDialog?.open && selectedWt ? (
        <InvalidationDialog
          open={true}
          changedStepLabel={STEP_LABELS[invalidationDialog.changedStep]}
          affectedSteps={getAffectedSteps(stepStatuses, invalidationDialog.changedStep).map((s) => ({
            id: s,
            label: STEP_LABELS[s],
          }))}
          impactSummary={{
            indicatorGroupCount: selectedWt.indicatorGroups.length,
            dimensionValueCount: selectedWt.dimensionRanges.reduce((sum, r) => sum + r.values.length, 0),
            ...buildInvalidationImpactSummary(selectedWt, taskGroups ?? [], fetchTasks ?? []),
          }}
          onConfirm={() => {
            invalidationDialog.onConfirm();
            setInvalidationDialog(null);
          }}
          onCancel={() => setInvalidationDialog(null)}
        />
      ) : null}
    </div>
  );
}

function cloneWideTable(wideTable: WideTable): WideTable {
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

function deriveDataUpdateSectionStatus(
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

  if (
    resolvedMode === "incremental"
    && hasWideTableBusinessDateDimension(wideTable)
    && !isOpenEndedBusinessDateRange(wideTable.businessDateRange)
  ) {
    return "invalidated";
  }

  return "completed";
}

function parseMultilineList(value: string): string[] {
  return value
    .split(/\n/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildDraftWideTable(requirementId: string): WideTable {
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

function StatusDot({
  status,
  title,
}: {
  status: StepStatus;
  title: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-3.5 w-3.5 shrink-0 rounded-full",
        status === "completed"
          ? "bg-green-500"
          : status === "invalidated"
            ? "bg-orange-400"
            : "bg-gray-300",
      )}
      title={title}
      aria-label={title}
    />
  );
}

function SectionStatusBadge({
  label,
  status,
}: {
  label: string;
  status: StepStatus;
}) {
  return (
    <StatusDot
      status={status}
      title={`${label}: ${formatStepStatusLabel(status)}`}
    />
  );
}

function CompactInfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/10 px-3 py-2.5">
      <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm">{value}</div>
    </div>
  );
}

function CompactChoiceButton({
  title,
  description,
  checked,
  disabled,
  badge,
  onClick,
}: {
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  badge?: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-md border px-3 py-2 text-left transition-colors",
        checked
          ? "border-primary bg-primary/5"
          : "border-border/70 hover:border-border hover:bg-muted/20",
        disabled ? "cursor-not-allowed opacity-50" : "",
      )}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            "mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors",
            checked
              ? "border-primary bg-primary/10"
              : "border-border/70 bg-background",
          )}
          aria-hidden="true"
        >
          <span className={cn("h-2 w-2 rounded-full", checked ? "bg-primary" : "bg-transparent")} />
        </span>
        <div className="min-w-0 flex-1 space-y-0.5 md:flex md:items-center md:justify-between md:gap-3 md:space-y-0">
          <div className="min-w-0">
            <div className="text-sm font-medium leading-5">{title}</div>
            <div className="text-[11px] leading-4 text-muted-foreground">{description}</div>
          </div>
          {badge ? <div className="shrink-0">{badge}</div> : null}
        </div>
      </div>
    </button>
  );
}

// ==================== 鍩虹淇℃伅 ====================

function BasicInfoSection({
  requirement,
  wideTables,
  onRequirementChange,
}: {
  requirement: Requirement;
  wideTables: WideTable[];
  onRequirementChange?: (requirement: Requirement) => void;
}) {
  const linkedWideTable = requirement.wideTable ?? wideTables[0];
  const update = (patch: Partial<Requirement>) => {
    onRequirementChange?.({ ...requirement, ...patch });
  };

  return (
    <section id="business-definition" className="scroll-mt-28 rounded-xl border bg-card p-6 space-y-4">
      <div className="space-y-1">
        <h3 className="font-semibold">1. 业务定义</h3>
        <p className="text-xs text-muted-foreground">明确这条需求的背景知识与角色分工。</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <CompactInfoItem label="需求 ID" value={requirement.id} />
        <EditableField label="业务负责人" control={
          <input className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={requirement.owner} onChange={(e) => update({ owner: e.target.value })} />
        } />
        <EditableField label="执行人" control={
          <input className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={requirement.assignee} onChange={(e) => update({ assignee: e.target.value })} />
        } />
      </div>

      <EditableField label="需求标题" control={
        <input className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          value={requirement.title} onChange={(e) => update({ title: e.target.value })} />
      } />

      <div className="grid gap-3 xl:grid-cols-1">
        <EditableField label="背景知识" control={
          <textarea className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[72px] resize-y"
            value={requirement.backgroundKnowledge ?? requirement.businessGoal ?? ""}
            onChange={(e) => update({ backgroundKnowledge: e.target.value, businessGoal: e.target.value })}
            placeholder="补充业务背景、历史口径和上下文信息" />
        } />
      </div>

      <CompactInfoItem label="当前关联数据表" value={linkedWideTable ? linkedWideTable.name : "尚未关联"} />
    </section>
  );
}

function DataUpdateSection({
  requirement,
  entryGuide,
  highlightedSections,
  status,
  selectedWt,
  onRequirementChange,
  onUpdateWideTable,
}: {
  requirement: Requirement;
  entryGuide?: string;
  highlightedSections?: readonly DefinitionSectionId[];
  status: StepStatus;
  selectedWt?: WideTable;
  onRequirementChange?: (requirement: Requirement) => void;
  onUpdateWideTable?: (wideTableId: string, updater: (wideTable: WideTable) => WideTable) => void;
}) {
  const [updateMessage, setUpdateMessage] = useState("");
  const usesBusinessDateAxis = Boolean(selectedWt && hasWideTableBusinessDateDimension(selectedWt));
  const effectiveMode = resolveRequirementDataUpdateMode(requirement, selectedWt);
  const hasConfirmedDataUpdateEnabled = requirement.dataUpdateEnabled != null;
  const dataUpdateEnabled = requirement.dataUpdateEnabled === true;
  const isRangeOpenEnded = Boolean(
    selectedWt
    && usesBusinessDateAxis
    && isOpenEndedBusinessDateRange(selectedWt.businessDateRange),
  );

  useEffect(() => {
    setUpdateMessage("");
  }, [requirement.id, selectedWt?.id]);

  const updateRequirement = (patch: Partial<Requirement>) => {
    onRequirementChange?.({
      ...requirement,
      ...patch,
      updatedAt: new Date().toISOString(),
    });
  };

  const updateSelectedWideTable = (updater: (wideTable: WideTable) => WideTable) => {
    if (!selectedWt || !onUpdateWideTable) {
      return;
    }
    onUpdateWideTable(selectedWt.id, (wideTable) => normalizeWideTableMode(updater(wideTable)));
  };

  const handleDataUpdateEnabledChange = (nextEnabled: boolean) => {
    updateRequirement({
      dataUpdateEnabled: nextEnabled,
      dataUpdateMode: nextEnabled ? (requirement.dataUpdateMode ?? null) : null,
    });
    setUpdateMessage(
      nextEnabled
        ? "已标记为持续更新需求，请继续确认更新方式；如需调整正式范围，请回到上方的数据范围节。"
        : "已标记为一次性交付需求。上方数据范围会按固定范围确认，不再要求正式调度规则。",
    );
  };

  const promoteBusinessDateToDimension = (wideTable: WideTable) => {
    const now = new Date().toISOString();
    const nextColumns = wideTable.schema.columns.map((col) => ({ ...col }));
    let found = false;

    for (const col of nextColumns) {
      // Ensure there is exactly one business date dimension.
      if (col.isBusinessDate) {
        col.isBusinessDate = false;
      }
    }

    // Prefer an existing biz_date column if present.
    const candidate = nextColumns.find((col) => col.name.toLowerCase() === "biz_date")
      ?? nextColumns.find((col) => col.name.toLowerCase() === "business_date");
    if (candidate) {
      candidate.category = "dimension";
      candidate.type = "DATE";
      candidate.isBusinessDate = true;
      candidate.chineseName = candidate.chineseName ?? "业务日期";
      candidate.description = candidate.description || "业务日期维度";
      found = true;
    }

    if (!found) {
      nextColumns.push({
        id: "biz_date",
        name: "biz_date",
        chineseName: "业务日期",
        type: "DATE",
        category: "dimension",
        description: "业务日期维度",
        required: true,
        isBusinessDate: true,
      });
    }

    return {
      ...wideTable,
      schema: { columns: nextColumns },
      // Ensure scope dimensions won't accidentally include biz_date.
      dimensionRanges: wideTable.dimensionRanges.filter((range) => range.dimensionName.toLowerCase() !== "biz_date"),
      recordCount: 0,
      currentPlanFingerprint: undefined,
      currentPlanVersion: Math.max(wideTable.currentPlanVersion ?? 0, 0) + 1,
      status: "draft" as const,
      updatedAt: now,
    };
  };

  const demoteBusinessDateToAttribute = (wideTable: WideTable) => {
    const now = new Date().toISOString();
    const nextColumns = wideTable.schema.columns.map((col) => ({ ...col }));
    const bizDateDimension = nextColumns.find((col) => col.category === "dimension" && col.isBusinessDate);
    if (bizDateDimension) {
      bizDateDimension.category = "attribute";
      bizDateDimension.isBusinessDate = false;
      bizDateDimension.type = "DATE";
      bizDateDimension.chineseName = bizDateDimension.chineseName ?? "业务日期";
      bizDateDimension.description = bizDateDimension.description || "业务日期（属性列）";
    }

    return {
      ...wideTable,
      schema: { columns: nextColumns },
      dimensionRanges: wideTable.dimensionRanges.filter((range) => range.dimensionName.toLowerCase() !== "biz_date"),
      recordCount: 0,
      currentPlanFingerprint: undefined,
      currentPlanVersion: Math.max(wideTable.currentPlanVersion ?? 0, 0) + 1,
      status: "draft" as const,
      updatedAt: now,
    };
  };

  const handleDataUpdateModeChange = (mode: NonNullable<Requirement["dataUpdateMode"]>) => {
    if (!selectedWt) {
      setUpdateMessage("请先关联数据表，再选择更新方式。");
      return;
    }
    updateRequirement({
      dataUpdateEnabled: true,
      dataUpdateMode: mode,
    });
    updateSelectedWideTable((wideTable) => (
      mode === "incremental" ? promoteBusinessDateToDimension(wideTable) : demoteBusinessDateToAttribute(wideTable)
    ));
    setUpdateMessage(`已切换为${formatRequirementDataUpdateMode(mode)}。`);
  };

  const handleScheduleRuleChange = (offsetDays: number) => {
    updateSelectedWideTable((wideTable) => ({
      ...wideTable,
      scheduleRule: {
        ...(wideTable.scheduleRule ?? buildDefaultScheduleRule(wideTable.id, "business_date", wideTable.businessDateRange.frequency)),
        businessDateOffsetDays: offsetDays,
        description: `业务日期后 ${offsetDays} 天触发未来任务`,
      },
    }));
    setUpdateMessage("增量更新调度设置已修改。");
  };

  const handleFullSnapshotScheduleRuleChange = (
    patch: Partial<NonNullable<WideTable["scheduleRule"]>>,
  ) => {
    updateSelectedWideTable((wideTable) => {
      const nextRule = {
        ...(wideTable.scheduleRule ?? buildDefaultScheduleRule(wideTable.id, "full_snapshot", wideTable.businessDateRange.frequency)),
        ...patch,
      };

      return {
        ...wideTable,
        scheduleRule: {
          ...nextRule,
          description: describeFullSnapshotScheduleRule(nextRule),
        },
      };
    });
    setUpdateMessage("全量更新调度设置已修改。");
  };

  const handleApplyDefaultScheduleRule = (
    mode: "business_date" | "full_snapshot",
  ) => {
    if (!selectedWt) {
      return;
    }

    updateSelectedWideTable((wideTable) => ({
      ...wideTable,
      scheduleRule: buildDefaultScheduleRule(wideTable.id, mode, wideTable.businessDateRange.frequency),
    }));
    setUpdateMessage("已应用默认调度规则，请按需调整。");
  };

  const modeOptions: Array<{
    mode: NonNullable<Requirement["dataUpdateMode"]>;
    title: string;
    description: string;
  }> = [
    {
      mode: "full",
      title: "全量更新",
      description: "按当前范围整表重跑，每次调度生成新的全量快照任务组。",
    },
    {
      mode: "incremental",
      title: "增量更新",
      description: "按业务日期拆分任务组，仅生成新增日期的任务输入。",
    },
  ];

  return (
    <section
      id="data-update"
      className={cn(
        "scroll-mt-28 rounded-xl border bg-card p-6 space-y-4 transition-all",
        highlightedSections?.includes("data-update") ? "border-amber-300 ring-4 ring-amber-200/70 shadow-[0_0_0_1px_rgba(251,191,36,0.35)]" : "",
      )}
    >
      <div className="space-y-1">
        {entryGuide === "production-scope" ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            你刚从【数据产出】返回。正式范围确认完成后，请在这里补充是否持续更新、更新方式和调度设置；如需持续更新但范围还未改为长期有效，请回到上方的数据范围步骤继续调整。
          </div>
        ) : null}
        <div className="flex items-center gap-2">
          <h3 className="font-semibold">5. 数据更新</h3>
          <span className="inline-flex items-center gap-1">
            <SectionStatusBadge label="数据更新配置" status={status} />
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          需求在这里确认是否持续更新，以及采用全量还是增量的更新策略。
        </p>
      </div>

      {selectedWt ? (
        <div className="grid gap-3 md:grid-cols-3">
          <CompactInfoItem label="当前数据表" value={selectedWt.name} />
          <CompactInfoItem label="当前更新方式" value={formatRequirementDataUpdateMode(effectiveMode)} />
          <CompactInfoItem label="业务日期语义轴" value={usesBusinessDateAxis ? "已启用" : "未启用"} />
        </div>
      ) : (
        <div className="rounded-md border border-dashed px-3 py-4 text-xs text-muted-foreground">
          先关联 Schema，才能配置更新方式和调度规则。
        </div>
      )}

      <>
          <div className="grid items-start gap-3 lg:grid-cols-2">
            <div className="rounded-lg bg-muted/10 p-3 space-y-2.5">
              <div>
                <h4 className="text-sm font-semibold">是否定期更新</h4>
                <p className="mt-1 text-xs text-muted-foreground">
                  有的正式需求只是一次性交付；只有需要后续持续更新时，才需要继续配置更新方式和调度规则。
                </p>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {[
                  {
                    value: true,
                    title: "定期更新",
                    description: "后续仍会持续补数并继续生成任务。",
                  },
                  {
                    value: false,
                    title: "一次性交付",
                    description: "只交付本次确认范围内的数据。",
                  },
                ].map((option) => {
                  const checked = requirement.dataUpdateEnabled === option.value;
                  return (
                    <CompactChoiceButton
                      key={option.title}
                      onClick={() => handleDataUpdateEnabledChange(option.value)}
                      checked={checked}
                      title={option.title}
                      description={option.description}
                    />
                  );
                })}
              </div>
            </div>

            {hasConfirmedDataUpdateEnabled && dataUpdateEnabled ? (
              <div className="rounded-lg bg-muted/10 p-3 space-y-2.5">
                <div>
                  <h4 className="text-sm font-semibold">更新方式</h4>
                  <p className="mt-1 text-xs text-muted-foreground">
                    更新方式由你选择。选择“增量更新”会启用业务日期语义轴；选择“全量更新”会把业务日期列降级为属性列。
                  </p>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  {modeOptions.map((option) => {
                    const checked = effectiveMode === option.mode;
                    return (
                      <CompactChoiceButton
                        key={option.mode}
                        onClick={() => handleDataUpdateModeChange(option.mode)}
                        checked={checked}
                        title={option.title}
                        description={option.description}
                      />
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>

          {dataUpdateEnabled ? (
            <>
              {effectiveMode === "incremental" ? (
                <div className="rounded-lg bg-muted/10 p-4 space-y-3">
                  <h4 className="text-sm font-semibold">增量更新设置</h4>
                  {!selectedWt ? (
                    <div className="rounded-md border border-dashed px-3 py-4 text-xs text-muted-foreground">
                      先关联数据表，再配置增量更新。
                    </div>
                  ) : (
                    <>
                      {!usesBusinessDateAxis ? (
                        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                          增量更新需要启用业务日期语义轴。请先在上方选择“增量更新”（系统会自动把业务日期列升级为维度列）。
                        </div>
                      ) : null}
                      {!selectedWt.scheduleRule ? (
                        <div className="flex items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-900">
                          <div>当前还未配置增量更新调度规则，请先应用一条默认规则。</div>
                          <button
                            type="button"
                            onClick={() => handleApplyDefaultScheduleRule("business_date")}
                            className="shrink-0 rounded-md bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600"
                          >
                            应用默认规则
                          </button>
                        </div>
                      ) : null}
                      <p className="text-xs text-muted-foreground">
                        参照现有方案，增量更新任务组按业务日期拆分，并通过“业务日期后偏移多少天”决定每个业务日期对应任务组的启动时间。
                      </p>
                      {!isRangeOpenEnded ? (
                        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                          你已选择“定期更新”，如需持续增量更新，请回到上方“数据范围”里把结束方式改为“永不”。
                        </div>
                      ) : null}
                      <div className="grid gap-3 md:grid-cols-2">
                        <EditableField
                          label="时间偏移量"
                          control={(
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={selectedWt.scheduleRule?.businessDateOffsetDays ?? 1}
                              onChange={(event) =>
                                handleScheduleRuleChange(Math.max(0, Number(event.target.value) || 0))
                              }
                              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                            />
                          )}
                        />
                        <ReadOnlyField
                          label="规则说明"
                          value={`业务日期后 +${selectedWt.scheduleRule?.businessDateOffsetDays ?? 1} 天`}
                        />
                      </div>
                    </>
                  )}
                </div>
              ) : effectiveMode === "full" ? (
                <div className="rounded-lg bg-muted/10 p-4 space-y-3">
                  <h4 className="text-sm font-semibold">全量更新设置</h4>
                  {!selectedWt ? (
                    <div className="rounded-md border border-dashed px-3 py-4 text-xs text-muted-foreground">
                      先关联数据表，再配置全量更新。
                    </div>
                  ) : (
                    <>
                      {usesBusinessDateAxis ? (
                        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                          全量更新不使用业务日期语义轴。选择“全量更新”后，业务日期列会降级为属性列，不参与维度拆分。
                        </div>
                      ) : null}
                      {!selectedWt.scheduleRule ? (
                        <div className="flex items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-900">
                          <div>当前还未配置全量更新调度规则，请先应用一条默认规则。</div>
                          <button
                            type="button"
                            onClick={() => handleApplyDefaultScheduleRule("full_snapshot")}
                            className="shrink-0 rounded-md bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600"
                          >
                            应用默认规则
                          </button>
                        </div>
                      ) : null}
                      <p className="text-xs text-muted-foreground">
                        参照现有方案，全量更新不按业务日期拆任务组，而是按调度频度持续生成新的全量快照任务组。
                      </p>
                      <div className="grid gap-3 md:grid-cols-3">
                        <EditableField
                          label="调度频度"
                          control={(
                            <select
                              value={selectedWt.scheduleRule?.periodLabel ?? selectedWt.businessDateRange.frequency}
                              onChange={(event) =>
                                handleFullSnapshotScheduleRuleChange({ periodLabel: event.target.value })
                              }
                              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                            >
                              <option value="daily">日频</option>
                              <option value="weekly">周频</option>
                              <option value="monthly">月频</option>
                              <option value="quarterly">季频</option>
                              <option value="yearly">年频</option>
                            </select>
                          )}
                        />
                        <EditableField
                          label="时间偏移量"
                          control={(
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={selectedWt.scheduleRule?.businessDateOffsetDays ?? 1}
                              onChange={(event) =>
                                handleFullSnapshotScheduleRuleChange({
                                  businessDateOffsetDays: Math.max(0, Number(event.target.value) || 0),
                                })
                              }
                              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                            />
                          )}
                        />
                        <ReadOnlyField
                          label="规则说明"
                          value={describeFullSnapshotScheduleRule(selectedWt.scheduleRule)}
                        />
                      </div>
                    </>
                  )}
                </div>
              ) : null}
            </>
          ) : null}
        </>

      {updateMessage ? (
        <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary">
          {updateMessage}
        </div>
      ) : null}
    </section>
  );
}


function DataSourceSection({
  project,
  requirement,
  onRequirementChange,
}: {
  project: Project;
  requirement: Requirement;
  onRequirementChange?: (requirement: Requirement) => void;
}) {
  const [isKnowledgeBaseSelectorOpen, setKnowledgeBaseSelectorOpen] = useState(false);
  const [allKnowledgeBases, setAllKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [enabledSearchEngines, setEnabledSearchEngines] = useState(
    DEFAULT_RUNTIME_SETTINGS.searchConfig.enabledSearchEngines,
  );

  useEffect(() => {
    fetch(buildApiUrl("/api/knowledge-bases"))
      .then((res) => res.json())
      .then((data) =>
        setAllKnowledgeBases(
          data.map((item: any) => ({
            id: item.id,
            name: item.name,
            description: item.description ?? "",
            documentCount: item.document_count ?? 0,
            status: item.status ?? "ready",
            lastUpdated: item.last_updated ?? "",
          })),
        ),
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchRuntimeSettings()
      .then((settings) => setEnabledSearchEngines(settings.searchConfig.enabledSearchEngines))
      .catch(() => {});
  }, []);

  const knowledgeBaseNameMap = useMemo(
    () => new Map(allKnowledgeBases.map((item) => [item.id, item.name])),
    [allKnowledgeBases],
  );

  const effectiveCollectionPolicy: NonNullable<Requirement["collectionPolicy"]> = useMemo(() => {
    if (requirement.collectionPolicy) {
      const normalizedEngines = requirement.collectionPolicy.searchEngines?.length
        ? requirement.collectionPolicy.searchEngines
        : enabledSearchEngines;
      return {
        ...requirement.collectionPolicy,
        searchEngines: normalizedEngines,
      };
    }

    return {
      searchEngines: enabledSearchEngines,
      preferredSites: project.dataSource.search.sites ?? [],
      sitePolicy: project.dataSource.search.sitePolicy ?? "preferred",
      knowledgeBases: project.dataSource.knowledgeBases ?? [],
      nullPolicy: "",
      sourcePriority: "",
      valueFormat: "",
    };
  }, [enabledSearchEngines, project.dataSource, requirement.collectionPolicy]);

  const updateRequirementCollectionPolicy = (
    updater: (policy: NonNullable<Requirement["collectionPolicy"]>) => NonNullable<Requirement["collectionPolicy"]>,
  ) => {
    onRequirementChange?.({
      ...requirement,
      collectionPolicy: updater(effectiveCollectionPolicy),
      updatedAt: new Date().toISOString(),
    });
  };

  const blockClass = "space-y-3 rounded-lg bg-muted/10 p-4";

  return (
    <section id="data-source" className="scroll-mt-28 rounded-xl border bg-card p-6 space-y-4">
      <div className="space-y-1">
        <h3 className="font-semibold">2. 数据来源</h3>
        <p className="text-xs text-muted-foreground">这里修改的是需求级来源策略（唯一真源：requirements.collection_policy）。</p>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className={blockClass}>
          <div>
            <h4 className="text-sm font-semibold">搜索引擎</h4>
            <p className="mt-1 text-xs text-muted-foreground">引擎启用列表已迁移到系统设置，这里只维护项目级站点策略。</p>
          </div>
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">全局启用引擎</div>
            {enabledSearchEngines.length === 0 ? (
              <div className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                当前未启用搜索引擎，请前往【设置】页面统一配置。              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {enabledSearchEngines.map((engine) => (
                  <span
                    key={engine}
                    className="inline-flex items-center rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-xs text-primary"
                  >
                    {formatSearchEngineLabel(engine)}
                  </span>
                ))}
              </div>
            )}
            <div className="text-[11px] text-muted-foreground">
              引擎列表在“设置 &gt; 搜索引擎与接入”中统一维护。            </div>
          </div>
          <label className="space-y-1 block">
            <div className="text-xs font-medium text-muted-foreground">站点策略</div>
            <select
              value={effectiveCollectionPolicy.sitePolicy}
              onChange={(event) =>
                updateRequirementCollectionPolicy((currentPolicy) => ({
                  ...currentPolicy,
                  sitePolicy: event.target.value as NonNullable<Requirement["collectionPolicy"]>["sitePolicy"],
                  searchEngines: enabledSearchEngines,
                }))
              }
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="preferred">preferred</option>
              <option value="whitelist">whitelist</option>
            </select>
          </label>
          <label className="space-y-1 block">
            <div className="text-xs font-medium text-muted-foreground">站点范围</div>
            <textarea
              value={(effectiveCollectionPolicy.preferredSites ?? []).join("\n")}
              onChange={(event) =>
                updateRequirementCollectionPolicy((currentPolicy) => ({
                  ...currentPolicy,
                  preferredSites: parseMultilineList(event.target.value),
                  searchEngines: enabledSearchEngines,
                }))
              }
              className="min-h-36 w-full rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="每行一个 site:xxx 或 URL"
            />
          </label>
        </div>

        <div className={blockClass}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <h4 className="text-sm font-semibold">知识库</h4>
              <p className="mt-1 text-xs text-muted-foreground">补充项目内部沉淀资料。</p>
            </div>
            <button
              type="button"
              onClick={() => setKnowledgeBaseSelectorOpen(true)}
              className="rounded-md border px-2 py-1 text-xs text-primary hover:bg-primary/5"
            >
              选择知识库            </button>
          </div>
          {(effectiveCollectionPolicy.knowledgeBases ?? []).length === 0 ? (
            <div className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
              暂未关联知识库            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {(effectiveCollectionPolicy.knowledgeBases ?? []).map((id) => (
                <span
                  key={id}
                  className="inline-flex items-center rounded-full border bg-background px-2 py-1 text-xs text-foreground"
                >
                  {knowledgeBaseNameMap.get(id) ?? id}
                </span>
              ))}
            </div>
          )}
          <div className="text-[11px] text-muted-foreground">
            已关联 {(effectiveCollectionPolicy.knowledgeBases ?? []).length} 个知识库
          </div>
        </div>

      </div>

      <div className="rounded-lg bg-muted/10 px-4 py-3 text-xs text-muted-foreground">
        当前需求使用 {enabledSearchEngines.length} 个全局搜索引擎，关联 {(effectiveCollectionPolicy.knowledgeBases ?? []).length} 个知识库。
      </div>

      <KnowledgeBaseSelectorModal
        isOpen={isKnowledgeBaseSelectorOpen}
        onClose={() => setKnowledgeBaseSelectorOpen(false)}
        allKnowledgeBases={allKnowledgeBases}
        linkedIds={effectiveCollectionPolicy.knowledgeBases ?? []}
        onSave={(ids) =>
          updateRequirementCollectionPolicy((currentPolicy) => ({
            ...currentPolicy,
            knowledgeBases: ids,
            searchEngines: enabledSearchEngines,
          }))
        }
      />
    </section>
  );
}

// ==================== 琛ㄧ粨鏋勫畾涔?====================

function WideTableSchemaSection({
  requirementId,
  wideTables,
  taskGroups,
  fetchTasks,
  selectedWtId,
  selectedWt,
  onSelectWt,
  schemaLocked,
  onReplaceWideTables,
  onUpdateWideTable,
  onTaskGroupsChange,
  onFetchTasksChange,
  stepStatuses,
  onStepStatusesChange,
  onShowInvalidationDialog,
}: {
  requirementId: string;
  wideTables: WideTable[];
  taskGroups: TaskGroup[];
  fetchTasks: FetchTask[];
  selectedWtId: string;
  selectedWt?: WideTable;
  onSelectWt: (id: string) => void;
  schemaLocked?: boolean;
  onReplaceWideTables?: (wideTables: WideTable[]) => void;
  onUpdateWideTable?: (wideTableId: string, updater: (wideTable: WideTable) => WideTable) => void;
  onTaskGroupsChange?: (taskGroups: TaskGroup[]) => void;
  onFetchTasksChange?: (fetchTasks: FetchTask[]) => void;
  stepStatuses: StepStatusMap;
  onStepStatusesChange: (statuses: StepStatusMap) => void;
  onShowInvalidationDialog: (changedStep: StepId, onConfirm: () => void) => void;
}) {
  const [isSchemaSelectorOpen, setIsSchemaSelectorOpen] = useState(false);
  const [schemaActionMessage, setSchemaActionMessage] = useState("");
  const selectedWideTablePlanVersion = useMemo(
    () => (
      selectedWt
        ? resolveCurrentPlanVersion(selectedWt, [], taskGroups ?? [])
        : 0
    ),
    [selectedWt, taskGroups],
  );
  const isSchemaMetadataEditable = Boolean(!schemaLocked && onUpdateWideTable && selectedWt);

  const updateSelectedWideTable = (updater: (wideTable: WideTable) => WideTable) => {
    if (!selectedWt || !onUpdateWideTable) {
      return;
    }
    onUpdateWideTable(selectedWt.id, (wideTable) => normalizeWideTableMode(updater(wideTable)));
  };

  useEffect(() => {
    setSchemaActionMessage("");
    setIsSchemaSelectorOpen(false);
  }, [selectedWtId, selectedWt?.name]);

  const handleColumnMetadataChange = (columnId: string, patch: Partial<ColumnDefinition>) => {
    const doChange = () => {
      const currentPlanVersion = selectedWideTablePlanVersion;
      updateSelectedWideTable((wideTable) => {
        const currentColumn = wideTable.schema.columns.find((col) => col.id === columnId);
        if (!currentColumn) {
          return wideTable;
        }

        let nextColumns = wideTable.schema.columns.map((col) => {
          if (col.id !== columnId) {
            return col;
          }

          const nextCategory = patch.category ?? col.category;
          const nextIsBusinessDate = patch.category && col.isBusinessDate && nextCategory !== "dimension"
            ? false
            : patch.isBusinessDate ?? col.isBusinessDate;

          return {
            ...col,
            ...patch,
            category: nextCategory,
            isBusinessDate: nextIsBusinessDate,
            unit: nextCategory === "indicator" ? patch.unit ?? col.unit : undefined,
          };
        });

        if (patch.isBusinessDate === true) {
          nextColumns = nextColumns.map((col) => (
            col.id === columnId ? col : { ...col, isBusinessDate: false }
          ));
        }

        let nextIndicatorGroups = wideTable.indicatorGroups;
        let nextDimensionRanges = wideTable.dimensionRanges;

        if (patch.category && patch.category !== "indicator") {
          nextIndicatorGroups = wideTable.indicatorGroups.map((group) => ({
            ...group,
            indicatorColumns: group.indicatorColumns.filter((column) => column !== currentColumn.name),
          }));
        }

        if (patch.category && patch.category !== "dimension") {
          nextDimensionRanges = wideTable.dimensionRanges.filter(
            (range) => range.dimensionName !== currentColumn.name,
          );
        }

        // Sub-task 5.3: Ensure all dimensionRanges reference valid dimension columns
        const currentDimensionNames = new Set(
          nextColumns
            .filter((col) => col.category === "dimension" && !col.isBusinessDate)
            .map((col) => col.name),
        );
        nextDimensionRanges = nextDimensionRanges.filter(
          (range) => currentDimensionNames.has(range.dimensionName),
        );

        const nextWideTable: WideTable = {
          ...wideTable,
          schema: {
            ...wideTable.schema,
            columns: nextColumns,
          },
          indicatorGroups: nextIndicatorGroups,
          dimensionRanges: nextDimensionRanges,
        };

        if (!patch.category) {
          return nextWideTable;
        }

        return {
          ...nextWideTable,
          // Artifact handling: when schema change causes downstream invalidation, mark TaskGroups stale
          status: "draft" as const,
          currentPlanFingerprint: undefined,
          currentPlanVersion: Math.max(currentPlanVersion, 1) + 1,
          updatedAt: new Date().toISOString(),
        };
      });

      // When column category changes, invalidate downstream of B and re-evaluate B completion
      if (patch.category) {
        onStepStatusesChange(invalidateDownstream(completeStep(stepStatuses, "A"), "A"));

        if (selectedWt && onTaskGroupsChange) {
          const staleTaskGroups = markTaskGroupsAsStale(taskGroups ?? [], selectedWt.id, currentPlanVersion);
          onTaskGroupsChange(staleTaskGroups);
        }
      }
    };

    doChange();
  };

  const resolveWideTableColumnType = (
    dataType: string,
    columnType?: string,
  ): ColumnDefinition["type"] => {
    const dt = (dataType ?? "").toLowerCase();
    const ct = (columnType ?? "").toLowerCase();

    if (dt === "tinyint" && ct.includes("(1)")) return "BOOLEAN";
    if (dt === "boolean" || dt === "bool" || dt === "bit") return "BOOLEAN";

    if (
      dt.includes("int")
      || dt === "bigint"
      || dt === "smallint"
      || dt === "mediumint"
      || dt === "tinyint"
    ) {
      return "INTEGER";
    }

    if (
      dt === "decimal"
      || dt === "numeric"
      || dt === "float"
      || dt === "double"
      || dt === "real"
    ) {
      return "NUMBER";
    }

    if (dt.includes("date") || dt.includes("time") || dt === "timestamp" || dt === "datetime") {
      return "DATE";
    }

    return "STRING";
  };

  const inferWideTableColumnMeta = (
    columnName: string,
    columnType: ColumnDefinition["type"],
  ): Pick<ColumnDefinition, "category" | "isBusinessDate"> => {
    const name = (columnName ?? "").trim();
    const lower = name.toLowerCase();

    if (lower === "row_status" || lower === "last_task_id" || lower === "updated_at") {
      return { category: "system" };
    }

    if (lower === "biz_date" || lower === "business_date") {
      return { category: "dimension", isBusinessDate: true };
    }

    if (lower === "id" || lower.endsWith("_id")) {
      return { category: "id" };
    }

    if (columnType === "NUMBER" || columnType === "INTEGER") {
      return { category: "indicator" };
    }

    return { category: "dimension" };
  };

  const buildColumnsFromTargetTable = (columns: TargetTableColumn[]): ColumnDefinition[] => {
    const mapped = (columns ?? [])
      .filter((col) => Boolean(col?.columnName))
      .sort((left, right) => (left.ordinalPosition ?? 0) - (right.ordinalPosition ?? 0))
      .map((col) => {
        const type = resolveWideTableColumnType(col.dataType, col.columnType);
        const meta = inferWideTableColumnMeta(col.columnName, type);
        const required = String(col.isNullable ?? "YES").toUpperCase() === "NO";
        const comment = col.columnComment ?? "";
        return {
          id: col.columnName,
          name: col.columnName,
          chineseName: comment || col.columnName,
          type,
          category: meta.category,
          description: comment,
          unit: undefined,
          required,
          isBusinessDate: meta.isBusinessDate,
          passthroughEnabled: false,
          passthroughContent: undefined,
          auditRuleType: undefined,
          auditRuleValue: undefined,
        } satisfies ColumnDefinition;
      });

    if (mapped.length > 0 && !mapped.some((col) => col.category === "id")) {
      mapped[0] = { ...mapped[0], category: "id" };
    }

    return mapped;
  };

  const handleApplyTargetTable = (table: TargetTableSummary) => {
    if (!selectedWt) {
      return;
    }

    const doApply = async () => {
      try {
        setSchemaActionMessage("Loading...");
        const rawColumns = await listTargetTableColumns(table.tableName);
        const nextColumns = buildColumnsFromTargetTable(rawColumns);
      updateSelectedWideTable((wideTable) => {
        const currentPlanVersion = Math.max(selectedWideTablePlanVersion, 1);
        wideTable.schema = {
          columns: nextColumns.map((column) => ({ ...column })),
        };
        wideTable.name = table.tableName;
        wideTable.description = table.tableComment ?? "";
        wideTable.dimensionRanges = [];
        wideTable.indicatorGroups = [];
        wideTable.recordCount = 0;
        wideTable.currentPlanVersion = currentPlanVersion + 1;
        wideTable.currentPlanFingerprint = undefined;
        wideTable.status = "draft";
        wideTable.updatedAt = new Date().toISOString();
        return wideTable;
      });
      setSchemaActionMessage(`已关联 Schema ${table.tableName}。`);

      // Step status: mark A as completed, invalidate downstream (B, C, D)
      onStepStatusesChange(invalidateDownstream(completeStep(stepStatuses, "A"), "A"));

      // Artifact handling: mark current TaskGroups as stale when D is invalidated
      if (onTaskGroupsChange && selectedWt) {
        const currentPlanVersion = selectedWideTablePlanVersion;
        const staleTaskGroups = markTaskGroupsAsStale(taskGroups ?? [], selectedWt.id, currentPlanVersion);
        onTaskGroupsChange(staleTaskGroups);
      }
      } catch (err) {
        setSchemaActionMessage(err instanceof Error ? err.message : String(err));
      }
    };

    void doApply();
  };

  const handleLinkDataTable = () => {
    if (!onReplaceWideTables || wideTables.length > 0) {
      return;
    }

    const nextWideTable = buildDraftWideTable(requirementId);
    onReplaceWideTables([nextWideTable]);
    onSelectWt(nextWideTable.id);
    setSchemaActionMessage("已初始化数据表关联，选择 Schema 后即可继续定义结构。");
    setIsSchemaSelectorOpen(true);
  };

  return (
    <section id="structure-config" className="scroll-mt-28 rounded-xl border bg-card p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">3. 表结构定义</h3>
            <span className="inline-flex items-center gap-1">
              <SectionStatusBadge label="Schema 定义" status={stepStatuses.A} />
            </span>
          </div>
          <p className="text-xs text-muted-foreground">这里仅定义宽表结构与字段元数据；指标分组已迁移到【执行】Tab 中配置。</p>
        </div>
        {wideTables.length === 0 ? (
          <button
            type="button"
            onClick={handleLinkDataTable}
            className="rounded-md border px-3 py-1.5 text-xs text-primary hover:bg-primary/5"
          >
            关联数据表          </button>
        ) : null}
      </div>

      {wideTables.length === 0 ? (
        <div className="rounded-lg border border-dashed px-4 py-8 text-sm text-muted-foreground">
          当前需求尚未关联数据表。点击“关联数据表”后选择一个 Schema 即可开始配置。        </div>
      ) : (
        <>
          {wideTables.length > 1 ? (
            <div className="flex gap-2 overflow-x-auto">
              {wideTables.map((wt) => (
                <button
                  key={wt.id}
                  type="button"
                  onClick={() => onSelectWt(wt.id)}
                  className={cn(
                    "shrink-0 rounded-md border px-3 py-1.5 text-xs",
                    selectedWtId === wt.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "bg-background text-muted-foreground hover:text-foreground",
                  )}
                >
                  {wt.name}
                </button>
              ))}
            </div>
          ) : null}

          {selectedWt ? (
            <div className="space-y-4">
              <div className="space-y-1">
                <div className="space-y-1">
                  <div className="text-sm font-semibold">{selectedWt.name}</div>
                  <div className="text-xs text-muted-foreground">{selectedWt.description}</div>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-4">
                <CompactInfoItem label="宽表 ID" value={selectedWt.id} />
                {!schemaLocked ? (
                  <div className="rounded-lg bg-muted/10 px-3 py-2.5">
                    <div className="text-[11px] font-medium text-muted-foreground">表名</div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {selectedWt.name === UNLINKED_DATA_TABLE_NAME ? "暂未关联" : selectedWt.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsSchemaSelectorOpen(true)}
                        className="shrink-0 rounded-md border px-2 py-1 text-xs text-primary hover:bg-primary/5"
                      >
                        关联 Schema
                      </button>
                    </div>
                  </div>
                ) : (
                  <CompactInfoItem label="表名" value={selectedWt.name} />
                )}
                <CompactInfoItem label="状态" value={selectedWt.status} />
                <CompactInfoItem label="当前记录数" value={String(selectedWt.recordCount)} />
              </div>

              {schemaLocked ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  Schema 已锁定：字段元数据仅支持只读查看；如需调整，请新建版本并重新生成计划。                </div>
              ) : null}

              {schemaActionMessage ? (
                <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary">
                  {schemaActionMessage}
                </div>
              ) : null}

              {selectedWt.schema.columns.length === 0 ? (
                <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                  当前宽表还未关联 Schema。请点击“关联 Schema”按钮选择一个结构。                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40 border-b">
                      <tr>
                        <th className="px-2 py-1.5 text-left">字段名</th>
                        <th className="px-2 py-1.5 text-left">中文名</th>
                        <th className="px-2 py-1.5 text-left">类型</th>
                        <th className="px-2 py-1.5 text-left">分类</th>
                        <th className="px-2 py-1.5 text-left">说明</th>
                        <th className="px-2 py-1.5 text-left">单位</th>
                        <th className="px-2 py-1.5 text-left">必填</th>
                        <th className="px-2 py-1.5 text-left">透传字段</th>
                        <th className="px-2 py-1.5 text-left">稽核规则</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {selectedWt.schema.columns.map((col) => (
                        <tr
                          key={col.id}
                          className={cn(normalizeCategoryForUI(col.category) === "system" ? "text-muted-foreground" : "")}
                        >
                          <td className="px-2 py-1.5 font-mono">{col.name}</td>
                          <td className="px-2 py-1.5">
                            {isSchemaMetadataEditable ? (
                              <input
                                value={col.chineseName ?? ""}
                                onChange={(event) => handleColumnMetadataChange(col.id, { chineseName: event.target.value })}
                                className="w-full rounded-md border bg-background px-2 py-1 text-xs"
                                placeholder="中文名"
                              />
                            ) : (
                              col.chineseName ?? "-"
                            )}
                          </td>
                          <td className="px-2 py-1.5">{col.type}</td>
                          <td className="px-2 py-1.5">
                            {isSchemaMetadataEditable ? (
                              <select
                                value={col.isBusinessDate ? "time" : normalizeCategoryForUI(col.category)}
                                onChange={(event) => {
                                  const nextValue = event.target.value;
                                  if (nextValue === "time") {
                                    handleColumnMetadataChange(col.id, {
                                      category: "dimension",
                                      isBusinessDate: true,
                                      type: "DATE",
                                    });
                                    return;
                                  }
                                  if (nextValue === "dimension") {
                                    handleColumnMetadataChange(col.id, {
                                      category: "dimension",
                                      isBusinessDate: false,
                                    });
                                    return;
                                  }
                                  handleColumnMetadataChange(col.id, {
                                    category: nextValue as ColumnDefinition["category"],
                                    isBusinessDate: false,
                                  });
                                }}
                                className={cn(
                                  "w-full rounded-md border px-2 py-1 text-xs",
                                  categorySelectClass(col.isBusinessDate ? "time" : normalizeCategoryForUI(col.category)),
                                )}
                              >
                                <option value="id">ID列</option>
                                <option value="time">时间列</option>
                                <option value="system">系统列</option>
                                <option value="dimension">维度列</option>
                                <option value="indicator">指标列</option>
                              </select>
                            ) : (
                              <span
                                className={cn(
                                  "px-1.5 py-0.5 rounded text-xs",
                                  categoryBadgeClass(col.isBusinessDate ? "time" : normalizeCategoryForUI(col.category)),
                                )}
                              >
                                {categoryLabel(col.isBusinessDate ? "time" : normalizeCategoryForUI(col.category))}
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-muted-foreground">
                            {isSchemaMetadataEditable ? (
                              <input
                                value={col.description}
                                onChange={(event) => handleColumnMetadataChange(col.id, { description: event.target.value })}
                                className="w-full rounded-md border bg-background px-2 py-1 text-xs"
                                placeholder="字段说明"
                              />
                            ) : (
                              col.description
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-muted-foreground">
                            {col.category === "indicator" && isSchemaMetadataEditable ? (
                              <input
                                value={col.unit ?? ""}
                                onChange={(event) => handleColumnMetadataChange(col.id, { unit: event.target.value })}
                                className="w-full rounded-md border bg-background px-2 py-1 text-xs"
                                placeholder="单位"
                              />
                            ) : (
                              col.unit ?? "-"
                            )}
                          </td>
                          <td className="px-2 py-1.5">
                            <span>{col.required ? "是" : "否"}</span>
                          </td>
                          <td className="px-2 py-1.5 align-top">
                            {isSchemaMetadataEditable ? (
                              <div className="space-y-1.5">
                                <select
                                  value={col.passthroughEnabled ? "yes" : "no"}
                                  onChange={(event) => {
                                    const enabled = event.target.value === "yes";
                                    handleColumnMetadataChange(col.id, {
                                      passthroughEnabled: enabled,
                                      passthroughContent: enabled ? (col.passthroughContent ?? "") : "",
                                    });
                                  }}
                                  className="w-full rounded-md border bg-background px-2 py-1 text-xs"
                                >
                                  <option value="no">否</option>
                                  <option value="yes">是</option>
                                </select>
                                {col.passthroughEnabled ? (
                                  <input
                                    value={col.passthroughContent ?? ""}
                                    onChange={(event) =>
                                      handleColumnMetadataChange(col.id, { passthroughContent: event.target.value })
                                    }
                                    className="w-full rounded-md border bg-background px-2 py-1 text-xs"
                                    placeholder="填写透传内容"
                                  />
                                ) : null}
                              </div>
                            ) : (
                              <span>{formatPassthroughDisplay(col)}</span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 align-top">
                            {isSchemaMetadataEditable ? (
                              <div className="space-y-1.5">
                                <select
                                  value={col.auditRuleType ?? ""}
                                  onChange={(event) => {
                                    const ruleType = (event.target.value || undefined) as ColumnDefinition["auditRuleType"] | undefined;
                                    handleColumnMetadataChange(col.id, {
                                      auditRuleType: ruleType,
                                      auditRuleValue: ruleType && auditRuleNeedsValue(ruleType) ? (col.auditRuleValue ?? "") : "",
                                    });
                                  }}
                                  className="w-full rounded-md border bg-background px-2 py-1 text-xs"
                                >
                                  <option value="">不设置</option>
                                  <option value="max_lte">最大值小于等于 xxx</option>
                                  <option value="min_gte">最小值大于等于 xxx</option>
                                  <option value="change_rate_lte">本期较上期变化范围不超过 xxx</option>
                                  <option value="not_empty">不为空</option>
                                </select>
                                {col.auditRuleType && auditRuleNeedsValue(col.auditRuleType) ? (
                                  <input
                                    value={col.auditRuleValue ?? ""}
                                    onChange={(event) =>
                                      handleColumnMetadataChange(col.id, { auditRuleValue: event.target.value })
                                    }
                                    className="w-full rounded-md border bg-background px-2 py-1 text-xs"
                                    placeholder="填写 xxx 的数值"
                                  />
                                ) : null}
                              </div>
                            ) : (
                              <span>{formatAuditRuleDisplay(col)}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <SchemaSelectorModal
                isOpen={isSchemaSelectorOpen}
                onClose={() => setIsSchemaSelectorOpen(false)}
                currentTableName={selectedWt?.name}
                onSelect={(table) => handleApplyTargetTable(table)}
              />
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

// ==================== 鑼冨洿瀹氫箟 ====================

function ScopeAndGroupSection({
  requirement,
  highlightedSections,
  wideTables,
  wideTableRecords,
  dimensionExcelImports,
  onDimensionExcelImportsChange,
  scopePreviewDirtyByWideTableId,
  onScopePreviewDirtyChange,
  selectedWtId,
  selectedWt,
  selectedWideTableRecords,
  onSelectWt,
  onUpdateWideTable,
  onReplaceWideTableRecords,
  taskGroups,
  fetchTasks,
  onTaskGroupsChange,
  onFetchTasksChange,
  stepStatuses,
  onStepStatusesChange,
}: {
  requirement: Requirement;
  highlightedSections?: readonly DefinitionSectionId[];
  wideTables: WideTable[];
  wideTableRecords: WideTableRecord[];
  dimensionExcelImports: Record<string, DimensionExcelImportState>;
  onDimensionExcelImportsChange: (
    value: Record<string, DimensionExcelImportState>
      | ((prev: Record<string, DimensionExcelImportState>) => Record<string, DimensionExcelImportState>),
  ) => void;
  scopePreviewDirtyByWideTableId: Record<string, boolean>;
  onScopePreviewDirtyChange: (
    value: Record<string, boolean>
      | ((prev: Record<string, boolean>) => Record<string, boolean>),
  ) => void;
  selectedWtId: string;
  selectedWt?: WideTable;
  selectedWideTableRecords: WideTableRecord[];
  onSelectWt: (id: string) => void;
  onUpdateWideTable?: (wideTableId: string, updater: (wideTable: WideTable) => WideTable) => void;
  onReplaceWideTableRecords?: (wideTableId: string, nextWideTableRecords: WideTableRecord[]) => void;
  taskGroups: TaskGroup[];
  fetchTasks: FetchTask[];
  onTaskGroupsChange?: (taskGroups: TaskGroup[]) => void;
  onFetchTasksChange?: (fetchTasks: FetchTask[]) => void;
  stepStatuses: StepStatusMap;
  onStepStatusesChange: (statuses: StepStatusMap) => void;
}) {
  const [pendingDimensionValues, setPendingDimensionValues] = useState<Record<string, string>>({});
  const [rangeMessage, setRangeMessage] = useState("");
  const [previewRecords, setPreviewRecords] = useState<WideTableRecord[]>([]);
  const [previewTotalCount, setPreviewTotalCount] = useState(0);
  const [selectedPreviewBusinessDate, setSelectedPreviewBusinessDate] = useState("");
  const [selectedPreviewYear, setSelectedPreviewYear] = useState("");
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const dimensionExcelImportInputRef = useRef<HTMLInputElement | null>(null);
  const selectedWideTableAllRecords = useMemo(
    () => wideTableRecords.filter((record) => record.wideTableId === selectedWtId),
    [wideTableRecords, selectedWtId],
  );
  const selectedWideTablePlanVersion = useMemo(
    () => (
      selectedWt
        ? resolveCurrentPlanVersion(selectedWt, selectedWideTableAllRecords, taskGroups ?? [])
        : 0
    ),
    [selectedWideTableAllRecords, selectedWt, taskGroups],
  );
  const businessDateColumn = selectedWt?.schema.columns.find((col) => col.category === "dimension" && col.isBusinessDate);
  const usesBusinessDateAxis = Boolean(selectedWt && hasWideTableBusinessDateDimension(selectedWt));
  const dimensionColumns = selectedWt?.schema.columns.filter((col) => col.category === "dimension" && !col.isBusinessDate) ?? [];
  const previewColumns = selectedWt?.schema.columns.filter((col) => col.category !== "system") ?? [];
  const previewBusinessDateFieldName = businessDateColumn?.name ?? "";
  const isPreviewMonthlyFrequency = Boolean(usesBusinessDateAxis && selectedWt?.businessDateRange.frequency === "monthly");
  const draftDimensionExcelImport = selectedWtId ? dimensionExcelImports[selectedWtId] : undefined;
  const isScopePreviewDirty = selectedWtId ? Boolean(scopePreviewDirtyByWideTableId[selectedWtId]) : false;
  const savedDimensionScopeImport = !isScopePreviewDirty ? selectedWt?.scopeImport : undefined;
  const displayedDimensionScopeImport = draftDimensionExcelImport
    ? {
        fileName: draftDimensionExcelImport.fileName,
        rowCount: draftDimensionExcelImport.rows.length,
        isPersisted: false,
      }
    : savedDimensionScopeImport
      ? {
          fileName: savedDimensionScopeImport.fileName,
          rowCount: savedDimensionScopeImport.rowCount,
          isPersisted: true,
        }
      : undefined;
  const activeDimensionExcelImport = displayedDimensionScopeImport
    ? (
        draftDimensionExcelImport
          ?? {
            fileName: displayedDimensionScopeImport.fileName,
            fileType: "text/csv" as const,
            fileContent: "",
            headers: [],
            rows: Array.from({ length: displayedDimensionScopeImport.rowCount }, () => ({})),
          }
      )
    : undefined;
  const previewBusinessDates = useMemo(
    () => !usesBusinessDateAxis
      ? []
      :
      Array.from(
        new Set(
          previewRecords
            .map((record) => String(record[previewBusinessDateFieldName] ?? ""))
            .filter((value) => value.trim() !== ""),
        ),
      ).sort((left, right) => right.localeCompare(left)),
    [previewBusinessDateFieldName, previewRecords, usesBusinessDateAxis],
  );
  const visibleAllPreviewBusinessDates = useMemo(
    () => limitFutureBusinessDates(previewBusinessDates, { now: new Date(), maxFuturePeriods: 1 }),
    [previewBusinessDates],
  );
  const previewBusinessYears = useMemo(
    () => {
      if (!isPreviewMonthlyFrequency) {
        return [];
      }
      const years = Array.from(
        new Set(
          visibleAllPreviewBusinessDates
            .map((dateText) => extractBusinessDateYear(dateText))
            .filter((year): year is string => Boolean(year)),
        ),
      );
      return years.sort((a, b) => b.localeCompare(a));
    },
    [isPreviewMonthlyFrequency, visibleAllPreviewBusinessDates],
  );

  const effectiveSelectedPreviewYear = useMemo(() => {
    if (!isPreviewMonthlyFrequency || previewBusinessYears.length === 0) {
      return "";
    }
    if (selectedPreviewYear && previewBusinessYears.includes(selectedPreviewYear)) {
      return selectedPreviewYear;
    }
    return pickDefaultBusinessYear(previewBusinessYears, { now: new Date() });
  }, [isPreviewMonthlyFrequency, previewBusinessYears, selectedPreviewYear]);

  useEffect(() => {
    if (!isPreviewMonthlyFrequency) {
      return;
    }

    if (previewBusinessYears.length === 0) {
      if (selectedPreviewYear) {
        setSelectedPreviewYear("");
      }
      return;
    }

    if (selectedPreviewYear !== effectiveSelectedPreviewYear) {
      setSelectedPreviewYear(effectiveSelectedPreviewYear);
    }
  }, [effectiveSelectedPreviewYear, isPreviewMonthlyFrequency, previewBusinessYears, selectedPreviewYear]);

  const visiblePreviewBusinessDates = useMemo(
    () => {
      const scopedDates = visibleAllPreviewBusinessDates;
      if (!isPreviewMonthlyFrequency || !effectiveSelectedPreviewYear) return scopedDates;
      return scopedDates.filter(d => d.slice(0, 4) === effectiveSelectedPreviewYear);
    },
    [effectiveSelectedPreviewYear, isPreviewMonthlyFrequency, visibleAllPreviewBusinessDates],
  );

  const visiblePreviewRecords = useMemo(
    () => (
      selectedPreviewBusinessDate
        ? previewRecords.filter(
          (record) => String(record[previewBusinessDateFieldName] ?? "") === selectedPreviewBusinessDate,
        )
        : previewRecords
    ),
    [previewBusinessDateFieldName, previewRecords, selectedPreviewBusinessDate],
  );
  const isRangeEditable = Boolean(onUpdateWideTable && onReplaceWideTableRecords && selectedWt);
  const isCEditable = isStepEditable(stepStatuses, "C");
  const hasConfirmedDataUpdateEnabled = requirement.dataUpdateEnabled != null;
  const dataUpdateEnabled = resolveRequirementDataUpdateEnabled(requirement);
  const isOpenEnded = selectedWt && usesBusinessDateAxis
    ? isOpenEndedBusinessDateRange(selectedWt.businessDateRange)
    : false;
  const markSelectedScopePreviewDirty = () => {
    if (!selectedWtId) {
      return;
    }
    onScopePreviewDirtyChange((prev) => ({
      ...prev,
      [selectedWtId]: true,
    }));
  };

  useEffect(() => {
    setRangeMessage("");
    setPreviewRecords([]);
    setPreviewTotalCount(0);
    setSelectedPreviewBusinessDate("");
    setSelectedPreviewYear("");
  }, [selectedWtId]);

  useEffect(() => {
    if (visiblePreviewBusinessDates.length === 0) {
      if (selectedPreviewBusinessDate) {
        setSelectedPreviewBusinessDate("");
      }
      return;
    }
    if (visiblePreviewBusinessDates.length > 0 && !visiblePreviewBusinessDates.includes(selectedPreviewBusinessDate)) {
      setSelectedPreviewBusinessDate(visiblePreviewBusinessDates[0] ?? "");
    }
  }, [visiblePreviewBusinessDates, selectedPreviewBusinessDate]);

  // Re-evaluate step C completion when dimension ranges or business date range change
  useEffect(() => {
    if (!selectedWt) return;
    // Step C only requires schema (Step A) to be completed.
    if (stepStatuses.A !== "completed") return;
    const cComplete = isStepCComplete(selectedWt);
    if (cComplete && stepStatuses.C !== "completed") {
      onStepStatusesChange(completeStep(stepStatuses, "C"));
    }
  }, [selectedWt?.dimensionRanges, selectedWt?.businessDateRange, stepStatuses.A, stepStatuses.C]);

  const updateSelectedWideTable = (updater: (wideTable: WideTable) => WideTable) => {
    if (!selectedWt || !onUpdateWideTable) {
      return;
    }
    onUpdateWideTable(selectedWt.id, (wideTable) => normalizeWideTableMode(updater(wideTable)));
  };

  const handleBusinessDateRangeChange = (
    patch: Partial<WideTable["businessDateRange"]>,
  ) => {
    setRangeMessage("时间范围已修改，如需查看请点击预览数据。");
    markSelectedScopePreviewDirty();
    updateSelectedWideTable((wideTable) => {
      const merged = {
        ...wideTable.businessDateRange,
        ...patch,
      };

      const freq = merged.frequency;
      // 月频 / 季频 / 年频时，自动对齐到周期末尾
      if (freq === "monthly" || freq === "quarterly" || freq === "yearly") {
        merged.start = snapToPeriodEnd(merged.start, freq);
        if (merged.end !== "never") {
          merged.end = snapToPeriodEnd(merged.end, freq);
        }
      }

      return {
        ...wideTable,
        businessDateRange: merged,
        scheduleRule: isOpenEndedBusinessDateRange(merged)
          ? wideTable.scheduleRule
          : undefined,
        // Artifact handling: when C change causes D invalidation, reset WideTable
        status: "draft" as const,
        currentPlanFingerprint: undefined,
        currentPlanVersion: Math.max(selectedWideTablePlanVersion, 1) + 1,
        updatedAt: new Date().toISOString(),
      };
    });

    // Step status: invalidate downstream of C (i.e., D)
    onStepStatusesChange(invalidateDownstream(stepStatuses, "C"));

    // Artifact handling: mark TaskGroups stale when D is invalidated
    if (onTaskGroupsChange && selectedWt) {
      const currentPlanVersion = selectedWideTablePlanVersion;
      const staleTaskGroups = markTaskGroupsAsStale(taskGroups ?? [], selectedWt.id, currentPlanVersion);
      onTaskGroupsChange(staleTaskGroups);
    }
  };

  const handleAddDimensionValue = (dimensionName: string) => {
    const nextValue = pendingDimensionValues[dimensionName]?.trim();
    if (!nextValue) {
      return;
    }

    updateSelectedWideTable((wideTable) => {
      const currentPlanVersion = wideTable.currentPlanVersion ?? resolveCurrentPlanVersion(wideTable, selectedWideTableRecords, taskGroups ?? []);
      const existingRange = wideTable.dimensionRanges.find((range) => range.dimensionName === dimensionName);
      if (existingRange) {
        existingRange.values = Array.from(new Set([...existingRange.values, nextValue]));
      } else {
        wideTable.dimensionRanges = [
          ...wideTable.dimensionRanges,
          { dimensionName, values: [nextValue] },
        ];
      }
      return {
        ...wideTable,
        currentPlanVersion: currentPlanVersion + 1,
        currentPlanFingerprint: undefined,
        recordCount: 0,
        status: "draft",
        updatedAt: new Date().toISOString(),
      };
    });

    setPendingDimensionValues((prev) => ({
      ...prev,
      [dimensionName]: "",
    }));
    setRangeMessage("维度取值已修改，如需查看请点击预览数据。");
    markSelectedScopePreviewDirty();

    // Step status: invalidate downstream of C (i.e., D)
    onStepStatusesChange(invalidateDownstream(stepStatuses, "C"));

    // Artifact handling: mark TaskGroups stale when D is invalidated
    if (onTaskGroupsChange && selectedWt) {
      const prevPlanVersion = selectedWideTablePlanVersion;
      const staleTaskGroups = markTaskGroupsAsStale(taskGroups ?? [], selectedWt.id, prevPlanVersion);
      onTaskGroupsChange(staleTaskGroups);
    }
  };

  const handleRemoveDimensionValue = (dimensionName: string, value: string) => {
    markSelectedScopePreviewDirty();
    updateSelectedWideTable((wideTable) => {
      const currentPlanVersion = wideTable.currentPlanVersion ?? resolveCurrentPlanVersion(wideTable, selectedWideTableRecords, taskGroups ?? []);
      wideTable.dimensionRanges = wideTable.dimensionRanges
        .map((range) =>
          range.dimensionName === dimensionName
            ? {
                ...range,
                values: range.values.filter((item) => item !== value),
              }
            : range,
        )
        .filter((range) => range.values.length > 0);
      return {
        ...wideTable,
        currentPlanVersion: currentPlanVersion + 1,
        currentPlanFingerprint: undefined,
        recordCount: 0,
        status: "draft",
        updatedAt: new Date().toISOString(),
      };
    });
    setRangeMessage("维度取值已修改，如需查看请点击预览数据。");

    // Step status: invalidate downstream of C (i.e., D)
    onStepStatusesChange(invalidateDownstream(stepStatuses, "C"));

    // Artifact handling: mark TaskGroups stale when D is invalidated
    if (onTaskGroupsChange && selectedWt) {
      const prevPlanVersion = selectedWideTablePlanVersion;
      const staleTaskGroups = markTaskGroupsAsStale(taskGroups ?? [], selectedWt.id, prevPlanVersion);
      onTaskGroupsChange(staleTaskGroups);
    }
  };

  const appendDimensionValues = (dimensionName: string, values: string[]) => {
    if (values.length === 0) {
      return;
    }
    markSelectedScopePreviewDirty();
    updateSelectedWideTable((wideTable) => {
      const currentPlanVersion = wideTable.currentPlanVersion ?? resolveCurrentPlanVersion(wideTable, selectedWideTableRecords, taskGroups ?? []);
      const existingRange = wideTable.dimensionRanges.find((range) => range.dimensionName === dimensionName);
      if (existingRange) {
        existingRange.values = Array.from(new Set([...existingRange.values, ...values]));
      } else {
        wideTable.dimensionRanges = [
          ...wideTable.dimensionRanges,
          { dimensionName, values: Array.from(new Set(values)) },
        ];
      }
      return {
        ...wideTable,
        currentPlanVersion: currentPlanVersion + 1,
        currentPlanFingerprint: undefined,
        recordCount: 0,
        status: "draft",
        updatedAt: new Date().toISOString(),
      };
    });
    setRangeMessage("维度取值已更新，如需查看请点击预览数据。");
    onStepStatusesChange(invalidateDownstream(stepStatuses, "C"));
    if (onTaskGroupsChange && selectedWt) {
      const prevPlanVersion = selectedWideTablePlanVersion;
      const staleTaskGroups = markTaskGroupsAsStale(taskGroups ?? [], selectedWt.id, prevPlanVersion);
      onTaskGroupsChange(staleTaskGroups);
    }
  };

  const normalizeExcelHeaderKey = (value: string) => value.trim().toLowerCase();

  const parseDelimitedTable = (text: string, delimiter: string): string[][] => {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentCell = "";
    let inQuotes = false;

    const pushCell = () => {
      currentRow.push(currentCell);
      currentCell = "";
    };

    const pushRow = () => {
      rows.push(currentRow);
      currentRow = [];
    };

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      if (char === "\"") {
        if (inQuotes && text[index + 1] === "\"") {
          currentCell += "\"";
          index += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (!inQuotes && char === delimiter) {
        pushCell();
        continue;
      }

      if (!inQuotes && (char === "\n" || char === "\r")) {
        pushCell();
        pushRow();
        if (char === "\r" && text[index + 1] === "\n") {
          index += 1;
        }
        continue;
      }

      currentCell += char;
    }

    pushCell();
    if (currentRow.length > 0) {
      pushRow();
    }

    return rows.filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""));
  };

  const detectDelimiter = (headerLine: string): string => {
    const commaCount = (headerLine.match(/,/g) ?? []).length;
    const tabCount = (headerLine.match(/\t/g) ?? []).length;
    if (tabCount > commaCount) return "\t";
    return ",";
  };

  const handleDimensionExcelImport = async (file: File) => {
    if (!selectedWt) {
      setRangeMessage("当前需求尚未关联数据表，无法导入维度取值。");
      return;
    }

    const fileName = file.name.toLowerCase();
    if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
      setRangeMessage("暂不支持直接解析 .xlsx/.xls，请先在 Excel 中另存为 CSV 后导入。");
      return;
    }

    const text = await file.text();
    const normalizedText = text.replace(/^\uFEFF/, "");
    const firstLine = normalizedText.split(/\r?\n/, 1)[0] ?? "";
    const delimiter = detectDelimiter(firstLine);
    const table = parseDelimitedTable(normalizedText, delimiter);

    if (table.length < 2) {
      setRangeMessage("导入内容为空或缺少数据行，请检查文件。");
      return;
    }

    const headers = (table[0] ?? []).map((h) => String(h ?? "").trim());
    const headerIndex = new Map<string, number>();
    headers.forEach((header, idx) => {
      const key = normalizeExcelHeaderKey(header);
      if (key && !headerIndex.has(key)) {
        headerIndex.set(key, idx);
      }
    });

    const requiredDimensionNames = dimensionColumns.map((col) => col.name);
    if (requiredDimensionNames.length === 0) {
      setRangeMessage("当前宽表没有可配置的普通维度列，无需导入。");
      return;
    }
    const missingHeaders = requiredDimensionNames.filter((name) => !headerIndex.has(normalizeExcelHeaderKey(name)));
    if (missingHeaders.length > 0) {
      setRangeMessage(`导入失败：Excel 缺少维度列（列名需与维度字段名一致）：${missingHeaders.join("、")}`);
      return;
    }

    const businessDateFieldName = businessDateColumn?.name;
    const businessDateIndex = businessDateFieldName
      ? headerIndex.get(normalizeExcelHeaderKey(businessDateFieldName))
      : undefined;

    const seenKeys = new Set<string>();
    const rows: Array<Record<string, string>> = [];
    let skipped = 0;

    for (const dataRow of table.slice(1)) {
      const rowObject: Record<string, string> = {};
      let hasEmptyRequired = false;

      for (const dimName of requiredDimensionNames) {
        const idx = headerIndex.get(normalizeExcelHeaderKey(dimName)) ?? -1;
        const value = String(dataRow[idx] ?? "").trim();
        rowObject[dimName] = value;
        if (!value) {
          hasEmptyRequired = true;
        }
      }

      if (businessDateFieldName && businessDateIndex != null) {
        rowObject[businessDateFieldName] = String(dataRow[businessDateIndex] ?? "").trim();
      }

      if (requiredDimensionNames.every((name) => !rowObject[name])) {
        continue;
      }

      if (hasEmptyRequired) {
        skipped += 1;
        continue;
      }

      const key = requiredDimensionNames.map((name) => rowObject[name]).join("|");
      if (seenKeys.has(key)) {
        continue;
      }
      seenKeys.add(key);
      rows.push(rowObject);
    }

    if (rows.length === 0) {
      setRangeMessage("导入内容为空或维度列缺失有效取值，请检查文件。");
      return;
    }

    onDimensionExcelImportsChange((prev) => ({
      ...prev,
      [selectedWt.id]: {
        fileName: file.name,
        fileType: "text/csv",
        fileContent: normalizedText,
        headers,
        rows,
      },
    }));
    markSelectedScopePreviewDirty();

    setRangeMessage(
      `已导入 Excel（${file.name}），识别到 ${rows.length} 行维度组合。` +
        (skipped > 0 ? `（已跳过 ${skipped} 行不完整数据）` : "") +
        " 点击预览数据查看。",
    );
  };

  const handleOpenPreview = () => {
    if (!selectedWt) {
      return;
    }

    const excelRows = draftDimensionExcelImport?.rows ?? [];
    const useExcelRows = excelRows.length > 0;
    const shouldUsePersistedImportedRows = Boolean(
      !useExcelRows
      && !isScopePreviewDirty
      && selectedWt.scopeImport?.importMode === "dimension_rows_csv"
      && selectedWideTableRecords.length > 0,
    );

    if (shouldUsePersistedImportedRows) {
      setPreviewRecords(selectedWideTableRecords);
      setPreviewTotalCount(selectedWideTableRecords.length);
      setIsPreviewModalOpen(true);
      setRangeMessage(`已加载已保存的 CSV 逐行维度组合（${selectedWideTableRecords.length} 行）。`);
      return;
    }

    if (!useExcelRows) {
      const missingDimensions = dimensionColumns
        .filter((column) => {
          const values = selectedWt.dimensionRanges.find((range) => range.dimensionName === column.name)?.values ?? [];
          return values.length === 0;
        })
        .map((column) => column.chineseName || column.name);

      if (missingDimensions.length > 0) {
        if (selectedWideTableRecords.length > 0) {
          setPreviewRecords(selectedWideTableRecords);
          setPreviewTotalCount(selectedWideTableRecords.length);
          setIsPreviewModalOpen(true);
          setRangeMessage(`已加载已保存的维度组合列表（${selectedWideTableRecords.length} 行）。`);
          return;
        }
        setRangeMessage(`请先为以下维度配置取值：${missingDimensions.join("、")}`);
        return;
      }
    }

    const { records, totalCount } = useExcelRows
      ? generateWideTablePreviewRecordsFromDimensionRows(selectedWt, excelRows, selectedWideTableRecords, wideTableRecords)
      : generateWideTablePreviewRecords(selectedWt, selectedWideTableRecords, wideTableRecords);
    if (totalCount === 0) {
      setRangeMessage(
        usesBusinessDateAxis
          ? "当前业务日期范围或维度取值不足，无法生成预览数据。"
          : "当前维度取值不足，无法生成预览数据。",
      );
      return;
    }

    setPreviewRecords(records);
    setPreviewTotalCount(totalCount);
    setIsPreviewModalOpen(true);
    setRangeMessage(
      [
        usesBusinessDateAxis
          ? `已生成预览数据（不保存），预计 ${totalCount} 行，当前展示 ${records.length} 行。`
          : `已生成快照预览（不保存），预计 ${totalCount} 行，当前展示 ${records.length} 行。`,
        isOpenEnded ? `open-ended 范围仅预览截至当前与未来 ${OPEN_ENDED_PREVIEW_PERIODS} 期。` : "",
      ].filter(Boolean).join(" "),
    );
  };

  return (
    <section
      id="scope-generation"
      className={cn(
        "scroll-mt-28 rounded-xl border bg-card p-6 space-y-4 transition-all",
        highlightedSections?.includes("scope-generation") ? "border-amber-300 ring-4 ring-amber-200/70 shadow-[0_0_0_1px_rgba(251,191,36,0.35)]" : "",
      )}
    >
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold">4. 数据范围</h3>
          <span className="inline-flex items-center gap-1">
            <SectionStatusBadge label="数据范围" status={stepStatuses.C} />
          </span>
        </div>
        <p className="text-xs text-muted-foreground">在这里配置时间范围与维度取值，并在需要时查看预览。</p>
      </div>

      {wideTables.length === 0 ? (
        <div className="text-sm text-muted-foreground">当前需求尚未关联数据表。</div>
      ) : (
        <>
          {wideTables.length > 1 ? (
            <div className="flex gap-2 overflow-x-auto">
              {wideTables.map((wt) => (
                <button
                  key={wt.id}
                  type="button"
                  onClick={() => onSelectWt(wt.id)}
                  className={cn(
                    "shrink-0 rounded-md border px-3 py-1.5 text-xs",
                    selectedWtId === wt.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "bg-background text-muted-foreground hover:text-foreground",
                  )}
                >
                  {wt.name}
                </button>
              ))}
            </div>
          ) : null}

          {selectedWt ? (
            selectedWt.schema.columns.length === 0 ? (
              <div className="rounded-lg border border-dashed px-4 py-8 text-sm text-muted-foreground">
                先在“表结构定义”里完成 Schema 关联，再回到这里配置范围。              </div>
            ) : (
            <div className="space-y-6">
              {/* 涓氬姟鏃ユ湡鑼冨洿 */}
              {usesBusinessDateAxis ? (
                <div className={cn("rounded-lg bg-muted/10 p-4 space-y-2", !isCEditable ? "opacity-60" : "")}>
                  <h4 className="text-sm font-semibold">业务日期</h4>
                  <p className="text-xs text-muted-foreground">
                    {businessDateColumn
                      ? `${businessDateColumn.name}${businessDateColumn.chineseName ? `（${businessDateColumn.chineseName}）` : ""}`
                      : "未识别到业务日期维度"}
                    。月频、季频、年频会自动对齐到周期末尾。
                    {!hasConfirmedDataUpdateEnabled
                      ? " 请先在下方确认是否定期更新，再决定结束方式。"
                      : dataUpdateEnabled
                        ? " 若需要持续增量更新，请把结束方式设为“永不”。"
                        : " 当前按一次性交付处理，需要给出固定结束日期。"}
                  </p>
                  <div className={cn("grid gap-3 text-xs", "md:grid-cols-4")}>
                    {isRangeEditable && isCEditable ? (
                      <>
                        <EditableField
                          label="频率"
                          control={(
                            <select
                              value={selectedWt.businessDateRange.frequency}
                              onChange={(event) =>
                                handleBusinessDateRangeChange({
                                  frequency: event.target.value as WideTable["businessDateRange"]["frequency"],
                                })
                              }
                              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                            >
                              <option value="daily">日频</option>
                              <option value="weekly">周频</option>
                              <option value="monthly">月频</option>
                              <option value="quarterly">季频</option>
                              <option value="yearly">年频</option>
                            </select>
                          )}
                        />
                        <EditableField
                          label="开始日期"
                          control={(
                            <BusinessDateInput
                              frequency={selectedWt.businessDateRange.frequency}
                              value={selectedWt.businessDateRange.start}
                              onChange={(v) => handleBusinessDateRangeChange({ start: v })}
                            />
                          )}
                        />
                        <EditableField
                          label="结束方式"
                          control={(
                            <select
                              value={isOpenEnded ? "never" : "fixed"}
                              onChange={(event) =>
                                handleBusinessDateRangeChange({
                                  end: event.target.value === "never" ? "never" : fallbackBusinessDateEnd(selectedWt.businessDateRange.start),
                                })
                              }
                              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                            >
                              <option value="fixed">具体日期</option>
                              <option value="never">永不</option>
                            </select>
                          )}
                        />
                        <EditableField
                          label="结束日期"
                          control={isOpenEnded ? (
                            <div className="rounded-md border bg-muted/10 p-3 text-xs text-muted-foreground">
                              永不（持续生成未来任务）
                            </div>
                          ) : (
                            <BusinessDateInput
                              frequency={selectedWt.businessDateRange.frequency}
                              value={selectedWt.businessDateRange.end === "never" ? "" : selectedWt.businessDateRange.end}
                              onChange={(v) => handleBusinessDateRangeChange({ end: v })}
                            />
                          )}
                        />
                      </>
                    ) : (
                      <>
                        <ReadOnlyField label="开始日期" value={selectedWt.businessDateRange.start} />
                        <ReadOnlyField label="结束日期" value={formatBusinessDateEnd(selectedWt.businessDateRange.end)} />
                        <ReadOnlyField label="频率" value={frequencyLabel(selectedWt.businessDateRange.frequency)} />
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div className={cn("rounded-lg bg-muted/10 p-4 space-y-3", !isCEditable ? "opacity-60" : "")}>
                  <h4 className="text-sm font-semibold">时间范围</h4>
                  <p className="text-xs text-muted-foreground">请选择时间粒度，并设置对应的起止时间。</p>
                  <div className="grid gap-3 text-xs md:grid-cols-3">
                    {isRangeEditable && isCEditable ? (
                      <>
                        <EditableField
                          label="时间粒度"
                          control={(
                            <select
                              value={selectedWt.businessDateRange.frequency}
                              onChange={(event) =>
                                handleBusinessDateRangeChange({
                                  frequency: event.target.value as WideTable["businessDateRange"]["frequency"],
                                })
                              }
                              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                            >
                              <option value="daily">日</option>
                              <option value="weekly">周</option>
                              <option value="monthly">月</option>
                              <option value="quarterly">季</option>
                              <option value="yearly">年</option>
                            </select>
                          )}
                        />
                        <EditableField
                          label="开始时间"
                          control={(
                            <BusinessDateInput
                              frequency={selectedWt.businessDateRange.frequency}
                              value={selectedWt.businessDateRange.start}
                              onChange={(v) => handleBusinessDateRangeChange({ start: v })}
                            />
                          )}
                        />
                        <EditableField
                          label="结束时间"
                          control={(
                            <BusinessDateInput
                              frequency={selectedWt.businessDateRange.frequency}
                              value={selectedWt.businessDateRange.end === "never"
                                ? fallbackBusinessDateEnd(selectedWt.businessDateRange.start)
                                : selectedWt.businessDateRange.end}
                              onChange={(v) => handleBusinessDateRangeChange({ end: v })}
                            />
                          )}
                        />
                      </>
                    ) : (
                      <>
                        <ReadOnlyField label="时间粒度" value={frequencyLabel(selectedWt.businessDateRange.frequency)} />
                        <ReadOnlyField label="开始时间" value={selectedWt.businessDateRange.start} />
                        <ReadOnlyField label="结束时间" value={formatBusinessDateEnd(selectedWt.businessDateRange.end)} />
                      </>
                    )}
                  </div>
                </div>
              )}

              {usesBusinessDateAxis && !hasConfirmedDataUpdateEnabled ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  当前尚未确认是否定期更新。提交前需要在下方“数据更新”里完成选择。                </div>
              ) : null}

              {usesBusinessDateAxis && hasConfirmedDataUpdateEnabled && !dataUpdateEnabled && isOpenEnded ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  当前已标记为一次性交付，但业务日期结束方式仍为“永不”。提交前请将结束方式改为“具体日期”。                </div>
              ) : null}

              {/* 维度范围 */}
              <div className={cn("rounded-lg bg-muted/10 p-4 space-y-3", !isCEditable ? "opacity-60" : "")}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold">维度取值</h4>
                  {isRangeEditable && isCEditable && dimensionColumns.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => dimensionExcelImportInputRef.current?.click()}
                      className="rounded-md border px-3 py-2 text-xs text-primary hover:bg-primary/5"
                    >
                      导入 Excel
                    </button>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  {requirement.schemaLocked
                    ? "Schema 已锁定。维度取值的调整会触发计划重建，并以新版本运行。"
                    : "这里仅管理非业务日期维度。每个维度都要明确可枚举的取值。"}
                </p>
                {displayedDimensionScopeImport ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/20 px-3 py-2 text-xs">
                    <div className="text-muted-foreground">
                      {displayedDimensionScopeImport.isPersisted ? "已保存导入：" : "已导入："}
                      {displayedDimensionScopeImport.fileName}（{displayedDimensionScopeImport.rowCount} 行）
                    </div>
                    <div className="flex items-center gap-2">
                      {displayedDimensionScopeImport.isPersisted && selectedWt ? (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await downloadWideTableScopeImport(
                                selectedWt.id,
                                displayedDimensionScopeImport.fileName,
                              );
                              setRangeMessage("已下载已保存的 CSV。");
                            } catch (error) {
                              const message = error instanceof Error ? error.message : "下载 CSV 失败";
                              setRangeMessage(message);
                            }
                          }}
                          className="rounded-md border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                        >
                          下载 CSV
                        </button>
                      ) : null}
                      {isRangeEditable && isCEditable ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (!selectedWt) return;
                            onDimensionExcelImportsChange((prev) => {
                              const next = { ...prev };
                              delete next[selectedWt.id];
                              return next;
                            });
                            onScopePreviewDirtyChange((prev) => ({
                              ...prev,
                              [selectedWt.id]: true,
                            }));
                            updateSelectedWideTable((wideTable) => ({
                              ...wideTable,
                              scopeImport: undefined,
                              updatedAt: new Date().toISOString(),
                            }));
                            setRangeMessage("已清除 Excel 导入内容。");
                          }}
                          className="rounded-md border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                        >
                          清除
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {dimensionColumns.length === 0 ? (
                  <div className="text-xs text-muted-foreground">当前宽表没有可配置的普通维度列。</div>
                ) : (
                  <div className="space-y-2">
                    {dimensionColumns.map((dimensionColumn) => {
                      const range = selectedWt.dimensionRanges.find((item) => item.dimensionName === dimensionColumn.name);
                      return (
                        <div key={dimensionColumn.id} className="rounded-md border bg-muted/10 px-3 py-3 text-xs space-y-3">
                          <div>
                            <div className="font-medium">{dimensionColumn.name}</div>
                            <div className="text-muted-foreground mt-1">
                              {dimensionColumn.chineseName ? `${dimensionColumn.chineseName} · ` : ""}
                              {dimensionColumn.description}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {(range?.values ?? []).map((value) => (
                              <span
                                key={value}
                                className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-1 text-[11px]"
                              >
                                {value}
                                {isRangeEditable && isCEditable ? (
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveDimensionValue(dimensionColumn.name, value)}
                                    className="text-muted-foreground hover:text-red-600"
                                  >
                                    x
                                  </button>
                                ) : null}
                              </span>
                            ))}
                            {(range?.values ?? []).length === 0 ? (
                              <span className="text-muted-foreground">暂未配置枚举值</span>
                            ) : null}
                          </div>
                          {isRangeEditable && isCEditable ? (
                            <div className="flex gap-2">
                              <input
                                value={pendingDimensionValues[dimensionColumn.name] ?? ""}
                                onChange={(event) =>
                                  setPendingDimensionValues((prev) => ({
                                    ...prev,
                                    [dimensionColumn.name]: event.target.value,
                                  }))
                                }
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    event.preventDefault();
                                    handleAddDimensionValue(dimensionColumn.name);
                                  }
                                }}
                                className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
                                placeholder={`新增 ${dimensionColumn.name} 枚举值`}
                              />
                              <button
                                type="button"
                                onClick={() => handleAddDimensionValue(dimensionColumn.name)}
                                className="rounded-md border px-3 py-2 text-xs text-primary hover:bg-primary/5"
                              >
                                添加
                              </button>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <input
                ref={dimensionExcelImportInputRef}
                type="file"
                accept=".csv,.txt,.tsv,.xlsx,.xls"
                className="hidden"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  event.currentTarget.value = "";
                  if (!file) return;
                  await handleDimensionExcelImport(file);
                }}
              />

              <div className="rounded-lg bg-muted/10 p-4 space-y-3">
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold">预览与生成</h4>
                  <p className="text-xs text-muted-foreground">
                    预览以弹窗形式展示，点击右侧按钮即可查看。                  </p>
                </div>

                {rangeMessage ? (
                  <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary">
                    {rangeMessage}
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={handleOpenPreview}
                    className="rounded-md border px-3 py-2 text-xs text-primary hover:bg-primary/5"
                  >
                    预览数据
                  </button>
                </div>

                {isPreviewModalOpen ? (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
                    <div className="max-h-[86vh] w-full max-w-6xl overflow-auto rounded-xl border bg-card p-4 shadow-lg">
                      <div className="mb-3 flex items-center justify-between">
                        <div className="text-sm font-semibold">预览行</div>
                        <button
                          type="button"
                          onClick={() => setIsPreviewModalOpen(false)}
                          className="rounded-md border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                        >
                          关闭
                        </button>
                      </div>
                      {previewRecords.length === 0 ? (
                        <div className="rounded-md border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                          {usesBusinessDateAxis ? "还没有可展示的预览数据，请先补齐业务日期和维度取值。" : "还没有可展示的预览数据，请先补齐维度取值。"}
                          {isOpenEnded ? ` open-ended 范围仅会生成截至当前与未来 ${OPEN_ENDED_PREVIEW_PERIODS} 期的预览。` : ""}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="text-xs text-muted-foreground">
                            预计生成 {previewTotalCount} 行，当前展示 {previewRecords.length} 行预览。                          </div>
                          {previewBusinessDates.length > 0 ? (
                            <div className="space-y-2">
                              {isPreviewMonthlyFrequency && previewBusinessYears.length > 0 ? (
                                <div className={cn("flex gap-2 overflow-x-auto pb-1", previewBusinessYears.length > 1 ? "border-b" : "")}>
                                  {previewBusinessYears.length > 1 ? (
                                    previewBusinessYears.map((year) => (
                                      <button
                                        key={year}
                                        type="button"
                                        onClick={() => setSelectedPreviewYear(year)}
                                        className={cn(
                                          "shrink-0 px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors",
                                          effectiveSelectedPreviewYear === year
                                            ? "border-primary text-primary"
                                            : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted",
                                        )}
                                      >
                                        {year}年
                                      </button>
                                    ))
                                  ) : (
                                    <div className="shrink-0 px-3 py-1.5 text-xs font-medium text-muted-foreground">
                                      {previewBusinessYears[0]}年
                                    </div>
                                  )}
                                </div>
                              ) : null}
                              <div className="flex gap-2 overflow-x-auto pb-1">
                                {visiblePreviewBusinessDates.map((businessDate) => (
                                  <button
                                    key={businessDate}
                                    type="button"
                                    onClick={() => setSelectedPreviewBusinessDate(businessDate)}
                                    className={cn(
                                      "shrink-0 rounded-md border px-3 py-1.5 text-xs",
                                      selectedPreviewBusinessDate === businessDate
                                        ? "border-primary bg-primary/10 text-primary"
                                        : "bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
                                    )}
                                  >
                                    {isPreviewMonthlyFrequency
                                      ? `${extractBusinessDateMonth(businessDate) ?? businessDate.slice(5, 7)}月`
                                      : businessDate}{" "}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ) : null}
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead className="border-b bg-muted/40">
                                <tr>
                                  {previewColumns.map((column) => (
                                    <th key={column.id} className="px-2 py-1.5 text-left">
                                      {column.name}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y">
                                {visiblePreviewRecords.map((record) => (
                                  <tr key={`${record.wideTableId}-${record.id}`}>
                                    {previewColumns.map((column) => (
                                      <td key={column.id} className="px-2 py-1.5 text-muted-foreground">
                                        {record[column.name] != null && record[column.name] !== "" ? (
                                          String(record[column.name])
                                        ) : (
                                          "-"
                                        )}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}
                {null}
              </div>
            </div>
            )
          ) : null}
        </>
      )}
    </section>
  );
}

// ==================== 姝ラ鐘舵€佸窘鏍?====================



function formatStepStatusLabel(status: StepStatus): string {
  if (status === "completed") {
    return "已完成";
  }
  if (status === "invalidated") {
    return "已失效";
  }
  return "待完成";
}

// ==================== 澶辨晥确认瀵硅瘽妗?====================

type InvalidationDialogProps = {
  open: boolean;
  changedStepLabel: string;
  affectedSteps: Array<{ id: StepId; label: string }>;
  impactSummary: {
    indicatorGroupCount: number;
    dimensionValueCount: number;
    taskGroupCount: number;
    fetchTaskCount: number;
    completedExecutionCount: number;
  };
  onConfirm: () => void;
  onCancel: () => void;
};

function InvalidationDialog({
  open,
  changedStepLabel,
  affectedSteps,
  impactSummary,
  onConfirm,
  onCancel,
}: InvalidationDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl border bg-card shadow-xl">
        <div className="border-b px-5 py-4 space-y-1">
          <h4 className="text-sm font-semibold">确认操作</h4>
          <p className="text-xs text-muted-foreground">
            修改「{changedStepLabel}」将导致以下下游步骤失效：
          </p>
        </div>
        <div className="space-y-4 px-5 py-4">
          <div className="flex flex-wrap gap-2">
            {affectedSteps.map((s) => (
              <span key={s.id} className="inline-flex items-center rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-[11px] text-orange-700">
                {s.id}. {s.label}
              </span>
            ))}
          </div>
          <div className="rounded-md border bg-muted/10 p-3 text-xs text-muted-foreground space-y-1">
            <div className="font-medium text-foreground">影响摘要</div>
            <div>指标组：{impactSummary.indicatorGroupCount} 个</div>
            <div>维度枚举值：{impactSummary.dimensionValueCount} 个</div>
            <div>TaskGroup：{impactSummary.taskGroupCount} 个</div>
            <div>FetchTask：{impactSummary.fetchTaskCount} 个</div>
            <div>已完成 ExecutionRecord：{impactSummary.completedExecutionCount} 个</div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              取消
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="rounded-md bg-orange-500 px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
            >
              确认
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==================== 杈呭姪缁勪欢 ====================

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="rounded-md border bg-muted/10 p-3 text-xs">{value}</div>
    </div>
  );
}

function EditableField({ label, control }: { label: string; control: ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      {control}
    </div>
  );
}

function buildDefaultScheduleRule(
  wideTableId: string,
  mode: "business_date" | "full_snapshot",
  frequency: WideTable["businessDateRange"]["frequency"],
): NonNullable<WideTable["scheduleRule"]> {
  if (mode === "full_snapshot") {
    const rule = {
      id: `sr_${wideTableId}`,
      wideTableId,
      type: "periodic" as const,
      periodLabel: frequency,
      businessDateOffsetDays: 1,
      description: "",
    };
    return {
      ...rule,
      description: describeFullSnapshotScheduleRule(rule),
    };
  }

  return {
    id: `sr_${wideTableId}`,
    wideTableId,
    type: "periodic",
    businessDateOffsetDays: 1,
    description: "业务日期后 1 天触发未来任务",
  };
}

function fallbackBusinessDateEnd(start: string): string {
  return start || new Date().toISOString().slice(0, 10);
}

/**
 * 频率感知的业务日期选择器。 * - daily / weekly => 普通 date input
 * - monthly / quarterly / yearly => 下拉选择周期末尾日期，显示友好标签 */
function BusinessDateInput({
  frequency,
  value,
  onChange,
}: {
  frequency: WideTable["businessDateRange"]["frequency"];
  value: string;
  onChange: (value: string) => void;
}) {
  if (frequency === "daily" || frequency === "weekly") {
    return (
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
      />
    );
  }

  const options = useMemo(
    () => buildSelectableBusinessDates(frequency).slice().reverse(),
    [frequency],
  );

  // 默认选择最新日期
  useEffect(() => {
    if ((!value || !options.includes(value)) && options.length > 0) {
      onChange(options[0]);
    }
  }, [options, value, onChange]);

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
    >
      {!value ? (
        <option value="">请选择</option>
      ) : null}
      {options.map((d) => (
        <option key={d} value={d}>
          {formatBusinessDateLabel(d, frequency)}
        </option>
      ))}
    </select>
  );
}

function formatBusinessDateEnd(end: string | "never"): string {
  return end === "never" ? "永不" : end;
}

function buildSchemaCandidateMeta(template: WideTable): string {
  const description = template.description?.trim();
  return description ? `${description} · ${template.id}` : template.id;
}

function normalizeSchemaTemplateKeyword(value: string): string {
  return value.trim().toLowerCase();
}

function resolveSchemaTemplateSearch(
  keyword: string,
  templateOptions: SchemaTemplateOption[],
): SchemaTemplateSearchResult {
  const normalizedKeyword = normalizeSchemaTemplateKeyword(keyword);
  const exactMatches = templateOptions.filter((option) =>
    [option.value, option.meta, option.template.name, option.template.id].some(
      (candidate) => normalizeSchemaTemplateKeyword(candidate) === normalizedKeyword,
    ),
  );

  if (exactMatches.length === 1) {
    return { kind: "matched", template: exactMatches[0].template };
  }

  if (exactMatches.length > 1) {
    return { kind: "ambiguous", matches: exactMatches };
  }

  const fuzzyMatches = templateOptions.filter((option) =>
    [option.value, option.meta, option.template.name, option.template.id].some(
      (candidate) => normalizeSchemaTemplateKeyword(candidate).includes(normalizedKeyword),
    ),
  );

  if (fuzzyMatches.length === 1) {
    return { kind: "matched", template: fuzzyMatches[0].template };
  }

  if (fuzzyMatches.length > 1) {
    return { kind: "ambiguous", matches: fuzzyMatches };
  }

  return { kind: "missing" };
}

function filterSchemaTemplateOptions(
  keyword: string,
  templateOptions: SchemaTemplateOption[],
): SchemaTemplateOption[] {
  const normalizedKeyword = normalizeSchemaTemplateKeyword(keyword);

  if (!normalizedKeyword) {
    return templateOptions;
  }

  return templateOptions.filter((option) =>
    [option.value, option.meta, option.template.name, option.template.id].some((candidate) =>
      normalizeSchemaTemplateKeyword(candidate).includes(normalizedKeyword),
    ),
  );
}

function dedupeSchemaTemplateOptions(templates: WideTable[]): WideTable[] {
  const optionMap = new Map<string, WideTable>();

  for (const template of templates) {
    const dedupeKey = normalizeSchemaTemplateKeyword(template.name);
    const current = optionMap.get(dedupeKey);
    if (!current || compareSchemaCandidatePriority(template, current) < 0) {
      optionMap.set(dedupeKey, template);
    }
  }

  return Array.from(optionMap.values());
}

function compareSchemaCandidatePriority(left: WideTable, right: WideTable): number {
  const leftStatus = schemaCandidateStatusScore(left.status);
  const rightStatus = schemaCandidateStatusScore(right.status);
  if (leftStatus !== rightStatus) {
    return rightStatus - leftStatus;
  }

  if (left.recordCount !== right.recordCount) {
    return right.recordCount - left.recordCount;
  }

  if (left.schema.columns.length !== right.schema.columns.length) {
    return right.schema.columns.length - left.schema.columns.length;
  }

  return left.createdAt.localeCompare(right.createdAt);
}

function schemaCandidateStatusScore(status: WideTable["status"]): number {
  if (status === "active") {
    return 3;
  }
  if (status === "initialized") {
    return 2;
  }
  return 1;
}

function frequencyLabel(freq: string): string {
  const map: Record<string, string> = {
    daily: "日频",
    weekly: "周频",
    monthly: "月频",
    quarterly: "季频",
    yearly: "年频",
  };
  return map[freq] ?? freq;
}

function formatPersistError(error: unknown): string {
  if (error instanceof Error && error.message.trim() !== "") {
    return error.message;
  }
  return "请稍后重试";
}

function normalizeCategoryForUI(category: ColumnDefinition["category"]): Exclude<ColumnDefinition["category"], "attribute"> {
  return (category === "attribute" ? "system" : category) as Exclude<ColumnDefinition["category"], "attribute">;
}

function categoryBadgeClass(category: ColumnDefinition["category"] | "time"): string {
  if (category === "id") {
    return "bg-purple-100 text-purple-700";
  }
  if (category === "time") {
    return "bg-sky-100 text-sky-700";
  }
  if (category === "dimension") {
    return "bg-blue-100 text-blue-700";
  }
  if (category === "attribute") {
    return "bg-amber-100 text-amber-700";
  }
  if (category === "indicator") {
    return "bg-emerald-100 text-emerald-700";
  }
  return "bg-gray-100 text-gray-600";
}

function categorySelectClass(category: ColumnDefinition["category"] | "time"): string {
  if (category === "time") {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }
  if (category === "dimension") {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }
  if (category === "attribute") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (category === "indicator") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (category === "id") {
    return "border-purple-200 bg-purple-50 text-purple-700";
  }
  return "border-gray-200 bg-gray-50 text-gray-700";
}

function groupToneClass(groupId: string, groups: WideTable["indicatorGroups"]): string {
  const toneIndex = Math.max(
    0,
    groups.findIndex((group) => group.id === groupId),
  ) % GROUP_TONE_CLASSES.length;
  return GROUP_TONE_CLASSES[toneIndex];
}

function groupSelectClass(groupId: string | undefined, groups: WideTable["indicatorGroups"]): string {
  if (!groupId) {
    return "border-gray-200 bg-gray-50 text-gray-700";
  }
  return groupToneClass(groupId, groups);
}

const GROUP_TONE_CLASSES = [
  "border-sky-200 bg-sky-50 text-sky-700",
  "border-emerald-200 bg-emerald-50 text-emerald-700",
  "border-orange-200 bg-orange-50 text-orange-700",
  "border-rose-200 bg-rose-50 text-rose-700",
  "border-violet-200 bg-violet-50 text-violet-700",
  "border-cyan-200 bg-cyan-50 text-cyan-700",
];

function categoryLabel(category: ColumnDefinition["category"] | "time"): string {
  if (category === "id") {
    return "ID列";
  }
  if (category === "time") {
    return "时间列";
  }
  if (category === "dimension") {
    return "维度列";
  }
  if (category === "attribute") {
    return "属性列";
  }
  if (category === "indicator") {
    return "指标列";
  }
  return "系统列";
}

function auditRuleNeedsValue(ruleType: ColumnDefinition["auditRuleType"]): boolean {
  return ruleType === "max_lte" || ruleType === "min_gte" || ruleType === "change_rate_lte";
}

function formatPassthroughDisplay(column: ColumnDefinition): string {
  if (!column.passthroughEnabled) {
    return "否";
  }
  if (column.passthroughContent?.trim()) {
    return `是：${column.passthroughContent.trim()}`;
  }
  return "是";
}

function formatAuditRuleDisplay(column: ColumnDefinition): string {
  if (!column.auditRuleType) {
    return "-";
  }
  const value = (column.auditRuleValue ?? "").trim();
  if (column.auditRuleType === "max_lte") {
    return `最大值小于等于 ${value || "xxx"}`;
  }
  if (column.auditRuleType === "min_gte") {
    return `最小值大于等于 ${value || "xxx"}`;
  }
  if (column.auditRuleType === "change_rate_lte") {
    return `本期较上期变化范围不超过 ${value || "xxx"}`;
  }
  return "不为空";
}
