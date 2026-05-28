"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchAssignableAccounts } from "@/lib/api-client";
import type { PermissionUser } from "@/lib/auth-permissions";
import { cn } from "@/lib/utils";

type Props = {
  value?: string;
  displayName?: string;
  onChange: (next: { account: string; name: string }) => void;
  placeholder?: string;
  disabled?: boolean;
};

const UNBOUND_VALUE = "__unbound__";

export default function AccountSelect({
  value,
  displayName,
  onChange,
  placeholder = "请选择账号",
  disabled = false,
}: Props) {
  const [accounts, setAccounts] = useState<PermissionUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchAssignableAccounts()
      .then((rows) => {
        if (!cancelled) {
          setAccounts(rows);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAccounts([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedValue = useMemo(() => {
    if (value) {
      return value;
    }
    if (displayName) {
      return UNBOUND_VALUE;
    }
    return "";
  }, [displayName, value]);

  const hasCurrentOption = useMemo(
    () => (value ? accounts.some((item) => item.account === value) : false),
    [accounts, value],
  );

  const handleChange = (nextValue: string) => {
    if (nextValue === UNBOUND_VALUE) {
      onChange({ account: "", name: displayName ?? "" });
      return;
    }
    const matched = accounts.find((item) => item.account === nextValue);
    onChange({
      account: matched?.account ?? "",
      name: matched?.name ?? "",
    });
  };

  return (
    <select
      value={selectedValue}
      disabled={disabled || loading}
      onChange={(event) => handleChange(event.target.value)}
      className={cn(
        "w-full rounded-md border bg-background px-3 py-2 text-sm",
        (disabled || loading) ? "text-muted-foreground" : "",
      )}
    >
      <option value="">{loading ? "正在加载账号..." : placeholder}</option>
      {!value && displayName ? <option value={UNBOUND_VALUE}>{displayName}（未绑定账号）</option> : null}
      {value && displayName && !hasCurrentOption ? <option value={value}>{displayName}（{value}）</option> : null}
      {accounts.map((item) => (
        <option key={item.account} value={item.account}>
          {item.name}（{item.account}）
        </option>
      ))}
    </select>
  );
}
