import type {
  ColumnDefinition,
  WideTable,
} from "@/lib/types";
import { GROUP_TONE_CLASSES } from "./requirementDefinitionConstants";

export function frequencyLabel(freq: string): string {
  const map: Record<string, string> = {
    daily: "日频",
    weekly: "周频",
    monthly: "月频",
    quarterly: "季频",
    yearly: "年频",
  };
  return map[freq] ?? freq;
}

export function formatPersistError(error: unknown): string {
  if (error instanceof Error && error.message.trim() !== "") {
    return error.message;
  }
  return "请稍后重试";
}

export function normalizeCategoryForUI(category: ColumnDefinition["category"]): Exclude<ColumnDefinition["category"], "attribute"> {
  return (category === "attribute" ? "system" : category) as Exclude<ColumnDefinition["category"], "attribute">;
}

export function categoryBadgeClass(category: ColumnDefinition["category"] | "time"): string {
  if (category === "id") {
    return "bg-purple-100 text-purple-700";
  }
  if (category === "time") {
    return "bg-sky-100 text-sky-700";
  }
  if (category === "dimension") {
    return "bg-blue-100 text-blue-700";
  }
  if (category === "attribute") {
    return "bg-amber-100 text-amber-700";
  }
  if (category === "indicator") {
    return "bg-emerald-100 text-emerald-700";
  }
  return "bg-gray-100 text-gray-600";
}

export function categorySelectClass(category: ColumnDefinition["category"] | "time"): string {
  if (category === "time") {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }
  if (category === "dimension") {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }
  if (category === "attribute") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (category === "indicator") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (category === "id") {
    return "border-purple-200 bg-purple-50 text-purple-700";
  }
  return "border-gray-200 bg-gray-50 text-gray-700";
}

export function groupToneClass(groupId: string, groups: WideTable["indicatorGroups"]): string {
  const toneIndex = Math.max(
    0,
    groups.findIndex((group) => group.id === groupId),
  ) % GROUP_TONE_CLASSES.length;
  return GROUP_TONE_CLASSES[toneIndex];
}

export function groupSelectClass(groupId: string | undefined, groups: WideTable["indicatorGroups"]): string {
  if (!groupId) {
    return "border-gray-200 bg-gray-50 text-gray-700";
  }
  return groupToneClass(groupId, groups);
}

export function categoryLabel(category: ColumnDefinition["category"] | "time"): string {
  if (category === "id") {
    return "ID列";
  }
  if (category === "time") {
    return "时间列";
  }
  if (category === "dimension") {
    return "维度列";
  }
  if (category === "attribute") {
    return "属性列";
  }
  if (category === "indicator") {
    return "指标列";
  }
  return "系统列";
}

export function auditRuleNeedsValue(ruleType: ColumnDefinition["auditRuleType"]): boolean {
  return ruleType === "max_lte" || ruleType === "min_gte" || ruleType === "change_rate_lte";
}

export function formatPassthroughDisplay(column: ColumnDefinition): string {
  if (!column.passthroughEnabled) {
    return "否";
  }
  if (column.passthroughContent?.trim()) {
    return `是：${column.passthroughContent.trim()}`;
  }
  return "是";
}

export function formatAuditRuleDisplay(column: ColumnDefinition): string {
  if (!column.auditRuleType) {
    return "-";
  }
  const value = (column.auditRuleValue ?? "").trim();
  if (column.auditRuleType === "max_lte") {
    return `最大值小于等于 ${value || "xxx"}`;
  }
  if (column.auditRuleType === "min_gte") {
    return `最小值大于等于 ${value || "xxx"}`;
  }
  if (column.auditRuleType === "change_rate_lte") {
    return `本期较上期变化范围不超过 ${value || "xxx"}`;
  }
  return "不为空";
}
