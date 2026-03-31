"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FolderKanban,
  Activity,
  CalendarClock,
  ChevronRight,
  BookOpen,
  Settings,
} from "lucide-react";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type NavChildType = {
  name: string;
  href: string;
  icon: LucideIcon;
};

type NavItemType = {
  name: string;
  href: string;
  icon: LucideIcon;
  children?: NavChildType[];
};

const mainNav: NavItemType[] = [
  { name: "项目", href: "/projects", icon: FolderKanban },
  { name: "知识库", href: "/knowledge-base", icon: BookOpen },
  {
    name: "运行中心",
    href: "/run-center",
    icon: Activity,
    children: [
      { name: "调度", href: "/scheduling", icon: CalendarClock },
      { name: "监控", href: "/ops-monitoring", icon: Activity },
    ],
  },
  { name: "设置", href: "/settings", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const safePathname = pathname ?? "";

  const isChildActive = (child: NavChildType) => {
    if (child.href === "/projects") {
      return safePathname === "/projects" || /^\/projects\/[^/]+$/.test(safePathname);
    }
    if (child.href === "/requirements") {
      return safePathname === "/requirements" || safePathname.includes("/requirements/");
    }
    return safePathname === child.href || safePathname.startsWith(`${child.href}/`);
  };

  const NavItem = ({ item }: { item: NavItemType }) => {
    const hasActiveChild = item.children?.some((child) => isChildActive(child)) ?? false;
    const isProjectSection = item.href === "/projects";
    const isActive =
      (isProjectSection
        ? safePathname === "/projects" || safePathname.startsWith("/projects/") || safePathname === "/requirements" || safePathname.includes("/requirements/")
        : safePathname === item.href)
      || (item.href !== "/" && safePathname.startsWith(`${item.href}/`))
      || hasActiveChild;

    return (
      <div className="space-y-1">
        <Link
          href={item.href}
          className={cn(
            "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            isActive
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <item.icon className="h-4 w-4" />
          <span className="flex-1">{item.name}</span>
          {item.children && <ChevronRight className="h-3 w-3 opacity-60" />}
        </Link>

        {item.children && (
          <div className="ml-6 space-y-1 border-l pl-2">
            {item.children.map((child) => {
              const childActive = isChildActive(child);
              return (
                <Link
                  key={child.name}
                  href={child.href}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                    childActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <child.icon className="h-3.5 w-3.5" />
                  {child.name}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full w-64 flex-col border-r bg-card">
      <div className="flex h-14 items-center border-b px-6">
        <span className="text-lg font-bold text-primary">Data Foundry</span>
      </div>
      
      <div className="flex-1 overflow-y-auto py-4">
        <nav className="space-y-1 px-2">
          {mainNav.map((item) => <NavItem key={item.name} item={item} />)}
        </nav>
      </div>
    </div>
  );
}
