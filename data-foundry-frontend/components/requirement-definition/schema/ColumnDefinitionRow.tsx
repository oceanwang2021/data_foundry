"use client";

import type { ColumnDefinition } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  categorySelectClass,
  formatPassthroughDisplay,
  normalizeCategoryForUI,
} from "@/components/requirement-definition/utils/requirementDefinitionFormatters";
import ColumnCategoryBadge from "@/components/requirement-definition/schema/ColumnCategoryBadge";
import AuditRuleEditor from "@/components/requirement-definition/schema/AuditRuleEditor";

type Props = {
  column: ColumnDefinition;
  editable: boolean;
  onColumnMetadataChange: (columnId: string, patch: Partial<ColumnDefinition>) => void;
};

export default function ColumnDefinitionRow({
  column,
  editable,
  onColumnMetadataChange,
}: Props) {
  return (
    <tr
      className={cn(normalizeCategoryForUI(column.category) === "system" ? "text-muted-foreground" : "")}
    >
      <td className="px-2 py-1.5 font-mono">{column.name}</td>
      <td className="px-2 py-1.5">
        {editable ? (
          <input
            value={column.chineseName ?? ""}
            onChange={(event) => onColumnMetadataChange(column.id, { chineseName: event.target.value })}
            className="w-full rounded-md border bg-background px-2 py-1 text-xs"
            placeholder="中文名"
          />
        ) : (
          column.chineseName ?? "-"
        )}
      </td>
      <td className="px-2 py-1.5">{column.type}</td>
      <td className="px-2 py-1.5">
        {editable ? (
          <select
            value={column.isBusinessDate ? "time" : normalizeCategoryForUI(column.category)}
            onChange={(event) => {
              const nextValue = event.target.value;
              if (nextValue === "time") {
                onColumnMetadataChange(column.id, {
                  category: "dimension",
                  isBusinessDate: true,
                  type: "DATE",
                });
                return;
              }
              if (nextValue === "dimension") {
                onColumnMetadataChange(column.id, {
                  category: "dimension",
                  isBusinessDate: false,
                });
                return;
              }
              onColumnMetadataChange(column.id, {
                category: nextValue as ColumnDefinition["category"],
                isBusinessDate: false,
              });
            }}
            className={cn(
              "w-full rounded-md border px-2 py-1 text-xs",
              categorySelectClass(column.isBusinessDate ? "time" : normalizeCategoryForUI(column.category)),
            )}
          >
            <option value="id">ID列</option>
            <option value="time">时间列</option>
            <option value="system">系统列</option>
            <option value="dimension">维度列</option>
            <option value="indicator">指标列</option>
          </select>
        ) : (
          <ColumnCategoryBadge category={column.category} isBusinessDate={column.isBusinessDate} />
        )}
      </td>
      <td className="px-2 py-1.5 text-muted-foreground">
        {editable ? (
          <input
            value={column.description}
            onChange={(event) => onColumnMetadataChange(column.id, { description: event.target.value })}
            className="w-full rounded-md border bg-background px-2 py-1 text-xs"
            placeholder="字段说明"
          />
        ) : (
          column.description
        )}
      </td>
      <td className="px-2 py-1.5 text-muted-foreground">
        {column.category === "indicator" && editable ? (
          <input
            value={column.unit ?? ""}
            onChange={(event) => onColumnMetadataChange(column.id, { unit: event.target.value })}
            className="w-full rounded-md border bg-background px-2 py-1 text-xs"
            placeholder="单位"
          />
        ) : (
          column.unit ?? "-"
        )}
      </td>
      <td className="px-2 py-1.5">
        <span>{column.required ? "是" : "否"}</span>
      </td>
      <td className="px-2 py-1.5 align-top">
        {editable ? (
          <div className="space-y-1.5">
            <select
              value={column.passthroughEnabled ? "yes" : "no"}
              onChange={(event) => {
                const enabled = event.target.value === "yes";
                onColumnMetadataChange(column.id, {
                  passthroughEnabled: enabled,
                  passthroughContent: enabled ? (column.passthroughContent ?? "") : "",
                });
              }}
              className="w-full rounded-md border bg-background px-2 py-1 text-xs"
            >
              <option value="no">否</option>
              <option value="yes">是</option>
            </select>
            {column.passthroughEnabled ? (
              <input
                value={column.passthroughContent ?? ""}
                onChange={(event) =>
                  onColumnMetadataChange(column.id, { passthroughContent: event.target.value })
                }
                className="w-full rounded-md border bg-background px-2 py-1 text-xs"
                placeholder="填写透传内容"
              />
            ) : null}
          </div>
        ) : (
          <span>{formatPassthroughDisplay(column)}</span>
        )}
      </td>
      <td className="px-2 py-1.5 align-top">
        <AuditRuleEditor
          column={column}
          editable={editable}
          onChange={(patch) => onColumnMetadataChange(column.id, patch)}
        />
      </td>
    </tr>
  );
}
