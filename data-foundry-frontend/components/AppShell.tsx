"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { fetchCurrentAccount } from "@/lib/api-client";
import {
  clearAuthSession,
  getCurrentUser,
  isAdminRole,
  loadAuthToken,
  saveStoredCurrentUser,
  subscribePermissionsChanged,
  type PermissionUser,
} from "@/lib/auth-permissions";
import { cn } from "@/lib/utils";

const PUBLIC_PATHS = new Set(["/login", "/register"]);

function FullscreenMessage({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="rounded-xl border bg-card px-6 py-5 text-sm text-muted-foreground shadow-sm">{message}</div>
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const isPublicPath = PUBLIC_PATHS.has(pathname);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [currentUser, setCurrentUser] = useState<PermissionUser | null>(() => getCurrentUser());

  useEffect(() => {
    let cancelled = false;

    const syncSession = async () => {
      const token = loadAuthToken();
      if (!token) {
        if (!cancelled) {
          setCurrentUser(null);
          saveStoredCurrentUser(null);
          setBootstrapped(true);
          if (!isPublicPath) {
            router.replace(`/login?next=${encodeURIComponent(pathname)}`);
          }
        }
        return;
      }

      try {
        const user = await fetchCurrentAccount();
        if (cancelled) {
          return;
        }
        saveStoredCurrentUser(user);
        setCurrentUser(user);
        setBootstrapped(true);
        if (isPublicPath) {
          router.replace("/projects");
          return;
        }
        if (pathname.startsWith("/settings/permissions") && !isAdminRole(user.role)) {
          router.replace("/projects");
        }
      } catch {
        if (cancelled) {
          return;
        }
        clearAuthSession();
        setCurrentUser(null);
        setBootstrapped(true);
        if (!isPublicPath) {
          router.replace(`/login?next=${encodeURIComponent(pathname)}`);
        }
      }
    };

    void syncSession();
    const unsubscribe = subscribePermissionsChanged(() => {
      if (cancelled) {
        return;
      }
      const storedUser = getCurrentUser();
      setCurrentUser(storedUser);
      setBootstrapped(true);
      if (!loadAuthToken() && !isPublicPath) {
        router.replace(`/login?next=${encodeURIComponent(pathname)}`);
        return;
      }
      if (pathname.startsWith("/settings/permissions") && storedUser && !isAdminRole(storedUser.role)) {
        router.replace("/projects");
      }
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [isPublicPath, pathname, router]);

  const content = useMemo(() => {
    if (!bootstrapped) {
      return <FullscreenMessage message="正在验证登录状态..." />;
    }

    if (isPublicPath) {
      return <>{children}</>;
    }

    if (!currentUser) {
      return <FullscreenMessage message="正在跳转到登录页..." />;
    }

    return (
      <div className="flex min-h-screen">
        <Sidebar />
        <main className={cn("flex-1 overflow-y-auto bg-muted/20")}>{children}</main>
      </div>
    );
  }, [bootstrapped, children, currentUser, isPublicPath]);

  return content;
}
