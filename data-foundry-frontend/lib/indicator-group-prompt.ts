import type { IndicatorGroup, Requirement, WideTable, ColumnDefinition } from "./types";

export const PROMPT_SECTION_TITLES = {
  coreQueryRequirement: "核心查询需求",
  businessKnowledge: "业务知识",
  metricList: "指标列表",
  dimensionColumns: "维度列信息",
  outputConstraints: "输出限制",
} as const;

export type IndicatorGroupPromptSections = {
  coreQueryRequirement: string;
  businessKnowledge: string;
  metricList: string;
  dimensionColumns: string;
  outputConstraints: string;
};

export type IndicatorGroupPromptBundle = {
  sections: IndicatorGroupPromptSections;
  markdown: string;
};

export function buildIndicatorGroupPrompt(
  requirement: Requirement,
  wideTable: WideTable,
  group: IndicatorGroup,
): IndicatorGroupPromptBundle {
  const sections: IndicatorGroupPromptSections = {
    coreQueryRequirement: resolveCoreQueryRequirement(requirement, group),
    businessKnowledge: resolveBusinessKnowledge(requirement, group),
    metricList: buildMetricListMarkdown(wideTable, group),
    dimensionColumns: resolveDimensionColumns(wideTable, group),
    outputConstraints: resolveOutputConstraints(requirement, group),
  };

  return {
    sections,
    markdown: buildIndicatorGroupPromptMarkdown(sections),
  };
}

export function buildIndicatorGroupPromptMarkdown(
  sections: IndicatorGroupPromptSections,
): string {
  return [
    `## ${PROMPT_SECTION_TITLES.coreQueryRequirement}\n${sections.coreQueryRequirement}`,
    `## ${PROMPT_SECTION_TITLES.businessKnowledge}\n${sections.businessKnowledge}`,
    `## ${PROMPT_SECTION_TITLES.metricList}\n${sections.metricList}`,
    `## ${PROMPT_SECTION_TITLES.dimensionColumns}\n${sections.dimensionColumns}`,
    `## ${PROMPT_SECTION_TITLES.outputConstraints}\n${sections.outputConstraints}`,
  ].join("\n\n").trim();
}

export function parseIndicatorGroupPromptMarkdown(markdown: string): IndicatorGroup["promptConfig"] {
  return {
    coreQueryRequirement: extractSectionBody(markdown, PROMPT_SECTION_TITLES.coreQueryRequirement),
    businessKnowledge: extractSectionBody(markdown, PROMPT_SECTION_TITLES.businessKnowledge),
    metricList: extractSectionBody(markdown, PROMPT_SECTION_TITLES.metricList),
    dimensionColumns: extractSectionBody(markdown, PROMPT_SECTION_TITLES.dimensionColumns),
    outputConstraints: extractSectionBody(markdown, PROMPT_SECTION_TITLES.outputConstraints),
  };
}

function resolveCoreQueryRequirement(
  requirement: Requirement,
  group: IndicatorGroup,
): string {
  if (group.promptConfig?.coreQueryRequirement?.trim()) {
    return group.promptConfig.coreQueryRequirement.trim();
  }

  if (group.promptTemplate?.trim()) {
    if (group.promptTemplate.includes("## ")) {
      const parsed = parseIndicatorGroupPromptMarkdown(group.promptTemplate);
      if (parsed?.coreQueryRequirement?.trim()) {
        return parsed.coreQueryRequirement.trim();
      }
    } else {
      return group.promptTemplate.trim();
    }
  }

  const lines = [
    `- 需求名称：${requirement.title}`,
    `- 指标组：${group.name}`,
    `- 核心目标：${requirement.businessGoal || "未配置"}`,
    "- 执行范围：本次只采集当前指标组内指标，禁止跨指标组混填。",
  ];
  if (requirement.deliveryScope) {
    lines.push(`- 交付范围：${requirement.deliveryScope}`);
  }
  if (group.description) {
    lines.push(`- 分组补充说明：${group.description}`);
  }
  return lines.join("\n");
}

function resolveBusinessKnowledge(
  requirement: Requirement,
  group: IndicatorGroup,
): string {
  if (group.promptConfig?.businessKnowledge?.trim()) {
    return group.promptConfig.businessKnowledge.trim();
  }

  if (group.promptTemplate?.includes("## ")) {
    const parsed = parseIndicatorGroupPromptMarkdown(group.promptTemplate);
    if (parsed?.businessKnowledge?.trim()) {
      return parsed.businessKnowledge.trim();
    }
  }

  const lines: string[] = [];
  const backgroundKnowledge = requirement.backgroundKnowledge || requirement.businessBoundary;
  if (backgroundKnowledge) {
    lines.push(`- 业务知识：${backgroundKnowledge}`);
  }
  if (
    requirement.businessBoundary
    && requirement.businessBoundary !== backgroundKnowledge
  ) {
    lines.push(`- 业务边界：${requirement.businessBoundary}`);
  }
  if (lines.length === 0) {
    lines.push("- 暂无额外业务知识，请严格按需求定义与字段口径执行。");
  }
  return lines.join("\n");
}

function buildMetricListMarkdown(
  wideTable: WideTable,
  group: IndicatorGroup,
): string {
  if (group.promptConfig?.metricList?.trim()) {
    return group.promptConfig.metricList.trim();
  }
  if (group.promptTemplate?.includes("## ")) {
    const parsed = parseIndicatorGroupPromptMarkdown(group.promptTemplate);
    if (parsed?.metricList?.trim()) {
      return parsed.metricList.trim();
    }
  }
  const indicatorColumns = wideTable.schema.columns.filter(
    (column) => column.category === "indicator" && group.indicatorColumns.includes(column.name),
  );
  if (indicatorColumns.length === 0) {
    return "- 当前指标组尚未分配指标。";
  }
  return indicatorColumns.map(renderMetricColumnBlock).join("\n");
}

function renderMetricColumnBlock(column: ColumnDefinition): string {
  return [
    `- \`${column.name}\``,
    `  - 中文名：${column.chineseName ?? column.name}`,
    `  - 英文名：${column.name}`,
    `  - 数据类型：${column.type}`,
    `  - 单位：${column.unit ?? "-"}`,
    `  - 口径说明：${column.description || "-"}`,
  ].join("\n");
}

function buildDimensionColumnsMarkdown(wideTable: WideTable): string {
  const dimensionColumns = wideTable.schema.columns.filter(
    (column) => column.category === "dimension",
  );
  if (dimensionColumns.length === 0) {
    return "- 当前宽表未配置维度列。";
  }

  return dimensionColumns.map((column) => {
    const lines = [
      `- \`${column.name}\``,
      `  - 中文名：${column.chineseName ?? column.name}`,
      `  - 英文名：${column.name}`,
      `  - 数据类型：${column.type}`,
      `  - 定义：${column.description || "-"}`,
    ];

    if (column.isBusinessDate) {
      const latestYearQuarterly = wideTable.businessDateRange.quarterlyForLatestYear
        ? "，最新年度按季度展开"
        : "";
      lines.push(
        "  - 取值范围："
        + `${wideTable.businessDateRange.start} ~ ${wideTable.businessDateRange.end}`
        + `（${wideTable.businessDateRange.frequency}${latestYearQuarterly}）`,
      );
      lines.push("  - 是否业务日期：是");
      return lines.join("\n");
    }

    const dimensionRange = wideTable.dimensionRanges.find(
      (range) => range.dimensionName === column.name,
    );
    lines.push(
      `  - 允许取值：${dimensionRange?.values.length ? dimensionRange.values.join("、") : "未配置"}`,
    );
    lines.push("  - 是否业务日期：否");
    return lines.join("\n");
  }).join("\n");
}

function resolveDimensionColumns(
  wideTable: WideTable,
  group: IndicatorGroup,
): string {
  if (group.promptConfig?.dimensionColumns?.trim()) {
    return group.promptConfig.dimensionColumns.trim();
  }
  if (group.promptTemplate?.includes("## ")) {
    const parsed = parseIndicatorGroupPromptMarkdown(group.promptTemplate);
    if (parsed?.dimensionColumns?.trim()) {
      return parsed.dimensionColumns.trim();
    }
  }
  return buildDimensionColumnsMarkdown(wideTable);
}

function resolveOutputConstraints(
  requirement: Requirement,
  group: IndicatorGroup,
): string {
  if (group.promptConfig?.outputConstraints?.trim()) {
    return group.promptConfig.outputConstraints.trim();
  }

  if (group.promptTemplate?.includes("## ")) {
    const parsed = parseIndicatorGroupPromptMarkdown(group.promptTemplate);
    if (parsed?.outputConstraints?.trim()) {
      return parsed.outputConstraints.trim();
    }
  }

  const collectionPolicy = requirement.collectionPolicy;
  if (!collectionPolicy) {
    return [
      "- 仅输出结构化采集结果，不要输出额外解释性文字。",
      "- 每个指标单独返回，字段口径必须与指标定义保持一致。",
    ].join("\n");
  }

  const lines = [
    "- 仅输出结构化采集结果，不要输出额外解释性文字。",
    "- 每个指标单独返回，字段口径必须与指标定义保持一致。",
    `- 空值策略：${collectionPolicy.nullPolicy}`,
    `- 来源优先级：${collectionPolicy.sourcePriority}`,
    `- 值格式要求：${collectionPolicy.valueFormat}`,
    `- 搜索引擎：${collectionPolicy.searchEngines.length ? collectionPolicy.searchEngines.join(", ") : "未配置"}`,
    `- 站点策略：${collectionPolicy.sitePolicy}`,
  ];
  if (collectionPolicy.preferredSites.length > 0) {
    lines.push(`- 允许/优先站点：${collectionPolicy.preferredSites.join("、")}`);
  }
  if (collectionPolicy.knowledgeBases.length > 0) {
    lines.push(`- 可参考知识库：${collectionPolicy.knowledgeBases.join("、")}`);
  }
  if (collectionPolicy.fixedUrls.length > 0) {
    lines.push(`- 固定参考链接：${collectionPolicy.fixedUrls.join("、")}`);
  }
  return lines.join("\n");
}

function extractSectionBody(markdown: string, title: string): string | undefined {
  const pattern = new RegExp(
    `##\\s+${escapeRegExp(title)}\\s*\\n([\\s\\S]*?)(?=\\n##\\s+|$)`,
  );
  const match = markdown.match(pattern);
  if (!match) {
    return undefined;
  }
  return match[1]?.trim() ?? "";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
