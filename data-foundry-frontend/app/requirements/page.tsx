"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ClipboardList } from "lucide-react";
import CreateRequirementModal from "@/components/CreateRequirementModal";
import {
  fetchProjects,
  searchRequirementsPage,
  type RequirementSearchPage,
  type RequirementSearchSortBy,
  type RequirementSearchSortDir,
} from "@/lib/api-client";
import type { Project, Requirement } from "@/lib/types";

type Filters = {
  keyword: string;
  projectId: string;
  owner: string;
  assignee: string;
  wideTableKeyword: string;
  hasWideTable: "all" | "yes" | "no";
  statuses: Array<Requirement["status"]>;
};

function buildDefaultFilters(): Filters {
  return {
    keyword: "",
    projectId: "",
    owner: "",
    assignee: "",
    wideTableKeyword: "",
    hasWideTable: "all",
    statuses: [],
  };
}

export default function RequirementsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [result, setResult] = useState<RequirementSearchPage | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [message, setMessage] = useState("");

  const [draftFilters, setDraftFilters] = useState<Filters>(() => buildDefaultFilters());
  const [filters, setFilters] = useState<Filters>(() => buildDefaultFilters());

  const [sortBy, setSortBy] = useState<RequirementSearchSortBy>("updated_at");
  const [sortDir, setSortDir] = useState<RequirementSearchSortDir>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    fetchProjects().then(setProjects).catch(() => {});
  }, []);

  const statusLabel = (status: Requirement["status"]) => {
    if (status === "draft") return "草稿";
    if (status === "aligning") return "对齐中";
    if (status === "ready") return "就绪";
    if (status === "running") return "运行中";
    return status;
  };

  const runSearch = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await searchRequirementsPage({
        page,
        pageSize,
        keyword: filters.keyword.trim() || undefined,
        projectId: filters.projectId || undefined,
        owner: filters.owner.trim() || undefined,
        assignee: filters.assignee.trim() || undefined,
        statuses: filters.statuses.length > 0 ? filters.statuses : undefined,
        wideTableKeyword: filters.wideTableKeyword.trim() || undefined,
        hasWideTable: filters.hasWideTable === "all" ? undefined : filters.hasWideTable === "yes",
        sortBy,
        sortDir,
      });
      setResult(data);
    } finally {
      setIsLoading(false);
    }
  }, [filters, page, pageSize, sortBy, sortDir]);

  useEffect(() => {
    void runSearch();
  }, [runSearch]);

  const total = result?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const toggleStatus = (next: Requirement["status"]) => {
    setDraftFilters((prev) => ({
      ...prev,
      statuses: prev.statuses.includes(next) ? prev.statuses.filter((s) => s !== next) : [...prev.statuses, next],
    }));
  };

  const resetFilters = () => {
    setDraftFilters(buildDefaultFilters());
    setFilters(buildDefaultFilters());
    setSortBy("updated_at");
    setSortDir("desc");
    setPage(1);
    setPageSize(20);
  };

  const applyFilters = () => {
    setFilters(draftFilters);
    setPage(1);
  };

  const handleSort = (next: RequirementSearchSortBy) => {
    setPage(1);
    setSortBy((current) => {
      if (current !== next) {
        setSortDir("asc");
        return next;
      }
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
      return current;
    });
  };

  const handleSaved = (createdRequirement: Requirement) => {
    setMessage(`已创建需求：${createdRequirement.id}`);
    if (page === 1) {
      void runSearch();
      return;
    }
    setPage(1);
  };

  return (
    <>
      <div className="p-8 space-y-6">
        <header className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <ClipboardList className="h-5 w-5 text-primary" />
            需求清单
          </h1>
          <p className="text-sm text-muted-foreground">直接查看需求列表与关联宽表信息。</p>
        </header>

        <section className="rounded-xl border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <h2 className="font-semibold">需求列表</h2>
              <div className="text-xs text-muted-foreground">共 {total} 条</div>
            </div>
            <button
              type="button"
              onClick={() => setCreateDialogOpen(true)}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
            >
              创建需求
            </button>
          </div>

          {message ? <div className="mt-3 text-xs text-primary">{message}</div> : null}

          <div className="mt-4 rounded-lg border bg-muted/10 p-4">
            <div className="grid gap-3 md:grid-cols-6">
              <div className="md:col-span-2">
                <div className="text-xs font-medium text-muted-foreground">查询</div>
                <input
                  value={draftFilters.keyword}
                  onChange={(e) => {
                    setDraftFilters((prev) => ({ ...prev, keyword: e.target.value }));
                  }}
                  placeholder="按需求/项目/人员/宽表关键词查询"
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground">所属项目</div>
                <select
                  value={draftFilters.projectId}
                  onChange={(e) => {
                    setDraftFilters((prev) => ({ ...prev, projectId: e.target.value }));
                  }}
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                >
                  <option value="">全部</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground">负责人</div>
                <input
                  value={draftFilters.owner}
                  onChange={(e) => {
                    setDraftFilters((prev) => ({ ...prev, owner: e.target.value }));
                  }}
                  placeholder="负责人"
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground">执行人</div>
                <input
                  value={draftFilters.assignee}
                  onChange={(e) => {
                    setDraftFilters((prev) => ({ ...prev, assignee: e.target.value }));
                  }}
                  placeholder="执行人"
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground">关联宽表</div>
                <input
                  value={draftFilters.wideTableKeyword}
                  onChange={(e) => {
                    setDraftFilters((prev) => ({ ...prev, wideTableKeyword: e.target.value }));
                  }}
                  placeholder="宽表名/ID"
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted-foreground">状态：</span>
                {(["draft", "aligning", "ready", "running"] as const).map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => toggleStatus(status)}
                    className={
                      draftFilters.statuses.includes(status)
                        ? "rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-primary"
                        : "rounded-md border bg-background px-2 py-1 text-muted-foreground hover:text-foreground"
                    }
                  >
                    {statusLabel(status)}
                  </button>
                ))}
                <span className="ml-2 text-muted-foreground">是否关联宽表：</span>
                <select
                  value={draftFilters.hasWideTable}
                  onChange={(e) => {
                    setDraftFilters((prev) => ({ ...prev, hasWideTable: e.target.value as "all" | "yes" | "no" }));
                  }}
                  className="rounded-md border bg-background px-2 py-1"
                >
                  <option value="all">全部</option>
                  <option value="yes">已关联</option>
                  <option value="no">未关联</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={applyFilters}
                  className="rounded-md border px-3 py-2 text-xs text-primary hover:bg-primary/5"
                >
                  查询
                </button>
                <button
                  type="button"
                  onClick={resetFilters}
                  className="rounded-md border px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  重置
                </button>
              </div>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[1080px] border-collapse text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-3 pr-4 font-medium">
                    <button type="button" onClick={() => handleSort("title")} className="hover:underline">
                      需求
                    </button>
                  </th>
                  <th className="py-3 pr-4 font-medium">
                    <button type="button" onClick={() => handleSort("project_name")} className="hover:underline">
                      所属项目
                    </button>
                  </th>
                  <th className="py-3 pr-4 font-medium">
                    <button type="button" onClick={() => handleSort("owner")} className="hover:underline">
                      负责人/执行人
                    </button>
                  </th>
                  <th className="py-3 pr-4 font-medium">
                    <button type="button" onClick={() => handleSort("wide_table_name")} className="hover:underline">
                      关联宽表
                    </button>
                  </th>
                  <th className="py-3 pr-4 font-medium">
                    <button type="button" onClick={() => handleSort("status")} className="hover:underline">
                      状态流转
                    </button>
                  </th>
                  <th className="py-3 pr-2 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {(result?.items ?? []).map((row) => {
                  const requirement = row.requirement;
                  const projectName = row.project?.name ?? "-";
                  const wideTable = row.wideTable ?? null;
                  const wideTableLabel = wideTable?.id
                    ? `${wideTable.tableName} (${wideTable.id})`
                    : "-";

                  return (
                    <tr key={requirement.id} className="border-b last:border-b-0 hover:bg-muted/30">
                      <td className="py-4 pr-4 align-top">
                        <div className="space-y-1">
                          <div className="max-w-[320px] truncate font-medium text-foreground" title={requirement.title}>
                            {requirement.title}
                          </div>
                          <div className="font-mono text-xs text-muted-foreground">{requirement.id}</div>
                        </div>
                      </td>
                      <td className="py-4 pr-4 align-top">
                        <div className="max-w-[200px] truncate" title={projectName}>
                          {projectName}
                        </div>
                      </td>
                      <td className="py-4 pr-4 align-top">
                        <div className="space-y-1 text-muted-foreground">
                          <div>业务：{requirement.owner || "-"}</div>
                          <div>执行：{requirement.assignee || "-"}</div>
                        </div>
                      </td>
                      <td className="py-4 pr-4 align-top">
                        <div className="max-w-[320px] truncate" title={wideTable?.id ? wideTableLabel : "-"}>
                          {wideTableLabel}
                        </div>
                        {wideTable?.id ? (
                          <div className="mt-1 text-xs text-muted-foreground">
                            {wideTable.columnCount ?? "-"} 列，{wideTable.recordCount ?? "-"} 条记录
                          </div>
                        ) : null}
                      </td>
                      <td className="py-4 pr-4 align-top">{statusLabel(requirement.status)}</td>
                      <td className="py-4 pr-2 align-top">
                        <Link
                          href={`/projects/${requirement.projectId}/requirements/${requirement.id}?nav=requirements&view=requirement&tab=requirement`}
                          className="text-primary hover:underline"
                        >
                          进入需求
                        </Link>
                      </td>
                    </tr>
                  );
                })}
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                      加载中...
                    </td>
                  </tr>
                ) : null}
                {!isLoading && (result?.items?.length ?? 0) === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                      没有匹配的需求
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
            <div>
              第 {page} / {totalPages} 页，{total} 条
            </div>
            <div className="flex items-center gap-2">
              <span>每页</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPage(1);
                  setPageSize(Number(e.target.value));
                }}
                className="rounded-md border bg-background px-2 py-1"
              >
                {[10, 20, 50, 100].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1}
                className="rounded-md border px-2 py-1 disabled:opacity-50"
              >
                上一页
              </button>
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={page >= totalPages}
                className="rounded-md border px-2 py-1 disabled:opacity-50"
              >
                下一页
              </button>
            </div>
          </div>
        </section>
      </div>

      <CreateRequirementModal
        projects={projects}
        defaultProjectId={draftFilters.projectId || filters.projectId || projects[0]?.id}
        isOpen={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        onSaved={handleSaved}
      />
    </>
  );
}
