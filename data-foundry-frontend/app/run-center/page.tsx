import Link from "next/link";
import { Activity, ArrowRight, CalendarClock, RefreshCw } from "lucide-react";

const entryCards = [
  {
    title: "调度",
    href: "/scheduling",
    description: "集中处理手动触发、定时调度、补采重跑和执行记录。",
    icon: CalendarClock,
  },
  {
    title: "监控",
    href: "/ops-monitoring",
    description: "查看环境健康、任务状态、数据状态，以及演示环境的初始化操作。",
    icon: Activity,
  },
];

export default function RunCenterPage() {
  return (
    <div className="p-8 space-y-6">
      <header className="space-y-2">
        <div className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground">
          <RefreshCw className="h-3.5 w-3.5" />
          跨项目运行能力
        </div>
        <h1 className="text-2xl font-bold">运行中心</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          这里放跨项目、跨需求的运行能力，不承载具体需求定义。与单个需求强绑定的配置、执行和数据视图，仍在需求详情内完成。
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        {entryCards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.title}
              href={card.href}
              className="rounded-xl border bg-card p-5 shadow-sm transition-colors hover:border-primary/40 hover:bg-primary/5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2">
                  <div className="inline-flex rounded-lg bg-primary/10 p-2 text-primary">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="text-lg font-semibold">{card.title}</div>
                  <p className="text-sm text-muted-foreground">{card.description}</p>
                </div>
                <ArrowRight className="mt-1 h-4 w-4 text-muted-foreground" />
              </div>
            </Link>
          );
        })}
      </section>
    </div>
  );
}
