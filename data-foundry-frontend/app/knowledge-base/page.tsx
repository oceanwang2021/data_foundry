"use client";

import { useEffect, useState } from "react";
import { BookOpen, Database, RefreshCw } from "lucide-react";
import type { KnowledgeBase } from "@/lib/types";
import type { ComponentType } from "react";
import { buildApiUrl } from "@/lib/api-base";

const statusStyle: Record<string, string> = {
  ready: "bg-green-100 text-green-700",
  indexing: "bg-amber-100 text-amber-700",
  error: "bg-red-100 text-red-700",
};

const statusLabel: Record<string, string> = {
  ready: "可用",
  indexing: "构建中",
  error: "异常",
};

export default function KnowledgeBasePage() {
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(buildApiUrl("/api/knowledge-bases"))
      .then((res) => res.json())
      .then((data) => setKnowledgeBases(data))
      .catch(() => setKnowledgeBases([]))
      .finally(() => setLoading(false));
  }, []);
  const totalDocs = knowledgeBases.reduce((acc, item) => acc + item.documentCount, 0);

  return (
    <div className="p-8 space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          知识库
        </h1>
        <p className="text-sm text-muted-foreground">
          统一管理内部知识库命名空间，供需求定义中的数据来源配置引用。
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard title="知识库数量" value={String(knowledgeBases.length)} icon={BookOpen} />
        <MetricCard title="文档总量" value={String(totalDocs)} icon={Database} />
        <MetricCard
          title="构建中"
          value={String(knowledgeBases.filter((item) => item.status === "indexing").length)}
          icon={RefreshCw}
        />
      </section>

      <section className="rounded-xl border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 border-b">
              <tr>
                <th className="text-left px-4 py-3">命名空间</th>
                <th className="text-left px-4 py-3">知识库名称</th>
                <th className="text-left px-4 py-3">描述</th>
                <th className="text-left px-4 py-3">文档数</th>
                <th className="text-left px-4 py-3">状态</th>
                <th className="text-left px-4 py-3">最近更新时间</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {knowledgeBases.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{item.id}</td>
                  <td className="px-4 py-3 font-medium">{item.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{item.description}</td>
                  <td className="px-4 py-3">{item.documentCount}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded ${statusStyle[item.status]}`}>
                      {statusLabel[item.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(item.lastUpdated).toLocaleString("zh-CN", { hour12: false })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  title,
  value,
  icon: Icon,
}: {
  title: string;
  value: string;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-sm">{title}</span>
        <Icon className="h-4 w-4" />
      </div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}
