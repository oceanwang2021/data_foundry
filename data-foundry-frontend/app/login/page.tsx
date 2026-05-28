"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { loginAccount } from "@/lib/api-client";
import { saveAuthToken, saveStoredCurrentUser } from "@/lib/auth-permissions";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams?.get("next") || "/projects";
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!account.trim() || !password) {
      setMessage("请输入账号和密码。");
      return;
    }
    setSubmitting(true);
    setMessage("");
    try {
      const result = await loginAccount({ account: account.trim(), password });
      saveAuthToken(result.token);
      saveStoredCurrentUser(result.user);
      router.replace(next);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "登录失败");
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#dbeafe,transparent_38%),linear-gradient(180deg,#f8fbff_0%,#eef2ff_100%)] p-6">
      <div className="w-full max-w-md rounded-2xl border bg-white/90 p-8 shadow-xl backdrop-blur">
        <div className="space-y-2">
          <div className="text-sm font-medium text-primary">Data Foundry</div>
          <h1 className="text-2xl font-bold">登录平台</h1>
          <p className="text-sm text-muted-foreground">使用真实账号进入平台，菜单权限会根据角色自动切换。</p>
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
            <label className="text-xs text-muted-foreground">密码</label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="请输入密码"
            />
          </div>

          {message ? <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{message}</div> : null}

          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? "登录中..." : "登录"}
          </button>
        </div>

        <div className="mt-6 text-sm text-muted-foreground">
          还没有账号？<Link href="/register" className="text-primary hover:underline">去注册</Link>
        </div>
      </div>
    </div>
  );
}
