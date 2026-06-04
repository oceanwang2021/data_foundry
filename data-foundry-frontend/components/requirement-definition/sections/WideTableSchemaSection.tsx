"use client";

import { useEffect, useMemo, useState } from "react";
import SchemaSelectorModal from "@/components/SchemaSelectorModal";
import { SchemaAuditRuleEditor } from "@/components/requirement-definition/schema/SchemaAuditRuleEditor";
import { SchemaColumnCategoryCell } from "@/components/requirement-definition/schema/SchemaColumnCategoryCell";
import { SchemaColumnRow } from "@/components/requirement-definition/schema/SchemaColumnRow";
import { SchemaColumnTable } from "@/components/requirement-definition/schema/SchemaColumnTable";
import { SchemaPassthroughEditor } from "@/components/requirement-definition/schema/SchemaPassthroughEditor";
import {
  CompactInfoItem,
  SectionStatusBadge,
} from "@/components/requirement-definition/shared/DefinitionShared";
import { UNLINKED_DATA_TABLE_NAME } from "@/components/requirement-definition/utils/requirementDefinitionConstants";
import {
  auditRuleNeedsValue,
  formatAuditRuleDisplay,
  formatPassthroughDisplay,
} from "@/components/requirement-definition/utils/requirementDefinitionFormatters";
import { buildDraftWideTable } from "@/components/requirement-definition/utils/requirementDefinitionUtils";
import { listTargetTableColumns } from "@/lib/api-client";
import { resolveCurrentPlanVersion } from "@/lib/task-plan-reconciliation";
import {
  type StepId,
  type StepStatusMap,
  completeStep,
  invalidateDownstream,
  markTaskGroupsAsStale,
} from "@/lib/step-status";
import type {
  ColumnDefinition,
  FetchTask,
  TargetTableColumn,
  TargetTableSummary,
  TaskGroup,
  WideTable,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { normalizeWideTableMode } from "@/lib/wide-table-mode";

type Props = {
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
};

export default function WideTableSchemaSection({
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
}: Props) {
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
          status: "draft" as const,
          currentPlanFingerprint: undefined,
          currentPlanVersion: Math.max(currentPlanVersion, 1) + 1,
          updatedAt: new Date().toISOString(),
        };
      });

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

        onStepStatusesChange(invalidateDownstream(completeStep(stepStatuses, "A"), "A"));

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
            关联数据表
          </button>
        ) : null}
      </div>

      {wideTables.length === 0 ? (
        <div className="rounded-lg border border-dashed px-4 py-8 text-sm text-muted-foreground">
          当前需求尚未关联数据表。点击“关联数据表”后选择一个 Schema 即可开始配置。
        </div>
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
                  Schema 已锁定：字段元数据仅支持只读查看；如需调整，请新建版本并重新生成计划。
                </div>
              ) : null}

              {schemaActionMessage ? (
                <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary">
                  {schemaActionMessage}
                </div>
              ) : null}

              {selectedWt.schema.columns.length === 0 ? (
                <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                  当前宽表还未关联 Schema。请点击“关联 Schema”按钮选择一个结构。
                </div>
              ) : (
                <SchemaColumnTable>
                  {selectedWt.schema.columns.map((col) => (
                    <SchemaColumnRow
                      key={col.id}
                      muted={col.category === "system"}
                      columnName={col.name}
                      columnType={col.type}
                      requiredCell={<span>{col.required ? "是" : "否"}</span>}
                      chineseNameCell={isSchemaMetadataEditable ? (
                        <input
                          value={col.chineseName ?? ""}
                          onChange={(event) => handleColumnMetadataChange(col.id, { chineseName: event.target.value })}
                          className="w-full rounded-md border bg-background px-2 py-1 text-xs"
                          placeholder="中文名"
                        />
                      ) : (
                        col.chineseName ?? "-"
                      )}
                      categoryCell={(
                        <SchemaColumnCategoryCell
                          editable={isSchemaMetadataEditable}
                          category={col.category}
                          isBusinessDate={col.isBusinessDate}
                          onChange={(nextValue) => {
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
                        />
                      )}
                      descriptionCell={isSchemaMetadataEditable ? (
                        <input
                          value={col.description}
                          onChange={(event) => handleColumnMetadataChange(col.id, { description: event.target.value })}
                          className="w-full rounded-md border bg-background px-2 py-1 text-xs"
                          placeholder="字段说明"
                        />
                      ) : (
                        col.description
                      )}
                      unitCell={col.category === "indicator" && isSchemaMetadataEditable ? (
                        <input
                          value={col.unit ?? ""}
                          onChange={(event) => handleColumnMetadataChange(col.id, { unit: event.target.value })}
                          className="w-full rounded-md border bg-background px-2 py-1 text-xs"
                          placeholder="单位"
                        />
                      ) : (
                        col.unit ?? "-"
                      )}
                      passthroughCell={(
                        <SchemaPassthroughEditor
                          editable={isSchemaMetadataEditable}
                          enabled={col.passthroughEnabled}
                          content={col.passthroughContent}
                          displayValue={formatPassthroughDisplay(col)}
                          onEnabledChange={(enabled) => {
                            handleColumnMetadataChange(col.id, {
                              passthroughEnabled: enabled,
                              passthroughContent: enabled ? (col.passthroughContent ?? "") : "",
                            });
                          }}
                          onContentChange={(value) => handleColumnMetadataChange(col.id, { passthroughContent: value })}
                        />
                      )}
                      auditRuleCell={(
                        <SchemaAuditRuleEditor
                          editable={isSchemaMetadataEditable}
                          ruleType={col.auditRuleType}
                          ruleValue={col.auditRuleValue}
                          displayValue={formatAuditRuleDisplay(col)}
                          onRuleTypeChange={(ruleType) => {
                            handleColumnMetadataChange(col.id, {
                              auditRuleType: ruleType,
                              auditRuleValue: ruleType && auditRuleNeedsValue(ruleType) ? (col.auditRuleValue ?? "") : "",
                            });
                          }}
                          onRuleValueChange={(value) => handleColumnMetadataChange(col.id, { auditRuleValue: value })}
                        />
                      )}
                    />
                  ))}
                </SchemaColumnTable>
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
