"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  muted?: boolean;
  columnName: string;
  columnType: string;
  requiredCell: ReactNode;
  chineseNameCell: ReactNode;
  categoryCell: ReactNode;
  descriptionCell: ReactNode;
  unitCell: ReactNode;
  passthroughCell: ReactNode;
  auditRuleCell: ReactNode;
};

export function SchemaColumnRow({
  muted,
  columnName,
  columnType,
  requiredCell,
  chineseNameCell,
  categoryCell,
  descriptionCell,
  unitCell,
  passthroughCell,
  auditRuleCell,
}: Props) {
  return (
    <tr className={cn(muted ? "text-muted-foreground" : "")}>
      <td className="px-2 py-1.5 font-mono">{columnName}</td>
      <td className="px-2 py-1.5">{chineseNameCell}</td>
      <td className="px-2 py-1.5">{columnType}</td>
      <td className="px-2 py-1.5">{categoryCell}</td>
      <td className="px-2 py-1.5 text-muted-foreground">{descriptionCell}</td>
      <td className="px-2 py-1.5 text-muted-foreground">{unitCell}</td>
      <td className="px-2 py-1.5">{requiredCell}</td>
      <td className="px-2 py-1.5 align-top">{passthroughCell}</td>
      <td className="px-2 py-1.5 align-top">{auditRuleCell}</td>
    </tr>
  );
}
