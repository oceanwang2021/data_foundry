"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import type { Project } from "@/lib/types";
import { createProject } from "@/lib/api-client";
import { getCurrentUser } from "@/lib/auth-permissions";
import { cn } from "@/lib/utils";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (project: Project) => void;
};

export default function CreateProjectModal({ isOpen, onClose, onSaved }: Props) {
  const currentUser = useMemo(() => getCurrentUser(), []);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [ownerTeam, setOwnerTeam] = useState("");
  const [businessBackground, setBusinessBackground] = useState("");

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setName("");
    setDescription("");
    setOwnerTeam("");
    setBusinessBackground("");
    setSaving(false);
    setMessage("");
  }, [isOpen]);

  if (!isOpen) return null;

  const canSave = name.trim() !== "" && !saving;

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setMessage("");
    try {
      const project = await createProject({
        name: name.trim(),
        description: description.trim() || undefined,
        ownerTeam: ownerTeam.trim() || undefined,
        businessBackground: businessBackground.trim() || undefined,
        createdBy: currentUser.name,
      });
      onSaved(project);
    } catch (err: any) {
      setMessage(err?.message ? String(err.message) : "创建失败");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-xl border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b p-4">
          <div className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" />
            <div className="text-base font-semibold">新建项目</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 hover:bg-muted"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 p-4">
          {message ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {message}
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">项目ID（系统生成）</label>
              <input
                value="提交后生成"
                disabled
                className="w-full rounded-md border bg-muted/20 px-3 py-2 text-sm text-muted-foreground"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">创建人（自动）</label>
              <input
                value={currentUser.name}
                disabled
                className="w-full rounded-md border bg-muted/20 px-3 py-2 text-sm text-muted-foreground"
              />
            </div>

            <div className="space-y-1 md:col-span-2">
              <label className="text-xs text-muted-foreground">
                项目名称 <span className="text-red-500">*</span>
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder="请输入项目名称"
              />
            </div>

            <div className="space-y-1 md:col-span-2">
              <label className="text-xs text-muted-foreground">项目描述（选填）</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full min-h-20 rounded-md border px-3 py-2 text-sm resize-y"
                placeholder="项目目标、交付边界、协作方式等"
              />
            </div>

            <div className="space-y-1 md:col-span-2">
              <label className="text-xs text-muted-foreground">所属团队（选填）</label>
              <input
                value={ownerTeam}
                onChange={(e) => setOwnerTeam(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder="对应 owner_team"
              />
            </div>

            <div className="space-y-1 md:col-span-2">
              <label className="text-xs text-muted-foreground">背景知识（选填）</label>
              <textarea
                value={businessBackground}
                onChange={(e) => setBusinessBackground(e.target.value)}
                className="w-full min-h-28 rounded-md border px-3 py-2 text-sm resize-y"
                placeholder="行业背景、指标口径、数据来源约束等"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t bg-muted/10 p-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className={cn(
              "rounded-md px-6 py-2 text-sm font-medium shadow-sm",
              canSave
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "cursor-not-allowed bg-muted text-muted-foreground",
            )}
          >
            {saving ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                保存中
              </span>
            ) : (
              "保存"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

