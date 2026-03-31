import { describe, expect, it } from "vitest";
import {
  parseDefinitionSectionHash,
  resolveActiveDefinitionSection,
} from "@/lib/requirement-definition-navigation";

describe("parseDefinitionSectionHash", () => {
  it("accepts valid definition anchors and rejects unknown ones", () => {
    expect(parseDefinitionSectionHash("#data-update")).toBe("data-update");
    expect(parseDefinitionSectionHash("#structure-config")).toBe("structure-config");
    expect(parseDefinitionSectionHash("scope-generation")).toBe("scope-generation");
    expect(parseDefinitionSectionHash("#not-a-real-section")).toBeNull();
  });
});

describe("resolveActiveDefinitionSection", () => {
  it("switches to the next section before it hits the exact anchor line", () => {
    expect(resolveActiveDefinitionSection({
      "business-definition": -280,
      "data-source": 20,
      "structure-config": 116,
      "scope-generation": 520,
    }, 100)).toBe("structure-config");
  });

  it("keeps the previous section active when the next section is still too far below", () => {
    expect(resolveActiveDefinitionSection({
      "business-definition": -280,
      "data-source": 80,
      "structure-config": 132,
      "scope-generation": 520,
    }, 100)).toBe("data-source");
  });

  it("supports resolving active sections against a visible subsection order", () => {
    expect(resolveActiveDefinitionSection({
      "business-definition": -280,
      "data-source": -24,
      "structure-config": 36,
      "scope-generation": 420,
      "data-update": -120,
    }, 100, undefined, [
      "business-definition",
      "data-source",
      "structure-config",
      "scope-generation",
    ])).toBe("structure-config");
  });
});
