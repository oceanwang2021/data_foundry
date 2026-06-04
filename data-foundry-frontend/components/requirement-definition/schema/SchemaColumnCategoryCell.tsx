"use client";

import type { ColumnDefinition } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  categoryBadgeClass,
  categoryLabel,
  categorySelectClass,
  normalizeCategoryForUI,
} from "@/components/requirement-definition/utils/requirementDefinitionFormatters";

type SchemaCategoryValue = "id" | "time" | "system" | "dimension" | "indicator";

type Props = {
  editable: boolean;
  category: ColumnDefinition["category"];
  isBusinessDate?: boolean;
  onChange?: (value: SchemaCategoryValue) => void;
};

export function SchemaColumnCategoryCell({
  editable,
  category,
  isBusinessDate,
  onChange,
}: Props) {
  const currentValue = isBusinessDate ? "time" : normalizeCategoryForUI(category);

  if (!editable) {
    return (
      <span className={cn("rounded px-1.5 py-0.5 text-xs", categoryBadgeClass(currentValue))}>
        {categoryLabel(currentValue)}
      </span>
    );
  }

  return (
    <select
      value={currentValue}
      onChange={(event) => onChange?.(event.target.value as SchemaCategoryValue)}
      className={cn("w-full rounded-md border px-2 py-1 text-xs", categorySelectClass(currentValue))}
    >
      <option value="id">{categoryLabel("id")}</option>
      <option value="time">{categoryLabel("time")}</option>
      <option value="system">{categoryLabel("system")}</option>
      <option value="dimension">{categoryLabel("dimension")}</option>
      <option value="indicator">{categoryLabel("indicator")}</option>
    </select>
  );
}
