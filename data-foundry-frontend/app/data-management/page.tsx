"use client";

import { useEffect, useState } from "react";
import { DATA_LINEAGE } from "@/lib/mock-platform";
import type { WideTable, WideTableRecord, TaskGroup } from "@/lib/types";
import type { DataLineage } from "@/lib/domain";
import { fetchProjects, fetchRequirementWideTables, fetchTaskGroups, fetchWideTableRows } from "@/lib/api-client";
import { Database } from "lucide-react";
import { cn } from "@/lib/utils";

const statusStyle: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  initialized: "bg-blue-100 text-blue-700",
  active: "bg-green-100 text-green-700",
};

const statusLabel: Record<string, string> = {
  draft: "草稿",
  initialized: "已初始化",
  active: "已激活",
};

export default function DataManagementPage() {
  const [wideTables, setWideTables] = useState<WideTable[]>([]);
  const [taskGroups, setTaskGroups] = useState<TaskGroup[]>([]);
  const [wideTableRecords, setWideTableRecords] = useState<WideTableRecord[]>([]);
  const [dataLineage] = useState<DataLineage[]>(DATA_LINEAGE);

  useEffect(() => {
    fetchProjects()
      .then(async (ps) => {
        const results = await Promise.all(
          ps.map((p) => fetchRequirementWideTables(p.id).catch(() => ({ requirements: [], wideTables: [] as WideTable[] }))),
        );
        const wts = results.flatMap((r) => r.wideTables);
        const reqs = results.flatMap((r) => r.requirements);
        setWideTables(wts);

        const tgArrays = await Promise.all(
          ps.flatMap((p) => reqs.filter((r) => r.projectId === p.id).map((r) => fetchTaskGroups(p.id, r.id).catch(() => [] as TaskGroup[]))),
        );
        setTaskGroups(tgArrays.flat());

        const recordArrays = await Promise.all(
          wts.map((wt) => fetchWideTableRows(wt.id, wt).catch(() => [] as WideTableRecord[])),
        );
        setWideTableRecords(recordArrays.flat());
      })
      .catch(() => {});
  }, []);

  return (
    <div className="p-8 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Database className="h-5 w-5 text-primary" />
          数据管理
        </h1>
        <p className="text-sm text-muted-foreground">
          管理需求关联宽表的数据版本、回填状态和数据血缘。
        </p>
      </header>

      <section className="rounded-xl border bg-card p-6">
        <h2 className="font-semibold mb-4">宽表数据概览</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 border-b">
              <tr>
                <th className="text-left px-3 py-2">宽表ID</th>
                <th className="text-left px-3 py-2">表名</th>
                <th className="text-left px-3 py-2">关联需求</th>
                <th className="text-left px-3 py-2">状态</th>
                <th className="text-left px-3 py-2">记录数</th>
                <th className="text-left px-3 py-2">任务组数</th>
                <th className="text-left px-3 py-2">日期范围</th>
                <th className="text-left px-3 py-2">更新时间</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {wideTables.map((wt) => {
                const tgCount = taskGroups.filter((tg) => tg.wideTableId === wt.id).length;
                return (
                  <tr key={wt.id}>
                    <td className="px-3 py-2 font-mono text-xs">{wt.id}</td>
                    <td className="px-3 py-2 font-medium">{wt.name}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{wt.requirementId}</td>
                    <td className="px-3 py-2">
                      <span className={cn("text-xs px-2 py-1 rounded", statusStyle[wt.status])}>
                        {statusLabel[wt.status] ?? wt.status}
                      </span>
                    </td>
                    <td className="px-3 py-2">{wt.recordCount}</td>
                    <td className="px-3 py-2">{tgCount}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {wt.businessDateRange.start} ~ {wt.businessDateRange.end}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{wt.updatedAt}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-6">
        <h2 className="font-semibold mb-4">宽表记录预览</h2>
        <p className="text-xs text-muted-foreground mb-4">
          展示已回填到宽表中的结构化记录。
        </p>
        {wideTables.map((wt) => {
          const records = wideTableRecords.filter((r) => r.wideTableId === wt.id);
          if (records.length === 0) return null;
          const dataCols = wt.schema.columns.filter((c) => c.category !== "system");
          return (
            <div key={wt.id} className="mb-6">
              <h3 className="text-sm font-semibold mb-2">{wt.name}（{wt.id}）</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 border-b">
                    <tr>
                      <th className="px-2 py-1 text-left">行ID</th>
                      {dataCols.map((col) => (
                        <th key={col.id} className="px-2 py-1 text-left">{col.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {records.slice(0, 5).map((record) => (
                      <tr key={`${wt.id}-${record.id}`}>
                        <td className="px-2 py-1.5 font-mono">{record.id}</td>
                        {dataCols.map((col) => (
                          <td key={col.id} className="px-2 py-1.5 text-muted-foreground">
                            {record[col.name] != null ? String(record[col.name]).substring(0, 40) : "-"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </section>

      <section className="rounded-xl border bg-card p-6">
        <h2 className="font-semibold mb-4">数据血缘</h2>
        <div className="space-y-3">
          {dataLineage.map((lineage) => (
            <div key={lineage.id} className="rounded-lg border p-4 bg-muted/10">
              <div className="font-medium">{lineage.dataset}</div>
              <div className="text-xs text-muted-foreground mt-2">上游：{lineage.upstream}</div>
              <div className="text-xs text-muted-foreground mt-1">下游：{lineage.downstream}</div>
              <div className="text-xs text-muted-foreground mt-1">最近同步：{lineage.lastSyncAt}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
