import { describe, expect, it } from "vitest";

import type { IndicatorGroup, Requirement, WideTable } from "@/lib/types";
import {
  buildIndicatorGroupPrompt,
  parseIndicatorGroupPromptMarkdown,
} from "@/lib/indicator-group-prompt";

const requirement: Requirement = {
  id: "REQ-1",
  projectId: "PRJ-1",
  requirementType: "demo",
  title: "自动驾驶运营快照采集",
  status: "running",
  owner: "业务",
  assignee: "算法",
  businessGoal: "稳定采集运营核心指标。",
  backgroundKnowledge: "不同运营商之间必须保持统一口径。",
  businessBoundary: "仅统计公开披露的正式运营数据。",
  deliveryScope: "Waymo / Pony.ai，2025-01",
  collectionPolicy: {
    searchEngines: ["bing", "volcano"],
    preferredSites: ["site:waymo.com"],
    sitePolicy: "preferred",
    knowledgeBases: ["kb_autodrive"],
    nullPolicy: "未提及填 NULL",
    sourcePriority: "官网优先",
    valueFormat: "数值列与单位分离存储",
  },
  createdAt: "2026-03-25T10:00:00Z",
  updatedAt: "2026-03-25T10:00:00Z",
};

const group: IndicatorGroup = {
  id: "ig_ops_core",
  wideTableId: "wt_ops",
  name: "运营核心指标组",
  indicatorColumns: ["order_volume", "fleet_size"],
  priority: 10,
  description: "优先核对官网快照口径。",
};

const wideTable: WideTable = {
  id: "wt_ops",
  requirementId: "REQ-1",
  name: "ads_autodrive_ops_snapshot",
  description: "测试宽表",
  schema: {
    columns: [
      { id: "id", name: "id", chineseName: "行ID", type: "INTEGER", category: "id", description: "主键", required: true },
      { id: "company", name: "company", chineseName: "公司", type: "STRING", category: "dimension", description: "运营主体", required: true },
      { id: "biz_date", name: "biz_date", chineseName: "业务日期", type: "DATE", category: "dimension", description: "业务日期", required: true, isBusinessDate: true },
      { id: "order_volume", name: "order_volume", chineseName: "订单量", type: "NUMBER", category: "indicator", description: "月订单量", unit: "单", required: true },
      { id: "fleet_size", name: "fleet_size", chineseName: "车队规模", type: "NUMBER", category: "indicator", description: "投放车队规模", unit: "辆", required: true },
      { id: "row_status", name: "row_status", chineseName: "行状态", type: "STRING", category: "system", description: "行状态", required: true },
    ],
  },
  dimensionRanges: [
    { dimensionName: "company", values: ["Waymo", "Pony.ai"] },
  ],
  businessDateRange: {
    start: "2025-01",
    end: "2025-03",
    frequency: "monthly",
  },
  semanticTimeAxis: "business_date",
  collectionCoverageMode: "incremental_by_business_date",
  indicatorGroups: [group],
  recordCount: 2,
  status: "initialized",
  createdAt: "2026-03-25T10:00:00Z",
  updatedAt: "2026-03-25T10:00:00Z",
};

describe("indicator-group prompt builder", () => {
  it("builds markdown sections from requirement definition and group metrics", () => {
    const bundle = buildIndicatorGroupPrompt(requirement, wideTable, group);

    expect(bundle.markdown).toContain("## 核心查询需求");
    expect(bundle.markdown).toContain("## 业务知识");
    expect(bundle.markdown).toContain("## 指标列表");
    expect(bundle.markdown).toContain("## 维度列信息");
    expect(bundle.markdown).toContain("## 输出限制");
    expect(bundle.markdown).toContain("`order_volume`");
    expect(bundle.markdown).toContain("`fleet_size`");
    expect(bundle.markdown).toContain("`company`");
    expect(bundle.markdown).toContain("`biz_date`");
  });

  it("parses editable sections from full markdown", () => {
    const parsed = parseIndicatorGroupPromptMarkdown([
      "## 核心查询需求",
      "只采集官网披露数据。",
      "",
      "## 业务知识",
      "车队规模必须与订单量时间口径一致。",
      "",
      "## 指标列表",
      "- 自动生成",
      "",
      "## 维度列信息",
      "- 自动生成",
      "",
      "## 输出限制",
      "只返回结构化 JSON。",
    ].join("\n"));

    expect(parsed).toEqual({
      coreQueryRequirement: "只采集官网披露数据。",
      businessKnowledge: "车队规模必须与订单量时间口径一致。",
      metricList: "- 自动生成",
      dimensionColumns: "- 自动生成",
      outputConstraints: "只返回结构化 JSON。",
    });
  });
});
