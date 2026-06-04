"use client";

import type { ColumnDefinition, IndicatorGroup, WideTable } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  findIndicatorColumnLabel,
  groupSelectClass,
  groupToneClass,
} from "@/components/requirement-tasks/utils/requirementTaskFormatters";

type ColumnGroupOption = {
  id: string;
  name: string;
};

type Props = {
  selectedWt: WideTable;
  hasIndicatorColumns: boolean;
  isDefinitionSubmitted: boolean;
  isPersistingIndicatorGroups: boolean;
  indicatorColumns: ColumnDefinition[];
  columnGroupMap: Map<string, ColumnGroupOption>;
  userDefinedIndicatorGroups: IndicatorGroup[];
  isIndicatorGroupingComplete: boolean;
  hasCurrentVersionTaskGroups: boolean;
  onAddIndicatorGroup: () => void;
  onPersistIndicatorGroups: () => void;
  onClose: () => void;
  onAssignIndicatorColumnToGroup: (columnName: string, groupId: string) => void;
  onClearIndicatorColumnGroup: (columnName: string) => void;
  onIndicatorGroupChange: (
    groupId: string,
    patch: Partial<WideTable["indicatorGroups"][number]>,
  ) => void;
  onDeleteIndicatorGroup: (groupId: string) => void;
};

export default function IndicatorGroupModal({
  selectedWt,
  hasIndicatorColumns,
  isDefinitionSubmitted,
  isPersistingIndicatorGroups,
  indicatorColumns,
  columnGroupMap,
  userDefinedIndicatorGroups,
  isIndicatorGroupingComplete,
  hasCurrentVersionTaskGroups,
  onAddIndicatorGroup,
  onPersistIndicatorGroups,
  onClose,
  onAssignIndicatorColumnToGroup,
  onClearIndicatorColumnGroup,
  onIndicatorGroupChange,
  onDeleteIndicatorGroup,
}: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-6xl rounded-xl border bg-card shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
          <div>
            <h4 className="text-sm font-semibold">分组管理</h4>
            <p className="mt-1 text-xs text-muted-foreground">
              在这里统一维护分组名称、执行说明与指标归属。采集提示词请在下方【采集提示词管理】模块中配置。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onAddIndicatorGroup}
              disabled={!selectedWt || !hasIndicatorColumns || !isDefinitionSubmitted || isPersistingIndicatorGroups}
              className={cn(
                "rounded-md border px-3 py-1.5 text-xs",
                !selectedWt || !hasIndicatorColumns || !isDefinitionSubmitted || isPersistingIndicatorGroups
                  ? "cursor-not-allowed text-muted-foreground opacity-50"
                  : "text-primary hover:bg-primary/5",
              )}
            >
              新增分组
            </button>
            <button
              type="button"
              onClick={onPersistIndicatorGroups}
              disabled={!selectedWt || !isDefinitionSubmitted || isPersistingIndicatorGroups}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium",
                !selectedWt || !isDefinitionSubmitted || isPersistingIndicatorGroups
                  ? "cursor-not-allowed bg-muted text-muted-foreground"
                  : "bg-primary text-primary-foreground hover:opacity-90",
              )}
            >
              {isPersistingIndicatorGroups
                ? "保存中..."
                : isIndicatorGroupingComplete
                  ? hasCurrentVersionTaskGroups ? "保存分组并重建任务组" : "保存分组并生成任务组"
                  : "保存分组"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              关闭
            </button>
          </div>
        </div>

        <div className="max-h-[80vh] space-y-4 overflow-y-auto px-5 py-4">
          <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-xs text-sky-900">
            {isDefinitionSubmitted
              ? "提示词支持分段编辑和整体 Markdown 编辑。默认内容来自需求定义，可在当前页面直接修改并保存。"
              : "请先在【需求】Tab 提交需求后，再配置采集提示词。"}
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-xs">
              <thead className="border-b bg-muted/30">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">指标列</th>
                  <th className="px-3 py-2 text-left font-medium">说明</th>
                  <th className="px-3 py-2 text-left font-medium">当前分组</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {indicatorColumns.map((column) => (
                  <tr key={column.id}>
                    <td className="px-3 py-2">
                      <div className="font-medium">{column.chineseName ?? column.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {column.name}
                        {column.unit ? ` · ${column.unit}` : ""}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{column.description || "-"}</td>
                    <td className="px-3 py-2">
                      <select
                        value={columnGroupMap.get(column.name)?.id ?? ""}
                        onChange={(event) => {
                          if (event.target.value) {
                            onAssignIndicatorColumnToGroup(column.name, event.target.value);
                            return;
                          }
                          onClearIndicatorColumnGroup(column.name);
                        }}
                        className={cn(
                          "w-full rounded-md border px-3 py-2 text-xs",
                          groupSelectClass(columnGroupMap.get(column.name)?.id, userDefinedIndicatorGroups),
                        )}
                      >
                        <option value="">未分组</option>
                        {userDefinedIndicatorGroups.map((group) => (
                          <option key={group.id} value={group.id}>
                            {group.name}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {userDefinedIndicatorGroups.length === 0 ? (
            <div className="rounded-lg border border-dashed bg-background px-4 py-8 text-center text-sm text-muted-foreground">
              还没有指标分组。请先新增分组，并把所有指标列分配进去。
            </div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {userDefinedIndicatorGroups.map((group) => (
                <div
                  key={group.id}
                  className={cn(
                    "space-y-3 rounded-lg border bg-background p-4",
                    groupToneClass(group.id, userDefinedIndicatorGroups),
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 space-y-2">
                      <input
                        value={group.name}
                        onChange={(event) => onIndicatorGroupChange(group.id, { name: event.target.value })}
                        className={cn(
                          "w-full rounded-md border bg-background px-3 py-2 text-sm",
                          groupToneClass(group.id, userDefinedIndicatorGroups),
                        )}
                        placeholder="指标组名称"
                      />
                      <textarea
                        value={group.description}
                        onChange={(event) => onIndicatorGroupChange(group.id, { description: event.target.value })}
                        rows={2}
                        className="w-full rounded-md border bg-background px-3 py-2 text-xs"
                        placeholder="补充该分组的执行说明"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => onDeleteIndicatorGroup(group.id)}
                      className="rounded-md border border-red-200 px-2 py-1 text-[10px] text-red-600 hover:bg-red-50"
                    >
                      删除
                    </button>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    已关联 {group.indicatorColumns.length} 个指标
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {group.indicatorColumns.length > 0 ? (
                      group.indicatorColumns.map((columnName) => (
                        <span
                          key={columnName}
                          className={cn(
                            "rounded-full border px-2 py-1 text-[11px]",
                            groupToneClass(group.id, userDefinedIndicatorGroups),
                          )}
                        >
                          {findIndicatorColumnLabel(indicatorColumns, columnName)}
                        </span>
                      ))
                    ) : (
                      <span className="text-[11px] text-muted-foreground">该分组还没有分配指标。</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
