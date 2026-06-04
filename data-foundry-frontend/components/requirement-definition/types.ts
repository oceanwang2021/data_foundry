import type { WideTable } from "@/lib/types";

export type DimensionExcelImportState = {
  fileName: string;
  fileType: "text/csv" | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  fileContent: string;
  headers: string[];
  rows: Array<Record<string, string>>;
};

export type SchemaTemplateOption = {
  key: string;
  value: string;
  meta: string;
  template: WideTable;
};

export type SchemaTemplateSearchResult =
  | { kind: "matched"; template: WideTable }
  | { kind: "ambiguous"; matches: SchemaTemplateOption[] }
  | { kind: "missing" };
