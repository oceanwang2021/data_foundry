"use client";

import { useState, useEffect, useMemo } from "react";
import { Check, X, Table as TableIcon, Search } from "lucide-react";
import type { WideTable } from "@/lib/types";
import { cn } from "@/lib/utils";

interface SchemaSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  templates: WideTable[];
  currentTemplateId?: string;
  onSelect: (template: WideTable) => void;
}

function buildMeta(template: WideTable): string {
  const desc = template.description?.trim();
  return desc ? `${desc} · ${template.id}` : template.id;
}

export default function SchemaSelectorModal({
  isOpen,
  onClose,
  templates,
  currentTemplateId,
  onSelect,
}: SchemaSelectorModalProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (isOpen) {
      setSelectedId(currentTemplateId ?? null);
      setSearchTerm("");
    }
  }, [isOpen, currentTemplateId]);

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return templates;
    const kw = searchTerm.trim().toLowerCase();
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(kw) ||
        (t.description ?? "").toLowerCase().includes(kw) ||
        t.id.toLowerCase().includes(kw),
    );
  }, [searchTerm, templates]);

  if (!isOpen) return null;

  const selectedTemplate = templates.find((t) => t.id === selectedId);

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
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">无匹配的 Schema</div>
          ) : (
            <div className="space-y-1">
              {filtered.map((t) => {
                const isSelected = selectedId === t.id;
                return (
                  <div
                    key={t.id}
                    onClick={() => setSelectedId(t.id)}
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
                      <div className="font-medium text-sm text-foreground">{t.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{buildMeta(t)}</div>
                      <div className="text-[10px] text-muted-foreground mt-1.5 flex gap-2">
                        <span>{t.schema.columns.length} 字段</span>
                        <span>·</span>
                        <span>{t.status}</span>
                      </div>
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
              if (selectedTemplate) {
                onSelect(selectedTemplate);
                onClose();
              }
            }}
            disabled={!selectedTemplate}
            className={cn(
              "px-6 py-2 text-sm font-medium rounded-md shadow-sm",
              selectedTemplate
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
