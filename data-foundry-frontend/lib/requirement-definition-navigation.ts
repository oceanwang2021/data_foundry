export const definitionSectionIds = [
  "business-definition",
  "data-source",
  "structure-config",
  "scope-generation",
  "data-update",
] as const;

export type DefinitionSectionId = (typeof definitionSectionIds)[number];
export const definitionSectionActivationOffset = 24;

export function parseDefinitionSectionHash(hash: string): DefinitionSectionId | null {
  const normalizedHash = hash.replace(/^#/, "");
  return definitionSectionIds.find((sectionId) => sectionId === normalizedHash) ?? null;
}

export function resolveActiveDefinitionSection(
  sectionViewportTops: Partial<Record<DefinitionSectionId, number>>,
  anchorOffset: number,
  activationOffset: number = definitionSectionActivationOffset,
  orderedSectionIds: readonly DefinitionSectionId[] = definitionSectionIds,
): DefinitionSectionId {
  let nextActiveSection: DefinitionSectionId = orderedSectionIds[0] ?? definitionSectionIds[0];

  for (const sectionId of orderedSectionIds) {
    const sectionViewportTop = sectionViewportTops[sectionId];
    if (sectionViewportTop == null) {
      continue;
    }

    if (sectionViewportTop - anchorOffset <= activationOffset) {
      nextActiveSection = sectionId;
    } else {
      break;
    }
  }

  return nextActiveSection;
}
