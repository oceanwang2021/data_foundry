"use client";

import React, { useState } from "react";
// 本组件用到的数据类型（UI 展示层独立定义，不依赖核心数据模型）
import type { WideTableSchema, ColumnDefinition } from "@/lib/types";

type TableSchema = WideTableSchema;
type DataRow = Record<string, any> & {
  id: string;
  _metadata?: {
    highlight?: boolean;
    auditChanged?: boolean;
    historyDiff?: boolean;
    confidence?: number;
  };
};
type DataVersion = { rows: DataRow[] };
import { AlertCircle, History, Save, Edit2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface DataTableProps {
  schema: TableSchema;
  data: DataVersion;
  isEditable?: boolean; // 新增：是否可编辑
  onSaveRow?: (rowId: string, newData: Partial<DataRow>) => void;
}

export default function DataTable({ schema, data, isEditable, onSaveRow }: DataTableProps) {
  const displayColumns = schema.columns;
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  
  // 本地临时存储编辑中的行数据
  const [editBuffer, setEditBuffer] = useState<Record<string, any>>({});

  const toggleRow = (id: string) => {
    setExpandedRowId(expandedRowId === id ? null : id);
  };

  const handleCellChange = (rowId: string, colName: string, value: any) => {
    setEditBuffer(prev => ({
      ...prev,
      [`${rowId}-${colName}`]: value
    }));
  };

  return (
    <div className="rounded-md border bg-card shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-muted/50 text-muted-foreground font-medium border-b">
            <tr>
              <th className="h-10 px-4 w-10"></th>
              {displayColumns.map((col) => (
                <th key={col.id} className="h-14 px-4 whitespace-nowrap align-middle">
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-1 font-semibold text-foreground/90 text-xs">
                      {col.name}
                      {col.category === "indicator" && <span className="h-1.5 w-1.5 rounded-full bg-blue-500" title="指标" />}
                    </div>
                    <span className="text-[10px] text-muted-foreground font-normal">{col.description}</span>
                  </div>
                </th>
              ))}
              <th className="h-10 px-4 w-24">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {data.rows.map((row) => {
               const isExpanded = expandedRowId === row.id;
               return (
                <React.Fragment key={row.id}>
                  <tr 
                    className={cn(
                      "hover:bg-muted/30 transition-colors cursor-pointer", 
                      isExpanded && "bg-muted/30"
                    )}
                    onClick={() => toggleRow(row.id)}
                  >
                    <td className="px-4 text-center">
                      <div className={cn("transition-transform duration-200 text-[10px]", isExpanded && "rotate-90")}>
                        ▶
                      </div>
                    </td>
                    {displayColumns.map((col) => {
                      const colKey = `${row.id}-${col.name}`;
                      const value = editBuffer[colKey] !== undefined ? editBuffer[colKey] : row[col.name];
                      const isHighlighted = row._metadata?.highlight && col.category === "indicator";

                      return (
                        <td 
                          key={col.id} 
                          className={cn(
                            "p-4 whitespace-nowrap relative group/cell",
                            row._metadata?.highlight && col.category === "indicator" && "bg-yellow-50/50",
                            row._metadata?.auditChanged && col.category === "indicator" && "bg-red-50 text-red-900", 
                            row._metadata?.historyDiff && col.category === "indicator" && !row._metadata?.auditChanged && "text-orange-600 font-medium"
                          )}
                          onClick={(e) => isEditable && col.category === "indicator" && e.stopPropagation()} // 防止点击输入框触发折叠
                        >
                          {isEditable && col.category === "indicator" ? (
                            <input 
                              type={col.type === 'NUMBER' ? 'number' : 'text'}
                              value={value || ""}
                              onChange={(e) => handleCellChange(row.id, col.name, e.target.value)}
                              placeholder="录入指标..."
                              className="w-full bg-transparent border-b border-dashed border-primary/30 focus:border-primary focus:outline-none focus:bg-white px-1 py-0.5"
                            />
                          ) : (
                            value === null || value === undefined ? (
                              col.category === "indicator" ? (
                                 <span className="text-muted-foreground/40 italic text-xs flex items-center gap-1.5 font-normal">
                                   <span className="h-1 w-1 rounded-full bg-muted-foreground/30 animate-pulse" />
                                   待采集
                                 </span>
                              ) : (
                                 <span className="text-muted-foreground italic">-</span>
                              )
                            ) : (
                              <div className="flex items-center gap-1.5">
                                {String(value)}
                                {row._metadata?.historyDiff && col.category === "indicator" && (
                                  <History className="h-3 w-3 text-orange-400" />
                                )}
                                {row._metadata?.auditChanged && col.category === "indicator" && (
                                  <AlertCircle className="h-3 w-3 text-red-500" />
                                )}
                              </div>
                            )
                          )}
                        </td>
                      );
                    })}
                    <td className="p-4" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-3">
                        {isEditable && (
                           <button className="text-primary hover:text-primary/80"><Save className="h-4 w-4" /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                  
                  {isExpanded && (
                    <tr className="bg-muted/10">
                      <td colSpan={displayColumns.length + 2} className="p-0 border-b">
                         <div className="p-6 shadow-inner space-y-3">
                            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              行状态
                            </div>
                            <div className="grid grid-cols-2 gap-4 text-sm">
                              <div className="rounded-md border bg-background p-4">
                                <div className="text-xs text-muted-foreground">宽表说明</div>
                                <div className="mt-2 text-foreground/80">
                                  宽表只保留结构化结果，不承载指标级来源链接、摘录或发布时间等元数据。
                                </div>
                              </div>
                              <div className="rounded-md border bg-background p-4">
                                <div className="text-xs text-muted-foreground">当前行置信度</div>
                                <div className={cn("mt-2 font-medium", (row._metadata?.confidence || 0) > 0.9 ? "text-green-600" : "text-yellow-600")}>
                                  {row._metadata?.confidence ? `${(row._metadata.confidence * 100).toFixed(0)}%` : "人工确认(100%)"}
                                </div>
                              </div>
                            </div>
                         </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="bg-muted/20 px-4 py-2 text-xs text-muted-foreground border-t flex justify-between">
        <span>共 {data.rows.length} 条数据</span>
        {isEditable && (
          <div className="text-primary font-medium flex items-center gap-1 animate-pulse">
            <Edit2 className="h-3 w-3" /> 人工录入模式开启
          </div>
        )}
      </div>
    </div>
  );
}
