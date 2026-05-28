"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  FolderKanban,
  ClipboardList,
  Workflow,
  ShieldCheck,
  Activity,
  CalendarClock,
  ChevronRight,
  BookOpen,
  Settings,
  SlidersHorizontal,
  Users,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  canViewCollectionTasks,
  getCurrentUser,
  isAdminRole,
  subscribePermissionsChanged,
  type PermissionUser,
  type UserRole,
} from "@/lib/auth-permissions";

type NavChildType = {
  name: string;
  href: string;
  icon: LucideIcon;
};

type MatchContext = {
  pathname: string;
  tab: string | null;
  nav: string | null;
};

type NavItemType = {
  name: string;
  href: string;
  icon: LucideIcon;
  match?: (context: MatchContext) => boolean;
  children?: NavChildType[];
};

const isProjectOverviewPath = (pathname: string) =>
  pathname === "/projects" || /^\/projects\/[^/]+\/?$/.test(pathname);

const isRequirementDetailPath = (pathname: string) =>
  /^\/projects\/[^/]+\/requirements\/[^/]+(?:\/.*)?$/.test(pathname);

const isRequirementTaskPath = (pathname: string) =>
  /^\/projects\/[^/]+\/requirements\/[^/]+\/tasks(?:\/[^/]+)?\/?$/.test(pathname);

const mainNav: NavItemType[] = [
  {
    name: "项目",
    href: "/projects",
    icon: FolderKanban,
    match: ({ pathname, nav }) => nav === "projects" || (!nav && isProjectOverviewPath(pathname)),
  },
  {
    name: "需求管理",
    href: "/requirements",
    icon: ClipboardList,
    match: ({ pathname, tab, nav }) =>
      nav === "requirements"
      || (!nav && (
        pathname === "/requirements"
        || (
          isRequirementDetailPath(pathname)
          && !isRequirementTaskPath(pathname)
          && tab !== "tasks"
          && tab !== "acceptance"
          && tab !== "audit"
        )
      )),
  },
  {
    name: "采集任务管理",
    href: "/collection-tasks",
    icon: Workflow,
    match: ({ pathname, tab, nav }) =>
      nav === "tasks"
      || (!nav && (
        pathname === "/collection-tasks"
        || isRequirementTaskPath(pathname)
        || (isRequirementDetailPath(pathname) && tab === "tasks")
      )),
  },
  {
    name: "数据验收",
    href: "/acceptance",
    icon: ShieldCheck,
    match: ({ pathname, tab, nav }) =>
      nav === "acceptance"
      || (!nav && (
        pathname === "/acceptance"
        || pathname.startsWith("/acceptance/")
        || pathname === "/quality-audit"
        || pathname.startsWith("/quality-audit/")
        || (isRequirementDetailPath(pathname) && (tab === "acceptance" || tab === "audit"))
      )),
  },
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
  {
    name: "系统配置",
    href: "/settings/model-config",
    icon: Settings,
    match: ({ pathname }) => pathname === "/settings" || pathname.startsWith("/settings/"),
    children: [
      { name: "模型配置", href: "/settings/model-config", icon: SlidersHorizontal },
      { name: "权限配置", href: "/settings/permissions", icon: Users },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const safePathname = pathname ?? "";
  const tab = searchParams?.get("tab") ?? null;
  const nav = searchParams?.get("nav") ?? null;
  const context: MatchContext = { pathname: safePathname, tab, nav };

  const [currentUser, setCurrentUser] = useState<PermissionUser | null>(() => getCurrentUser());
  const currentRole: UserRole = currentUser?.role ?? "DATA_BA";

  useEffect(() => {
    const refresh = () => setCurrentUser(getCurrentUser());
    refresh();
    return subscribePermissionsChanged(refresh);
  }, []);

  const visibleNav = useMemo(() => {
    const filtered = mainNav
      .filter((item) => canViewCollectionTasks(currentRole) || item.href !== "/collection-tasks")
      .map((item) =>
        item.href === "/settings/model-config"
          ? {
              ...item,
              children: (item.children ?? []).filter(
                (child) => child.href !== "/settings/permissions" || isAdminRole(currentRole),
              ),
            }
          : item,
      );

    const settingsIndex = filtered.findIndex((item) => item.href === "/settings/model-config");
    const personalCenterItem = {
      name: "个人中心",
      href: "/personal-center",
      icon: UserRound,
    } satisfies NavItemType;

    if (settingsIndex < 0) {
      return [...filtered, personalCenterItem];
    }

    return [
      ...filtered.slice(0, settingsIndex),
      personalCenterItem,
      ...filtered.slice(settingsIndex),
    ];
  }, [currentRole]);

  const isChildActive = (child: NavChildType) => {
    return safePathname === child.href || safePathname.startsWith(`${child.href}/`);
  };

  const NavItem = ({ item }: { item: NavItemType }) => {
    const hasActiveChild = item.children?.some((child) => isChildActive(child)) ?? false;
    const isActive = item.match
      ? item.match(context)
      : safePathname === item.href || (item.href !== "/" && safePathname.startsWith(`${item.href}/`)) || hasActiveChild;

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
          {item.children ? <ChevronRight className="h-3 w-3 opacity-60" /> : null}
        </Link>

        {item.children ? (
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
        ) : null}
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
          {visibleNav.map((item) => <NavItem key={item.name} item={item} />)}
        </nav>
      </div>
    </div>
  );
}
