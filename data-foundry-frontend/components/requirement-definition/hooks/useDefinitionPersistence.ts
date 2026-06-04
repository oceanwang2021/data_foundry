"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import {
  persistWideTablePreview,
  updateRequirementWideTable,
} from "@/lib/api-client";
import { reconcileTaskPlanChange, resolveCurrentPlanVersion, resolveRecordPlanVersion } from "@/lib/task-plan-reconciliation";
import {
  generateWideTablePreviewRecords,
  generateWideTablePreviewRecordsFromDimensionRows,
} from "@/lib/wide-table-preview";
import type {
  FetchTask,
  Requirement,
  TaskGroup,
  WideTable,
  WideTableRecord,
} from "@/lib/types";
import type { DimensionExcelImportState } from "@/components/requirement-definition/types";
import { MAX_PERSISTED_DIMENSION_ROWS, UNLINKED_DATA_TABLE_NAME } from "@/components/requirement-definition/utils/requirementDefinitionConstants";
import { formatPersistError } from "@/components/requirement-definition/utils/requirementDefinitionFormatters";
import { isTransientDraftWideTable } from "@/components/requirement-definition/utils/requirementDefinitionUtils";

type Args = {
  requirement: Requirement;
  wideTables: WideTable[];
  wideTableRecords: WideTableRecord[];
  taskGroups?: TaskGroup[];
  fetchTasks?: FetchTask[];
  selectedWt?: WideTable;
  dimensionExcelImports: Record<string, DimensionExcelImportState>;
  scopePreviewDirtyByWideTableId: Record<string, boolean>;
  setScopePreviewDirtyByWideTableId: Dispatch<SetStateAction<Record<string, boolean>>>;
  handleReplaceWideTableRecords: (wideTableId: string, nextWideTableRecords: WideTableRecord[]) => void;
  onRequirementChange?: (requirement: Requirement) => void;
  onSubmitRequirement?: (requirement: Requirement) => Promise<void>;
  onRefreshData?: () => Promise<void>;
  canSubmit: boolean;
  submitBlockerMessage: string;
};

export function useDefinitionPersistence({
  requirement,
  wideTables,
  wideTableRecords,
  taskGroups,
  fetchTasks,
  selectedWt,
  dimensionExcelImports,
  scopePreviewDirtyByWideTableId,
  setScopePreviewDirtyByWideTableId,
  handleReplaceWideTableRecords,
  onRequirementChange,
  onSubmitRequirement,
  onRefreshData,
  canSubmit,
  submitBlockerMessage,
}: Args) {
  const [submitMessage, setSubmitMessage] = useState("");
  const [isSavingDefinition, setIsSavingDefinition] = useState(false);
  const [isSubmittingDefinition, setIsSubmittingDefinition] = useState(false);

  const persistDefinition = async () => {
    if (!selectedWt) {
      throw new Error("尚未关联数据表，无法保存。");
    }
    if (
      selectedWt.name === UNLINKED_DATA_TABLE_NAME
      || isTransientDraftWideTable(requirement.id, selectedWt.id)
    ) {
      throw new Error("当前详情页未加载到真实宽表，请刷新页面后重试。");
    }

    const persistWideTableDimensionRows = async (wideTable: WideTable) => {
      const allRecordsForTable = wideTableRecords.filter((record) => record.wideTableId === wideTable.id);
      const currentPlanVersion = resolveCurrentPlanVersion(wideTable, allRecordsForTable, taskGroups ?? []);
      const currentPlanRecords = allRecordsForTable.filter(
        (record) => resolveRecordPlanVersion(record, currentPlanVersion) === currentPlanVersion,
      );

      if (wideTable.parameterSource?.mode === "sql") {
        await updateRequirementWideTable(requirement.id, {
          ...wideTable,
          parameterRows: [],
          recordCount: 0,
        });

        await persistWideTablePreview(
          requirement.id,
          { ...wideTable, parameterRows: [], recordCount: 0 },
          [],
          null,
        );

        setScopePreviewDirtyByWideTableId((prev) => ({
          ...prev,
          [wideTable.id]: false,
        }));
        handleReplaceWideTableRecords(wideTable.id, []);
        return;
      }

      const excelImport = dimensionExcelImports[wideTable.id];
      const excelRows = excelImport?.rows ?? [];
      const hasUnsavedScopePreviewChanges = scopePreviewDirtyByWideTableId[wideTable.id] ?? false;
      const useExcelRows = excelRows.length > 0;
      const shouldReusePersistedDimensionRows = Boolean(
        !useExcelRows
        && !hasUnsavedScopePreviewChanges
        && (wideTable.scopeImport?.importMode === "dimension_rows_csv" || wideTable.scopeImport?.importMode === "parameter_rows_file")
        && currentPlanRecords.length > 0,
      );
      const preview = shouldReusePersistedDimensionRows
        ? { records: currentPlanRecords, totalCount: currentPlanRecords.length }
        : useExcelRows
          ? generateWideTablePreviewRecordsFromDimensionRows(wideTable, excelRows, currentPlanRecords, wideTableRecords)
          : generateWideTablePreviewRecords(wideTable, currentPlanRecords, wideTableRecords);

      if (preview.totalCount > MAX_PERSISTED_DIMENSION_ROWS) {
        throw new Error(`采集参数行数过大（${preview.totalCount}），请缩小时间范围或参数行数量后再保存。`);
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

      const parameterRows = recordsWithPlanVersion.map((record, index) => ({
        rowId: Number((record as { ROW_ID?: number }).ROW_ID ?? record.id ?? index + 1),
        businessDate: undefined,
        values: Object.fromEntries(
          wideTable.schema.columns
            .filter((column) => column.category === "dimension" && !column.isBusinessDate)
            .map((column) => [column.name, String((record as Record<string, unknown>)[column.name] ?? "")]),
        ),
      }));

      await updateRequirementWideTable(requirement.id, {
        ...wideTable,
        parameterRows,
      });

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

    await Promise.all(wideTables.map((wideTable) => persistWideTableDimensionRows(wideTable)));
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
      const nextRequirement = {
        ...requirement,
        status: "ready" as const,
        schemaLocked: true,
        updatedAt: new Date().toISOString(),
      };
      if (onSubmitRequirement) {
        await onSubmitRequirement(nextRequirement);
      } else {
        await Promise.resolve(onRequirementChange?.(nextRequirement));
      }
      setSubmitMessage("已提交需求。现在可以进入【任务】配置指标分组并生成任务组。");
      await onRefreshData?.();
    } catch (error) {
      setSubmitMessage(`提交失败：${formatPersistError(error)}`);
    } finally {
      setIsSubmittingDefinition(false);
    }
  };

  return {
    submitMessage,
    isSavingDefinition,
    isSubmittingDefinition,
    handleSaveDefinition,
    handleSubmitDefinition,
  };
}
