"use client";

import type { ColumnDefinition } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  categoryBadgeClass,
  categoryLabel,
  normalizeCategoryForUI,
} from "@/components/requirement-definition/utils/requirementDefinitionFormatters";

type Props = {
  category: ColumnDefinition["category"];
  isBusinessDate?: boolean;
};

export default function ColumnCategoryBadge({
  category,
  isBusinessDate,
}: Props) {
  const displayCategory = isBusinessDate ? "time" : normalizeCategoryForUI(category);

  return (
    <span
      className={cn(
        "px-1.5 py-0.5 rounded text-xs",
        categoryBadgeClass(displayCategory),
      )}
    >
      {categoryLabel(displayCategory)}
    </span>
  );
}
