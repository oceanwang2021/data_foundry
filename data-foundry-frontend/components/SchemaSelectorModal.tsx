"use client";

import { useState, useEffect, useMemo } from "react";
import { Check, X, Table as TableIcon, Search } from "lucide-react";
import { listTargetTables } from "@/lib/api-client";
import type { TargetTableSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

interface SchemaSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTableName?: string;
  onSelect: (table: TargetTableSummary) => void;
}

function buildMeta(table: TargetTableSummary): string {
  const desc = table.tableComment?.trim();
  return desc ? `${desc} · ${table.tableName}` : table.tableName;
}

export default function SchemaSelectorModal({
  isOpen,
  onClose,
  currentTableName,
  onSelect,
}: SchemaSelectorModalProps) {
  const [tables, setTables] = useState<TargetTableSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (isOpen) {
      setSelectedName(currentTableName ?? null);
      setSearchTerm("");
      setLoadError(null);
      setLoading(true);
      listTargetTables()
        .then((data) => setTables(data ?? []))
        .catch((err) => setLoadError(err instanceof Error ? err.message : String(err)))
        .finally(() => setLoading(false));
    }
  }, [isOpen, currentTableName]);

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return tables;
    const kw = searchTerm.trim().toLowerCase();
    return tables.filter(
      (t) =>
        (t.tableName ?? "").toLowerCase().includes(kw) ||
        (t.tableComment ?? "").toLowerCase().includes(kw),
    );
  }, [searchTerm, tables]);

  if (!isOpen) return null;

  const selectedTable = tables.find((t) => t.tableName === selectedName);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-background w-full max-w-lg rounded-xl shadow-xl flex flex-col overflow-hidden border animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-4 border-b bg-muted/20">
          <div className="flex items-center gap-2">
            <TableIcon className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">关联 Schema</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-full text-muted-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 border-b bg-background">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="搜索 Schema（表名、说明或 ID）..."
              className="w-full pl-9 pr-4 py-2 text-sm border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 max-h-[50vh]">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Loading...</div>
          ) : loadError ? (
            <div className="p-8 text-center text-destructive text-sm">{loadError}</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">无匹配的 Schema</div>
          ) : (
            <div className="space-y-1">
              {filtered.map((t) => {
                const isSelected = selectedName === t.tableName;
                return (
                  <div
                    key={t.tableName}
                    onClick={() => setSelectedName(t.tableName)}
                    className={cn(
                      "flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors border",
                      isSelected
                        ? "bg-primary/5 border-primary/30"
                        : "bg-transparent border-transparent hover:bg-muted",
                    )}
                  >
                    <div
                      className={cn(
                        "mt-0.5 h-5 w-5 shrink-0 rounded-full border flex items-center justify-center transition-colors",
                        isSelected ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground",
                      )}
                    >
                      {isSelected && <Check className="h-3.5 w-3.5" />}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-sm text-foreground">{t.tableName}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{buildMeta(t)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-4 border-t bg-muted/10 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium hover:bg-muted rounded-md text-muted-foreground hover:text-foreground"
          >
            取消
          </button>
          <button
            onClick={() => {
              if (selectedTable) {
                onSelect(selectedTable);
                onClose();
              }
            }}
            disabled={!selectedTable}
            className={cn(
              "px-6 py-2 text-sm font-medium rounded-md shadow-sm",
              selectedTable
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-muted text-muted-foreground cursor-not-allowed",
            )}
          >
            确认关联
          </button>
        </div>
      </div>
    </div>
  );
}
