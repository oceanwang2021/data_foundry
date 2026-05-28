"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { registerAccount } from "@/lib/api-client";
import { ROLE_LABEL, type UserRole } from "@/lib/auth-permissions";

const ROLE_OPTIONS = (Object.keys(ROLE_LABEL) as UserRole[]).map((role) => ({
  value: role,
  label: ROLE_LABEL[role],
}));

export default function RegisterPage() {
  const router = useRouter();
  const [account, setAccount] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("DATA_BA");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!account.trim() || !displayName.trim() || !password) {
      setMessage("请输入账号、中文姓名和密码。");
      return;
    }
    setSubmitting(true);
    setMessage("");
    try {
      await registerAccount({
        account: account.trim(),
        password,
        displayName: displayName.trim(),
        role,
      });
      router.replace("/login");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "注册失败");
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#dcfce7,transparent_35%),linear-gradient(180deg,#fbfffd_0%,#effcf5_100%)] p-6">
      <div className="w-full max-w-md rounded-2xl border bg-white/90 p-8 shadow-xl backdrop-blur">
        <div className="space-y-2">
          <div className="text-sm font-medium text-emerald-700">Data Foundry</div>
          <h1 className="text-2xl font-bold">注册账号</h1>
          <p className="text-sm text-muted-foreground">注册后即可登录平台。中文姓名会用于页面展示，账号用于权限和归属口径。</p>
        </div>

        <div className="mt-6 space-y-4">
          <div>
            <label className="text-xs text-muted-foreground">账号</label>
            <input
              value={account}
              onChange={(event) => setAccount(event.target.value)}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="请输入账号"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">中文姓名</label>
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="请输入中文姓名"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">密码</label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="请输入密码"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">角色</label>
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as UserRole)}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              {ROLE_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          {message ? <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{message}</div> : null}

          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting}
            className="w-full rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {submitting ? "注册中..." : "注册"}
          </button>
        </div>

        <div className="mt-6 text-sm text-muted-foreground">
          已有账号？<Link href="/login" className="text-primary hover:underline">返回登录</Link>
        </div>
      </div>
    </div>
  );
}
