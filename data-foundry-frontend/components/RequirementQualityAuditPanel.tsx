"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchAuditRules } from "@/lib/api-client";
import type { Requirement, WideTable, WideTableRecord } from "@/lib/types";
import type { BusinessRigour } from "@/lib/domain";
import { ShieldCheck } from "lucide-react";
import {
  AuditRuleState,
  buildRawRows,
  runAuditOnProcessedRows,
  runPreprocess,
} from "@/lib/requirement-data-pipeline";
import { cn } from "@/lib/utils";

type Props = {
  requirement: Requirement;
  wideTables: WideTable[];
  wideTableRecords: WideTableRecord[];
};

const rigourLabel: Record<BusinessRigour, string> = {
  low: "低",
  high: "高",
};

export default function RequirementQualityAuditPanel({ requirement, wideTables, wideTableRecords }: Props) {
  const [auditRules, setAuditRules] = useState<AuditRuleState[]>([]);

  useEffect(() => {
    fetchAuditRules()
      .then((rules) => setAuditRules(rules.map((item) => ({ ...item, enabled: true }))))
      .catch(() => {});
  }, []);
  const [activeRuleAnchorId, setActiveRuleAnchorId] = useState("");

  const processedRows = useMemo(
    () => runPreprocess(buildRawRows(requirement, wideTables, wideTableRecords)),
    [requirement, wideTables, wideTableRecords],
  );
  const results = useMemo(
    () => runAuditOnProcessedRows(processedRows, auditRules),
    [processedRows, auditRules],
  );
  const enabledAuditCount = useMemo(
    () => auditRules.filter((item) => item.enabled).length,
    [auditRules],
  );
  const failedCount = useMemo(
    () => results.filter((item) => item.status === "未通过").length,
    [results],
  );

  useEffect(() => {
    const applyHash = () => {
      if (typeof window === "undefined") return;
      const hash = window.location.hash.replace("#", "");
      setActiveRuleAnchorId(hash);
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, []);

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">数据稽核</h2>
        </div>
        <p className="text-xs text-muted-foreground">本环节展示：稽核规则、每条后处理结果数据的稽核执行结果。</p>
      </section>

      <section className="rounded-xl border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">1. 稽核规则</h3>
          <div className="text-xs text-muted-foreground">启用 {enabledAuditCount}/{auditRules.length}</div>
        </div>
        <div className="space-y-2">
          {auditRules.map((rule) => (
            <div
              key={rule.id}
              id={`audit-rule-${rule.id}`}
              className={cn(
                "rounded border bg-muted/10 p-3 text-xs space-y-1 scroll-mt-24",
                activeRuleAnchorId === `audit-rule-${rule.id}` ? "ring-2 ring-primary/40 border-primary/40" : "",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium">
                  <span className="font-mono text-[11px] text-muted-foreground mr-1">{rule.id}</span>
                  {rule.name}
                </div>
                <label className="inline-flex items-center gap-1 text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={rule.enabled}
                    onChange={(event) =>
                      setAuditRules((prev) =>
                        prev.map((item) => (item.id === rule.id ? { ...item, enabled: event.target.checked } : item)),
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
      </section>

      <section className="rounded-xl border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">2. 稽核结果（逐条）</h3>
          <div className="text-xs text-muted-foreground">
            已执行 {results.length} 条 | 未通过 {failedCount} 条
          </div>
        </div>
        {results.length === 0 ? (
          <div className="rounded-md border border-dashed px-3 py-6 text-xs text-muted-foreground text-center">
            暂无可稽核数据
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 border-b">
                <tr>
                  <th className="px-2 py-1 text-left">行ID</th>
                  <th className="px-2 py-1 text-left">主体</th>
                  <th className="px-2 py-1 text-left">指标</th>
                  <th className="px-2 py-1 text-left">后处理结果值</th>
                  <th className="px-2 py-1 text-left">结果</th>
                  <th className="px-2 py-1 text-left">未通过规则</th>
                  <th className="px-2 py-1 text-left">说明</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {results.map((row) => (
                  <tr key={row.rowId}>
                    <td className="px-2 py-1.5 font-mono">{row.rowId}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{row.entity}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{row.indicator}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{row.value}</td>
                    <td className="px-2 py-1.5">
                      <span
                        className={cn(
                          "inline-flex rounded px-2 py-0.5",
                          row.status === "通过" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700",
                        )}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-muted-foreground">{row.failedRules}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{row.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
