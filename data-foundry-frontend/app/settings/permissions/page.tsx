"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchAccounts, updateAccount } from "@/lib/api-client";
import {
  getCurrentUser,
  isAdminRole,
  ROLE_LABEL,
  STATUS_LABEL,
  subscribePermissionsChanged,
  type PermissionUser,
  type UserRole,
  type UserStatus,
} from "@/lib/auth-permissions";
import { cn } from "@/lib/utils";

export default function PermissionsPage() {
  const [users, setUsers] = useState<PermissionUser[]>([]);
  const [currentUser, setCurrentUser] = useState<PermissionUser | null>(() => getCurrentUser());
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const refreshCurrentUser = () => setCurrentUser(getCurrentUser());
    refreshCurrentUser();
    return subscribePermissionsChanged(refreshCurrentUser);
  }, []);

  useEffect(() => {
    if (!currentUser || !isAdminRole(currentUser.role)) {
      setUsers([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    fetchAccounts()
      .then((rows) => setUsers(rows))
      .catch((error) => setMessage(error instanceof Error ? error.message : "加载账号失败"))
      .finally(() => setLoading(false));
  }, [currentUser]);

  const roleOptions: { value: UserRole; label: string }[] = useMemo(
    () => (Object.keys(ROLE_LABEL) as UserRole[]).map((role) => ({ value: role, label: ROLE_LABEL[role] })),
    [],
  );

  const statusOptions: { value: UserStatus; label: string }[] = useMemo(
    () => (Object.keys(STATUS_LABEL) as UserStatus[]).map((status) => ({ value: status, label: STATUS_LABEL[status] })),
    [],
  );

  const handlePatch = async (
    account: string,
    patch: Partial<{
      role: UserRole;
      status: UserStatus;
    }>,
  ) => {
    try {
      const updated = await updateAccount(account, patch);
      setUsers((prev) => prev.map((item) => (item.account === account ? updated : item)));
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    }
  };

  if (!currentUser || !isAdminRole(currentUser.role)) {
    return (
      <div className="max-w-4xl space-y-4 p-8">
        <h1 className="text-2xl font-bold tracking-tight">权限配置</h1>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          仅管理员可访问该页面。
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-6 p-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">权限配置</h1>
        <p className="text-sm text-muted-foreground">
          维护真实账号的状态与角色。数据BA/业务专家不显示“采集任务管理”，数据工程师/管理员显示全部菜单。
        </p>
      </div>

      <section className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">当前登录用户</h2>
          <p className="text-sm text-muted-foreground">
            当前：{currentUser.name}（{currentUser.account} / {ROLE_LABEL[currentUser.role]}）
          </p>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">账号列表</h2>
          <p className="text-sm text-muted-foreground">账号、中文姓名、状态与角色均来自后端数据库。</p>
        </div>

        {message ? (
          <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {message}
          </div>
        ) : null}

        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">账号</th>
                <th className="py-2 pr-4 font-medium">中文姓名</th>
                <th className="py-2 pr-4 font-medium">状态</th>
                <th className="py-2 pr-4 font-medium">角色</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-muted-foreground">
                    正在加载账号...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-muted-foreground">
                    暂无账号数据。
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.account} className="border-b last:border-b-0">
                    <td className="py-3 pr-4 font-mono text-xs">{user.account}</td>
                    <td className="py-3 pr-4">{user.name}</td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-3">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                            user.status === "ACTIVE"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-zinc-100 text-zinc-600",
                          )}
                        >
                          {STATUS_LABEL[user.status]}
                        </span>
                        <select
                          value={user.status}
                          onChange={(event) => void handlePatch(user.account, { status: event.target.value as UserStatus })}
                          className="h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-primary/20"
                        >
                          {statusOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <select
                        value={user.role}
                        onChange={(event) => void handlePatch(user.account, { role: event.target.value as UserRole })}
                        className="h-9 w-44 rounded-md border border-input bg-background px-2 text-sm shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-primary/20"
                      >
                        {roleOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
