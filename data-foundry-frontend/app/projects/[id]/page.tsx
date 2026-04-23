"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { Project, Requirement, WideTable } from "@/lib/types";
import { loadProjectData } from "@/lib/api-client";
import { ArrowLeft } from "lucide-react";
import ProjectRequirementsPanel from "@/components/ProjectRequirementsPanel";

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";

  const [project, setProject] = useState<Project | null>(null);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [wideTables, setWideTables] = useState<WideTable[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) {
      setProject(null);
      setLoading(false);
      return;
    }

    loadProjectData(id)
      .then((data) => {
        setProject(data.project);
        setRequirements(data.requirements);
        setWideTables(data.wideTables);
      })
      .catch(() => {
        setProject(null);
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-sm text-muted-foreground">正在加载项目数据...</div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-8">
        <div className="text-sm text-muted-foreground">未找到该项目。</div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <header className="space-y-2">
        <Link
          href="/projects"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          返回项目列表
        </Link>
        <h1 className="text-2xl font-bold">{project.name}</h1>
        <p className="text-sm text-muted-foreground">{project.description}</p>
      </header>

      <ProjectRequirementsPanel
        project={project}
        projectId={project.id}
        initialRequirements={requirements}
        initialWideTables={wideTables}
      />
    </div>
  );
}
