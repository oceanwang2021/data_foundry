from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class IndicatorCell(BaseModel):
    value: Any | None = None
    value_description: str | None = None
    max_value: float | None = None
    min_value: float | None = None
    data_source: str | None = None
    source_link: str | None = None


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


class SemanticIndicatorResult(BaseModel):
    kind: Literal["exact", "range", "at_least", "approximate", "null", "date", "unknown"] = "exact"
    value: float | None = None
    lower: float | None = None
    upper: float | None = None
    unit: str | None = None
    confidence: float = Field(default=0.9, ge=0.0, le=1.0)
    reasoning: str = ""


class AgentExecutionRequest(BaseModel):
    task_id: str
    run_id: str | None = None
    requirement_id: str
    wide_table_id: str
    row_id: int
    business_date: str | None = None
    task_group_id: str | None = None
    batch_id: str | None = None
    collection_coverage_mode: Literal["incremental_by_business_date", "full_snapshot"] = "incremental_by_business_date"
    snapshot_label: str | None = None
    snapshot_at: str | None = None
    dimension_values: dict[str, str]
    indicator_keys: list[str]
    indicator_names: dict[str, str] = Field(default_factory=dict)
    indicator_descriptions: dict[str, str] = Field(default_factory=dict)
    indicator_units: dict[str, str] = Field(default_factory=dict)
    search_engines: list[str] = Field(default_factory=list)
    preferred_sites: list[str] = Field(default_factory=list)
    site_policy: str = "preferred"
    knowledge_bases: list[str] = Field(default_factory=list)
    fixed_urls: list[str] = Field(default_factory=list)
    prompt_template: str | None = None
    execution_mode: str = "agent"
    default_agent: str | None = None


class AgentIndicatorResult(BaseModel):
    indicator_key: str
    value: str | None = None
    value_description: str | None = None
    data_source: str | None = None
    source_url: str | None = None
    source_link: str | None = None
    quote_text: str | None = None
    confidence: float = Field(default=0.9, ge=0.0, le=1.0)
    semantic: SemanticIndicatorResult | None = None


class RetrievalTaskResult(BaseModel):
    indicator_key: str
    query: str
    status: Literal["pending", "running", "completed", "failed"] = "completed"
    confidence: float = Field(default=0.9, ge=0.0, le=1.0)
    narrow_row: NarrowIndicatorRow


class AgentExecutionResponse(BaseModel):
    task_id: str
    status: Literal["completed", "failed"]
    indicators: list[AgentIndicatorResult] = Field(default_factory=list)
    retrieval_tasks: list[RetrievalTaskResult] = Field(default_factory=list)
    duration_ms: int
    error_message: str | None = None
