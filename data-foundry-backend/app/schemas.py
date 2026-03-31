from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


ProjectStatus = Literal["active", "planning"]
RequirementPhase = Literal["demo", "production"]
RequirementStatus = Literal["draft", "scoping", "ready", "running", "stabilized"]
RequirementDataUpdateMode = Literal["full", "incremental"]
SearchEngine = Literal["volcano", "bing"]
SitePolicy = Literal["preferred", "whitelist"]
ColumnRole = Literal["id", "dimension", "indicator", "system"]
ColumnType = Literal["string", "number", "integer", "boolean", "date", "datetime"]
BusinessDateFrequency = Literal["yearly", "monthly"]
SemanticTimeAxis = Literal["business_date", "none"]
CollectionCoverageMode = Literal["incremental_by_business_date", "full_snapshot"]
ExecutionMode = Literal["agent", "human"]
RowStatus = Literal["initialized", "collecting", "partial", "completed", "invalidated"]
TaskGroupStatus = Literal["pending", "running", "partial", "completed", "invalidated"]
CollectionBatchStatus = Literal["pending", "running", "completed", "failed", "invalidated"]
TaskGroupPartitionType = Literal["business_date", "full_table", "shard"]
FetchTaskStatus = Literal["pending", "running", "completed", "failed", "invalidated"]
RetrievalStatus = Literal["pending", "running", "completed", "failed"]
RunStatus = Literal["queued", "running", "completed", "failed"]
TriggerType = Literal["trial", "manual", "cron", "resample", "backfill"]
TaskGroupSource = Literal["scheduled", "backfill"]
BackfillOrigin = Literal["initialization", "manual"]
BackfillStatus = Literal["pending", "running", "completed", "failed"]


class Project(BaseModel):
    id: str
    name: str
    owner_team: str
    description: str
    status: ProjectStatus
    business_background: str | None = None
    data_source: dict[str, Any] | None = None
    created_at: str | None = None


class WideTableColumn(BaseModel):
    key: str
    name: str
    role: ColumnRole
    data_type: ColumnType
    description: str
    required: bool = True
    unit: str | None = None
    is_business_date: bool = False

    @model_validator(mode="after")
    def validate_column(self) -> "WideTableColumn":
        if self.role == "indicator" and not self.unit:
            raise ValueError("indicator column must define a unit")
        if self.role != "indicator" and self.unit is not None:
            raise ValueError("only indicator columns can define a unit")
        if self.is_business_date and self.role != "dimension":
            raise ValueError("business date column must be a dimension column")
        if self.role == "id" and self.data_type != "integer":
            raise ValueError("id column must use integer type")
        return self


class WideTableSchema(BaseModel):
    table_name: str
    version: int
    id_column: WideTableColumn
    dimension_columns: list[WideTableColumn]
    indicator_columns: list[WideTableColumn]
    system_columns: list[WideTableColumn]

    @model_validator(mode="after")
    def validate_schema(self) -> "WideTableSchema":
        if self.id_column.role != "id":
            raise ValueError("id_column must be an id column")
        if self.id_column.data_type != "integer":
            raise ValueError("id column must be integer")
        if not self.indicator_columns:
            raise ValueError("wide table must define indicator columns")
        if not self.system_columns:
            raise ValueError("wide table must define system columns")
        if any(column.role != "dimension" for column in self.dimension_columns):
            raise ValueError("dimension_columns must only contain dimension columns")
        if any(column.role != "indicator" for column in self.indicator_columns):
            raise ValueError("indicator_columns must only contain indicator columns")
        if any(column.role != "system" for column in self.system_columns):
            raise ValueError("system_columns must only contain system columns")

        all_keys = [self.id_column.key]
        all_keys.extend(column.key for column in self.dimension_columns)
        all_keys.extend(column.key for column in self.indicator_columns)
        all_keys.extend(column.key for column in self.system_columns)
        if len(all_keys) != len(set(all_keys)):
            raise ValueError("schema column keys must be unique")

        return self


class BusinessDateScope(BaseModel):
    column_key: str
    start: str
    end: str
    frequency: BusinessDateFrequency
    latest_year_quarterly: bool = False


class DimensionValueScope(BaseModel):
    column_key: str
    values: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_scope(self) -> "DimensionValueScope":
        if not self.values:
            raise ValueError("dimension scope must contain at least one value")
        return self


class WideTableScope(BaseModel):
    business_date: BusinessDateScope | None = None
    dimensions: list[DimensionValueScope] = Field(default_factory=list)


def resolve_semantic_time_axis(
    *,
    table_schema: "WideTableSchema",
    scope: "WideTableScope",
) -> SemanticTimeAxis:
    has_business_date_dimension = any(
        column.is_business_date for column in table_schema.dimension_columns
    )
    return "business_date" if has_business_date_dimension or scope.business_date is not None else "none"


def resolve_collection_coverage_mode(
    semantic_time_axis: SemanticTimeAxis,
) -> CollectionCoverageMode:
    return (
        "incremental_by_business_date"
        if semantic_time_axis == "business_date"
        else "full_snapshot"
    )


class RequirementCollectionPolicy(BaseModel):
    search_engines: list[SearchEngine]
    preferred_sites: list[str] = Field(default_factory=list)
    site_policy: SitePolicy
    knowledge_bases: list[str] = Field(default_factory=list)
    fixed_urls: list[str] = Field(default_factory=list)
    null_policy: str
    source_priority: str
    value_format: str


class IndicatorGroupPromptConfig(BaseModel):
    core_query_requirement: str | None = None
    business_knowledge: str | None = None
    output_constraints: str | None = None
    last_edited_at: str | None = None


class IndicatorGroup(BaseModel):
    id: str
    name: str
    indicator_keys: list[str]
    execution_mode: ExecutionMode
    default_agent: str | None = None
    prompt_template: str | None = None
    prompt_config: IndicatorGroupPromptConfig | None = None
    description: str = ""
    priority: int = 100
    timeout_seconds: int | None = None
    source_preference: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_group(self) -> "IndicatorGroup":
        if not self.indicator_keys:
            raise ValueError("indicator group must contain at least one indicator")
        if len(self.indicator_keys) != len(set(self.indicator_keys)):
            raise ValueError("indicator keys within a group must be unique")
        return self


class ScheduleRule(BaseModel):
    id: str
    frequency: BusinessDateFrequency
    trigger_time: str
    auto_retry_limit: int = 0
    enabled: bool = True


class WideTable(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    title: str
    description: str
    table_schema: WideTableSchema = Field(alias="schema")
    scope: WideTableScope
    indicator_groups: list[IndicatorGroup]
    schedule_rules: list[ScheduleRule]
    semantic_time_axis: SemanticTimeAxis = "business_date"
    collection_coverage_mode: CollectionCoverageMode = "incremental_by_business_date"
    status: Literal["draft", "initialized", "active"] = "draft"
    record_count: int = 0
    created_at: str | None = None
    updated_at: str | None = None

    @model_validator(mode="after")
    def validate_wide_table(self) -> "WideTable":
        self.semantic_time_axis = resolve_semantic_time_axis(
            table_schema=self.table_schema,
            scope=self.scope,
        )
        self.collection_coverage_mode = resolve_collection_coverage_mode(
            self.semantic_time_axis,
        )

        if not self.indicator_groups:
            raise ValueError("wide table must define indicator groups")
        if not self.schedule_rules:
            raise ValueError("wide table must define schedule rules")

        business_date_keys = {
            column.key
            for column in self.table_schema.dimension_columns
            if column.is_business_date
        }

        if self.semantic_time_axis == "business_date":
            if len(business_date_keys) != 1:
                raise ValueError("semantic_time_axis=business_date requires exactly one business date dimension")
            if self.scope.business_date is None:
                raise ValueError("semantic_time_axis=business_date requires business_date scope")
            if self.scope.business_date.column_key not in business_date_keys:
                raise ValueError("business date scope must target the business date dimension")
        else:
            if business_date_keys:
                raise ValueError("semantic_time_axis=none forbids business date dimensions")
            if self.scope.business_date is not None:
                raise ValueError("semantic_time_axis=none forbids business_date scope")

        expected_dimension_keys = {
            column.key
            for column in self.table_schema.dimension_columns
            if self.semantic_time_axis != "business_date" or not column.is_business_date
        }
        actual_dimension_keys = {scope.column_key for scope in self.scope.dimensions}
        if actual_dimension_keys != expected_dimension_keys:
            raise ValueError("scope must provide values for every non-date dimension")

        indicator_keys = {column.key for column in self.table_schema.indicator_columns}
        grouped_indicator_keys: list[str] = []
        for group in self.indicator_groups:
            if not set(group.indicator_keys).issubset(indicator_keys):
                raise ValueError("indicator group contains undefined indicator keys")
            grouped_indicator_keys.extend(group.indicator_keys)
        if len(grouped_indicator_keys) != len(set(grouped_indicator_keys)):
            raise ValueError("indicator groups must not overlap on indicator keys")
        if set(grouped_indicator_keys) != indicator_keys:
            raise ValueError("indicator groups must cover all indicator columns")
        return self


def infer_requirement_data_update_mode(
    wide_table: "WideTable" | None,
) -> RequirementDataUpdateMode | None:
    if wide_table is None:
        return None
    return (
        "incremental"
        if wide_table.collection_coverage_mode == "incremental_by_business_date"
        else "full"
    )


class Requirement(BaseModel):
    id: str
    project_id: str
    title: str
    phase: RequirementPhase
    parent_requirement_id: str | None = None
    schema_locked: bool
    status: RequirementStatus
    owner: str
    assignee: str
    business_goal: str
    background_knowledge: str | None = None
    wide_table: WideTable | None = None
    collection_policy: RequirementCollectionPolicy
    business_boundary: str | None = None
    delivery_scope: str | None = None
    data_update_enabled: bool | None = None
    data_update_mode: RequirementDataUpdateMode | None = None
    processing_rule_drafts: list[dict[str, Any]] = Field(default_factory=list)
    created_at: str | None = None
    updated_at: str | None = None

    @model_validator(mode="before")
    @classmethod
    def normalize_legacy_wide_tables(cls, data: Any) -> Any:
        if not isinstance(data, dict) or "wide_table" in data:
            return data
        legacy_wide_tables = data.get("wide_tables")
        if legacy_wide_tables is None:
            return data
        if len(legacy_wide_tables) > 1:
            raise ValueError("requirement supports at most one wide table")
        normalized = dict(data)
        normalized["wide_table"] = legacy_wide_tables[0] if legacy_wide_tables else None
        return normalized

    @model_validator(mode="after")
    def validate_requirement(self) -> "Requirement":
        if self.phase == "demo" and self.schema_locked:
            raise ValueError("demo requirement must keep schema unlocked")
        if self.phase == "production":
            if not self.schema_locked:
                raise ValueError("production requirement must lock schema")
        if self.wide_table is None and self.status != "draft":
            raise ValueError("non-draft requirement must define a wide table")
        inferred_mode = infer_requirement_data_update_mode(self.wide_table)
        if self.data_update_enabled:
            self.data_update_mode = self.data_update_mode or inferred_mode
            if (
                inferred_mode is not None
                and self.data_update_mode is not None
                and self.data_update_mode != inferred_mode
            ):
                raise ValueError("data update mode must match the wide table coverage mode")
        else:
            self.data_update_mode = None
        return self


class IndicatorCell(BaseModel):
    value: Any | None = None
    value_description: str | None = None
    max_value: float | None = None
    min_value: float | None = None
    data_source: str | None = None
    source_link: str | None = None


# ==================== 指标填充：LLM 语义 JSON + 规则引擎 ====================

SemanticKind = Literal[
    "exact", "range", "at_least", "approximate", "null", "date", "unknown"
]
DateSemantics = Literal["exact", "quarter", "half_year", "year"]
NullReason = Literal["not_disclosed", "not_applicable", "insufficient", "pending"]
FillingStatus = Literal["filled", "low_confidence", "null_mapped", "error"]


class SemanticIndicatorResult(BaseModel):
    """LLM 产出的中间语义 JSON，不直接作为最终值。"""
    kind: SemanticKind
    value: float | None = None
    lower: float | None = None
    upper: float | None = None
    unit: str | None = None
    original_unit: str | None = None
    null_reason: NullReason | None = None
    date_semantics: DateSemantics | None = None
    date_value: str | None = None
    html_cleaned: bool = False
    confidence: float = Field(ge=0.0, le=1.0)
    reasoning: str = ""


class IndicatorFillingResult(BaseModel):
    """规则引擎根据语义 JSON 落成的最终填充结果。"""
    row_id: int
    indicator_key: str
    raw_value: str
    semantic: SemanticIndicatorResult
    final_value: str
    status: FillingStatus
    rule_applied: str
    needs_human_review: bool = False


class IndicatorFillingConfig(BaseModel):
    """指标填充规则配置。"""
    confidence_threshold: float = Field(default=0.7, ge=0.0, le=1.0)
    null_synonyms: list[str] = Field(
        default_factory=lambda: ["数据不足", "暂无", "无", "N/A", "未披露", "不适用"]
    )
    range_strategy: Literal["midpoint", "lower", "upper", "flag"] = "midpoint"
    html_tag_stripping: bool = True
    date_quarter_end_mapping: bool = True


class UnitMapping(BaseModel):
    """单位映射配置。"""
    from_unit: str
    to_unit: str
    conversion_factor: float


class WideTableRow(BaseModel):
    row_id: int
    requirement_id: str
    wide_table_id: str
    schema_version: int
    plan_version: int = 1
    row_status: RowStatus
    dimension_values: dict[str, str]
    business_date: str | None = None
    row_binding_key: str = ""
    indicator_values: dict[str, IndicatorCell]
    system_values: dict[str, Any | None] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_row(self) -> "WideTableRow":
        if self.row_id < 1:
            raise ValueError("row_id must start from 1")
        return self


class BackfillRequest(BaseModel):
    id: str
    requirement_id: str
    wide_table_id: str
    start_business_date: str
    end_business_date: str
    requested_by: str
    origin: BackfillOrigin
    status: BackfillStatus
    reason: str | None = None


class TaskGroup(BaseModel):
    id: str
    requirement_id: str
    wide_table_id: str
    batch_id: str | None = None
    business_date: str | None = None
    source_type: TaskGroupSource
    status: TaskGroupStatus
    schedule_rule_id: str | None = None
    backfill_request_id: str | None = None
    plan_version: int = 1
    group_kind: str = "baseline"
    partition_type: TaskGroupPartitionType = "business_date"
    partition_key: str = ""
    partition_label: str = ""
    total_tasks: int = 0
    completed_tasks: int = 0
    failed_tasks: int = 0
    triggered_by: str = "manual"
    business_date_label: str | None = None
    row_snapshots: list[WideTableRow] | None = None
    created_at: str | None = None
    updated_at: str | None = None

    @model_validator(mode="after")
    def validate_group(self) -> "TaskGroup":
        if self.source_type == "scheduled" and not self.schedule_rule_id:
            raise ValueError("scheduled task group must reference schedule_rule_id")
        if self.source_type == "backfill" and not self.backfill_request_id:
            raise ValueError("backfill task group must reference backfill_request_id")
        if self.partition_type == "business_date" and not self.business_date:
            raise ValueError("business_date partition must provide business_date")
        return self


class CollectionBatch(BaseModel):
    id: str
    requirement_id: str
    wide_table_id: str
    snapshot_at: str
    snapshot_label: str
    coverage_mode: CollectionCoverageMode
    semantic_time_axis: SemanticTimeAxis
    status: CollectionBatchStatus = "pending"
    is_current: bool = False
    plan_version: int = 1
    triggered_by: str = "manual"
    start_business_date: str | None = None
    end_business_date: str | None = None
    created_at: str | None = None
    updated_at: str | None = None


class FetchTask(BaseModel):
    id: str
    requirement_id: str
    wide_table_id: str
    task_group_id: str
    batch_id: str | None = None
    row_id: int
    indicator_group_id: str
    name: str
    schema_version: int
    execution_mode: ExecutionMode
    indicator_keys: list[str]
    dimension_values: dict[str, str]
    business_date: str | None = None
    status: FetchTaskStatus
    confidence: float | None = None
    can_rerun: bool
    invalidated_reason: str | None = None
    owner: str
    plan_version: int = 1
    row_binding_key: str = ""
    created_at: str | None = None
    updated_at: str | None = None

    @model_validator(mode="after")
    def validate_task(self) -> "FetchTask":
        if self.row_id < 1:
            raise ValueError("fetch task row_id must be positive")
        if not self.indicator_keys:
            raise ValueError("fetch task must contain indicator keys")
        return self


class NarrowIndicatorRow(BaseModel):
    wide_table_id: str
    row_id: int
    dimension_values: dict[str, str]
    business_date: str | None = None
    indicator_key: str
    indicator_name: str
    indicator_description: str
    indicator_unit: str
    unit: str | None = None
    published_at: str | None = None
    source_site: str | None = None
    indicator_logic: str | None = None
    indicator_logic_supplement: str | None = None
    max_value: float | None = None
    min_value: float | None = None
    source_url: str | None = None
    quote_text: str | None = None
    result: IndicatorCell


class WideTableRowSnapshot(BaseModel):
    batch_id: str
    wide_table_id: str
    row_id: int
    row_binding_key: str
    business_date: str | None = None
    dimension_values: dict[str, str]
    row_status: RowStatus
    indicator_values: dict[str, IndicatorCell]
    system_values: dict[str, Any | None] = Field(default_factory=dict)
    created_at: str | None = None
    updated_at: str | None = None


class RetrievalTask(BaseModel):
    id: str
    parent_task_id: str
    wide_table_id: str
    row_id: int
    name: str
    indicator_key: str
    query: str
    status: RetrievalStatus
    confidence: float
    narrow_row: NarrowIndicatorRow


class ExecutionRecord(BaseModel):
    id: str
    task_id: str
    trigger_type: TriggerType
    status: RunStatus
    started_at: str
    ended_at: str | None = None
    operator: str
    output_ref: str | None = None
    log_ref: str


class RequirementSummary(BaseModel):
    requirement: Requirement
    wide_table_count: int
    wide_row_count: int
    task_group_count: int
    task_count: int
    retrieval_task_count: int
    backfill_request_count: int


class TaskSummary(BaseModel):
    task: FetchTask
    retrieval_task_count: int
    run_count: int


# ==================== API 请求/响应模型 ====================


class ProjectCreateInput(BaseModel):
    name: str
    owner_team: str
    description: str
    status: ProjectStatus = "planning"
    business_background: str | None = None
    data_source: dict[str, Any] | None = None


class ProjectUpdateInput(BaseModel):
    name: str | None = None
    owner_team: str | None = None
    description: str | None = None
    status: ProjectStatus | None = None
    business_background: str | None = None
    data_source: dict[str, Any] | None = None


class RequirementCreateInput(BaseModel):
    title: str
    phase: RequirementPhase = "demo"
    owner: str
    assignee: str
    business_goal: str
    background_knowledge: str | None = None
    business_boundary: str | None = None
    delivery_scope: str | None = None
    data_update_enabled: bool | None = None
    data_update_mode: RequirementDataUpdateMode | None = None
    collection_policy: RequirementCollectionPolicy
    wide_table: WideTable | None = None

    @model_validator(mode="before")
    @classmethod
    def normalize_legacy_wide_tables(cls, data: Any) -> Any:
        if not isinstance(data, dict) or "wide_table" in data:
            return data
        legacy_wide_tables = data.get("wide_tables")
        if legacy_wide_tables is None:
            return data
        if len(legacy_wide_tables) > 1:
            raise ValueError("requirement supports at most one wide table")
        normalized = dict(data)
        normalized["wide_table"] = legacy_wide_tables[0] if legacy_wide_tables else None
        return normalized


class RequirementUpdateInput(BaseModel):
    title: str | None = None
    status: RequirementStatus | None = None
    owner: str | None = None
    assignee: str | None = None
    business_goal: str | None = None
    background_knowledge: str | None = None
    business_boundary: str | None = None
    delivery_scope: str | None = None
    data_update_enabled: bool | None = None
    data_update_mode: RequirementDataUpdateMode | None = None
    processing_rule_drafts: list[dict[str, Any]] | None = None
    collection_policy: RequirementCollectionPolicy | None = None


class WideTableCreateInput(BaseModel):
    title: str
    description: str
    table_schema: WideTableSchema = Field(alias="schema")
    scope: WideTableScope
    indicator_groups: list[IndicatorGroup]
    schedule_rules: list[ScheduleRule]
    semantic_time_axis: SemanticTimeAxis = "business_date"
    collection_coverage_mode: CollectionCoverageMode = "incremental_by_business_date"

    model_config = ConfigDict(populate_by_name=True)


class WideTableUpdateInput(BaseModel):
    title: str | None = None
    description: str | None = None
    table_schema: WideTableSchema | None = Field(default=None, alias="schema")
    scope: WideTableScope | None = None
    indicator_groups: list[IndicatorGroup] | None = None
    schedule_rules: list[ScheduleRule] | None = None
    semantic_time_axis: SemanticTimeAxis | None = None
    collection_coverage_mode: CollectionCoverageMode | None = None

    model_config = ConfigDict(populate_by_name=True)


class WideTableRowUpdateInput(BaseModel):
    indicator_values: dict[str, IndicatorCell] | None = None
    row_status: RowStatus | None = None
    system_values: dict[str, Any | None] | None = None


class WideTableRowUpdateItem(BaseModel):
    row_id: int
    indicator_values: dict[str, IndicatorCell] | None = None
    row_status: RowStatus | None = None


class WideTableRowBatchUpdateInput(BaseModel):
    updates: list[WideTableRowUpdateItem]


class TaskGroupCreateInput(BaseModel):
    wide_table_id: str
    business_date: str | None = None
    source_type: TaskGroupSource = "scheduled"
    triggered_by: str = "manual"


class WideTablePlanIndicatorGroupInput(BaseModel):
    id: str
    name: str
    indicator_columns: list[str]
    priority: int = 100
    description: str = ""
    agent: str | None = None
    prompt_template: str | None = None
    prompt_config: IndicatorGroupPromptConfig | None = None


class WideTablePlanRowInput(BaseModel):
    row_id: int
    plan_version: int = 1
    row_status: RowStatus = "initialized"
    dimension_values: dict[str, str]
    business_date: str | None = None
    row_binding_key: str | None = None
    system_values: dict[str, Any | None] = Field(default_factory=dict)


class WideTablePlanTaskGroupInput(BaseModel):
    id: str
    batch_id: str | None = None
    business_date: str | None = None
    plan_version: int = 1
    status: TaskGroupStatus = "pending"
    partition_type: TaskGroupPartitionType = "business_date"
    partition_key: str = ""
    partition_label: str = ""
    total_tasks: int = 0
    completed_tasks: int = 0
    failed_tasks: int = 0
    triggered_by: str = "manual"
    created_at: str | None = None
    updated_at: str | None = None


class WideTablePlanPersistInput(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    table_schema: WideTableSchema | None = Field(default=None, alias="schema")
    scope: WideTableScope
    indicator_groups: list[WideTablePlanIndicatorGroupInput]
    rows: list[WideTablePlanRowInput]
    task_groups: list[WideTablePlanTaskGroupInput]
    semantic_time_axis: SemanticTimeAxis | None = None
    collection_coverage_mode: CollectionCoverageMode | None = None
    status: Literal["draft", "initialized", "active"] = "initialized"
    record_count: int = 0


class BackfillRequestCreateInput(BaseModel):
    wide_table_id: str
    start_business_date: str
    end_business_date: str
    reason: str | None = None
    requested_by: str = "system"


class TaskExecuteInput(BaseModel):
    trigger_type: TriggerType = "manual"
    operator: str = "system"


class AcceptanceTicketCreateInput(BaseModel):
    dataset: str
    requirement_id: str
    owner: str
    feedback: str | None = None


class AcceptanceTicketUpdateInput(BaseModel):
    status: Literal["approved", "rejected", "fixing", "deleted"] | None = None
    feedback: str | None = None


# ==================== 新增表的数据模型 ====================

AcceptanceStatus = Literal["approved", "rejected", "fixing", "deleted"]
PreprocessRuleSource = Literal["platform", "business"]
PreprocessRuleCategory = Literal["format_fix", "null_fix", "unit_convert", "derived"]
AuditRuleMode = Literal["non_blocking", "blocking"]
ScenarioRigour = Literal["low", "high"]
ScheduleJobStatus = Literal["queued", "running", "completed", "failed"]


class PreprocessRule(BaseModel):
    id: str
    name: str
    source: PreprocessRuleSource
    enabled: bool = True
    category: PreprocessRuleCategory
    expression: str
    sample_issue: str | None = None
    indicator_bindings: list[dict[str, Any]] = Field(default_factory=list)
    filling_config: dict[str, Any] | None = None


class AuditRule(BaseModel):
    id: str
    name: str
    mode: AuditRuleMode
    scenario_rigour: ScenarioRigour
    condition_expr: str
    action_text: str
    enabled: bool = True


class AcceptanceTicket(BaseModel):
    id: str
    dataset: str
    requirement_id: str
    status: AcceptanceStatus
    owner: str
    feedback: str | None = None
    latest_action_at: str


class ScheduleJob(BaseModel):
    id: str
    task_group_id: str
    wide_table_id: str | None = None
    trigger_type: TriggerType
    status: ScheduleJobStatus
    started_at: str
    ended_at: str | None = None
    operator: str
    log_ref: str | None = None


class KnowledgeBase(BaseModel):
    id: str
    name: str
    description: str | None = None
    document_count: int = 0
    status: str = "ready"
    last_updated: str | None = None


class PromptTemplate(BaseModel):
    id: str
    name: str
    industry: str | None = None
    rigour: str | None = None
    description: str | None = None
    recommended_model: str | None = None
    updated_at: str | None = None


class DataLineage(BaseModel):
    id: str
    dataset: str
    upstream: str
    downstream: str
    last_sync_at: str | None = None


class DashboardMetrics(BaseModel):
    projects: int
    requirements: int
    task_groups: int
    fetch_tasks: int
    running_task_groups: int
    pending_backfills: int


class OpsOverview(BaseModel):
    environment: str
    stage: str
    status: str
    running_tasks: int
    failed_tasks: int


class StatusCount(BaseModel):
    status: str
    count: int


class RuntimeSettings(BaseModel):
    max_concurrent_agent_tasks: int = Field(default=5, ge=1, le=64)


class RuntimeSettingsUpdateInput(BaseModel):
    max_concurrent_agent_tasks: int = Field(ge=1, le=64)
