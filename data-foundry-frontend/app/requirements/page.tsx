"use client";

import Link from "next/link";
import { ReactNode, useEffect, useState } from "react";
import type { Project, Requirement, WideTable } from "@/lib/types";
import { fetchProjects, fetchRequirementWideTables } from "@/lib/api-client";
import { ClipboardList, FolderKanban, ArrowRight } from "lucide-react";

const typeLabel: Record<string, string> = {
  demo: "Demo",
  production: "正式生产",
};

export default function RequirementsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [wideTables, setWideTables] = useState<WideTable[]>([]);

  useEffect(() => {
    fetchProjects()
      .then((ps) => {
        setProjects(ps);
        return Promise.all(
          ps.map((p) =>
            fetchRequirementWideTables(p.id).catch(() => ({
              requirements: [] as Requirement[],
              wideTables: [] as WideTable[],
            })),
          ),
        );
      })
      .then((results) => {
        setRequirements(results.flatMap((r) => r.requirements));
        setWideTables(results.flatMap((r) => r.wideTables));
      })
      .catch(() => {});
  }, []);

  return (
    <div className="p-8 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-primary" />
          需求清单
        </h1>
        <p className="text-sm text-muted-foreground">
          跨项目查看需求阶段、当前配置和关联宽表状态。
        </p>
      </header>

      <section className="rounded-xl border bg-card p-6 space-y-4">
        <h2 className="font-semibold">项目视图</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {projects.map((project) => {
            const reqCount = requirements.filter((r) => r.projectId === project.id).length;
            return (
              <div key={project.id} className="rounded-lg border p-4 bg-muted/10">
                <div className="flex items-center">
                  <div className="font-semibold flex items-center gap-2">
                    <FolderKanban className="h-4 w-4 text-primary" />
                    {project.name}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">{project.description}</p>
                <div className="text-xs mt-3">
                  关联需求：<span className="font-semibold">{reqCount}</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-xl border bg-card p-6">
        <h2 className="font-semibold mb-3">需求定义规范</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border p-4 bg-muted/10">
            <div className="text-sm font-semibold mb-2">需求级别字段</div>
            <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
              <li>业务目标</li>
              <li>业务边界</li>

              <li>需求类型（Demo / 正式生产）</li>
            </ul>
          </div>
          <div className="rounded-lg border p-4 bg-muted/10">
            <div className="text-sm font-semibold mb-2">宽表级别字段</div>
            <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
              <li>每个需求仅关联一张宽表</li>
              <li>表结构 Schema（列定义、列分类）</li>
              <li>维度范围（仅维度列参与拆分）</li>
              <li>属性列定义（随行携带，不参与拆分）</li>
              <li>业务日期范围与频率</li>
              <li>指标组定义</li>
              <li>调度规则</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-semibold">需求列表</h2>
        {requirements.map((req) => {
          const project = projects.find((p) => p.id === req.projectId);
          const reqWideTable = req.wideTable ?? wideTables.find((wt) => wt.requirementId === req.id);
          return (
            <div key={req.id} className="rounded-xl border bg-card p-5 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs px-2 py-1 rounded border bg-muted/30">{req.id}</span>
                <h3 className="font-semibold">{req.title}</h3>
                <span className="text-xs px-2 py-1 rounded border">{typeLabel[req.requirementType] ?? req.requirementType}</span>
              </div>
              <div className="grid gap-4 xl:grid-cols-3">
                <Info title="需求信息">
                  <p>业务目标：{req.businessGoal || "-"}</p>
                  <p>业务边界：{req.businessBoundary || "-"}</p>

                </Info>
                <Info title="宽表与数据">
                  <p>关联宽表：{reqWideTable ? reqWideTable.name : "-"}</p>
                  <p>
                    宽表状态：
                    {reqWideTable
                      ? `${reqWideTable.schema.columns.length} 列，${reqWideTable.recordCount} 条记录`
                      : "未配置"}
                  </p>
                </Info>
                <Info title="操作">
                  <div>
                    <Link
                      href={`/projects/${req.projectId}/requirements/${req.id}?view=requirement&tab=requirement`}
                      className="inline-flex items-center gap-1 text-primary text-sm hover:underline mt-2"
                    >
                      查看需求详情
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                </Info>
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}

function Info({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border bg-muted/10 p-4">
      <div className="text-xs font-semibold mb-2">{title}</div>
      <div className="text-xs text-muted-foreground space-y-1">{children}</div>
    </div>
  );
}
