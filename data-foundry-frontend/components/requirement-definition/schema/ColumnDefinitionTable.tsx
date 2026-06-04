"use client";

import type { ColumnDefinition } from "@/lib/types";
import ColumnDefinitionRow from "@/components/requirement-definition/schema/ColumnDefinitionRow";

type Props = {
  columns: ColumnDefinition[];
  editable: boolean;
  onColumnMetadataChange: (columnId: string, patch: Partial<ColumnDefinition>) => void;
};

export default function ColumnDefinitionTable({
  columns,
  editable,
  onColumnMetadataChange,
}: Props) {
  return (
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
          {columns.map((column) => (
            <ColumnDefinitionRow
              key={column.id}
              column={column}
              editable={editable}
              onColumnMetadataChange={onColumnMetadataChange}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
