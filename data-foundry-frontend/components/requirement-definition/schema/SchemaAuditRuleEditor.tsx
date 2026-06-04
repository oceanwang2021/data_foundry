"use client";

import type { ColumnDefinition } from "@/lib/types";
import { auditRuleNeedsValue } from "@/components/requirement-definition/utils/requirementDefinitionFormatters";

type Props = {
  editable: boolean;
  ruleType?: ColumnDefinition["auditRuleType"];
  ruleValue?: string;
  displayValue: string;
  onRuleTypeChange?: (ruleType?: ColumnDefinition["auditRuleType"]) => void;
  onRuleValueChange?: (value: string) => void;
};

export function SchemaAuditRuleEditor({
  editable,
  ruleType,
  ruleValue,
  displayValue,
  onRuleTypeChange,
  onRuleValueChange,
}: Props) {
  if (!editable) {
    return <span>{displayValue}</span>;
  }

  return (
    <div className="space-y-1.5">
      <select
        value={ruleType ?? ""}
        onChange={(event) => {
          const nextRuleType = (event.target.value || undefined) as ColumnDefinition["auditRuleType"] | undefined;
          onRuleTypeChange?.(nextRuleType);
        }}
        className="w-full rounded-md border bg-background px-2 py-1 text-xs"
      >
        <option value="">不设置</option>
        <option value="max_lte">最大值小于等于 xxx</option>
        <option value="min_gte">最小值大于等于 xxx</option>
        <option value="change_rate_lte">本期较上期变化范围不超过 xxx</option>
        <option value="not_empty">不为空</option>
      </select>
      {ruleType && auditRuleNeedsValue(ruleType) ? (
        <input
          value={ruleValue ?? ""}
          onChange={(event) => onRuleValueChange?.(event.target.value)}
          className="w-full rounded-md border bg-background px-2 py-1 text-xs"
          placeholder="填写 xxx 的数值"
        />
      ) : null}
    </div>
  );
}
