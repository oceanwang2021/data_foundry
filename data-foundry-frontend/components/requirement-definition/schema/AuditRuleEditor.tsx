"use client";

import type { ColumnDefinition } from "@/lib/types";
import {
  auditRuleNeedsValue,
  formatAuditRuleDisplay,
} from "@/components/requirement-definition/utils/requirementDefinitionFormatters";

type Props = {
  column: ColumnDefinition;
  editable: boolean;
  onChange: (patch: Partial<ColumnDefinition>) => void;
};

export default function AuditRuleEditor({
  column,
  editable,
  onChange,
}: Props) {
  if (!editable) {
    return <span>{formatAuditRuleDisplay(column)}</span>;
  }

  return (
    <div className="space-y-1.5">
      <select
        value={column.auditRuleType ?? ""}
        onChange={(event) => {
          const ruleType = (event.target.value || undefined) as ColumnDefinition["auditRuleType"] | undefined;
          onChange({
            auditRuleType: ruleType,
            auditRuleValue: ruleType && auditRuleNeedsValue(ruleType) ? (column.auditRuleValue ?? "") : "",
          });
        }}
        className="w-full rounded-md border bg-background px-2 py-1 text-xs"
      >
        <option value="">不设置</option>
        <option value="max_lte">最大值小于等于 xxx</option>
        <option value="min_gte">最小值大于等于 xxx</option>
        <option value="change_rate_lte">本期较上期变化范围不超过 xxx</option>
        <option value="not_empty">不为空</option>
      </select>
      {column.auditRuleType && auditRuleNeedsValue(column.auditRuleType) ? (
        <input
          value={column.auditRuleValue ?? ""}
          onChange={(event) => onChange({ auditRuleValue: event.target.value })}
          className="w-full rounded-md border bg-background px-2 py-1 text-xs"
          placeholder="填写 xxx 的数值"
        />
      ) : null}
    </div>
  );
}
