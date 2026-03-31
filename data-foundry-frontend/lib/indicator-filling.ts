/**
 * 指标填充管线 —— LLM 产出中间语义 JSON，规则引擎落成最终值
 *
 * 流程：原始指标值 → LLM 语义解析 → SemanticIndicatorResult → 规则引擎 → 最终值 / 人工确认
 */

// ==================== 语义类型枚举 ====================

export type SemanticKind =
  | "exact"       // 精确值，如 "128000"
  | "range"       // 区间值，如 "10-20"
  | "at_least"    // 下限值，如 "至少15"
  | "approximate" // 近似值，如 "百余"、"约300"
  | "null"        // 空值语义，如 "暂无"、"N/A"
  | "date"        // 日期语义，如 "20250101"、"2025Q1"
  | "unknown";    // 无法识别

export const SEMANTIC_KIND_LABELS: Record<SemanticKind, string> = {
  exact: "精确值",
  range: "区间值",
  at_least: "下限值",
  approximate: "近似值",
  null: "空值",
  date: "日期",
  unknown: "未识别",
};

export type DateSemantics = "exact" | "quarter" | "half_year" | "year" | null;

export type NullReason =
  | "not_disclosed"   // 未披露
  | "not_applicable"  // 不适用
  | "insufficient"    // 数据不足
  | "pending"         // 暂无
  | null;

export type SemanticIndicatorResult = {
  kind: SemanticKind;
  value: number | null;
  lower: number | null;
  upper: number | null;
  unit: string | null;
  original_unit: string | null;
  null_reason: NullReason;
  date_semantics: DateSemantics;
  date_value: string | null;
  html_cleaned: boolean;
  confidence: number;
  reasoning: string;
};

// ==================== 填充结果 ====================

export type FillingStatus = "filled" | "low_confidence" | "null_mapped" | "error";

export type IndicatorFillingResult = {
  rowId: string;
  columnName: string;
  rawValue: string;
  semantic: SemanticIndicatorResult;
  finalValue: string;
  status: FillingStatus;
  ruleId: string;
  ruleName: string;
  needsHumanReview: boolean;
};

// ==================== 填充规则注册表 ====================

export type FillingRule = {
  id: string;
  name: string;
  description: string;
};

/**
 * 平台统一维护的填充规则注册表。
 * 每条规则有唯一 ID，填充结果可追溯到具体规则。
 */
export const FILLING_RULES: FillingRule[] = [
  { id: "FR-001", name: "低置信度阻塞", description: "LLM 解析置信度低于阈值时阻塞，等待人工确认" },
  { id: "FR-002", name: "空值统一", description: "将「数据不足」「暂无」「无」「N/A」「未披露」等统一映射为 NULL" },
  { id: "FR-003", name: "日期格式转换", description: "紧凑日期 20250101 转为 2025-01-01；季度转为季度末；半年度转为期末" },
  { id: "FR-004", name: "单位统一+指标换算", description: "台转辆、元转亿元等单位映射，指标值同步换算" },
  { id: "FR-005", name: "区间值处理", description: "区间值（如 10~20）按策略取中间值、上限或下限" },
  { id: "FR-006", name: "下限值处理", description: "下限值（如 至少15）取下限，标记待人工确认" },
  { id: "FR-007", name: "近似值处理", description: "近似值（如 百余、约300）取近似数值" },
  { id: "FR-008", name: "HTML标签剔除", description: "剔除原始值中的 HTML 换行符等标签" },
  { id: "FR-009", name: "千分位去除", description: "去除数值中的千分位分隔符（如 128,000 转为 128000）" },
  { id: "FR-010", name: "百分率转换", description: "百分率转换为小数（如 45% 转为 0.45）" },
];

// ==================== 填充规则配置 ====================

export type FillingRuleConfig = {
  confidenceThreshold: number;
  nullSynonyms: string[];
  unitMappings: UnitMapping[];
  dateQuarterEndMapping: boolean;
  htmlTagStripping: boolean;
  rangeStrategy: "midpoint" | "lower" | "upper" | "flag";
};

export type UnitMapping = {
  from: string;
  to: string;
  conversionFactor: number;
};

export const DEFAULT_FILLING_CONFIG: FillingRuleConfig = {
  confidenceThreshold: 0.7,
  nullSynonyms: ["数据不足", "暂无", "无", "N/A", "未披露", "null", "-", "—", "不适用"],
  unitMappings: [
    { from: "台", to: "辆", conversionFactor: 1 },
    { from: "元", to: "亿元", conversionFactor: 1e-8 },
    { from: "万元", to: "亿元", conversionFactor: 1e-4 },
    { from: "千", to: "个", conversionFactor: 1000 },
  ],
  dateQuarterEndMapping: true,
  htmlTagStripping: true,
  rangeStrategy: "midpoint",
};

const NULL_SYNONYMS_SET = new Set(
  DEFAULT_FILLING_CONFIG.nullSynonyms.map((s) => s.toLowerCase().trim()),
);

// ==================== 模拟 LLM 语义解析 ====================

export function parseSemantic(rawValue: string, targetUnit?: string): SemanticIndicatorResult {
  const trimmed = rawValue.trim();

  if (!trimmed || NULL_SYNONYMS_SET.has(trimmed.toLowerCase())) {
    return {
      kind: "null", value: null, lower: null, upper: null,
      unit: null, original_unit: null,
      null_reason: resolveNullReason(trimmed),
      date_semantics: null, date_value: null,
      html_cleaned: false, confidence: 0.95,
      reasoning: `识别为空值：${resolveNullReason(trimmed) ?? "空字符串"}`,
    };
  }

  const htmlPattern = /<[^>]+>/g;
  const hasHtml = htmlPattern.test(trimmed);
  const cleaned = trimmed.replace(htmlPattern, "").trim();

  const dateResult = tryParseDate(cleaned);
  if (dateResult) return { ...dateResult, html_cleaned: hasHtml };

  // 数值缩写/倍率：11.8k、12.5k、14.6万单 等
  // 目标：把常见的 k/M/B 或 百/千/万/亿 还原成基础数值，提升演示数据的可读性。
  const scaledCandidate = cleaned.replace(/,/g, "");
  const scaledMatch = scaledCandidate.match(/^(-?\d+(?:\.\d+)?)\s*([kKmMbB]|[百千万亿])\s*(.*)$/);
  if (scaledMatch) {
    const baseValue = Number(scaledMatch[1]);
    const scale = scaledMatch[2];
    const restUnit = scaledMatch[3]?.trim() || "";
    const multiplier = resolveScaleMultiplier(scale);
    const value = Number((baseValue * multiplier).toPrecision(12));
    const unit = restUnit || targetUnit || null;

    return {
      kind: "exact", value, lower: null, upper: null,
      unit,
      original_unit: restUnit ? `${scale}${restUnit}` : scale,
      null_reason: null, date_semantics: null, date_value: null,
      html_cleaned: hasHtml, confidence: 0.9,
      reasoning: `缩写数值 ${baseValue}${scale}${restUnit ? ` ${restUnit}` : ""} -> ${value}${unit ? ` ${unit}` : ""}`,
    };
  }

  const rangeMatch = cleaned.match(/^(\d+(?:\.\d+)?)\s*[-~～至到]\s*(\d+(?:\.\d+)?)\s*(.*)$/);
  if (rangeMatch) {
    const lower = Number(rangeMatch[1]);
    const upper = Number(rangeMatch[2]);
    const unit = rangeMatch[3]?.trim() || targetUnit || null;
    return {
      kind: "range", value: null, lower, upper, unit, original_unit: unit,
      null_reason: null, date_semantics: null, date_value: null,
      html_cleaned: hasHtml, confidence: 0.82,
      reasoning: `区间值 [${lower}, ${upper}]${unit ? ` ${unit}` : ""}`,
    };
  }

  const atLeastMatch = cleaned.match(/^(?:至少|不低于|不少于|≥|>=)\s*(\d+(?:\.\d+)?)\s*(.*)$/);
  if (atLeastMatch) {
    const value = Number(atLeastMatch[1]);
    const unit = atLeastMatch[2]?.trim() || targetUnit || null;
    return {
      kind: "at_least", value: null, lower: value, upper: null, unit, original_unit: unit,
      null_reason: null, date_semantics: null, date_value: null,
      html_cleaned: hasHtml, confidence: 0.78,
      reasoning: `下限值 ≥${value}${unit ? ` ${unit}` : ""}`,
    };
  }

  const approxMatch = cleaned.match(/^(?:约|近|大约|大概|接近)\s*(\d+(?:\.\d+)?)\s*(.*)$/);
  if (approxMatch) {
    const value = Number(approxMatch[1]);
    const unit = approxMatch[2]?.trim() || targetUnit || null;
    return {
      kind: "approximate", value, lower: null, upper: null, unit, original_unit: unit,
      null_reason: null, date_semantics: null, date_value: null,
      html_cleaned: hasHtml, confidence: 0.75,
      reasoning: `近似值 ≈${value}${unit ? ` ${unit}` : ""}`,
    };
  }

  const chineseApproxMatch = cleaned.match(/^(\d*)([百千万亿])余\s*(.*)$/);
  if (chineseApproxMatch) {
    const prefix = chineseApproxMatch[1] ? Number(chineseApproxMatch[1]) : 1;
    const multiplier = resolveChineseMultiplier(chineseApproxMatch[2]);
    const value = prefix * multiplier;
    const unit = chineseApproxMatch[3]?.trim() || targetUnit || null;
    return {
      kind: "approximate", value, lower: null, upper: null, unit, original_unit: unit,
      null_reason: null, date_semantics: null, date_value: null,
      html_cleaned: hasHtml, confidence: 0.7,
      reasoning: `中文近似值 ≈${value}${unit ? ` ${unit}` : ""}`,
    };
  }

  const numericCleaned = cleaned.replace(/,/g, "");
  const exactMatch = numericCleaned.match(/^(-?\d+(?:\.\d+)?)\s*(%|[^\d\s]*)$/);
  if (exactMatch) {
    let value = Number(exactMatch[1]);
    let unit = exactMatch[2]?.trim() || targetUnit || null;
    if (unit === "%") { value = value / 100; unit = null; }
    return {
      kind: "exact", value, lower: null, upper: null, unit,
      original_unit: exactMatch[2]?.trim() || null,
      null_reason: null, date_semantics: null, date_value: null,
      html_cleaned: hasHtml, confidence: 0.95,
      reasoning: `精确值 ${value}${unit ? ` ${unit}` : ""}`,
    };
  }

  return {
    kind: "unknown", value: null, lower: null, upper: null,
    unit: null, original_unit: null, null_reason: null,
    date_semantics: null, date_value: null,
    html_cleaned: hasHtml, confidence: 0.3,
    reasoning: `无法解析原始值: "${cleaned}"`,
  };
}

// ==================== 规则引擎：语义 JSON → 最终值（带规则编号） ====================

type RuleEngineOutput = {
  finalValue: string;
  ruleId: string;
  ruleName: string;
  needsHumanReview: boolean;
  status: FillingStatus;
};

export function applyFillingRules(
  semantic: SemanticIndicatorResult,
  config: FillingRuleConfig = DEFAULT_FILLING_CONFIG,
): RuleEngineOutput {
  // FR-001 低置信度阻塞
  if (semantic.confidence < config.confidenceThreshold) {
    return {
      finalValue: semantic.value != null ? String(semantic.value) : "",
      ruleId: "FR-001", ruleName: "低置信度阻塞",
      needsHumanReview: true, status: "low_confidence",
    };
  }

  // FR-002 空值统一
  if (semantic.kind === "null") {
    return {
      finalValue: "NULL",
      ruleId: "FR-002", ruleName: "空值统一",
      needsHumanReview: false, status: "null_mapped",
    };
  }

  // FR-003 日期格式转换
  if (semantic.kind === "date" && semantic.date_value) {
    return {
      finalValue: semantic.date_value,
      ruleId: "FR-003", ruleName: "日期格式转换",
      needsHumanReview: false, status: "filled",
    };
  }

  // FR-004 / FR-009 / FR-010 精确值 + 单位转换
  if (semantic.kind === "exact" && semantic.value != null) {
    const converted = applyUnitConversion(semantic.value, semantic.unit, config);
    return {
      finalValue: String(converted.value),
      ruleId: converted.ruleId, ruleName: converted.ruleName,
      needsHumanReview: false, status: "filled",
    };
  }

  // FR-005 区间值
  if (semantic.kind === "range" && semantic.lower != null && semantic.upper != null) {
    const resolved = resolveRangeValue(semantic.lower, semantic.upper, config.rangeStrategy);
    const converted = applyUnitConversion(resolved, semantic.unit, config);
    return {
      finalValue: String(converted.value),
      ruleId: "FR-005", ruleName: "区间值处理",
      needsHumanReview: config.rangeStrategy === "flag",
      status: config.rangeStrategy === "flag" ? "low_confidence" : "filled",
    };
  }

  // FR-006 下限值
  if (semantic.kind === "at_least" && semantic.lower != null) {
    const converted = applyUnitConversion(semantic.lower, semantic.unit, config);
    return {
      finalValue: String(converted.value),
      ruleId: "FR-006", ruleName: "下限值处理",
      needsHumanReview: true, status: "low_confidence",
    };
  }

  // FR-007 近似值
  if (semantic.kind === "approximate" && semantic.value != null) {
    const converted = applyUnitConversion(semantic.value, semantic.unit, config);
    return {
      finalValue: String(converted.value),
      ruleId: "FR-007", ruleName: "近似值处理",
      needsHumanReview: semantic.confidence < 0.8,
      status: semantic.confidence < 0.8 ? "low_confidence" : "filled",
    };
  }

  return {
    finalValue: "", ruleId: "-", ruleName: "无法解析",
    needsHumanReview: true, status: "error",
  };
}

// ==================== 完整填充流程 ====================

export function fillIndicator(
  rawValue: string,
  targetUnit?: string,
  config: FillingRuleConfig = DEFAULT_FILLING_CONFIG,
): IndicatorFillingResult {
  const semantic = parseSemantic(rawValue, targetUnit);
  const result = applyFillingRules(semantic, config);
  return {
    rowId: "", columnName: "", rawValue, semantic,
    finalValue: result.finalValue,
    status: result.status,
    ruleId: result.ruleId,
    ruleName: result.ruleName,
    needsHumanReview: result.needsHumanReview,
  };
}

// ==================== 批量填充 ====================

export type BatchFillingResult = {
  results: IndicatorFillingResult[];
  totalCount: number;
  filledCount: number;
  reviewCount: number;
  errorCount: number;
  nullCount: number;
};

export function fillIndicatorBatch(
  items: Array<{ rowId: string; columnName: string; rawValue: string; targetUnit?: string }>,
  config: FillingRuleConfig = DEFAULT_FILLING_CONFIG,
): BatchFillingResult {
  const results = items.map((item) => {
    const result = fillIndicator(item.rawValue, item.targetUnit, config);
    return { ...result, rowId: item.rowId, columnName: item.columnName };
  });
  return {
    results,
    totalCount: results.length,
    filledCount: results.filter((r) => r.status === "filled").length,
    reviewCount: results.filter((r) => r.status === "low_confidence").length,
    errorCount: results.filter((r) => r.status === "error").length,
    nullCount: results.filter((r) => r.status === "null_mapped").length,
  };
}

// ==================== 辅助函数 ====================

function resolveNullReason(value: string): NullReason {
  const lower = value.toLowerCase().trim();
  if (!lower) return null;
  if (lower === "数据不足") return "insufficient";
  if (lower === "暂无" || lower === "无") return "pending";
  if (lower === "未披露" || lower === "n/a") return "not_disclosed";
  if (lower === "不适用") return "not_applicable";
  return "pending";
}

function tryParseDate(value: string): SemanticIndicatorResult | null {
  const compactMatch = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compactMatch) {
    return {
      kind: "date", value: null, lower: null, upper: null,
      unit: null, original_unit: null, null_reason: null,
      date_semantics: "exact",
      date_value: `${compactMatch[1]}-${compactMatch[2]}-${compactMatch[3]}`,
      html_cleaned: false, confidence: 0.95,
      reasoning: `紧凑日期格式 → ${compactMatch[1]}-${compactMatch[2]}-${compactMatch[3]}`,
    };
  }

  const quarterMatch = value.match(/^(\d{4})\s*(?:年)?(?:第)?([一二三四1-4])\s*季度?$/i)
    || value.match(/^(\d{4})\s*(?:年)?\s*Q([1-4])$/i);
  if (quarterMatch) {
    const year = quarterMatch[1];
    const q = resolveQuarterNumber(quarterMatch[2]);
    const quarterEnd = getQuarterEndDate(Number(year), q);
    return {
      kind: "date", value: null, lower: null, upper: null,
      unit: null, original_unit: null, null_reason: null,
      date_semantics: "quarter", date_value: quarterEnd,
      html_cleaned: false, confidence: 0.92,
      reasoning: `季度日期 → 季度末 ${quarterEnd}`,
    };
  }

  const halfYearMatch = value.match(/^(\d{4})\s*年?\s*(?:上|下)半年$/);
  if (halfYearMatch) {
    const year = halfYearMatch[1];
    const isFirst = value.includes("上");
    const dateValue = isFirst ? `${year}-06-30` : `${year}-12-31`;
    return {
      kind: "date", value: null, lower: null, upper: null,
      unit: null, original_unit: null, null_reason: null,
      date_semantics: "half_year", date_value: dateValue,
      html_cleaned: false, confidence: 0.9,
      reasoning: `半年度日期 → ${dateValue}`,
    };
  }

  return null;
}

function resolveQuarterNumber(q: string): number {
  if (q === "一" || q === "1") return 1;
  if (q === "二" || q === "2") return 2;
  if (q === "三" || q === "3") return 3;
  if (q === "四" || q === "4") return 4;
  return 1;
}

function getQuarterEndDate(year: number, quarter: number): string {
  const endMonths: Record<number, string> = { 1: "03-31", 2: "06-30", 3: "09-30", 4: "12-31" };
  return `${year}-${endMonths[quarter] ?? "03-31"}`;
}

function resolveChineseMultiplier(char: string): number {
  if (char === "百") return 100;
  if (char === "千") return 1000;
  if (char === "万") return 10000;
  if (char === "亿") return 100000000;
  return 1;
}

function resolveScaleMultiplier(char: string): number {
  const lower = char.toLowerCase();
  if (lower === "k") return 1000;
  if (lower === "m") return 1000000;
  if (lower === "b") return 1000000000;
  return resolveChineseMultiplier(char);
}

function applyUnitConversion(
  value: number,
  unit: string | null,
  config: FillingRuleConfig,
): { value: number; ruleId: string; ruleName: string } {
  if (!unit) {
    return { value, ruleId: "FR-004", ruleName: "精确值(无单位转换)" };
  }
  const mapping = config.unitMappings.find((m) => m.from === unit);
  if (mapping) {
    const converted = Number((value * mapping.conversionFactor).toPrecision(10));
    return { value: converted, ruleId: "FR-004", ruleName: `单位统一: ${unit}→${mapping.to}` };
  }
  return { value, ruleId: "FR-004", ruleName: `精确值(${unit})` };
}

function resolveRangeValue(lower: number, upper: number, strategy: FillingRuleConfig["rangeStrategy"]): number {
  if (strategy === "lower") return lower;
  if (strategy === "upper") return upper;
  return (lower + upper) / 2;
}
