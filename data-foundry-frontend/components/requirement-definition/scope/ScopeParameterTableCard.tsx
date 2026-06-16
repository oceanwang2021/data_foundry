"use client";

import type { ParameterRow } from "@/lib/types";
import { cn } from "@/lib/utils";

type ParameterTableColumn = {
  key: string;
  label: string;
};

type DisplayedImport = {
  fileName: string;
  rowCount: number;
  isPersisted: boolean;
};

type Props = {
  faded?: boolean;
  parameterInputMode: "manual" | "sql";
  canUseManualParameterInput: boolean;
  canUseSqlParameterInput: boolean;
  parameterTableColumns: ParameterTableColumn[];
  parameterRows: ParameterRow[];
  parameterSqlText: string;
  isParameterSqlImporting: boolean;
  displayedDimensionScopeImport?: DisplayedImport;
  onParameterInputModeChange: (mode: "manual" | "sql") => void;
  onAddParameterRow: () => void;
  onTriggerFileImport: () => void;
  onClearImportedScope: () => void;
  onImportParameterRowsFromSql: () => void;
  onParameterSqlTextChange: (value: string) => void;
  onPasteParameterRows: (value: string) => void;
  onUpdateParameterCell: (rowIndex: number, columnKey: string, value: string) => void;
  onRemoveParameterRow: (rowIndex: number) => void;
};

function isEditablePasteTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || target.isContentEditable;
}

function looksLikeTablePaste(value: string): boolean {
  const normalized = value.replace(/^\uFEFF/, "").trim();
  return normalized.includes("\t") || normalized.includes(",") || /\r?\n/.test(normalized);
}

export function ScopeParameterTableCard({
  faded,
  parameterInputMode,
  canUseManualParameterInput,
  canUseSqlParameterInput,
  parameterTableColumns,
  parameterRows,
  parameterSqlText,
  isParameterSqlImporting,
  displayedDimensionScopeImport,
  onParameterInputModeChange,
  onAddParameterRow,
  onTriggerFileImport,
  onClearImportedScope,
  onImportParameterRowsFromSql,
  onParameterSqlTextChange,
  onPasteParameterRows,
  onUpdateParameterCell,
  onRemoveParameterRow,
}: Props) {
  return (
    <div className={cn("rounded-lg bg-muted/10 p-4 space-y-3", faded ? "opacity-60" : "")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold">采集参数表</h4>
          <p className="mt-1 text-xs text-muted-foreground">请选择一种参数来源：手动/文件用于固定参数行，SQL 导入会在任务生成前动态查询最新参数。</p>
        </div>
        {(canUseManualParameterInput || canUseSqlParameterInput) ? (
          <div className="inline-flex rounded-md border bg-background p-1 text-xs">
            <button
              type="button"
              onClick={() => onParameterInputModeChange("manual")}
              className={cn("rounded px-3 py-1.5", parameterInputMode === "manual" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              手动/文件
            </button>
            <button
              type="button"
              onClick={() => onParameterInputModeChange("sql")}
              className={cn("rounded px-3 py-1.5", parameterInputMode === "sql" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              SQL 导入
            </button>
          </div>
        ) : null}
      </div>

      {canUseManualParameterInput ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onAddParameterRow} className="rounded-md border px-3 py-2 text-xs text-primary hover:bg-primary/5">新增行</button>
          <button type="button" onClick={onTriggerFileImport} className="rounded-md border px-3 py-2 text-xs text-primary hover:bg-primary/5">导入 CSV/XLSX</button>
        </div>
      ) : null}

      {parameterInputMode === "manual" && displayedDimensionScopeImport ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/20 px-3 py-2 text-xs">
          <div className="text-muted-foreground">
            {displayedDimensionScopeImport.isPersisted ? "已保存导入：" : "已导入："}
            {displayedDimensionScopeImport.fileName}（{displayedDimensionScopeImport.rowCount} 行）
          </div>
          {canUseManualParameterInput ? (
            <button
              type="button"
              onClick={onClearImportedScope}
              className="rounded-md border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              清空
            </button>
          ) : null}
        </div>
      ) : null}

      {canUseSqlParameterInput && parameterTableColumns.length > 0 ? (
        <div className="rounded-md border bg-background p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-medium">SQL 导入</div>
            <button
              type="button"
              onClick={onImportParameterRowsFromSql}
              disabled={isParameterSqlImporting}
              className="rounded-md border px-3 py-1.5 text-xs text-primary hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isParameterSqlImporting ? "执行中..." : "执行导入"}
            </button>
          </div>
          <textarea
            value={parameterSqlText}
            onChange={(event) => onParameterSqlTextChange(event.target.value)}
            rows={3}
            className="w-full rounded-md border bg-background px-3 py-2 font-mono text-xs"
            placeholder="select distinct COMNAME as COMNAME, COMCODE as COMCODE from IR_ADAS_COMPUTE_CONFIG"
          />
        </div>
      ) : null}

      {parameterTableColumns.length === 0 ? (
        <div className="rounded-md border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">当前 Schema 没有可填写的参数列。</div>
      ) : (
        <div
          className="overflow-x-auto rounded-md border bg-background"
          onPaste={(event) => {
            if (!canUseManualParameterInput) return;
            const pastedText = event.clipboardData.getData("text/plain");
            if (!pastedText.trim()) return;
            if (isEditablePasteTarget(event.target)) {
              return;
            }
            if (!looksLikeTablePaste(pastedText)) {
              return;
            }
            event.preventDefault();
            onPasteParameterRows(pastedText);
          }}
        >
          <table className="w-full min-w-[760px] text-xs">
            <thead className="border-b bg-muted/40">
              <tr>
                <th className="w-14 px-2 py-2 text-left font-medium">#</th>
                {parameterTableColumns.map((column) => (
                  <th key={column.key} className="px-2 py-2 text-left font-medium">{column.label}</th>
                ))}
                {canUseManualParameterInput ? <th className="w-20 px-2 py-2 text-right font-medium">操作</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y">
              {parameterRows.length === 0 ? (
                <tr>
                  <td colSpan={parameterTableColumns.length + (canUseManualParameterInput ? 2 : 1)} className="px-3 py-6 text-center text-muted-foreground">
                    {parameterInputMode === "sql" ? "暂无参数行，请先执行 SQL 导入。" : "暂无参数行，可新增一行或直接粘贴 Excel 表格。"}
                  </td>
                </tr>
              ) : (
                parameterRows.map((row, rowIndex) => (
                  <tr key={row.rowId || rowIndex}>
                    <td className="px-2 py-2 text-muted-foreground">{rowIndex + 1}</td>
                    {parameterTableColumns.map((column) => (
                      <td key={column.key} className="px-2 py-2">
                        <input
                          value={row.values[column.key] ?? ""}
                          disabled={!canUseManualParameterInput}
                          onChange={(event) => onUpdateParameterCell(rowIndex, column.key, event.target.value)}
                          className="w-full rounded-md border bg-background px-2 py-1.5 text-xs disabled:bg-muted/30"
                        />
                      </td>
                    ))}
                    {canUseManualParameterInput ? (
                      <td className="px-2 py-2 text-right">
                        <button type="button" onClick={() => onRemoveParameterRow(rowIndex)} className="rounded-md border px-2 py-1 text-xs text-muted-foreground hover:text-red-600">删除</button>
                      </td>
                    ) : null}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
