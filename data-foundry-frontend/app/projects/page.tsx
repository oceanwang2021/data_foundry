"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Project, Requirement } from "@/lib/types";
import { fetchProjects, fetchRequirements } from "@/lib/api-client";
import { FolderKanban, ArrowRight, Plus } from "lucide-react";
import CreateProjectModal from "@/components/CreateProjectModal";

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  useEffect(() => {
    fetchProjects()
      .then(setProjects)
      .catch(() => setProjects([]));
  }, []);

  useEffect(() => {
    if (projects.length === 0) return;
    Promise.all(projects.map((p) => fetchRequirements(p.id).catch(() => [])))
      .then((arrays) => setRequirements(arrays.flat()))
      .catch(() => setRequirements([]));
  }, [projects]);

  return (
    <div className="p-8 space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FolderKanban className="h-5 w-5 text-primary" />
          项目概览
        </h1>
        <p className="text-sm text-muted-foreground">
          从项目维度查看需求规模、当前状态和最近交付进展。
        </p>
        </div>

        <button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          新建项目
        </button>
      </header>

      <div className="grid gap-5 md:grid-cols-2">
        {projects.map((project) => {
          const reqs = requirements.filter((r) => r.projectId === project.id);
          return (
            <div key={project.id} className="rounded-xl border bg-card p-5 shadow-sm">
              <div className="flex items-start gap-2">
                <div>
                  <h2 className="font-semibold text-lg">{project.name}</h2>
                  <p className="text-xs text-muted-foreground mt-1">{project.description}</p>
                </div>
              </div>
              <div className="mt-4 text-sm text-muted-foreground">
                <p>需求数量：{reqs.length}</p>
                <p>状态：{project.status === "active" ? "运行中" : "规划中"}</p>
              </div>
              <Link
                href={`/projects/${project.id}`}
                className="mt-4 inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                进入项目
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          );
        })}
      </div>

      <CreateProjectModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSaved={(project) => {
          setIsCreateOpen(false);
          router.push(`/projects/${project.id}`);
        }}
      />
    </div>
  );
}
