from __future__ import annotations

from dataclasses import dataclass

from app.schemas import IndicatorGroup, Requirement, WideTable, WideTableColumn


SECTION_TITLES: dict[str, str] = {
    "core_query_requirement": "核心查询需求",
    "business_knowledge": "业务知识",
    "metric_list": "指标列表",
    "dimension_columns": "维度列信息",
    "output_constraints": "输出限制",
}


@dataclass(frozen=True)
class IndicatorGroupPromptBundle:
    sections: dict[str, str]
    markdown: str


def build_indicator_group_prompt(
    requirement: Requirement,
    wide_table: WideTable,
    indicator_group: IndicatorGroup,
) -> IndicatorGroupPromptBundle:
    sections = {
        "core_query_requirement": _resolve_core_query_requirement(
            requirement,
            indicator_group,
        ),
        "business_knowledge": _resolve_business_knowledge(
            requirement,
            indicator_group,
        ),
        "metric_list": _build_metric_list_markdown(wide_table, indicator_group),
        "dimension_columns": _build_dimension_columns_markdown(wide_table),
        "output_constraints": _resolve_output_constraints(
            requirement,
            indicator_group,
        ),
    }
    markdown = "\n\n".join(
        f"## {SECTION_TITLES[key]}\n{value}".rstrip()
        for key, value in sections.items()
    ).strip()
    return IndicatorGroupPromptBundle(sections=sections, markdown=markdown)


def _resolve_core_query_requirement(
    requirement: Requirement,
    indicator_group: IndicatorGroup,
) -> str:
    prompt_config = indicator_group.prompt_config
    if prompt_config and prompt_config.core_query_requirement:
        return prompt_config.core_query_requirement.strip()

    if indicator_group.prompt_template and "## " not in indicator_group.prompt_template:
        return indicator_group.prompt_template.strip()

    lines = [
        f"- 需求名称：{requirement.title}",
        f"- 指标组：{indicator_group.name}",
        f"- 核心目标：{requirement.business_goal or '未配置'}",
        "- 执行范围：本次只采集当前指标组内指标，禁止跨指标组混填。",
    ]
    if requirement.delivery_scope:
        lines.append(f"- 交付范围：{requirement.delivery_scope}")
    if indicator_group.description:
        lines.append(f"- 分组补充说明：{indicator_group.description}")
    return "\n".join(lines)


def _resolve_business_knowledge(
    requirement: Requirement,
    indicator_group: IndicatorGroup,
) -> str:
    prompt_config = indicator_group.prompt_config
    if prompt_config and prompt_config.business_knowledge:
        return prompt_config.business_knowledge.strip()

    lines: list[str] = []
    if requirement.background_knowledge:
        lines.append(f"- 业务知识：{requirement.background_knowledge}")
    if requirement.business_boundary:
        lines.append(f"- 业务边界：{requirement.business_boundary}")
    if not lines:
        lines.append("- 暂无额外业务知识，请严格按需求定义与字段口径执行。")
    return "\n".join(lines)


def _build_metric_list_markdown(
    wide_table: WideTable,
    indicator_group: IndicatorGroup,
) -> str:
    grouped_keys = set(indicator_group.indicator_keys)
    grouped_columns = [
        column
        for column in wide_table.table_schema.indicator_columns
        if column.key in grouped_keys
    ]
    if not grouped_columns:
        return "- 当前指标组尚未分配指标。"

    return "\n".join(_render_metric_column_block(column) for column in grouped_columns)


def _render_metric_column_block(column: WideTableColumn) -> str:
    lines = [
        f"- `{column.key}`",
        f"  - 中文名：{column.name}",
        f"  - 英文名：{column.key}",
        f"  - 数据类型：{column.data_type}",
        f"  - 单位：{column.unit or '-'}",
        f"  - 口径说明：{column.description or '-'}",
    ]
    return "\n".join(lines)


def _build_dimension_columns_markdown(wide_table: WideTable) -> str:
    dimension_scope_map = {
        scope.column_key: scope.values
        for scope in wide_table.scope.dimensions
    }
    lines: list[str] = []
    for column in wide_table.table_schema.dimension_columns:
        lines.append(f"- `{column.key}`")
        lines.append(f"  - 中文名：{column.name}")
        lines.append(f"  - 英文名：{column.key}")
        lines.append(f"  - 数据类型：{column.data_type}")
        lines.append(f"  - 定义：{column.description or '-'}")
        if column.is_business_date and wide_table.scope.business_date is not None:
            business_date_scope = wide_table.scope.business_date
            end = business_date_scope.end
            frequency = business_date_scope.frequency
            latest_year_quarterly = (
                "，最新年度按季度展开"
                if business_date_scope.latest_year_quarterly
                else ""
            )
            lines.append(
                "  - 取值范围："
                f"{business_date_scope.start} ~ {end}（{frequency}{latest_year_quarterly}）"
            )
            lines.append("  - 是否业务日期：是")
            continue

        dimension_values = dimension_scope_map.get(column.key, [])
        lines.append(
            "  - 允许取值："
            f"{'、'.join(dimension_values) if dimension_values else '未配置'}"
        )
        lines.append("  - 是否业务日期：否")
    return "\n".join(lines) if lines else "- 当前宽表未配置维度列。"


def _resolve_output_constraints(
    requirement: Requirement,
    indicator_group: IndicatorGroup,
) -> str:
    prompt_config = indicator_group.prompt_config
    if prompt_config and prompt_config.output_constraints:
        return prompt_config.output_constraints.strip()

    collection_policy = requirement.collection_policy
    lines = [
        "- 仅输出结构化采集结果，不要输出额外解释性文字。",
        "- 每个指标单独返回，字段口径必须与指标定义保持一致。",
        f"- 空值策略：{collection_policy.null_policy}",
        f"- 来源优先级：{collection_policy.source_priority}",
        f"- 值格式要求：{collection_policy.value_format}",
        f"- 搜索引擎：{', '.join(collection_policy.search_engines) if collection_policy.search_engines else '未配置'}",
        f"- 站点策略：{collection_policy.site_policy}",
    ]
    if collection_policy.preferred_sites:
        lines.append(f"- 允许/优先站点：{'、'.join(collection_policy.preferred_sites)}")
    if collection_policy.knowledge_bases:
        lines.append(f"- 可参考知识库：{'、'.join(collection_policy.knowledge_bases)}")
    if collection_policy.fixed_urls:
        lines.append(f"- 固定参考链接：{'、'.join(collection_policy.fixed_urls)}")
    return "\n".join(lines)
