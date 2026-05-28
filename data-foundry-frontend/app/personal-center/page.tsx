"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import {
  ClipboardList,
  FolderKanban,
  Loader2,
  LogOut,
  ShieldCheck,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import {
  fetchPersonalCenterOverview,
  type PersonalCenterAcceptanceTask,
  type PersonalCenterCollectionTask,
  type PersonalCenterOverview,
} from "@/lib/api-client";
import {
  clearAuthSession,
  getCurrentUser,
  ROLE_LABEL,
  subscribePermissionsChanged,
} from "@/lib/auth-permissions";
import { cn } from "@/lib/utils";

const reviewStatusLabel: Record<PersonalCenterAcceptanceTask["reviewStatus"], string> = {
  pending: "待验收",
  approved: "已通过",
  partial_approved: "部分通过",
  rejected: "待处理",
};

const reviewStatusClass: Record<PersonalCenterAcceptanceTask["reviewStatus"], string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-700",
  partial_approved: "bg-sky-100 text-sky-700",
  rejected: "bg-rose-100 text-rose-700",
};

const EMPTY_OVERVIEW: PersonalCenterOverview = {
  projects: [],
  requirements: [],
  collectionTasks: [],
  acceptanceTasks: [],
};

function formatDate(value?: string) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("zh-CN", { hour12: false });
}

export default function PersonalCenterPage() {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [overview, setOverview] = useState<PersonalCenterOverview>(EMPTY_OVERVIEW);
  const [currentUser, setCurrentUser] = useState(() => getCurrentUser());

  useEffect(() => {
    const refresh = () => setCurrentUser(getCurrentUser());
    refresh();
    return subscribePermissionsChanged(refresh);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!currentUser?.account) {
        if (!cancelled) {
          setOverview(EMPTY_OVERVIEW);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setErrorMessage("");

      try {
        const nextOverview = await fetchPersonalCenterOverview();
        if (!cancelled) {
          setOverview(nextOverview);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "个人中心加载失败");
          setOverview(EMPTY_OVERVIEW);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [currentUser?.account]);

  return (
    <div className="space-y-6 p-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold">个人中心</h1>
            <p className="text-sm text-muted-foreground">
              按当前登录账号查看我创建的项目、我创建的需求、我负责执行的采集任务，以及我负责的数据验收任务。
            </p>
          </div>
          <div className="text-sm text-muted-foreground">
            当前账号：{currentUser?.name ?? "未登录"} / {currentUser?.account ?? "-"}
          </div>
        </div>

        <div className="min-w-[260px] rounded-xl border bg-card p-4 shadow-sm">
          <div className="font-medium">{currentUser?.name ?? "未登录"}</div>
          <div className="mt-1 text-sm text-muted-foreground">{currentUser?.account ?? "-"}</div>
          <div className="mt-1 text-sm text-muted-foreground">
            {currentUser ? ROLE_LABEL[currentUser.role] : "-"}
          </div>
          <button
            type="button"
            onClick={() => clearAuthSession()}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            退出登录
          </button>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="我的项目" value={overview.projects.length} icon={FolderKanban} />
        <MetricCard title="我的需求" value={overview.requirements.length} icon={ClipboardList} />
        <MetricCard title="我的采集任务" value={overview.collectionTasks.length} icon={Workflow} />
        <MetricCard title="我的验收任务" value={overview.acceptanceTasks.length} icon={ShieldCheck} />
      </section>

      {loading ? (
        <section className="rounded-xl border bg-card p-8 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            正在加载个人中心...
          </span>
        </section>
      ) : null}

      {!loading && errorMessage ? (
        <section className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {errorMessage}
        </section>
      ) : null}

      {!loading && !errorMessage ? (
        <>
          <SectionCard
            title="我的项目"
            description="按项目创建人账号展示。"
            emptyText="当前账号下暂无项目。"
          >
            {overview.projects.map((project) => (
              <ListRow
                key={project.id}
                title={project.name}
                meta={`项目 ID：${project.id}`}
                right={`创建时间：${formatDate(project.createdAt)}`}
                href={`/projects/${project.id}`}
                hrefLabel="进入项目"
              />
            ))}
          </SectionCard>

          <SectionCard
            title="我的需求"
            description="按需求创建人账号展示。"
            emptyText="当前账号下暂无需求。"
          >
            {overview.requirements.map((requirement) => (
              <ListRow
                key={requirement.id}
                title={requirement.title}
                meta={`需求 ID：${requirement.id} · 项目：${requirement.projectId}`}
                right={`更新时间：${formatDate(requirement.updatedAt ?? requirement.createdAt)}`}
                href={`/projects/${requirement.projectId}/requirements/${requirement.id}?nav=requirements`}
                hrefLabel="进入需求"
              />
            ))}
          </SectionCard>

          <SectionCard
            title="我的采集任务"
            description="按需求执行人账号展示。"
            emptyText="当前账号下暂无采集任务。"
          >
            {overview.collectionTasks.map((row) => (
              <CollectionTaskRowView key={row.taskGroup.id} row={row} />
            ))}
          </SectionCard>

          <SectionCard
            title="我的验收任务"
            description="按数据验收负责人账号展示。"
            emptyText="当前账号下暂无验收任务。"
          >
            {overview.acceptanceTasks.map((row) => (
              <AcceptanceTaskRowView key={row.taskGroup.id} row={row} />
            ))}
          </SectionCard>
        </>
      ) : null}
    </div>
  );
}

function MetricCard({
  title,
  value,
  icon: Icon,
}: {
  title: string;
  value: number;
  icon: LucideIcon;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">{title}</div>
        <span className="inline-flex rounded-md bg-primary/10 p-1.5 text-primary">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-3 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function SectionCard({
  title,
  description,
  emptyText,
  children,
}: {
  title: string;
  description: string;
  emptyText: string;
  children: ReactNode;
}) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : [];

  return (
    <section className="space-y-4 rounded-xl border bg-card p-6">
      <div className="space-y-1">
        <h2 className="font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          {emptyText}
        </div>
      ) : (
        <div className="space-y-3">{children}</div>
      )}
    </section>
  );
}

function ListRow({
  title,
  meta,
  right,
  href,
  hrefLabel,
}: {
  title: string;
  meta: string;
  right: string;
  href: string;
  hrefLabel: string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-background px-4 py-3 md:flex-row md:items-center md:justify-between">
      <div className="space-y-1">
        <div className="font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{meta}</div>
      </div>
      <div className="flex flex-col items-start gap-2 text-xs md:items-end">
        <div className="text-muted-foreground">{right}</div>
        <Link href={href} className="text-primary hover:underline">
          {hrefLabel}
        </Link>
      </div>
    </div>
  );
}

function CollectionTaskRowView({ row }: { row: PersonalCenterCollectionTask }) {
  const businessDate = row.taskGroup.businessDateLabel || row.taskGroup.businessDate || "-";

  return (
    <ListRow
      title={`${row.requirement.title} / ${businessDate}`}
      meta={`项目：${row.project.name} · 任务组：${row.taskGroup.id}`}
      right={`状态：${row.taskGroup.status} · 更新时间：${formatDate(row.taskGroup.updatedAt)}`}
      href={`/projects/${row.project.id}/requirements/${row.requirement.id}?nav=tasks&tab=tasks&tg=${encodeURIComponent(row.taskGroup.id)}`}
      hrefLabel="查看任务"
    />
  );
}

function AcceptanceTaskRowView({ row }: { row: PersonalCenterAcceptanceTask }) {
  const businessDate = row.taskGroup.businessDateLabel || row.taskGroup.businessDate || "-";

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-background px-4 py-3 md:flex-row md:items-center md:justify-between">
      <div className="space-y-1">
        <div className="font-medium">
          {row.requirement.title} / {businessDate}
        </div>
        <div className="text-xs text-muted-foreground">
          项目：{row.project.name} · 任务组：{row.taskGroup.id}
        </div>
      </div>
      <div className="flex flex-col items-start gap-2 text-xs md:items-end">
        <span className={cn("inline-flex rounded px-2 py-1", reviewStatusClass[row.reviewStatus])}>
          {reviewStatusLabel[row.reviewStatus]}
        </span>
        <div className="text-muted-foreground">
          更新时间：{formatDate(row.ticket?.latestActionAt ?? row.taskGroup.updatedAt)}
        </div>
        <Link
          href={`/projects/${row.project.id}/requirements/${row.requirement.id}?nav=acceptance&tab=acceptance&tg=${encodeURIComponent(row.taskGroup.id)}`}
          className="text-primary hover:underline"
        >
          进入验收
        </Link>
      </div>
    </div>
  );
}
