import type { WideTable } from "@/lib/types";
import type {
  SchemaTemplateOption,
  SchemaTemplateSearchResult,
} from "../types";

export function buildSchemaCandidateMeta(template: WideTable): string {
  const description = template.description?.trim();
  return description ? `${description} · ${template.id}` : template.id;
}

export function normalizeSchemaTemplateKeyword(value: string): string {
  return value.trim().toLowerCase();
}

export function resolveSchemaTemplateSearch(
  keyword: string,
  templateOptions: SchemaTemplateOption[],
): SchemaTemplateSearchResult {
  const normalizedKeyword = normalizeSchemaTemplateKeyword(keyword);
  const exactMatches = templateOptions.filter((option) =>
    [option.value, option.meta, option.template.name, option.template.id].some(
      (candidate) => normalizeSchemaTemplateKeyword(candidate) === normalizedKeyword,
    ),
  );

  if (exactMatches.length === 1) {
    return { kind: "matched", template: exactMatches[0].template };
  }

  if (exactMatches.length > 1) {
    return { kind: "ambiguous", matches: exactMatches };
  }

  const fuzzyMatches = templateOptions.filter((option) =>
    [option.value, option.meta, option.template.name, option.template.id].some(
      (candidate) => normalizeSchemaTemplateKeyword(candidate).includes(normalizedKeyword),
    ),
  );

  if (fuzzyMatches.length === 1) {
    return { kind: "matched", template: fuzzyMatches[0].template };
  }

  if (fuzzyMatches.length > 1) {
    return { kind: "ambiguous", matches: fuzzyMatches };
  }

  return { kind: "missing" };
}

export function filterSchemaTemplateOptions(
  keyword: string,
  templateOptions: SchemaTemplateOption[],
): SchemaTemplateOption[] {
  const normalizedKeyword = normalizeSchemaTemplateKeyword(keyword);

  if (!normalizedKeyword) {
    return templateOptions;
  }

  return templateOptions.filter((option) =>
    [option.value, option.meta, option.template.name, option.template.id].some((candidate) =>
      normalizeSchemaTemplateKeyword(candidate).includes(normalizedKeyword),
    ),
  );
}

export function dedupeSchemaTemplateOptions(templates: WideTable[]): WideTable[] {
  const optionMap = new Map<string, WideTable>();

  for (const template of templates) {
    const dedupeKey = normalizeSchemaTemplateKeyword(template.name);
    const current = optionMap.get(dedupeKey);
    if (!current || compareSchemaCandidatePriority(template, current) < 0) {
      optionMap.set(dedupeKey, template);
    }
  }

  return Array.from(optionMap.values());
}

export function compareSchemaCandidatePriority(left: WideTable, right: WideTable): number {
  const leftStatus = schemaCandidateStatusScore(left.status);
  const rightStatus = schemaCandidateStatusScore(right.status);
  if (leftStatus !== rightStatus) {
    return rightStatus - leftStatus;
  }

  if (left.recordCount !== right.recordCount) {
    return right.recordCount - left.recordCount;
  }

  if (left.schema.columns.length !== right.schema.columns.length) {
    return right.schema.columns.length - left.schema.columns.length;
  }

  return left.createdAt.localeCompare(right.createdAt);
}

export function schemaCandidateStatusScore(status: WideTable["status"]): number {
  if (status === "active") {
    return 3;
  }
  if (status === "initialized") {
    return 2;
  }
  return 1;
}
