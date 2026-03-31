"use client";

import { useState, useEffect } from "react";
import { Check, X, Database, Search } from "lucide-react";
import { KnowledgeBase } from "@/lib/types";
import { cn } from "@/lib/utils";

interface KnowledgeBaseSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  allKnowledgeBases: KnowledgeBase[];
  linkedIds: string[];
  onSave: (ids: string[]) => void;
}

export default function KnowledgeBaseSelectorModal({ isOpen, onClose, allKnowledgeBases, linkedIds, onSave }: KnowledgeBaseSelectorModalProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (isOpen) {
      setSelectedIds(linkedIds);
      setSearchTerm("");
    }
  }, [isOpen, linkedIds]);

  if (!isOpen) return null;

  const toggleId = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(i => i !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const filteredKBs = allKnowledgeBases.filter(kb => 
    kb.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    kb.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-background w-full max-w-lg rounded-xl shadow-xl flex flex-col overflow-hidden border animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-4 border-b bg-muted/20">
          <div className="flex items-center gap-2">
             <Database className="h-5 w-5 text-primary" />
             <h2 className="text-lg font-semibold">关联知识库</h2>
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
              placeholder="搜索知识库..."
              className="w-full pl-9 pr-4 py-2 text-sm border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {filteredKBs.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">无匹配的知识库</div>
          ) : (
            <div className="space-y-1">
              {filteredKBs.map(kb => {
                const isSelected = selectedIds.includes(kb.id);
                return (
                  <div 
                    key={kb.id}
                    onClick={() => toggleId(kb.id)}
                    className={cn(
                      "flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors border",
                      isSelected 
                        ? "bg-primary/5 border-primary/30" 
                        : "bg-transparent border-transparent hover:bg-muted"
                    )}
                  >
                    <div className={cn(
                      "mt-0.5 h-5 w-5 shrink-0 rounded border flex items-center justify-center transition-colors",
                      isSelected ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground"
                    )}>
                      {isSelected && <Check className="h-3.5 w-3.5" />}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-sm text-foreground">{kb.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{kb.description}</div>
                      <div className="text-[10px] text-muted-foreground mt-1.5 flex gap-2">
                        <span>{kb.documentCount} 文档</span>
                        <span>•</span>
                        <span>{new Date(kb.lastUpdated).toLocaleDateString()} 更新</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-4 border-t bg-muted/10 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium hover:bg-muted rounded-md text-muted-foreground hover:text-foreground">
            取消
          </button>
          <button 
            onClick={() => { onSave(selectedIds); onClose(); }}
            className="px-6 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md shadow-sm hover:bg-primary/90"
          >
            确认 ({selectedIds.length})
          </button>
        </div>
      </div>
    </div>
  );
}
