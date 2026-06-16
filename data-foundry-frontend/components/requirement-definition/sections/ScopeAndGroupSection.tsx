"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DefinitionSectionId } from "@/lib/requirement-definition-navigation";
import {
  buildDefaultDateRange,
  buildSelectableBusinessDates,
  extractBusinessDateYear,
  formatBusinessDateLabel,
  isOpenEndedBusinessDateRange,
  limitFutureBusinessDates,
  OPEN_ENDED_PREVIEW_PERIODS,
  pickDefaultBusinessYear,
} from "@/lib/business-date";
import { previewParameterRowsSql } from "@/lib/api-client";
import {
  type StepStatusMap,
  completeStep,
  invalidateDownstream,
  isStepCComplete,
  isStepEditable,
  markTaskGroupsAsStale,
} from "@/lib/step-status";
import {
  generateWideTablePreviewRecords,
  generateWideTablePreviewRecordsFromDimensionRows,
} from "@/lib/wide-table-preview";
import {
  resolveCurrentPlanVersion,
} from "@/lib/task-plan-reconciliation";
import type {
  FetchTask,
  ParameterRow,
  Requirement,
  TaskGroup,
  WideTable,
  WideTableRecord,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { normalizeWideTableMode, hasWideTableBusinessDateDimension } from "@/lib/wide-table-mode";
import type { DimensionExcelImportState } from "@/components/requirement-definition/types";
import { ScopeBusinessDateRangeCard } from "@/components/requirement-definition/scope/ScopeBusinessDateRangeCard";
import { ScopeParameterTableCard } from "@/components/requirement-definition/scope/ScopeParameterTableCard";
import { ScopePreviewModal } from "@/components/requirement-definition/scope/ScopePreviewModal";
import { SectionStatusBadge } from "@/components/requirement-definition/shared/DefinitionShared";

type Props = {
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
  onRequirementChange?: (requirement: Requirement) => void;
  onUpdateWideTable?: (wideTableId: string, updater: (wideTable: WideTable) => WideTable) => void;
  onReplaceWideTableRecords?: (wideTableId: string, nextWideTableRecords: WideTableRecord[]) => void;
  taskGroups: TaskGroup[];
  fetchTasks: FetchTask[];
  onTaskGroupsChange?: (taskGroups: TaskGroup[]) => void;
  onFetchTasksChange?: (fetchTasks: FetchTask[]) => void;
  stepStatuses: StepStatusMap;
  onStepStatusesChange: (statuses: StepStatusMap) => void;
};

export default function ScopeAndGroupSection({
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
  onRequirementChange,
  onUpdateWideTable,
  onReplaceWideTableRecords,
  taskGroups,
  fetchTasks,
  onTaskGroupsChange,
  onFetchTasksChange,
  stepStatuses,
  onStepStatusesChange,
}: Props) {
  const [pendingDimensionValues, setPendingDimensionValues] = useState<Record<string, string>>({});
  const [rangeMessage, setRangeMessage] = useState("");
  const [parameterInputMode, setParameterInputMode] = useState<"manual" | "sql">("manual");
  const [parameterSqlText, setParameterSqlText] = useState("");
  const [isParameterSqlImporting, setIsParameterSqlImporting] = useState(false);
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
  const parameterTableColumns = useMemo(
    () => dimensionColumns.map((column) => ({
      key: column.name,
      label: column.chineseName ? `${column.name} / ${column.chineseName}` : column.name,
    })),
    [dimensionColumns],
  );
  const parameterRows = selectedWt?.parameterRows ?? [];
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
      return scopedDates.filter((d) => d.slice(0, 4) === effectiveSelectedPreviewYear);
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
  const canUseManualParameterInput = isRangeEditable && isCEditable && parameterInputMode === "manual";
  const canUseSqlParameterInput = isRangeEditable && isCEditable && parameterInputMode === "sql";
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
    setParameterInputMode(selectedWt?.parameterSource?.mode === "sql" ? "sql" : "manual");
    setParameterSqlText(selectedWt?.parameterSource?.sql ?? "");
  }, [selectedWtId, selectedWt?.parameterSource?.mode, selectedWt?.parameterSource?.sql]);

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

  useEffect(() => {
    if (!selectedWt) return;
    if (stepStatuses.A !== "completed") return;
    const cComplete = isStepCComplete(selectedWt);
    if (cComplete && stepStatuses.C !== "completed") {
      onStepStatusesChange(completeStep(stepStatuses, "C"));
    }
  }, [selectedWt, stepStatuses.A, stepStatuses.C, onStepStatusesChange]);

  const updateSelectedWideTable = (updater: (wideTable: WideTable) => WideTable) => {
    if (!selectedWt || !onUpdateWideTable) {
      return;
    }
    onUpdateWideTable(selectedWt.id, (wideTable) => normalizeWideTableMode(updater(wideTable)));
  };

  const updateRequirement = (patch: Partial<Requirement>) => {
    onRequirementChange?.({
      ...requirement,
      ...patch,
      updatedAt: new Date().toISOString(),
    });
  };

  const normalizeParameterHeaderKey = (value: string) => value.trim().toLowerCase();

  const clearDraftParameterFileImport = () => {
    if (!selectedWt) {
      return;
    }
    onDimensionExcelImportsChange((prev) => {
      const next = { ...prev };
      delete next[selectedWt.id];
      return next;
    });
  };

  const handleParameterInputModeChange = (mode: "manual" | "sql") => {
    if (mode === parameterInputMode) {
      return;
    }
    setParameterInputMode(mode);
    setRangeMessage(
      mode === "manual"
        ? "已切换为手动/文件导入方式。"
        : "已切换为 SQL 导入方式，执行 SQL 后会覆盖当前参数行。",
    );
    if (mode === "sql") {
      clearDraftParameterFileImport();
    }
    updateSelectedWideTable((wideTable) => ({
      ...wideTable,
      parameterSource: mode === "sql"
        ? { mode: "sql", sql: parameterSqlText, maxRows: 1000 }
        : { mode: "manual_file" },
      updatedAt: new Date().toISOString(),
    }));
  };

  const applyParameterRows = (
    rows: ParameterRow[],
    message: string,
    source: WideTable["parameterSource"] = { mode: "manual_file" },
    options: { keepDraftParameterFileImport?: boolean } = {},
  ) => {
    if (!options.keepDraftParameterFileImport) {
      clearDraftParameterFileImport();
    }
    markSelectedScopePreviewDirty();
    updateSelectedWideTable((wideTable) => {
      const currentPlanVersion = wideTable.currentPlanVersion ?? resolveCurrentPlanVersion(wideTable, selectedWideTableRecords, taskGroups ?? []);
      return {
        ...wideTable,
        parameterRows: rows.map((row, index) => ({
          rowId: index + 1,
          businessDate: row.businessDate,
          values: { ...row.values },
        })),
        parameterSource: source,
        dimensionRanges: [],
        currentPlanVersion: currentPlanVersion + 1,
        currentPlanFingerprint: undefined,
        recordCount: 0,
        status: "draft",
        updatedAt: new Date().toISOString(),
      };
    });
    setRangeMessage(message);
    onStepStatusesChange(invalidateDownstream(stepStatuses, "C"));
    if (onTaskGroupsChange && selectedWt) {
      const staleTaskGroups = markTaskGroupsAsStale(taskGroups ?? [], selectedWt.id, selectedWideTablePlanVersion);
      onTaskGroupsChange(staleTaskGroups);
    }
  };

  const handleAddParameterRow = () => {
    const emptyValues = Object.fromEntries(dimensionColumns.map((column) => [column.name, ""]));
    applyParameterRows(
      [
        ...parameterRows,
        {
          rowId: parameterRows.length + 1,
          businessDate: undefined,
          values: emptyValues,
        },
      ],
      "已新增一行采集参数。",
    );
  };

  const handleUpdateParameterCell = (rowIndex: number, columnKey: string, value: string) => {
    const nextRows = parameterRows.map((row, index) => {
      if (index !== rowIndex) {
        return row;
      }
      return {
        ...row,
        values: {
          ...row.values,
          [columnKey]: value,
        },
      };
    });
    applyParameterRows(nextRows, "采集参数表已更新。");
  };

  const handleRemoveParameterRow = (rowIndex: number) => {
    applyParameterRows(
      parameterRows.filter((_, index) => index !== rowIndex),
      "已删除采集参数行。",
    );
  };

  const handlePasteParameterRows = (text: string) => {
    const rows = text
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .map((line) => line.split(/\t|,/).map((cell) => cell.trim()))
      .filter((row) => row.some((cell) => cell !== ""));
    if (rows.length < 2) {
      setRangeMessage("粘贴内容需要包含表头和至少一行数据。");
      return;
    }
    const headers = rows[0];
    const normalizedHeaders = headers.map((header) => normalizeParameterHeaderKey(header));
    const nextRows = rows.slice(1).map((cells, index) => {
      const values: Record<string, string> = {};
      parameterTableColumns.forEach((column) => {
        const headerIndex = normalizedHeaders.indexOf(normalizeParameterHeaderKey(column.key));
        const value = headerIndex >= 0 ? String(cells[headerIndex] ?? "").trim() : "";
        values[column.key] = value;
      });
      return { rowId: index + 1, values };
    });
    applyParameterRows(nextRows, `已粘贴 ${nextRows.length} 行采集参数。`);
  };

  const handleParameterSqlTextChange = (value: string) => {
    setParameterSqlText(value);
    updateSelectedWideTable((wideTable) => ({
      ...wideTable,
      parameterSource: {
        mode: "sql",
        sql: value,
        maxRows: 1000,
      },
      updatedAt: new Date().toISOString(),
    }));
  };

  const handleImportParameterRowsFromSql = async () => {
    const sql = parameterSqlText.trim();
    if (!sql) {
      setRangeMessage("请输入用于导入采集参数的 SELECT SQL。");
      return;
    }
    setIsParameterSqlImporting(true);
    try {
      const result = await previewParameterRowsSql(sql, 1000);
      if (result.rows.length === 0) {
        setRangeMessage("SQL 查询没有返回数据。");
        return;
      }
      const returnedHeaders = new Set(result.headers.map((header) => normalizeParameterHeaderKey(header)));
      const missingColumns = dimensionColumns
        .filter((column) => !returnedHeaders.has(normalizeParameterHeaderKey(column.name)))
        .map((column) => column.name);
      if (missingColumns.length > 0) {
        setRangeMessage(`SQL 返回字段缺少参数列：${missingColumns.join("、")}。请使用 as 别名与参数字段保持一致。`);
        return;
      }
      const nextRows = result.rows.map((rawRow, index) => {
        const normalizedRow = new Map<string, unknown>();
        Object.entries(rawRow).forEach(([key, value]) => {
          normalizedRow.set(normalizeParameterHeaderKey(key), value);
        });
        const values: Record<string, string> = {};
        parameterTableColumns.forEach((column) => {
          const rawValue = normalizedRow.get(normalizeParameterHeaderKey(column.key));
          const value = rawValue == null ? "" : String(rawValue).trim();
          values[column.key] = value;
        });
        return { rowId: index + 1, values };
      });
      clearDraftParameterFileImport();
      applyParameterRows(
        nextRows,
        `已通过 SQL 导入 ${nextRows.length} 行采集参数。`, 
        { mode: "sql", sql, maxRows: 1000 },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "SQL 瀵煎叆澶辫触";
      setRangeMessage(message);
    } finally {
      setIsParameterSqlImporting(false);
    }
  };

  const handleBusinessDateRangeChange = (
    patch: Partial<WideTable["businessDateRange"]>,
  ) => {
    const nextBusinessDateRange = selectedWt
      ? {
          ...selectedWt.businessDateRange,
          ...patch,
        }
      : null;
    const willSwitchToPeriodicUpdate = Boolean(
      nextBusinessDateRange
      && nextBusinessDateRange.end === "never"
      && requirement.dataUpdateEnabled !== true,
    );
    setRangeMessage(
      willSwitchToPeriodicUpdate
        ? "时间范围已修改，并已自动切换为定期更新；如需查看请点击预览数据。"
        : "时间范围已修改，如需查看请点击预览数据。",
    );
    markSelectedScopePreviewDirty();
    updateSelectedWideTable((wideTable) => {
      const merged = {
        ...wideTable.businessDateRange,
        ...patch,
      };

      if (patch.frequency && patch.frequency !== wideTable.businessDateRange.frequency) {
        const defaults = buildDefaultDateRange(patch.frequency);
        merged.start = defaults.start;
        merged.end = wideTable.businessDateRange.end === "never" ? "never" : defaults.end;
      }

      return {
        ...wideTable,
        businessDateRange: merged,
        scheduleRule: wideTable.scheduleRule
          ? { ...wideTable.scheduleRule, periodLabel: merged.frequency }
          : wideTable.scheduleRule,
        status: "draft" as const,
        currentPlanFingerprint: undefined,
        currentPlanVersion: Math.max(selectedWideTablePlanVersion, 1) + 1,
        updatedAt: new Date().toISOString(),
      };
    });
    if (nextBusinessDateRange?.end === "never" && requirement.dataUpdateEnabled !== true) {
      updateRequirement({
        dataUpdateEnabled: true,
        dataUpdateMode: requirement.dataUpdateMode ?? null,
      });
    }

    onStepStatusesChange(invalidateDownstream(stepStatuses, "C"));

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
    setRangeMessage("采集参数表已修改，如需查看请点击预览数据。");
    markSelectedScopePreviewDirty();

    onStepStatusesChange(invalidateDownstream(stepStatuses, "C"));

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
    setRangeMessage("采集参数表已修改，如需查看请点击预览数据。");

    onStepStatusesChange(invalidateDownstream(stepStatuses, "C"));

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
    setRangeMessage("采集参数表已更新，如需查看请点击预览数据。");
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

  const readImportFileAsDelimitedText = async (file: File): Promise<string> => {
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith(".xlsx") && !fileName.endsWith(".xls")) {
      return file.text();
    }
    const xlsx = await import("xlsx");
    const buffer = await file.arrayBuffer();
    const workbook = xlsx.read(buffer, { type: "array" });
    const firstSheetName = workbook.SheetNames[0];
    const firstSheet = firstSheetName ? workbook.Sheets[firstSheetName] : undefined;
    if (!firstSheet) {
      return "";
    }
    const aoa = xlsx.utils.sheet_to_json<string[]>(firstSheet, {
      header: 1,
      raw: false,
      defval: "",
    });
    return aoa.map((row) => row.map((cell) => String(cell ?? "")).join(",")).join("\n");
  };

  const handleDimensionExcelImport = async (file: File) => {
    if (!selectedWt) {
      setRangeMessage("当前需求尚未关联数据表，无法导入采集参数表。");
      return;
    }

    const fileName = file.name.toLowerCase();
    if (false && (fileName.endsWith(".xlsx") || fileName.endsWith(".xls"))) {
      setRangeMessage("暂不支持直接解析 .xlsx/.xls，请先在 Excel 中另存为 CSV 后导入。");
      return;
    }

    const text = await readImportFileAsDelimitedText(file);
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

    const importedParameterRows = rows.map((row, index) => ({
      rowId: index + 1,
      values: Object.fromEntries(
        dimensionColumns.map((column) => [column.name, String(row[column.name] ?? "").trim()]),
      ),
    }));
    applyParameterRows(
      importedParameterRows,
      `已导入 ${importedParameterRows.length} 行采集参数。`,
      { mode: "manual_file" },
      { keepDraftParameterFileImport: true },
    );

    onDimensionExcelImportsChange((prev) => ({
      ...prev,
      [selectedWt.id]: {
        fileName: file.name,
        fileType: fileName.endsWith(".xlsx") || fileName.endsWith(".xls")
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "text/csv",
        fileContent: normalizedText,
        headers,
        rows,
      },
    }));
    markSelectedScopePreviewDirty();

    setRangeMessage(
      `已导入 ${file.name}，识别到 ${rows.length} 行采集参数。` +
        (skipped > 0 ? `（已跳过 ${skipped} 行不完整数据）` : "") +
        " 点击预览数据查看。",
    );
  };

  const handleOpenPreview = async () => {
    if (!selectedWt) {
      return;
    }

    const businessDateKey = businessDateColumn?.name ?? "business_date";
    const importedRows = draftDimensionExcelImport?.rows ?? [];
    const savedParameterRows = parameterRows.map((row) => ({
      ...row.values,
      ...(usesBusinessDateAxis && row.businessDate ? { [businessDateKey]: row.businessDate } : {}),
    }));
    const excelRows = importedRows.length > 0 ? importedRows : savedParameterRows;
    const useExcelRows = excelRows.length > 0;
    const shouldUsePersistedImportedRows = Boolean(
      !useExcelRows
      && !isScopePreviewDirty
      && (selectedWt.scopeImport?.importMode === "dimension_rows_csv" || selectedWt.scopeImport?.importMode === "parameter_rows_file")
      && selectedWideTableRecords.length > 0,
    );

    if (shouldUsePersistedImportedRows) {
      setPreviewRecords(selectedWideTableRecords);
      setPreviewTotalCount(selectedWideTableRecords.length);
      setIsPreviewModalOpen(true);
      setRangeMessage(`已加载已保存的采集参数表（${selectedWideTableRecords.length} 行）。`);
      return;
    }

    if (!useExcelRows) {
      if (selectedWideTableRecords.length > 0) {
        setPreviewRecords(selectedWideTableRecords);
        setPreviewTotalCount(selectedWideTableRecords.length);
        setIsPreviewModalOpen(true);
        setRangeMessage(`已加载已保存的采集参数表（${selectedWideTableRecords.length} 行）。`);
        return;
      }
      setRangeMessage("请先新增采集参数行，或导入 CSV/XLSX 参数表。");
      return;
    }

    const { records, totalCount } = useExcelRows
      ? generateWideTablePreviewRecordsFromDimensionRows(selectedWt, excelRows, selectedWideTableRecords, wideTableRecords)
      : generateWideTablePreviewRecords(selectedWt, selectedWideTableRecords, wideTableRecords);
    if (totalCount === 0) {
      setRangeMessage("当前时间范围或采集参数表为空，无法生成预览数据。");
      return;
    }

    setPreviewRecords(records);
    setPreviewTotalCount(totalCount);
    setIsPreviewModalOpen(true);
    setRangeMessage(
      [
        `已生成预览数据（不保存），预计 ${totalCount} 行，当前展示 ${records.length} 行。`, 
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
        <p className="text-xs text-muted-foreground">在这里配置时间范围与采集参数表，并在需要时查看预览。</p>
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
                先在“表结构定义”里完成 Schema 关联，再回到这里配置范围。
              </div>
            ) : (
              <div className="space-y-6">
                <ScopeBusinessDateRangeCard
                  wideTable={selectedWt}
                  editable={Boolean(isRangeEditable && isCEditable)}
                  faded={!isCEditable}
                  onBusinessDateRangeChange={handleBusinessDateRangeChange}
                  DateInputComponent={BusinessDateInput}
                />

                <ScopeParameterTableCard
                  faded={!isCEditable}
                  parameterInputMode={parameterInputMode}
                  canUseManualParameterInput={canUseManualParameterInput}
                  canUseSqlParameterInput={canUseSqlParameterInput}
                  parameterTableColumns={parameterTableColumns}
                  parameterRows={parameterRows}
                  parameterSqlText={parameterSqlText}
                  isParameterSqlImporting={isParameterSqlImporting}
                  displayedDimensionScopeImport={displayedDimensionScopeImport}
                  onParameterInputModeChange={handleParameterInputModeChange}
                  onAddParameterRow={handleAddParameterRow}
                  onTriggerFileImport={() => dimensionExcelImportInputRef.current?.click()}
                  onClearImportedScope={() => {
                    if (!selectedWt) return;
                    onDimensionExcelImportsChange((prev) => {
                      const next = { ...prev };
                      delete next[selectedWt.id];
                      return next;
                    });
                    applyParameterRows([], "已清空采集参数表。");
                  }}
                  onImportParameterRowsFromSql={handleImportParameterRowsFromSql}
                  onParameterSqlTextChange={handleParameterSqlTextChange}
                  onPasteParameterRows={handlePasteParameterRows}
                  onUpdateParameterCell={handleUpdateParameterCell}
                  onRemoveParameterRow={handleRemoveParameterRow}
                />
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
                      预览以弹窗形式展示，点击右侧按钮即可查看。
                    </p>
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

                  <ScopePreviewModal
                    isOpen={isPreviewModalOpen}
                    previewRecords={previewRecords}
                    previewTotalCount={previewTotalCount}
                    previewColumns={previewColumns}
                    previewBusinessDates={previewBusinessDates}
                    previewBusinessYears={previewBusinessYears}
                    isPreviewMonthlyFrequency={isPreviewMonthlyFrequency}
                    effectiveSelectedPreviewYear={effectiveSelectedPreviewYear}
                    visiblePreviewBusinessDates={visiblePreviewBusinessDates}
                    selectedPreviewBusinessDate={selectedPreviewBusinessDate}
                    visiblePreviewRecords={visiblePreviewRecords}
                    isOpenEnded={isOpenEnded}
                    openEndedPreviewPeriods={OPEN_ENDED_PREVIEW_PERIODS}
                    onClose={() => setIsPreviewModalOpen(false)}
                    onPreviewYearChange={setSelectedPreviewYear}
                    onPreviewBusinessDateChange={setSelectedPreviewBusinessDate}
                  />
                </div>
              </div>
            )
          ) : null}
        </>
      )}
    </section>
  );
}
function BusinessDateInput({
  frequency,
  value,
  onChange,
  disabled,
}: {
  frequency: WideTable["businessDateRange"]["frequency"];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  if (frequency === "daily") {
    return (
      <input
        type="date"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "w-full rounded-md border px-3 py-2 text-sm",
          disabled ? "bg-muted/20 text-muted-foreground" : "bg-background",
        )}
      />
    );
  }

  const options = useMemo(
    () => buildSelectableBusinessDates(frequency).slice().reverse(),
    [frequency],
  );

  useEffect(() => {
    if (disabled) {
      return;
    }
    if ((!value || !options.includes(value)) && options.length > 0) {
      onChange(options[0]);
    }
  }, [disabled, options, value, onChange]);

  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "w-full rounded-md border px-3 py-2 text-sm",
        disabled ? "bg-muted/20 text-muted-foreground" : "bg-background",
      )}
    >
      {!value ? (
        <option value="">璇烽€夋嫨</option>
      ) : null}
      {options.map((d) => (
        <option key={d} value={d}>
          {formatBusinessDateLabel(d, frequency)}
        </option>
      ))}
    </select>
  );
}
