"use client";

import { useEffect, useMemo, useState } from "react";
import type { PreprocessRule } from "@/lib/domain";
import { fetchPreprocessRules, fetchAuditRules } from "@/lib/api-client";
import { CheckCircle2, FileCog, PlusCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type DataRow = {
  id: string;
  businessDate: string;
  company: string;
  indicator: string;
  value: string;
  unit: string;
  source: string;
  note: string;
};

const categoryLabel: Record<PreprocessRule["category"], string> = {
  format_fix: "格式修复",
  null_fix: "空值修复",
  unit_convert: "单位换算",
  derived: "衍生计算",
};

const rigourLabel: Record<"low" | "high", string> = {
  low: "低",
  high: "高",
};

const initialMeta = {
  requirementId: "REQ-2026-001",
  taskId: "TASK-DEMO-001",
  subTaskId: "RT-DEMO-001",
  collectedAt: "2026-03-04 10:25",
  collector: "算法-陈飞",
  dataName: "autodrive_snapshot_2026-02-28.xlsx",
};

const rawDataRows: DataRow[] = [
  {
    id: "ROW-001",
    businessDate: "2026/02/28",
    company: "滴滴全球",
    indicator: "订单数量",
    value: "45.2万单",
    unit: "万单",
    source: "https://www.didiglobal.com/",
    note: "快照值带单位后缀",
  },
  {
    id: "ROW-002",
    businessDate: "2026/02/28",
    company: "小马智行",
    indicator: "车队数量",
    value: "1,159",
    unit: "辆",
    source: "https://pony.ai/",
    note: "数字含千分位",
  },
  {
    id: "ROW-003",
    businessDate: "2026/02/28",
    company: "曹操出行",
    indicator: "运营里程",
    value: "N/A",
    unit: "万公里",
    source: "https://www.caocao.com/",
    note: "空值语义不统一",
  },
];

function normalizeDate(value: string): string {
  return value.replaceAll("/", "-");
}

function preprocessValue(value: string): { value: string; note: string } {
  if (value === "N/A" || value === "未披露") {
    return { value: "NULL", note: "空值标准化 -> NULL" };
  }
  if (value.includes(",")) {
    return { value: value.replaceAll(",", ""), note: "去除千分位分隔符" };
  }
  if (value.endsWith("%")) {
    const parsed = Number(value.replace("%", ""));
    if (Number.isFinite(parsed)) {
      return {
        value: (parsed / 100).toFixed(4),
        note: "百分率转换为小数",
      };
    }
  }
  return { value, note: "无需修复" };
}

function runPreprocess(rows: DataRow[]): DataRow[] {
  return rows.map((row) => {
    const normalized = preprocessValue(row.value);
    return {
      ...row,
      businessDate: normalizeDate(row.businessDate),
      value: normalized.value,
      note: normalized.note,
    };
  });
}

export default function PreprocessingPage() {
  const [rules, setRules] = useState<PreprocessRule[]>([]);
  const [auditRules, setAuditRules] = useState<Array<{ id: string; name: string; mode: string; scenarioRigour: "low" | "high"; condition: string; action: string; enabled: boolean }>>([]);

  useEffect(() => {
    fetchPreprocessRules()
      .then(setRules)
      .catch(() => {});
    fetchAuditRules()
      .then((items) => setAuditRules(items.map((item) => ({ ...item, enabled: true }))))
      .catch(() => {});
  }, []);
  const [newRuleName, setNewRuleName] = useState("");
  const [newRuleExpression, setNewRuleExpression] = useState("");
  const [newRuleCategory, setNewRuleCategory] = useState<PreprocessRule["category"]>("format_fix");
  const [newRuleSource, setNewRuleSource] = useState<PreprocessRule["source"]>("business");
  const [processedRows, setProcessedRows] = useState<DataRow[]>([]);
  const [targetTable, setTargetTable] = useState("ads_autodrive_ops");
  const [targetConfirmed, setTargetConfirmed] = useState(false);
  const [stored, setStored] = useState(false);
  const [message, setMessage] = useState("");

  const enabledRuleCount = useMemo(() => rules.filter((item) => item.enabled).length, [rules]);
  const enabledAuditCount = useMemo(
    () => auditRules.filter((item) => item.enabled).length,
    [auditRules],
  );

  const handleAddRule = () => {
    if (!newRuleName.trim() || !newRuleExpression.trim()) {
      setMessage("新建规则失败：规则名称和规则表达式必填。");
      return;
    }
    const nextRule: PreprocessRule = {
      id: `PR-LOCAL-${Date.now().toString(36).toUpperCase()}`,
      name: newRuleName.trim(),
      source: newRuleSource,
      enabled: true,
      category: newRuleCategory,
      expression: newRuleExpression.trim(),
      sampleIssue: "手动新增规则",
    };
    setRules((prev) => [nextRule, ...prev]);
    setNewRuleName("");
    setNewRuleExpression("");
    setMessage(`已新增规则：${nextRule.name}`);
  };

  const handleRunPreprocess = () => {
    const nextRows = runPreprocess(rawDataRows);
    setProcessedRows(nextRows);
    setTargetConfirmed(false);
    setStored(false);
    setMessage(`后处理完成：共处理 ${nextRows.length} 条数据。`);
  };

  const handleConfirmTarget = () => {
    if (processedRows.length === 0) {
      setMessage("请先执行后处理，再确认目标表。");
      return;
    }
    setTargetConfirmed(true);
    setStored(false);
    setMessage(`目标表已确认：${targetTable}`);
  };

  const handleStoreData = () => {
    if (!targetConfirmed) {
      setMessage("请先确认目标表后再执行数据落库。");
      return;
    }
    setStored(true);
    setMessage(`数据已落库：${targetTable}（${processedRows.length} 条）`);
  };

  return (
    <div className="p-8 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileCog className="h-5 w-5 text-primary" />
          数据后处理
        </h1>
        <p className="text-sm text-muted-foreground">
          独立环节：管理数据基础信息、后处理规则配置、稽核配置，并完成目标表确认与落库。
        </p>
      </header>

      {message ? <div className="text-xs text-primary">{message}</div> : null}

      <section className="rounded-xl border bg-card p-6 space-y-4">
        <h2 className="font-semibold">1. 数据基础信息</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <MetaCard title="需求ID" value={initialMeta.requirementId} />
          <MetaCard title="采集任务ID" value={initialMeta.taskId} />
          <MetaCard title="采集子任务ID" value={initialMeta.subTaskId} />
          <MetaCard title="采集时间" value={initialMeta.collectedAt} />
          <MetaCard title="采集人员" value={initialMeta.collector} />
          <MetaCard title="数据名称" value={initialMeta.dataName} />
        </div>
      </section>

      <section className="rounded-xl border bg-card p-6 space-y-4">
        <h2 className="font-semibold">2. 数据后处理配置</h2>

        <div className="rounded-lg border bg-muted/10 p-4 space-y-3">
          <div className="font-medium text-sm flex items-center gap-2">
            <PlusCircle className="h-4 w-4 text-primary" />
            新建规则
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <TextField label="规则名称" value={newRuleName} onChange={setNewRuleName} placeholder="例如：来源字段标准化" />
            <SelectField
              label="规则类型"
              value={newRuleCategory}
              onChange={(value) => setNewRuleCategory(value as PreprocessRule["category"])}
              options={[
                { value: "format_fix", label: "格式修复" },
                { value: "null_fix", label: "空值修复" },
                { value: "unit_convert", label: "单位换算" },
                { value: "derived", label: "衍生计算" },
              ]}
            />
            <SelectField
              label="规则来源"
              value={newRuleSource}
              onChange={(value) => setNewRuleSource(value as PreprocessRule["source"])}
              options={[
                { value: "business", label: "业务侧" },
                { value: "platform", label: "平台侧" },
              ]}
            />
            <TextField
              label="规则表达式"
              value={newRuleExpression}
              onChange={setNewRuleExpression}
              placeholder="例如：normalize(source)"
            />
          </div>
          <button
            type="button"
            onClick={handleAddRule}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
          >
            新建规则
          </button>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border bg-background p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">后处理规则配置</h3>
              <div className="text-xs text-muted-foreground">启用 {enabledRuleCount}/{rules.length}</div>
            </div>
            <div className="space-y-2">
              {rules.map((rule) => (
                <div key={rule.id} className="rounded border bg-muted/10 p-3 text-xs space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">{rule.name}</div>
                    <label className="inline-flex items-center gap-1 text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={rule.enabled}
                        onChange={(event) =>
                          setRules((prev) =>
                            prev.map((item) =>
                              item.id === rule.id ? { ...item, enabled: event.target.checked } : item,
                            ),
                          )
                        }
                      />
                      启用
                    </label>
                  </div>
                  <div className="text-muted-foreground">
                    {rule.id} | {categoryLabel[rule.category]} | {rule.source === "platform" ? "平台侧" : "业务侧"}
                  </div>
                  <div className="text-muted-foreground">表达式：{rule.expression}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border bg-background p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">数据稽核配置</h3>
              <div className="text-xs text-muted-foreground">启用 {enabledAuditCount}/{auditRules.length}</div>
            </div>
            <div className="space-y-2">
              {auditRules.map((rule) => (
                <div key={rule.id} className="rounded border bg-muted/10 p-3 text-xs space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">{rule.name}</div>
                    <label className="inline-flex items-center gap-1 text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={rule.enabled}
                        onChange={(event) =>
                          setAuditRules((prev) =>
                            prev.map((item) =>
                              item.id === rule.id ? { ...item, enabled: event.target.checked } : item,
                            ),
                          )
                        }
                      />
                      启用
                    </label>
                  </div>
                  <div className="text-muted-foreground">
                    {rule.id} | {rule.mode === "blocking" ? "阻断式" : "非阻断式"} | 严谨性{" "}
                    {rigourLabel[rule.scenarioRigour]}
                  </div>
                  <div className="text-muted-foreground">条件：{rule.condition}</div>
                  <div className="text-muted-foreground">动作：{rule.action}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-6 space-y-4">
        <h2 className="font-semibold">3. 数据处理与落库</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border bg-background p-4">
            <h3 className="text-sm font-semibold mb-3">原始数据显示</h3>
            <DataTable rows={rawDataRows} />
          </div>
          <div className="rounded-lg border bg-background p-4">
            <h3 className="text-sm font-semibold mb-3">后处理结果数据显示</h3>
            {processedRows.length === 0 ? (
              <div className="rounded-md border border-dashed px-3 py-6 text-xs text-muted-foreground text-center">
                尚未执行后处理
              </div>
            ) : (
              <DataTable rows={processedRows} />
            )}
          </div>
        </div>

        <div className="rounded-lg border bg-background p-4 space-y-3">
          <h3 className="text-sm font-semibold">目标表确认与数据落库</h3>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <TextField
              label="目标表"
              value={targetTable}
              onChange={setTargetTable}
              placeholder="例如：ads_autodrive_ops"
            />
            <StatusCard
              label="目标表状态"
              value={targetConfirmed ? "已确认" : "未确认"}
              success={targetConfirmed}
            />
            <StatusCard
              label="数据落库状态"
              value={stored ? "已落库" : "未落库"}
              success={stored}
            />
            <StatusCard
              label="处理数据量"
              value={processedRows.length > 0 ? `${processedRows.length} 条` : "0 条"}
              success={processedRows.length > 0}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleRunPreprocess}
              className="rounded-md border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              执行后处理
            </button>
            <button
              type="button"
              onClick={handleConfirmTarget}
              className="rounded-md border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              确认目标表
            </button>
            <button
              type="button"
              onClick={handleStoreData}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
            >
              数据落库
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function MetaCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/10 p-3">
      <div className="text-xs text-muted-foreground">{title}</div>
      <div className="text-sm font-medium mt-1">{value}</div>
    </div>
  );
}

function StatusCard({
  label,
  value,
  success,
}: {
  label: string;
  value: string;
  success: boolean;
}) {
  return (
    <div className="rounded-lg border bg-muted/10 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-center gap-1 text-sm font-medium">
        <CheckCircle2 className={cn("h-4 w-4", success ? "text-green-600" : "text-muted-foreground")} />
        {value}
      </div>
    </div>
  );
}

function DataTable({ rows }: { rows: DataRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-muted/40 border-b">
          <tr>
            <th className="px-2 py-1 text-left">行ID</th>
            <th className="px-2 py-1 text-left">业务日期</th>
            <th className="px-2 py-1 text-left">主体</th>
            <th className="px-2 py-1 text-left">指标</th>
            <th className="px-2 py-1 text-left">值</th>
            <th className="px-2 py-1 text-left">单位</th>
            <th className="px-2 py-1 text-left">来源</th>
            <th className="px-2 py-1 text-left">处理说明</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="px-2 py-1.5 font-mono">{row.id}</td>
              <td className="px-2 py-1.5 text-muted-foreground">{row.businessDate}</td>
              <td className="px-2 py-1.5 text-muted-foreground">{row.company}</td>
              <td className="px-2 py-1.5 text-muted-foreground">{row.indicator}</td>
              <td className="px-2 py-1.5 text-muted-foreground">{row.value}</td>
              <td className="px-2 py-1.5 text-muted-foreground">{row.unit}</td>
              <td className="px-2 py-1.5 text-muted-foreground">{row.source}</td>
              <td className="px-2 py-1.5 text-muted-foreground">{row.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="space-y-1 block">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="space-y-1 block">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
      >
        {options.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  );
}
