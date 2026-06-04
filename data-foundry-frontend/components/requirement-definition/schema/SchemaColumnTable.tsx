"use client";

import type { ReactNode } from "react";

export function SchemaColumnTable({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="border-b bg-muted/40">
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
        <tbody className="divide-y">{children}</tbody>
      </table>
    </div>
  );
}
