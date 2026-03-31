import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import {
  Activity,
  ArrowRight,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Database,
  Eye,
  FolderKanban,
  LayoutPanelLeft,
  Layers3,
  Settings,
  ShieldCheck,
  Sparkles,
  Workflow,
} from "lucide-react";

type Issue = {
  title: string;
  description: string;
};

type MenuItem = {
  name: string;
  href: string;
  summary: string;
  icon: LucideIcon;
  badge?: string;
};

type MenuGroup = {
  title: string;
  description: string;
  items: MenuItem[];
};

type RenameSuggestion = {
  current: string;
  proposed: string;
  reason: string;
};

type TabSuggestion = {
  current: string;
  proposed: string;
  reason: string;
};

const currentIssues: Issue[] = [
  {
    title: "一级菜单粒度不一致",
    description: "“项目”是业务对象，“知识库”是平台资源，“调度中心 / 运维监控”是后台能力，用户很难预判点进去会处理什么工作。",
  },
  {
    title: "真实能力和侧边栏脱节",
    description: "仓库里已经有需求列表、任务执行、数据资产、系统设置等页面，但侧边栏只有 4 个入口，信息架构不完整。",
  },
  {
    title: "全局导航与上下文导航边界不清",
    description: "后处理、稽核、验收都依赖具体需求和宽表，不适合脱离上下文做一级导航，更适合收进需求工作区。",
  },
  {
    title: "文案偏抽象或偏后台",
    description: "“中心”这类词信息密度低；“运维监控”又显得过于技术化，不利于业务和数据角色快速定位入口。",
  },
];

const currentSidebar: MenuItem[] = [
  {
    name: "项目",
    href: "/projects",
    summary: "当前实际同时承载项目、需求、宽表配置。",
    icon: FolderKanban,
  },
  {
    name: "知识库",
    href: "/knowledge-base",
    summary: "平台资源入口，语义相对清晰。",
    icon: BookOpen,
  },
  {
    name: "调度中心",
    href: "/scheduling",
    summary: "偏后台词汇，和任务执行边界不清。",
    icon: CalendarClock,
  },
  {
    name: "运维监控",
    href: "/ops-monitoring",
    summary: "包含环境状态，也包含数据初始化动作。",
    icon: Activity,
  },
];

const recommendedSidebar: MenuGroup[] = [
  {
    title: "生产主线",
    description: "围绕“定义需求 -> 执行采集 -> 沉淀数据资产”的全局工作入口。",
    items: [
      {
        name: "项目与需求",
        href: "/projects",
        summary: "项目总览、需求创建、转正、需求配置。",
        icon: FolderKanban,
        badge: "推荐替换“项目”",
      },
      {
        name: "任务执行",
        href: "/collection-tasks",
        summary: "任务组、采集任务、执行进度。",
        icon: Workflow,
      },
      {
        name: "任务调度",
        href: "/scheduling",
        summary: "定时调度、手动触发、补采重跑。",
        icon: CalendarClock,
        badge: "推荐替换“调度中心”",
      },
      {
        name: "数据资产",
        href: "/data-management",
        summary: "宽表版本、记录预览、数据血缘。",
        icon: Database,
      },
    ],
  },
  {
    title: "平台支持",
    description: "共享资源、运行状态与全局配置。",
    items: [
      {
        name: "知识库",
        href: "/knowledge-base",
        summary: "知识源命名空间、文档量与可用状态。",
        icon: BookOpen,
      },
      {
        name: "运行监控",
        href: "/ops-monitoring",
        summary: "环境健康、任务状态、数据状态。",
        icon: Activity,
        badge: "推荐替换“运维监控”",
      },
      {
        name: "系统设置",
        href: "/settings",
        summary: "全局参数、密钥与系统偏好。",
        icon: Settings,
      },
    ],
  },
];

const secondaryEntryGroups: MenuGroup[] = [
  {
    title: "项目与需求下的二级入口",
    description: "建议补齐项目空间内部导航，而不是继续把它们挤在一级侧边栏。",
    items: [
      {
        name: "项目总览",
        href: "/projects",
        summary: "看项目列表、项目状态、需求数量。",
        icon: FolderKanban,
      },
      {
        name: "需求列表",
        href: "/requirements",
        summary: "看跨项目需求清单与需求级配置概览。",
        icon: ClipboardList,
      },
    ],
  },
];

const requirementTabs: TabSuggestion[] = [
  {
    current: "需求",
    proposed: "需求定义",
    reason: "比“需求”更具体，强调这是配置区，而不是需求详情摘要。",
  },
  {
    current: "任务",
    proposed: "任务",
    reason: "当前命名已经简洁明确，可保留。",
  },
  {
    current: "数据",
    proposed: "数据处理",
    reason: "当前 Tab 内实际承载后处理、预览、稽核前准备，叫“数据”过于宽泛。",
  },
  {
    current: "验收",
    proposed: "验收",
    reason: "有明确动作含义，建议保留。",
  },
];

const renameSuggestions: RenameSuggestion[] = [
  {
    current: "项目",
    proposed: "项目与需求",
    reason: "这个入口已经不只是项目列表，而是整条需求配置入口。",
  },
  {
    current: "调度中心",
    proposed: "任务调度",
    reason: "去掉抽象的“中心”，直接说明这里处理的是任务调度。",
  },
  {
    current: "运维监控",
    proposed: "运行监控",
    reason: "保留监控语义，但弱化过于技术化的运维色彩，更适合产品型后台。",
  },
  {
    current: "需求",
    proposed: "需求定义",
    reason: "明确这是配置型页面，而不是只读详情。",
  },
  {
    current: "数据",
    proposed: "数据处理",
    reason: "更贴近当前实际行为，避免用户误以为这里只是看数据结果。",
  },
];

const notRecommended: Issue[] = [
  {
    title: "不建议把“数据稽核 / 数据验收”直接挂成一级菜单",
    description: "这两个动作都高度依赖当前需求、当前宽表和当前版本，脱离上下文后入口价值有限。",
  },
  {
    title: "不建议继续保留多个“原型演示页”与正式导航并行",
    description: "像 /preprocessing、/quality-audit、/acceptance 更适合作为方案演示页，或并回需求工作区，而不是长期并列在正式菜单体系里。",
  },
];

export default function MenuSystemProposalPage() {
  return (
    <div className="min-h-full bg-[linear-gradient(180deg,rgba(255,251,235,0.75)_0%,rgba(248,250,252,0)_220px)] p-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <section className="rounded-3xl border border-amber-200 bg-[linear-gradient(135deg,rgba(255,247,237,0.98)_0%,rgba(255,255,255,0.98)_45%,rgba(236,253,245,0.98)_100%)] p-8 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="max-w-3xl space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-white/80 px-3 py-1 text-xs font-medium text-amber-700">
                <Sparkles className="h-3.5 w-3.5" />
                菜单系统候选方案页
              </div>
              <div className="space-y-2">
                <h1 className="text-3xl font-bold tracking-tight text-slate-900">菜单文案与菜单体系候选方案</h1>
                <p className="max-w-2xl text-sm leading-6 text-slate-600">
                  这个页面只展示候选信息架构，不会改动当前侧边栏。目标是把“全局工作入口”和“需求内流程入口”分层，减少用户在菜单里猜路径的成本。
                </p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <MetricCard title="当前一级入口" value="4" note="项目 / 知识库 / 调度中心 / 运维监控" />
              <MetricCard title="建议补齐入口" value="7" note="加入任务执行、数据资产、系统设置等全局入口" />
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-4">
          {currentIssues.map((issue) => (
            <InsightCard key={issue.title} title={issue.title} description={issue.description} />
          ))}
        </section>

        <section className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="space-y-6">
            <MenuPreviewCard title="当前侧边栏" subtitle="现状更像“页面集合”，不是一条清晰的工作主线。">
              <div className="space-y-2">
                {currentSidebar.map((item) => (
                  <SidebarRow key={item.name} item={item} subtle />
                ))}
              </div>
            </MenuPreviewCard>

            <MenuPreviewCard title="推荐侧边栏" subtitle="一级只放全局入口，二级用于补齐同一工作域内的列表页。">
              <div className="space-y-5">
                {recommendedSidebar.map((group) => (
                  <div key={group.title} className="space-y-2">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{group.title}</div>
                      <div className="mt-1 text-xs leading-5 text-slate-500">{group.description}</div>
                    </div>
                    <div className="space-y-2">
                      {group.items.map((item, index) => (
                        <SidebarRow key={item.name} item={item} active={group.title === "生产主线" && index === 0} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </MenuPreviewCard>
          </div>

          <div className="space-y-6">
            <section className="rounded-3xl border bg-card p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <LayoutPanelLeft className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">推荐结构</h2>
              </div>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                {recommendedSidebar.map((group) => (
                  <GroupCard key={group.title} group={group} />
                ))}
                {secondaryEntryGroups.map((group) => (
                  <GroupCard key={group.title} group={group} accent="emerald" />
                ))}
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 lg:col-span-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <Layers3 className="h-4 w-4 text-slate-500" />
                    需求工作区建议保留为上下文导航
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    后处理、稽核、验收都依赖当前需求和当前宽表。更合理的做法不是再堆一级侧边栏，而是在需求详情内做清晰的流程型 Tab。
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {requirementTabs.map((tab) => (
                      <div key={`${tab.current}-${tab.proposed}`} className="rounded-full border bg-white px-3 py-1.5 text-xs text-slate-700">
                        {tab.proposed}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-3xl border bg-card p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <h2 className="text-lg font-semibold">文案替换建议</h2>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="border-b bg-slate-50 text-left text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">当前文案</th>
                      <th className="px-4 py-3 font-medium">建议文案</th>
                      <th className="px-4 py-3 font-medium">调整原因</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {renameSuggestions.map((row) => (
                      <tr key={`${row.current}-${row.proposed}`}>
                        <td className="px-4 py-3 text-slate-700">{row.current}</td>
                        <td className="px-4 py-3 font-medium text-slate-900">{row.proposed}</td>
                        <td className="px-4 py-3 text-slate-600">{row.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-3xl border bg-card p-6 shadow-sm">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-sky-600" />
                  <h2 className="text-lg font-semibold">建议保留为全局菜单</h2>
                </div>
                <div className="mt-4 space-y-3">
                  {recommendedSidebar.flatMap((group) => group.items).map((item) => (
                    <RouteCard key={item.name} item={item} />
                  ))}
                </div>
              </div>

              <div className="rounded-3xl border bg-card p-6 shadow-sm">
                <div className="flex items-center gap-2">
                  <Eye className="h-5 w-5 text-amber-600" />
                  <h2 className="text-lg font-semibold">当前不建议升成一级菜单</h2>
                </div>
                <div className="mt-4 space-y-4">
                  {notRecommended.map((item) => (
                    <div key={item.title} className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
                      <div className="text-sm font-semibold text-amber-900">{item.title}</div>
                      <p className="mt-2 text-sm leading-6 text-amber-800">{item.description}</p>
                    </div>
                  ))}
                  <div className="rounded-2xl border border-dashed p-4">
                    <div className="text-sm font-semibold text-slate-800">建议归位到需求工作区的页面能力</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {["数据后处理", "数据稽核", "数据验收", "范围确认生成"].map((label) => (
                        <span key={label} className="rounded-full border bg-slate-50 px-3 py-1 text-xs text-slate-600">
                          {label}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </section>

        <section className="rounded-3xl border bg-card p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">候选方案结论</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                推荐先做“一级菜单重分组 + 文案收敛 + 需求工作区 Tab 改名”，暂不动页面能力本身。
              </p>
            </div>
            <Link
              href="/projects"
              className="inline-flex items-center gap-2 rounded-full border bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              返回当前主流程
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

function MetricCard({
  title,
  value,
  note,
}: {
  title: string;
  value: string;
  note: string;
}) {
  return (
    <div className="min-w-[220px] rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm backdrop-blur">
      <div className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">{title}</div>
      <div className="mt-2 text-3xl font-bold text-slate-900">{value}</div>
      <p className="mt-2 text-xs leading-5 text-slate-500">{note}</p>
    </div>
  );
}

function InsightCard({ title, description }: Issue) {
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
    </div>
  );
}

function MenuPreviewCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border bg-slate-950 p-4 text-white shadow-sm">
      <div className="rounded-[1.4rem] border border-white/10 bg-slate-900 p-5">
        <div className="mb-4 border-b border-white/10 pb-4">
          <div className="text-lg font-semibold">{title}</div>
          <p className="mt-1 text-xs leading-5 text-slate-400">{subtitle}</p>
        </div>
        {children}
      </div>
    </section>
  );
}

function SidebarRow({
  item,
  active = false,
  subtle = false,
}: {
  item: MenuItem;
  active?: boolean;
  subtle?: boolean;
}) {
  const Icon = item.icon;

  return (
    <div
      className={[
        "rounded-2xl border px-3 py-3",
        active
          ? "border-emerald-400/40 bg-emerald-400/10"
          : subtle
            ? "border-white/10 bg-white/5"
            : "border-white/10 bg-slate-950/60",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-xl bg-white/10 p-2">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-medium text-white">{item.name}</div>
            {item.badge ? (
              <span className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-medium text-emerald-200">
                {item.badge}
              </span>
            ) : null}
          </div>
          <div className="mt-1 text-xs leading-5 text-slate-400">{item.summary}</div>
        </div>
      </div>
    </div>
  );
}

function GroupCard({
  group,
  accent = "amber",
}: {
  group: MenuGroup;
  accent?: "amber" | "emerald";
}) {
  const accentStyles =
    accent === "emerald"
      ? "border-emerald-200 bg-emerald-50/60"
      : "border-amber-200 bg-amber-50/60";

  return (
    <div className={`rounded-2xl border p-5 ${accentStyles}`}>
      <div className="text-sm font-semibold text-slate-900">{group.title}</div>
      <p className="mt-2 text-sm leading-6 text-slate-600">{group.description}</p>
      <div className="mt-4 space-y-3">
        {group.items.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.name} className="rounded-2xl border border-white/70 bg-white/80 p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-slate-100 p-2 text-slate-600">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-semibold text-slate-900">{item.name}</div>
                    {item.badge ? (
                      <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                        {item.badge}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">{item.summary}</div>
                </div>
              </div>
              <div className="mt-3 inline-flex rounded-full border bg-slate-50 px-2.5 py-1 text-[11px] text-slate-500">
                {item.href}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RouteCard({ item }: { item: MenuItem }) {
  const Icon = item.icon;

  return (
    <div className="rounded-2xl border bg-muted/10 p-4">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-slate-100 p-2 text-slate-600">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-slate-900">{item.name}</div>
          <p className="mt-1 text-xs leading-5 text-slate-500">{item.summary}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="rounded-full border bg-white px-2.5 py-1 text-[11px] text-slate-500">{item.href}</span>
        <Link href={item.href} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          查看现有页面
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
