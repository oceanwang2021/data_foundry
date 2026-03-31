from __future__ import annotations

from copy import deepcopy
from datetime import date

from app.modeling import (
    build_backfill_requests,
    build_collection_batches,
    build_execution_records,
    build_fetch_tasks,
    build_row_snapshots,
    build_retrieval_tasks,
    build_rows,
    build_task_groups,
    business_date_sort_key,
    is_past_business_date,
    recompute_row_state,
)
from app.schemas import (
    BackfillRequest,
    ExecutionRecord,
    FetchTask,
    IndicatorCell,
    IndicatorGroup,
    Project,
    Requirement,
    RequirementCollectionPolicy,
    RetrievalTask,
    ScheduleRule,
    TaskGroup,
    WideTable,
    WideTableColumn,
    WideTableRow,
    WideTableSchema,
)


REFERENCE_DATE = date(2026, 3, 13)


def _column(
    key: str,
    name: str,
    role: WideTableColumn.__annotations__["role"],
    data_type: WideTableColumn.__annotations__["data_type"],
    description: str,
    *,
    unit: str | None = None,
    is_business_date: bool = False,
) -> WideTableColumn:
    return WideTableColumn(
        key=key,
        name=name,
        role=role,
        data_type=data_type,
        description=description,
        unit=unit,
        is_business_date=is_business_date,
    )


def _cell(
    value: float | int | None = None,
    *,
    value_description: str | None = None,
    max_value: float | None = None,
    min_value: float | None = None,
    data_source: str | None = None,
    source_link: str | None = None,
) -> IndicatorCell:
    return IndicatorCell(
        value=value,
        value_description=value_description,
        max_value=max_value,
        min_value=min_value,
        data_source=data_source,
        source_link=source_link,
    )


AUTODRIVE_OPS_TABLE = WideTable(
    id="WT-AD-OPS",
    title="自动驾驶运营快照宽表",
    description="按运营商组织的运营全量快照。",
    schema=WideTableSchema(
        table_name="ads_autodrive_ops",
        version=3,
        id_column=_column("id", "行ID", "id", "integer", "宽表整数型行主键。"),
        dimension_columns=[
            _column("company", "运营商", "dimension", "string", "运营主体。"),
        ],
        indicator_columns=[
            _column(
                "order_volume",
                "订单量",
                "indicator",
                "number",
                "快照期内订单总量。",
                unit="单",
            ),
            _column(
                "fleet_size",
                "车队数量",
                "indicator",
                "number",
                "截至快照时间的在运营车辆数量。",
                unit="辆",
            ),
            _column(
                "operating_mileage",
                "运营里程",
                "indicator",
                "number",
                "截至快照时间累计运营里程。",
                unit="万公里",
            ),
            _column(
                "order_price",
                "订单单价",
                "indicator",
                "number",
                "快照期内平均订单单价。",
                unit="元",
            ),
            _column(
                "order_count",
                "订单数量",
                "indicator",
                "number",
                "截至快照时间累计订单数量。",
                unit="万单",
            ),
        ],
        system_columns=[
            _column("robot_type", "类型", "system", "string", "Robotaxi / Robotruck 等业务类型。"),
            _column("country", "所属国家", "system", "string", "业务所属国家。"),
            _column("row_status", "行状态", "system", "string", "系统维护的宽表行状态。"),
            _column("last_task_id", "最近任务ID", "system", "string", "最近一次触发采集的任务ID。"),
            _column("updated_at", "更新时间", "system", "datetime", "最近一次写回宽表的时间。"),
        ],
    ),
    scope={
        "dimensions": [
            {"column_key": "company", "values": ["Waymo", "滴滴全球", "如祺出行", "曹操出行", "小马智行"]},
        ],
    },
    indicator_groups=[
        IndicatorGroup(
            id="IG-AD-OPS-CORE",
            name="运营快照指标组",
            indicator_keys=["order_volume", "fleet_size", "operating_mileage", "order_price", "order_count"],
            execution_mode="agent",
            default_agent="ops-agent",
            prompt_template="优先采集官网披露的运营快照口径，并保持不同运营商之间的统计口径一致。",
            priority=10,
            timeout_seconds=600,
            source_preference=["企业官网", "行业统计"],
        )
    ],
    schedule_rules=[
        ScheduleRule(
            id="SR-AD-OPS-MONTHLY",
            frequency="monthly",
            trigger_time="09:00",
            auto_retry_limit=2,
        )
    ],
)

AUTODRIVE_SAFETY_TABLE = WideTable(
    id="WT-AD-SAFE",
    title="自动驾驶安全宽表",
    description="按公司、城市和业务月份组织的安全指标宽表。",
    schema=WideTableSchema(
        table_name="ads_autodrive_safety",
        version=4,
        id_column=_column("id", "行ID", "id", "integer", "宽表整数型行主键。"),
        dimension_columns=[
            _column("company", "公司", "dimension", "string", "运营主体。"),
            _column("city", "城市", "dimension", "string", "业务发生城市。"),
            _column(
                "biz_date",
                "业务日期",
                "dimension",
                "date",
                "业务归属月份，是任务组和补采范围的主时间维度。",
                is_business_date=True,
            ),
        ],
        indicator_columns=[
            _column(
                "mpi_takeover_miles",
                "MPI接管里程",
                "indicator",
                "number",
                "发生人工接管前的自动驾驶里程。",
                unit="公里",
            ),
            _column(
                "incident_rate",
                "事故率",
                "indicator",
                "number",
                "按百万公里归一化后的事故率。",
                unit="次/百万公里",
            ),
        ],
        system_columns=[
            _column("row_status", "行状态", "system", "string", "系统维护的宽表行状态。"),
            _column("last_task_id", "最近任务ID", "system", "string", "最近一次触发采集的任务ID。"),
            _column("updated_at", "更新时间", "system", "datetime", "最近一次写回宽表的时间。"),
        ],
    ),
    scope={
        "business_date": {
            "column_key": "biz_date",
            "start": "2025-12-31",
            "end": "never",
            "frequency": "monthly",
            "latest_year_quarterly": False,
        },
        "dimensions": [
            {"column_key": "company", "values": ["Waymo", "Pony.ai"]},
            {"column_key": "city", "values": ["旧金山"]},
        ],
    },
    indicator_groups=[
        IndicatorGroup(
            id="IG-AD-SAFE-MPI",
            name="接管里程指标组",
            indicator_keys=["mpi_takeover_miles"],
            execution_mode="agent",
            default_agent="safety-agent",
            prompt_template="优先采集里程口径与接管定义。",
            priority=20,
            timeout_seconds=900,
            source_preference=["监管公告", "企业安全报告"],
        ),
        IndicatorGroup(
            id="IG-AD-SAFE-INCIDENT",
            name="事故率指标组",
            indicator_keys=["incident_rate"],
            execution_mode="agent",
            default_agent="incident-agent",
            prompt_template="优先采集事故率及归一化口径。",
            priority=20,
            timeout_seconds=900,
            source_preference=["监管公告", "企业安全报告"],
        ),
    ],
    schedule_rules=[
        ScheduleRule(
            id="SR-AD-SAFE-MONTHLY",
            frequency="monthly",
            trigger_time="09:30",
            auto_retry_limit=2,
        )
    ],
)

ADC_DEMO_TABLE = WideTable(
    id="WT-ADC-DEMO",
    title="ADC三期临床宽表",
    description="按药物、适应症和业务年份组织的临床疗效与安全性宽表。",
    schema=WideTableSchema(
        table_name="ads_adc_phase3_clinical",
        version=1,
        id_column=_column("id", "行ID", "id", "integer", "宽表整数型行主键。"),
        dimension_columns=[
            _column("drug_name", "药物", "dimension", "string", "采集对象药物名称。"),
            _column("indication", "适应症", "dimension", "string", "临床试验对应适应症。"),
            _column(
                "biz_date",
                "业务日期",
                "dimension",
                "date",
                "业务归属年份。",
                is_business_date=True,
            ),
        ],
        indicator_columns=[
            _column(
                "orr",
                "ORR",
                "indicator",
                "number",
                "客观缓解率，按队列和剂量组保持口径一致。",
                unit="%",
            ),
            _column(
                "pfs",
                "PFS",
                "indicator",
                "number",
                "无进展生存期中位数。",
                unit="月",
            ),
            _column(
                "grade3_teae",
                "3级以上TEAE",
                "indicator",
                "number",
                "3级及以上治疗期间不良事件发生比例。",
                unit="%",
            ),
        ],
        system_columns=[
            _column("row_status", "行状态", "system", "string", "系统维护的宽表行状态。"),
            _column("last_task_id", "最近任务ID", "system", "string", "最近一次触发采集的任务ID。"),
            _column("updated_at", "更新时间", "system", "datetime", "最近一次写回宽表的时间。"),
        ],
    ),
    scope={
        "business_date": {
            "column_key": "biz_date",
            "start": "2024",
            "end": "2024",
            "frequency": "yearly",
            "latest_year_quarterly": False,
        },
        "dimensions": [
            {"column_key": "drug_name", "values": ["DS-8201"]},
            {"column_key": "indication", "values": ["HER2阳性乳腺癌"]},
        ],
    },
    indicator_groups=[
        IndicatorGroup(
            id="IG-ADC-EFFICACY",
            name="疗效指标组",
            indicator_keys=["orr", "pfs"],
            execution_mode="agent",
            default_agent="clinical-efficacy-agent",
            prompt_template="优先抽取队列内可比的疗效指标及样本量描述。",
            priority=10,
            timeout_seconds=1200,
            source_preference=["监管网站", "学术会议摘要"],
        ),
        IndicatorGroup(
            id="IG-ADC-SAFETY",
            name="安全性指标组",
            indicator_keys=["grade3_teae"],
            execution_mode="agent",
            default_agent="clinical-safety-agent",
            prompt_template="优先抽取治疗期间不良事件口径和分级定义。",
            priority=20,
            timeout_seconds=1200,
            source_preference=["监管网站", "学术会议摘要"],
        ),
    ],
    schedule_rules=[
        ScheduleRule(
            id="SR-ADC-YEARLY",
            frequency="yearly",
            trigger_time="10:00",
            auto_retry_limit=1,
        )
    ],
)

ADC_PRODUCTION_TABLE = WideTable(
    id="WT-ADC-PROD",
    title="ADC三期临床宽表",
    description="正式需求沿用 Demo 宽表定义，只扩展药物与业务日期范围。",
    schema=deepcopy(ADC_DEMO_TABLE.table_schema),
    scope={
        "business_date": {
            "column_key": "biz_date",
            "start": "2024",
            "end": "2025",
            "frequency": "yearly",
            "latest_year_quarterly": True,
        },
        "dimensions": [
            {"column_key": "drug_name", "values": ["DS-8201", "SKB264"]},
            {"column_key": "indication", "values": ["HER2阳性乳腺癌"]},
        ],
    },
    indicator_groups=deepcopy(ADC_DEMO_TABLE.indicator_groups),
    schedule_rules=deepcopy(ADC_DEMO_TABLE.schedule_rules),
)


SEED_PROJECTS: list[Project] = [
    Project(
        id="PROJ-001",
        name="自动驾驶",
        owner_team="AI投研业务数据团队",
        description="围绕行业专题承接需求定义、宽表生成和任务执行。",
        status="active",
        business_background="聚焦自动驾驶运营效率与安全指标，面向月度更新与专题分析。",
        data_source={
            "search": {
                "engines": ["bing", "volcano"],
                "sites": ["site:waymo.com", "site:ponyai.com", "site:dmv.ca.gov"],
                "sitePolicy": "preferred",
            },
            "knowledgeBases": ["kb_autodrive_industry"],
            "fixedUrls": ["https://waymo.com/safety/", "https://pony.ai/"],
        },
    ),
    Project(
        id="PROJ-002",
        name="创新药",
        owner_team="AI投研业务数据团队",
        description="围绕临床疗效与安全性构建结构化生产链路。",
        status="active",
        business_background="聚焦肿瘤药物临床疗效、安全性与监管披露的结构化生产。",
        data_source={
            "search": {
                "engines": ["volcano"],
                "sites": ["site:clinicaltrials.gov", "site:fda.gov", "site:asco.org"],
                "sitePolicy": "whitelist",
            },
            "knowledgeBases": ["kb_pharma_reports"],
            "fixedUrls": ["https://clinicaltrials.gov/", "https://www.fda.gov/"],
        },
    ),
]


SEED_REQUIREMENTS: list[Requirement] = [
    Requirement(
        id="REQ-2026-001",
        project_id="PROJ-001",
        title="自动驾驶运营快照采集",
        phase="demo",
        schema_locked=False,
        status="scoping",
        owner="业务-张宁",
        assignee="算法-陈飞",
        business_goal="先把自动驾驶运营快照宽表稳定下来，再按全量快照生成记录、任务组与采集任务。",
        background_knowledge="当前需求按运营商维度采集全量快照，不按业务日期做增量拆分。",
        data_update_enabled=False,
        wide_table=AUTODRIVE_OPS_TABLE,
        collection_policy=RequirementCollectionPolicy(
            search_engines=["bing", "volcano"],
            preferred_sites=[
                "site:didiglobal.com",
                "site:ruqi-mobility.com",
                "site:caocao.com",
                "site:pony.ai",
            ],
            site_policy="preferred",
            knowledge_bases=["kb_autodrive_industry"],
            fixed_urls=[
                "https://www.didiglobal.com/",
                "https://www.ruqi-mobility.com/",
                "https://www.caocao.com/",
                "https://pony.ai/",
            ],
            null_policy="未提及填 NULL，不允许把缺失写成 0。",
            source_priority="企业官网 > 行业统计 > 券商研报 > 媒体。",
            value_format="数值列与单位分离存储。",
        ),
    ),
    Requirement(
        id="REQ-2026-004",
        project_id="PROJ-001",
        title="自动驾驶安全月度采集",
        phase="production",
        schema_locked=True,
        status="running",
        owner="业务-张宁",
        assignee="算法-陈飞",
        business_goal="沿用已稳定的安全宽表定义，按月持续回填历史月份并为未来月份预铺宽表行。",
        background_knowledge="MPI 接管里程与事故率都必须保持百万公里归一口径，历史业务月份优先按补采方式回填。",
        data_update_enabled=True,
        data_update_mode="incremental",
        wide_table=AUTODRIVE_SAFETY_TABLE,
        collection_policy=RequirementCollectionPolicy(
            search_engines=["bing", "volcano"],
            preferred_sites=["site:waymo.com", "site:ponyai.com", "site:dmv.ca.gov"],
            site_policy="preferred",
            knowledge_bases=["kb_autodrive_industry"],
            fixed_urls=["https://waymo.com/safety/", "https://pony.ai/", "https://dmv.ca.gov/"],
            null_policy="未提及填 NULL，不允许把缺失写成 0。",
            source_priority="监管公告 > 企业官网 > 券商研报 > 媒体。",
            value_format="日期统一为 YYYY-MM，数值列与单位分离存储。",
        ),
    ),
    Requirement(
        id="REQ-2026-002",
        project_id="PROJ-002",
        title="ADC 三期疗效采集",
        phase="demo",
        schema_locked=False,
        status="stabilized",
        owner="业务-李珂",
        assignee="算法-许越",
        business_goal="先在 Demo 阶段把临床疗效与安全性的宽表 Schema、指标组和业务日期范围稳定下来。",
        background_knowledge="需要按药物和适应症固定主维度，避免跨队列比较。",
        data_update_enabled=False,
        wide_table=ADC_DEMO_TABLE,
        collection_policy=RequirementCollectionPolicy(
            search_engines=["volcano"],
            preferred_sites=["site:clinicaltrials.gov", "site:fda.gov", "site:asco.org"],
            site_policy="whitelist",
            knowledge_bases=["kb_pharma_reports"],
            fixed_urls=[],
            null_policy="无法验证时填 NULL，并保留来源解释。",
            source_priority="监管网站 > 学术会议摘要 > 企业公告。",
            value_format="ORR/TEAE 按百分比存储，PFS 统一按月。",
        ),
    ),
    Requirement(
        id="REQ-2026-003",
        project_id="PROJ-002",
        title="ADC 三期疗效采集",
        phase="production",
        parent_requirement_id="REQ-2026-002",
        schema_locked=True,
        status="running",
        owner="业务-李珂",
        assignee="算法-许越",
        business_goal="沿用已稳定的临床宽表定义，在不改 Schema 的前提下扩展药物与业务日期范围并持续执行。",
        background_knowledge="正式需求不允许修改 Schema，只允许扩展药物、适应症和业务日期范围，并调整指标组、调度和补采。",
        data_update_enabled=True,
        data_update_mode="incremental",
        wide_table=ADC_PRODUCTION_TABLE,
        collection_policy=RequirementCollectionPolicy(
            search_engines=["volcano"],
            preferred_sites=["site:clinicaltrials.gov", "site:fda.gov", "site:asco.org"],
            site_policy="whitelist",
            knowledge_bases=["kb_pharma_reports"],
            fixed_urls=[],
            null_policy="无法验证时填 NULL，并保留来源解释。",
            source_priority="监管网站 > 学术会议摘要 > 企业公告。",
            value_format="ORR/TEAE 按百分比存储，PFS 统一按月。",
        ),
    ),
]


ROW_OVERRIDES = [
    {
        "wide_table_id": "WT-AD-OPS",
        "business_date": None,
        "dimensions": {"company": "Waymo"},
        "indicator_values": {
            "order_volume": _cell(
                152000,
                value_description="Waymo 在 20260228 快照中的订单量。",
                max_value=153000,
                min_value=151000,
                data_source="Waymo Safety Report",
                source_link="https://waymo.com/safety/",
            ),
            "fleet_size": _cell(
                700,
                value_description="Waymo 在 20260228 快照中的 Robotaxi 车队数量。",
                max_value=710,
                min_value=690,
                data_source="Waymo Safety Report",
                source_link="https://waymo.com/safety/",
            ),
            "operating_mileage": _cell(
                4200,
                value_description="截至 20260228 的累计运营里程。",
                max_value=4250,
                min_value=4150,
                data_source="Waymo Safety Report",
                source_link="https://waymo.com/safety/",
            ),
            "order_price": _cell(
                42,
                value_description="快照期平均订单单价。",
                max_value=43,
                min_value=41,
                data_source="Waymo Safety Report",
                source_link="https://waymo.com/safety/",
            ),
            "order_count": _cell(
                152,
                value_description="截至 20260228 的累计订单数量。",
                max_value=154,
                min_value=150,
                data_source="Waymo Safety Report",
                source_link="https://waymo.com/safety/",
            ),
        },
        "system_values": {
            "robot_type": "Robotaxi",
            "country": "美国",
        },
        "updated_at": "2026-03-05 09:00",
    },
    {
        "wide_table_id": "WT-AD-OPS",
        "business_date": None,
        "dimensions": {"company": "滴滴全球"},
        "indicator_values": {
            "order_volume": _cell(
                89000,
                value_description="滴滴全球在 20260228 快照中的订单量。",
                max_value=90000,
                min_value=88000,
                data_source="滴滴全球官网",
                source_link="https://www.didiglobal.com/",
            ),
            "fleet_size": _cell(
                200,
                value_description="滴滴全球在 20260228 快照中的 Robotaxi 车队数量。",
                max_value=205,
                min_value=195,
                data_source="滴滴全球官网",
                source_link="https://www.didiglobal.com/",
            ),
            "operating_mileage": _cell(
                86.5,
                value_description="截至 20260228 的累计运营里程。",
                max_value=87.2,
                min_value=85.9,
                data_source="滴滴全球官网",
                source_link="https://www.didiglobal.com/",
            ),
            "order_price": _cell(
                85,
                value_description="快照期平均订单单价。",
                max_value=86,
                min_value=84,
                data_source="滴滴全球官网",
                source_link="https://www.didiglobal.com/",
            ),
            "order_count": _cell(
                45.2,
                value_description="截至 20260228 的累计订单数量。",
                max_value=46.0,
                min_value=44.7,
                data_source="滴滴全球官网",
                source_link="https://www.didiglobal.com/",
            ),
        },
        "system_values": {
            "robot_type": "Robotaxi",
            "country": "中国",
        },
        "updated_at": "2026-03-05 10:15",
    },
    {
        "wide_table_id": "WT-AD-OPS",
        "business_date": None,
        "dimensions": {"company": "如祺出行"},
        "indicator_values": {
            "order_volume": _cell(
                56000,
                value_description="如祺出行在 20260228 快照中的订单量。",
                max_value=57000,
                min_value=55000,
                data_source="如祺出行官网",
                source_link="https://www.ruqi-mobility.com/",
            ),
            "fleet_size": _cell(
                300,
                value_description="如祺出行在 20260228 快照中的 Robotaxi 车队数量。",
                max_value=305,
                min_value=295,
                data_source="如祺出行官网",
                source_link="https://www.ruqi-mobility.com/",
            ),
            "operating_mileage": _cell(
                600,
                value_description="截至 20260228 的累计运营里程。",
                max_value=608,
                min_value=592,
                data_source="如祺出行官网",
                source_link="https://www.ruqi-mobility.com/",
            ),
            "order_price": _cell(
                78,
                value_description="快照期平均订单单价。",
                max_value=79,
                min_value=77,
                data_source="如祺出行官网",
                source_link="https://www.ruqi-mobility.com/",
            ),
            "order_count": _cell(
                18.6,
                value_description="截至 20260228 的累计订单数量。",
                max_value=19.0,
                min_value=18.1,
                data_source="如祺出行官网",
                source_link="https://www.ruqi-mobility.com/",
            ),
        },
        "system_values": {
            "robot_type": "Robotaxi",
            "country": "中国",
        },
        "updated_at": "2026-03-05 11:40",
    },
    {
        "wide_table_id": "WT-AD-OPS",
        "business_date": None,
        "dimensions": {"company": "曹操出行"},
        "indicator_values": {
            "order_volume": _cell(
                32000,
                value_description="曹操出行在 20260228 快照中的订单量。",
                max_value=33000,
                min_value=31000,
                data_source="曹操出行官网",
                source_link="https://www.caocao.com/",
            ),
            "fleet_size": _cell(
                100,
                value_description="曹操出行在 20260228 快照中的 Robotaxi 车队数量。",
                max_value=102,
                min_value=98,
                data_source="曹操出行官网",
                source_link="https://www.caocao.com/",
            ),
            "operating_mileage": _cell(
                15.3,
                value_description="截至 20260228 的累计运营里程。",
                max_value=15.8,
                min_value=14.9,
                data_source="曹操出行官网",
                source_link="https://www.caocao.com/",
            ),
            "order_price": _cell(
                72,
                value_description="快照期平均订单单价。",
                max_value=73,
                min_value=71,
                data_source="曹操出行官网",
                source_link="https://www.caocao.com/",
            ),
            "order_count": _cell(
                9.8,
                value_description="截至 20260228 的累计订单数量。",
                max_value=10.1,
                min_value=9.5,
                data_source="曹操出行官网",
                source_link="https://www.caocao.com/",
            ),
        },
        "system_values": {
            "robot_type": "Robotaxi",
            "country": "中国",
        },
        "updated_at": "2026-03-05 12:05",
    },
    {
        "wide_table_id": "WT-AD-OPS",
        "business_date": None,
        "dimensions": {"company": "小马智行"},
        "indicator_values": {
            "order_volume": _cell(
                210000,
                value_description="小马智行在 20260228 快照中的订单量。",
                max_value=212000,
                min_value=208000,
                data_source="小马智行官网",
                source_link="https://pony.ai/",
            ),
            "fleet_size": _cell(
                1159,
                value_description="小马智行在 20260228 快照中的 Robotaxi 车队数量。",
                max_value=1168,
                min_value=1150,
                data_source="小马智行官网",
                source_link="https://pony.ai/",
            ),
            "operating_mileage": _cell(
                3350,
                value_description="截至 20260228 的累计运营里程。",
                max_value=3368,
                min_value=3332,
                data_source="小马智行官网",
                source_link="https://pony.ai/",
            ),
            "order_price": _cell(
                35,
                value_description="快照期平均订单单价。",
                max_value=36,
                min_value=34,
                data_source="小马智行官网",
                source_link="https://pony.ai/",
            ),
            "order_count": _cell(
                109.5,
                value_description="截至 20260228 的累计订单数量。",
                max_value=110.4,
                min_value=108.8,
                data_source="小马智行官网",
                source_link="https://pony.ai/",
            ),
        },
        "system_values": {
            "robot_type": "Robotaxi",
            "country": "中国",
        },
        "updated_at": "2026-03-05 12:20",
    },
    {
        "wide_table_id": "WT-AD-SAFE",
        "business_date": "2025-12-31",
        "dimensions": {"company": "Waymo", "city": "旧金山"},
        "indicator_values": {
            "mpi_takeover_miles": _cell(
                198000,
                value_description="2025 年 12 月 Waymo 旧金山业务的 MPI 接管里程。",
                max_value=201500,
                min_value=194800,
                data_source="Waymo Safety Hub",
                source_link="https://waymo.com/safety/",
            ),
            "incident_rate": _cell(
                0.21,
                value_description="按百万公里归一后的事故率。",
                max_value=0.23,
                min_value=0.19,
                data_source="California DMV",
                source_link="https://dmv.ca.gov/",
            ),
        },
        "updated_at": "2026-01-12 10:10",
    },
    {
        "wide_table_id": "WT-AD-SAFE",
        "business_date": "2025-12-31",
        "dimensions": {"company": "Pony.ai", "city": "旧金山"},
        "indicator_values": {
            "mpi_takeover_miles": _cell(
                71000,
                value_description="2025 年 12 月 Pony.ai 旧金山业务披露的 MPI 接管里程。",
                max_value=72600,
                min_value=69400,
                data_source="Pony.ai 安全月报",
                source_link="https://pony.ai/",
            ),
            "incident_rate": _cell(
                0.34,
                value_description="按百万公里归一后的事故率。",
                max_value=0.37,
                min_value=0.32,
                data_source="California DMV",
                source_link="https://dmv.ca.gov/",
            ),
        },
        "updated_at": "2026-01-14 15:40",
    },
    {
        "wide_table_id": "WT-AD-SAFE",
        "business_date": "2026-01-31",
        "dimensions": {"company": "Waymo", "city": "旧金山"},
        "indicator_values": {
            "mpi_takeover_miles": _cell(
                205000,
                value_description="2026 年 1 月 Waymo 旧金山业务的 MPI 接管里程。",
                max_value=208400,
                min_value=201800,
                data_source="Waymo Safety Hub",
                source_link="https://waymo.com/safety/",
            ),
            "incident_rate": _cell(
                0.19,
                value_description="按百万公里归一后的事故率。",
                max_value=0.21,
                min_value=0.17,
                data_source="California DMV",
                source_link="https://dmv.ca.gov/",
            ),
        },
        "updated_at": "2026-02-10 09:25",
    },
    {
        "wide_table_id": "WT-AD-SAFE",
        "business_date": "2026-01-31",
        "dimensions": {"company": "Pony.ai", "city": "旧金山"},
        "indicator_values": {
            "mpi_takeover_miles": _cell(
                73500,
                value_description="2026 年 1 月 Pony.ai 旧金山业务披露的 MPI 接管里程。",
                max_value=74900,
                min_value=72100,
                data_source="Pony.ai 安全月报",
                source_link="https://pony.ai/",
            ),
            "incident_rate": _cell(
                0.31,
                value_description="按百万公里归一后的事故率。",
                max_value=0.34,
                min_value=0.29,
                data_source="California DMV",
                source_link="https://dmv.ca.gov/",
            ),
        },
        "updated_at": "2026-02-12 13:15",
    },
    {
        "wide_table_id": "WT-AD-SAFE",
        "business_date": "2026-02-28",
        "dimensions": {"company": "Waymo", "city": "旧金山"},
        "indicator_values": {
            "mpi_takeover_miles": _cell(
                212000,
                value_description="2026 年 2 月 Waymo 旧金山业务的 MPI 接管里程。",
                max_value=215900,
                min_value=208700,
                data_source="Waymo Safety Hub",
                source_link="https://waymo.com/safety/",
            ),
            "incident_rate": _cell(
                0.18,
                value_description="按百万公里归一后的事故率。",
                max_value=0.2,
                min_value=0.16,
                data_source="California DMV",
                source_link="https://dmv.ca.gov/",
            ),
        },
        "updated_at": "2026-03-08 11:05",
    },
    {
        "wide_table_id": "WT-AD-SAFE",
        "business_date": "2026-02-28",
        "dimensions": {"company": "Pony.ai", "city": "旧金山"},
        "indicator_values": {
            "mpi_takeover_miles": _cell(
                74800,
                value_description="2026 年 2 月 Pony.ai 旧金山业务披露的 MPI 接管里程。",
                max_value=76100,
                min_value=73400,
                data_source="Pony.ai 安全月报",
                source_link="https://pony.ai/",
            )
        },
        "updated_at": "2026-03-09 16:20",
    },
    {
        "wide_table_id": "WT-ADC-PROD",
        "business_date": "2024",
        "dimensions": {"drug_name": "DS-8201", "indication": "HER2阳性乳腺癌"},
        "indicator_values": {
            "orr": _cell(
                78.4,
                value_description="关键队列 ORR。",
                max_value=80.1,
                min_value=76.8,
                data_source="ASCO 摘要",
                source_link="https://asco.org/",
            ),
            "pfs": _cell(
                14.2,
                value_description="中位 PFS。",
                max_value=14.9,
                min_value=13.7,
                data_source="ASCO 摘要",
                source_link="https://asco.org/",
            ),
        },
        "updated_at": "2026-03-06 14:10",
    },
    {
        "wide_table_id": "WT-ADC-PROD",
        "business_date": "2025-Q4",
        "dimensions": {"drug_name": "DS-8201", "indication": "HER2阳性乳腺癌"},
        "indicator_values": {
            "orr": _cell(
                65.1,
                value_description="最近一季会议摘要披露的 ORR。",
                max_value=67.0,
                min_value=63.4,
                data_source="ESMO 摘要",
                source_link="https://esmo.org/",
            )
        },
        "updated_at": "2026-03-06 16:20",
    },
]


def _row_key(
    wide_table_id: str,
    business_date: str | None,
    dimensions: dict[str, str],
) -> tuple[str, str | None, tuple[tuple[str, str], ...]]:
    return (
        wide_table_id,
        business_date,
        tuple(sorted(dimensions.items())),
    )


def _apply_row_overrides(rows: list[WideTableRow]) -> list[WideTableRow]:
    row_index = {
        _row_key(row.wide_table_id, row.business_date, row.dimension_values): row for row in rows
    }
    for override in ROW_OVERRIDES:
        key = _row_key(
            override["wide_table_id"],
            override["business_date"],
            override["dimensions"],
        )
        row = row_index.get(key)
        if row is None:
            continue
        for indicator_key, value in override["indicator_values"].items():
            row.indicator_values[indicator_key] = value
        for system_key, value in override.get("system_values", {}).items():
            row.system_values[system_key] = value
        row.system_values["updated_at"] = override["updated_at"]
        recompute_row_state(row)
    for row in rows:
        recompute_row_state(row)
    return rows


def _finalize_task_group_status(
    task_groups: list[TaskGroup],
    fetch_tasks: list[FetchTask],
) -> list[TaskGroup]:
    tasks_by_group: dict[str, list[FetchTask]] = {}
    for task in fetch_tasks:
        tasks_by_group.setdefault(task.task_group_id, []).append(task)

    for task_group in task_groups:
        group_tasks = tasks_by_group.get(task_group.id, [])
        if not group_tasks:
            task_group.status = "pending"
            task_group.total_tasks = 0
            task_group.completed_tasks = 0
            task_group.failed_tasks = 0
            continue
        task_group.total_tasks = len(group_tasks)
        task_group.completed_tasks = sum(1 for task in group_tasks if task.status == "completed")
        task_group.failed_tasks = sum(1 for task in group_tasks if task.status == "failed")
        statuses = {task.status for task in group_tasks}
        if statuses == {"completed"}:
            task_group.status = "completed"
        elif "running" in statuses:
            task_group.status = "running"
        elif "completed" in statuses and ("pending" in statuses):
            task_group.status = "partial"
        elif "failed" in statuses:
            task_group.status = "invalidated"
        else:
            task_group.status = "pending"
    return task_groups


def _finalize_backfill_status(
    backfill_requests: list[BackfillRequest],
    task_groups: list[TaskGroup],
) -> list[BackfillRequest]:
    groups_by_request: dict[str, list[TaskGroup]] = {}
    for task_group in task_groups:
        if task_group.backfill_request_id:
            groups_by_request.setdefault(task_group.backfill_request_id, []).append(task_group)

    for request in backfill_requests:
        groups = groups_by_request.get(request.id, [])
        statuses = {group.status for group in groups}
        if not groups:
            request.status = "pending"
        elif statuses == {"completed"}:
            request.status = "completed"
        elif "running" in statuses or "partial" in statuses:
            request.status = "running"
        elif "invalidated" in statuses:
            request.status = "failed"
        else:
            request.status = "pending"
    return backfill_requests


def _finalize_row_system_values(
    rows: list[WideTableRow],
    fetch_tasks: list[FetchTask],
) -> list[WideTableRow]:
    tasks_by_row: dict[tuple[str, int], list[FetchTask]] = {}
    for task in fetch_tasks:
        tasks_by_row.setdefault((task.wide_table_id, task.row_id), []).append(task)

    for row in rows:
        row_tasks = tasks_by_row.get((row.wide_table_id, row.row_id), [])
        if row_tasks:
            row.system_values["last_task_id"] = row_tasks[-1].id
        row.system_values["row_status"] = row.row_status
    return rows


def _sort_task_groups(task_groups: list[TaskGroup]) -> list[TaskGroup]:
    return sorted(
        task_groups,
        key=lambda item: (
            item.wide_table_id,
            business_date_sort_key(item.business_date) if item.business_date else (9999, 12, 31),
            item.partition_key,
        ),
    )


def _sort_rows(rows: list[WideTableRow]) -> list[WideTableRow]:
    return sorted(
        rows,
        key=lambda item: (
            item.wide_table_id,
            business_date_sort_key(item.business_date) if item.business_date else (9999, 12, 31),
            item.row_id,
        ),
    )


def _select_seed_task_group_batches(
    requirement: Requirement,
    wide_table: WideTable,
    *,
    collection_batches: list["CollectionBatch"],
) -> list["CollectionBatch"]:
    business_date_scope = wide_table.scope.business_date
    if (
        requirement.phase != "production"
        or wide_table.collection_coverage_mode != "incremental_by_business_date"
        or business_date_scope is None
    ):
        return collection_batches

    historical_batches = [
        batch
        for batch in collection_batches
        if batch.start_business_date
        and is_past_business_date(
            batch.start_business_date,
            frequency=business_date_scope.frequency,
            reference_date=REFERENCE_DATE,
        )
    ]
    return historical_batches or collection_batches


def _materialize_seed_graph() -> tuple[
    list["CollectionBatch"],
    list[WideTableRow],
    list["WideTableRowSnapshot"],
    list[BackfillRequest],
    list[TaskGroup],
    list[FetchTask],
    list[RetrievalTask],
    list[ExecutionRecord],
]:
    collection_batches: list["CollectionBatch"] = []
    rows: list[WideTableRow] = []
    row_snapshots: list["WideTableRowSnapshot"] = []
    backfill_requests: list[BackfillRequest] = []
    task_groups: list[TaskGroup] = []
    fetch_tasks: list[FetchTask] = []
    retrieval_tasks: list[RetrievalTask] = []
    execution_records: list[ExecutionRecord] = []

    for requirement in SEED_REQUIREMENTS:
        requirement_rows: list[WideTableRow] = []
        requirement_fetch_tasks: list[FetchTask] = []
        requirement_task_groups: list[TaskGroup] = []
        requirement_backfills: list[BackfillRequest] = []

        wide_table = requirement.wide_table
        if wide_table is None:
            continue

        table_rows = build_rows(requirement, wide_table)
        requirement_rows.extend(table_rows)

        _apply_row_overrides(requirement_rows)

        table_rows = [row for row in requirement_rows if row.wide_table_id == wide_table.id]
        table_backfills = build_backfill_requests(
            requirement,
            wide_table,
            reference_date=REFERENCE_DATE,
        )
        table_batches = build_collection_batches(
            requirement,
            wide_table,
            reference_date=REFERENCE_DATE,
        )
        seeded_task_group_batches = _select_seed_task_group_batches(
            requirement,
            wide_table,
            collection_batches=table_batches,
        )
        table_task_groups = build_task_groups(
            requirement,
            wide_table,
            reference_date=REFERENCE_DATE,
            backfill_requests=table_backfills,
            collection_batches=seeded_task_group_batches,
        )
        table_fetch_tasks = build_fetch_tasks(
            requirement,
            wide_table,
            rows=table_rows,
            task_groups=table_task_groups,
        )
        table_retrieval_tasks = build_retrieval_tasks(
            wide_table,
            rows=table_rows,
            fetch_tasks=table_fetch_tasks,
        )

        collection_batches.extend(table_batches)
        for batch in table_batches:
            row_snapshots.extend(build_row_snapshots(batch, table_rows))
        requirement_backfills.extend(table_backfills)
        requirement_task_groups.extend(table_task_groups)
        requirement_fetch_tasks.extend(table_fetch_tasks)
        retrieval_tasks.extend(table_retrieval_tasks)

        _finalize_task_group_status(requirement_task_groups, requirement_fetch_tasks)
        _finalize_backfill_status(requirement_backfills, requirement_task_groups)
        _finalize_row_system_values(requirement_rows, requirement_fetch_tasks)

        rows.extend(_sort_rows(requirement_rows))
        backfill_requests.extend(requirement_backfills)
        task_groups.extend(_sort_task_groups(requirement_task_groups))
        fetch_tasks.extend(requirement_fetch_tasks)
        execution_records.extend(build_execution_records(requirement, requirement_fetch_tasks))

    return (
        collection_batches,
        rows,
        row_snapshots,
        backfill_requests,
        task_groups,
        fetch_tasks,
        retrieval_tasks,
        execution_records,
    )


(
    SEED_COLLECTION_BATCHES,
    SEED_WIDE_TABLE_ROWS,
    SEED_WIDE_TABLE_ROW_SNAPSHOTS,
    SEED_BACKFILL_REQUESTS,
    SEED_TASK_GROUPS,
    SEED_FETCH_TASKS,
    SEED_RETRIEVAL_TASKS,
    SEED_EXECUTION_RECORDS,
) = _materialize_seed_graph()
