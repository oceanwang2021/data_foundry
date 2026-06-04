"use client";

import AccountSelect from "@/components/AccountSelect";
import type {
  Requirement,
  WideTable,
} from "@/lib/types";
import {
  CompactInfoItem,
  EditableField,
} from "@/components/requirement-definition/shared/DefinitionShared";

type Props = {
  requirement: Requirement;
  wideTables: WideTable[];
  onRequirementChange?: (requirement: Requirement) => void;
};

export default function BasicInfoSection({
  requirement,
  wideTables,
  onRequirementChange,
}: Props) {
  const linkedWideTable = requirement.wideTable ?? wideTables[0];
  const update = (patch: Partial<Requirement>) => {
    onRequirementChange?.({ ...requirement, ...patch });
  };

  return (
    <section id="business-definition" className="scroll-mt-28 rounded-xl border bg-card p-6 space-y-4">
      <div className="space-y-1">
        <h3 className="font-semibold">1. 业务定义</h3>
        <p className="text-xs text-muted-foreground">明确这条需求的背景知识与角色分工。</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <CompactInfoItem label="需求 ID" value={requirement.id} />
        <EditableField label="业务负责人" control={
          <AccountSelect
            value={requirement.ownerAccount}
            displayName={requirement.owner}
            onChange={({ account, name }) => update({ owner: name, ownerAccount: account || undefined })}
          />
        } />
        <EditableField label="执行人" control={
          <AccountSelect
            value={requirement.assigneeAccount}
            displayName={requirement.assignee}
            onChange={({ account, name }) => update({ assignee: name, assigneeAccount: account || undefined })}
          />
        } />
        <EditableField label="数据验收负责人" control={
          <AccountSelect
            value={requirement.acceptanceOwnerAccount}
            displayName={requirement.acceptanceOwner}
            onChange={({ account, name }) => update({ acceptanceOwner: name, acceptanceOwnerAccount: account || undefined })}
          />
        } />
      </div>

      <EditableField label="需求标题" control={
        <input className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          value={requirement.title} onChange={(e) => update({ title: e.target.value })} />
      } />

      <div className="grid gap-3 xl:grid-cols-1">
        <EditableField label="背景知识" control={
          <textarea className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[72px] resize-y"
            value={requirement.backgroundKnowledge ?? requirement.businessGoal ?? ""}
            onChange={(e) => update({ backgroundKnowledge: e.target.value })}
            placeholder="补充业务背景、历史口径和上下文信息" />
        } />
      </div>

      <CompactInfoItem label="当前关联数据表" value={linkedWideTable ? linkedWideTable.name : "尚未关联"} />
    </section>
  );
}
