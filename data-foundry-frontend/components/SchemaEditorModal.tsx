"use client";

import { useState, useEffect } from "react";
import { Sparkles, Send, Plus, X, Trash2, Loader2, Table as TableIcon, Edit2, Check, ArrowDown, Download, Upload } from "lucide-react";
import { ColumnDefinition, WideTableSchema, ColumnCategory } from "@/lib/types";
import { cn } from "@/lib/utils";

interface SchemaEditorModalProps {
  projectId: string;
  initialName?: string;
  initialSchema?: WideTableSchema | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string, schema: WideTableSchema) => void;
}

export default function SchemaEditorModal({ projectId, initialName, initialSchema, isOpen, onClose, onSave }: SchemaEditorModalProps) {
  const [schemaName, setSchemaName] = useState("");
  const [columns, setColumns] = useState<ColumnDefinition[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [chatHistory, setChatHistory] = useState<{role: 'user'|'ai', content: string}[]>([]);
  
  // Manual Editing State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<ColumnDefinition>>({});

  useEffect(() => {
    if (isOpen) {
      setSchemaName(initialName || "");
      
      const defaultSystemFields: ColumnDefinition[] = [
        { id: "SYS_BIZ_DATE", name: "SYS_BIZ_DATE", type: "DATE", category: "system", description: "业务归属时间", required: true },
        { id: "SYS_SCHEDULE_DATE", name: "SYS_SCHEDULE_DATE", type: "DATE", category: "system", description: "调度日期", required: true },
      ];

      setColumns(initialSchema?.columns || defaultSystemFields);
      
      // Context-aware greeting
      let greeting = '您好！请告诉我您想创建什么样的表结构？';
      if (projectId === 'p2') { // Auto Driving
        greeting = '您好！我是智能驾驶数据助手。我可以帮您创建如“车型配置表”、“月度销量表”或“智驾功能渗透率表”。';
      } else if (projectId === 'p3') { // Pharma
        greeting = '您好！我是医药数据助手。我可以帮您创建“临床试验结果表”、“药品获批进度表”或“不良反应统计表”。';
      }
      
      setChatHistory(initialSchema ? [] : [{ role: 'ai', content: greeting }]);
      setEditingId(null);
    }
  }, [isOpen, initialSchema, projectId]);

  if (!isOpen) return null;

  const handleSendChat = () => {
    if (!chatInput.trim()) return;
    const userMsg = chatInput;
    setChatInput("");
    setChatHistory(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsProcessing(true);

    setTimeout(() => {
      let newCols = [...columns];
      let reply = "已更新表结构。";
      let suggestedName = "";

      // --- Mock Logic: Domain Specific ---
      
      // 1. Auto Driving Domain
      if (userMsg.includes("销量") || userMsg.includes("交付")) {
        suggestedName = "AUTO_SALES_MONTHLY";
        newCols = [
          { id: "c1", name: "BRAND", type: "STRING", category: "dimension", description: "品牌", required: true },
          { id: "c2", name: "MODEL", type: "STRING", category: "dimension", description: "车型", required: true },
          { id: "c3", name: "MONTH", type: "STRING", category: "dimension", description: "月份", required: true },
          { id: "c4", name: "SALES_VOLUME", type: "NUMBER", category: "indicator", description: "销量/交付量 (辆)", required: true },
          { id: "c5", name: "YOY_GROWTH", type: "STRING", category: "indicator", description: "同比增速", required: false },
        ];
        reply = "已为您生成“月度销量表”模板，包含品牌、车型、月份及销量指标。";
      } 
      else if (userMsg.includes("配置") || userMsg.includes("参数") || userMsg.includes("雷达")) {
        suggestedName = "VEHICLE_SPECS_SHEET";
        newCols = [
          { id: "c1", name: "MODEL_VARIANT", type: "STRING", category: "dimension", description: "车型版本", required: true },
          { id: "c2", name: "PRICE", type: "NUMBER", category: "indicator", description: "指导价 (万元)", required: true },
          { id: "c3", name: "LIDAR_COUNT", type: "NUMBER", category: "indicator", description: "激光雷达数量", required: false },
          { id: "c4", name: "CHIP_PLATFORM", type: "STRING", category: "indicator", description: "智驾芯片平台", required: false },
          { id: "c5", name: "NOA_CAPABILITY", type: "STRING", category: "indicator", description: "NOA功能 (城市/高速)", required: false },
        ];
        reply = "已生成“车型配置表”，重点覆盖了价格、雷达数量及智驾芯片信息。";
      }
      
      // 2. Pharma Domain
      else if (userMsg.includes("临床") || userMsg.includes("试验")) {
        suggestedName = "DRUG_CLINICAL_RESULTS";
        newCols = [
          { id: "c1", name: "DRUG_CODE", type: "STRING", category: "dimension", description: "药物代码", required: true },
          { id: "c2", name: "TRIAL_ID", type: "STRING", category: "dimension", description: "NCT登记号", required: true },
          { id: "c3", name: "PHASE", type: "STRING", category: "dimension", description: "临床阶段", required: true },
          { id: "c4", name: "ORR", type: "STRING", category: "indicator", description: "客观缓解率", required: false },
          { id: "c5", name: "MPFS", type: "NUMBER", category: "indicator", description: "中位无进展生存期", required: false },
          { id: "c6", name: "OS_HAZARD_RATIO", type: "NUMBER", category: "indicator", description: "OS风险比", required: false },
        ];
        reply = "已生成“临床试验结果表”，包含NCT号、阶段及核心肿瘤疗效指标(ORR/PFS/OS)。";
      }
      else if (userMsg.includes("不良") || userMsg.includes("安全") || userMsg.includes("副作用")) {
        // Append to existing or create new
        if (newCols.length > 0) {
           newCols.push(
             { id: `c_${Date.now()}_1`, name: "TEAE_ANY_GRADE", type: "STRING", category: "indicator", description: "任意级别不良反应率", required: false },
             { id: `c_${Date.now()}_2`, name: "TEAE_GRADE3_PLUS", type: "STRING", category: "indicator", description: "3级及以上不良反应率", required: false }
           );
           reply = "已补充安全性指标：任意级别及3级以上TEAE发生率。";
        } else {
           suggestedName = "DRUG_SAFETY_PROFILE";
           newCols = [
             { id: "c1", name: "DRUG_NAME", type: "STRING", category: "dimension", description: "药物名称", required: true },
             { id: "c2", name: "INDICATION", type: "STRING", category: "dimension", description: "适应症", required: true },
             { id: "c3", name: "SAFETY_POPULATION_N", type: "NUMBER", category: "indicator", description: "安全集样本量", required: false },
             { id: "c4", name: "SERIOUS_AE_RATE", type: "STRING", category: "indicator", description: "严重不良事件发生率", required: false },
           ];
           reply = "已生成“药物安全性表”，重点关注SAE及样本量。";
        }
      } 
      
      // 3. Generic Operations
      else if (userMsg.includes("删") || userMsg.includes("移除")) {
        if (newCols.length > 0) {
           const removed = newCols.pop(); // Remove last logical col (before system fields usually)
           reply = `已移除字段 "${removed?.name}"。`;
        } else {
           reply = "当前没有可移除的字段。";
        }
      } else {
        newCols.push({ id: `c_${Date.now()}`, name: "NEW_FIELD", type: "STRING", category: "indicator", description: "新字段", required: false });
        reply = "已添加一个通用字段，请在右侧手动调整名称。建议您使用具体指令，如“创建销量表”。";
      }
      
      // Update Name if empty or suggested
      if (!schemaName && suggestedName) {
        setSchemaName(suggestedName);
      }

      // Always ensure system fields exist and are at the end
      // Remove existing system fields first to re-append at bottom
      newCols = newCols.filter(c => c.category !== "system");
      newCols.push(
        { id: "SYS_BIZ_DATE", name: "SYS_BIZ_DATE", type: "DATE", category: "system", description: "业务归属时间", required: true },
        { id: "SYS_SCHEDULE_DATE", name: "SYS_SCHEDULE_DATE", type: "DATE", category: "system", description: "调度日期", required: true },
      );

      setColumns(newCols);
      setChatHistory(prev => [...prev, { role: 'ai', content: reply }]);
      setIsProcessing(false);
    }, 1000);
  };

  const startEdit = (col: ColumnDefinition) => {
    if (col.category === "system") return;
    setEditingId(col.id);
    setEditForm({ ...col });
  };

  const saveEdit = () => {
    setColumns(prev => prev.map(c => c.id === editingId ? (editForm as ColumnDefinition) : c));
    setEditingId(null);
  };

  const addNewField = () => {
    const newId = `c_${Date.now()}`;
    const newCol: ColumnDefinition = { id: newId, name: "NEW_FIELD", type: "STRING", category: "indicator", description: "描述", required: false };
    setColumns(prev => {
      // Insert before system fields
      const sysIdx = prev.findIndex(c => c.category === "system");
      if (sysIdx === -1) return [...prev, newCol];
      const next = [...prev];
      next.splice(sysIdx, 0, newCol);
      return next;
    });
    startEdit(newCol);
  };

  const handleSave = () => {
    onSave(schemaName || "未命名表", { columns });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-background w-full max-w-5xl h-[85vh] rounded-xl shadow-2xl flex flex-col overflow-hidden border">
        <div className="flex items-center justify-between px-6 py-4 border-b bg-muted/20">
          <div className="flex items-center gap-2">
             <div className="p-2 bg-primary/10 rounded-md text-primary"><TableIcon className="h-5 w-5" /></div>
             <div><h2 className="text-lg font-semibold">{initialSchema ? "编辑表结构" : "新建表结构"}</h2></div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-full"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <div className="w-1/3 border-r flex flex-col bg-muted/5">
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {chatHistory.map((msg, idx) => (
                <div key={idx} className={cn("flex", msg.role === 'user' ? "justify-end" : "justify-start")}>
                  <div className={cn("max-w-[90%] rounded-lg p-3 text-sm", msg.role === 'user' ? "bg-primary text-primary-foreground" : "bg-card border shadow-sm")}>
                    {msg.content}
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 border-t bg-background">
              <div className="relative">
                <textarea 
                  value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                  placeholder="用自然语言描述来修改..." 
                  className="w-full h-24 p-3 pr-10 rounded-md border text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button onClick={handleSendChat} className="absolute right-2 bottom-2 p-1.5 bg-primary text-primary-foreground rounded-md"><Send className="h-4 w-4" /></button>
              </div>
            </div>
          </div>

          <div className="w-2/3 flex flex-col bg-background">
            <div className="p-4 border-b bg-muted/5">
              <label className="text-xs font-medium text-muted-foreground uppercase">表名称</label>
              <input value={schemaName} onChange={(e) => setSchemaName(e.target.value)} className="w-full mt-1 font-mono text-sm bg-transparent border-b border-input focus:border-primary focus:outline-none" />
            </div>

            <div className="flex-1 overflow-auto">
              <table className="w-full text-sm text-left border-collapse">
                <thead className="bg-muted/50 text-muted-foreground sticky top-0 z-10">
                  <tr>
                    <th className="p-3 pl-6 font-medium">字段名 / 描述</th>
                    <th className="p-3 font-medium">类型</th>
                    <th className="p-3 font-medium">分类</th>
                    <th className="p-3 text-right pr-6">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {columns.map((col) => (
                    <tr key={col.id} className={cn("group transition-colors", editingId === col.id ? "bg-primary/5" : "hover:bg-muted/30")}>
                      <td className="p-3 pl-6">
                        {editingId === col.id ? (
                          <div className="space-y-2">
                            <input value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} className="w-full p-1 border rounded font-mono text-xs" />
                            <input value={editForm.description} onChange={e => setEditForm({...editForm, description: e.target.value})} className="w-full p-1 border rounded text-xs" placeholder="字段描述" />
                          </div>
                        ) : (
                          <div>
                            <div className="font-mono text-xs font-semibold">{col.name}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">{col.description}</div>
                          </div>
                        )}
                      </td>
                      <td className="p-3 align-top">
                        {editingId === col.id ? (
                          <select value={editForm.type} onChange={e => setEditForm({...editForm, type: e.target.value as any})} className="p-1 border rounded text-xs">
                            <option value="STRING">STRING</option>
                            <option value="NUMBER">NUMBER</option>
                            <option value="DATE">DATE</option>
                          </select>
                        ) : (
                          <span className="text-xs font-mono text-muted-foreground">{col.type}</span>
                        )}
                      </td>
                      <td className="p-3 align-top">
                        {editingId === col.id ? (
                          <select value={editForm.category} onChange={e => setEditForm({...editForm, category: e.target.value as ColumnCategory})} className="p-1 border rounded text-xs">
                            <option value="id">ID</option>
                            <option value="dimension">维度</option>
                            <option value="indicator">指标</option>
                            <option value="system">系统</option>
                          </select>
                        ) : (
                          <span className={cn(
                            "text-xs px-1.5 py-0.5 rounded border",
                            col.category === "system"
                              ? "bg-gray-100 text-gray-600"
                              : col.category === "indicator"
                              ? "bg-blue-50 text-blue-700 border-blue-100"
                              : col.category === "dimension"
                              ? "bg-purple-50 text-purple-700 border-purple-100"
                              : "bg-gray-50 text-gray-600",
                          )}>
                            {col.category === "system" ? "系统" : col.category === "indicator" ? "指标" : col.category === "dimension" ? "维度" : "ID"}
                          </span>
                        )}
                      </td>
                      <td className="p-3 pr-6 text-right align-top">
                        <div className="flex justify-end gap-2">
                          {editingId === col.id ? (
                            <button onClick={saveEdit} className="p-1.5 bg-green-600 text-white rounded-md"><Check className="h-3.5 w-3.5" /></button>
                          ) : col.category !== "system" && (
                            <>
                              <button onClick={() => startEdit(col)} className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md"><Edit2 className="h-3.5 w-3.5" /></button>
                              <button onClick={() => setColumns(columns.filter(c => c.id !== col.id))} className="p-1.5 text-muted-foreground hover:text-red-600 hover:bg-red-50 rounded-md"><Trash2 className="h-3.5 w-3.5" /></button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button 
                onClick={addNewField}
                className="w-full py-4 flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors border-t border-dashed"
              >
                <Plus className="h-4 w-4" /> 手动添加字段
              </button>
            </div>

            <div className="p-4 border-t bg-muted/10 flex justify-end gap-3">
              <button onClick={onClose} className="px-4 py-2 text-sm font-medium border bg-background rounded-md">取消</button>
              <button onClick={handleSave} className="px-6 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md shadow-sm">保存修改</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
