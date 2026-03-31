"""Collection agent client for remote task execution."""
from __future__ import annotations

import logging
import os
import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Literal

import httpx
from pydantic import BaseModel, Field

from app.repository import DataFoundryRepository
from app.schemas import (
    CollectionBatch,
    ExecutionRecord,
    FetchTask,
    IndicatorCell,
    IndicatorGroup,
    NarrowIndicatorRow,
    Requirement,
    TaskGroup,
    RetrievalTask,
    WideTable,
    WideTableColumn,
    WideTableRow,
    WideTableRowSnapshot,
)
from app.services.prompt_service import build_indicator_group_prompt

logger = logging.getLogger(__name__)


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
    confidence: float = 0.0
    semantic: dict[str, Any] | None = None


class RetrievalTaskResult(BaseModel):
    indicator_key: str
    query: str
    status: str
    confidence: float = 0.0
    narrow_row: NarrowIndicatorRow


class AgentExecutionResponse(BaseModel):
    task_id: str
    status: str
    indicators: list[AgentIndicatorResult] = Field(default_factory=list)
    retrieval_tasks: list[RetrievalTaskResult] = Field(default_factory=list)
    duration_ms: int = 0
    error_message: str | None = None


@dataclass
class TaskExecutionContext:
    requirement: Requirement
    wide_table: WideTable
    task_group: TaskGroup
    batch: CollectionBatch | None
    row: WideTableRow
    indicator_group: IndicatorGroup
    indicator_columns: dict[str, WideTableColumn]


class CollectionAgentService:
    def __init__(
        self,
        repo: DataFoundryRepository,
        *,
        base_url: str | None = None,
        timeout_seconds: float | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.repo = repo
        self.base_url = (
            base_url
            or os.getenv("DATA_FOUNDRY_AGENT_BASE_URL")
            or "http://127.0.0.1:8100"
        ).rstrip("/")
        self.timeout_seconds = timeout_seconds or float(
            os.getenv("DATA_FOUNDRY_AGENT_TIMEOUT_SECONDS", "30")
        )
        self.transport = transport

    async def run_task(
        self,
        task: FetchTask,
        *,
        trigger_type: str = "manual",
        operator: str = "system",
    ) -> None:
        context = self._load_context(task)
        run_id = str(uuid.uuid4())
        started_at = datetime.now().isoformat()
        request_body = self._build_request(task, context, run_id=run_id)

        record = ExecutionRecord(
            id=run_id,
            task_id=task.id,
            trigger_type=trigger_type,
            status="running",
            started_at=started_at,
            operator=operator,
            log_ref=f"log://collection-agent/{run_id}",
        )
        self.repo.save_execution_record(record)

        try:
            response = await self._execute_remote(request_body)
        except Exception as exc:
            logger.exception("Remote agent execution failed for task %s", task.id)
            self._mark_failure(task, record, str(exc))
            return

        if response.status != "completed":
            self._mark_failure(task, record, response.error_message or "Agent execution failed")
            return

        self._persist_success(task, record, response, context)

    def _load_context(self, task: FetchTask) -> TaskExecutionContext:
        requirement = self._find_requirement(task.requirement_id)
        if requirement is None:
            raise ValueError(f"Requirement {task.requirement_id!r} not found")

        wide_table = self.repo.get_wide_table(task.wide_table_id)
        if wide_table is None:
            raise ValueError(f"WideTable {task.wide_table_id!r} not found")

        task_group = self.repo.get_task_group(task.task_group_id)
        if task_group is None:
            raise ValueError(f"TaskGroup {task.task_group_id!r} not found")

        batch = self.repo.get_collection_batch(task.batch_id) if task.batch_id else None
        row = self.repo.get_wide_table_row(task.wide_table_id, task.row_id)
        if row is None:
            raise ValueError(
                f"WideTableRow {task.wide_table_id!r}/{task.row_id!r} not found"
            )

        indicator_group = next(
            (group for group in wide_table.indicator_groups if group.id == task.indicator_group_id),
            None,
        )
        if indicator_group is None:
            raise ValueError(f"IndicatorGroup {task.indicator_group_id!r} not found")

        indicator_columns = {
            column.key: column
            for column in wide_table.table_schema.indicator_columns
            if column.key in task.indicator_keys
        }
        return TaskExecutionContext(
            requirement=requirement,
            wide_table=wide_table,
            task_group=task_group,
            batch=batch,
            row=row,
            indicator_group=indicator_group,
            indicator_columns=indicator_columns,
        )

    def _find_requirement(self, requirement_id: str) -> Requirement | None:
        for project in self.repo.list_projects():
            requirement = self.repo.get_requirement(project.id, requirement_id)
            if requirement is not None:
                return requirement
        return None

    def _build_request(
        self,
        task: FetchTask,
        context: TaskExecutionContext,
        *,
        run_id: str | None = None,
    ) -> AgentExecutionRequest:
        collection_policy = context.requirement.collection_policy
        prompt_bundle = build_indicator_group_prompt(
            context.requirement,
            context.wide_table,
            context.indicator_group,
        )
        snapshot_label: str | None = None
        snapshot_at: str | None = None
        if context.wide_table.collection_coverage_mode == "full_snapshot":
            snapshot_label = context.batch.snapshot_label if context.batch is not None else (context.task_group.partition_label or context.task_group.business_date_label)
            snapshot_at = context.batch.snapshot_at if context.batch is not None else context.task_group.created_at
        return AgentExecutionRequest(
            task_id=task.id,
            run_id=run_id,
            requirement_id=context.requirement.id,
            wide_table_id=context.wide_table.id,
            row_id=context.row.row_id,
            business_date=context.row.business_date,
            task_group_id=context.task_group.id,
            batch_id=context.batch.id if context.batch is not None else task.batch_id,
            collection_coverage_mode=context.wide_table.collection_coverage_mode,
            snapshot_label=snapshot_label,
            snapshot_at=snapshot_at,
            dimension_values=context.row.dimension_values,
            indicator_keys=task.indicator_keys,
            indicator_names={
                key: context.indicator_columns[key].name
                for key in task.indicator_keys
                if key in context.indicator_columns
            },
            indicator_descriptions={
                key: context.indicator_columns[key].description
                for key in task.indicator_keys
                if key in context.indicator_columns
            },
            indicator_units={
                key: context.indicator_columns[key].unit or ""
                for key in task.indicator_keys
                if key in context.indicator_columns
            },
            search_engines=list(collection_policy.search_engines),
            preferred_sites=collection_policy.preferred_sites,
            site_policy=collection_policy.site_policy,
            knowledge_bases=collection_policy.knowledge_bases,
            fixed_urls=collection_policy.fixed_urls,
            prompt_template=prompt_bundle.markdown,
            execution_mode=context.indicator_group.execution_mode,
            default_agent=context.indicator_group.default_agent,
        )

    async def _execute_remote(
        self,
        request_body: AgentExecutionRequest,
    ) -> AgentExecutionResponse:
        async with httpx.AsyncClient(
            timeout=self.timeout_seconds,
            transport=self.transport,
            trust_env=False,
        ) as client:
            response = await client.post(
                f"{self.base_url}/agent/executions",
                json=request_body.model_dump(mode="json"),
            )
            response.raise_for_status()
        return AgentExecutionResponse.model_validate(response.json())

    def _mark_failure(
        self,
        task: FetchTask,
        record: ExecutionRecord,
        error_message: str,
    ) -> None:
        ended_at = datetime.now().isoformat()
        self.repo.save_execution_record(
            record.model_copy(
                update={
                    "status": "failed",
                    "ended_at": ended_at,
                    "output_ref": error_message,
                }
            )
        )
        self.repo.update_fetch_task(
            task.id,
            status="failed",
            confidence=0.0,
            can_rerun=True,
        )

    def _persist_success(
        self,
        task: FetchTask,
        record: ExecutionRecord,
        response: AgentExecutionResponse,
        context: TaskExecutionContext,
    ) -> None:
        row = self.repo.get_wide_table_row(task.wide_table_id, task.row_id)
        if row is None:
            row = context.row.model_copy(deep=True)
        else:
            row = row.model_copy(deep=True)
        retrieval_map = {
            item.indicator_key: item
            for item in response.retrieval_tasks
        }

        for indicator in response.indicators:
            existing = row.indicator_values.get(indicator.indicator_key, IndicatorCell())
            retrieval = retrieval_map.get(indicator.indicator_key)
            row.indicator_values[indicator.indicator_key] = existing.model_copy(
                update={
                    "value": indicator.value,
                    "value_description": indicator.value_description
                    or (retrieval.narrow_row.quote_text if retrieval else existing.value_description),
                    "data_source": indicator.data_source
                    or (retrieval.narrow_row.source_site if retrieval else existing.data_source),
                    "source_link": indicator.source_link
                    or indicator.source_url
                    or (retrieval.narrow_row.source_url if retrieval else existing.source_link),
                    "max_value": retrieval.narrow_row.max_value if retrieval else existing.max_value,
                    "min_value": retrieval.narrow_row.min_value if retrieval else existing.min_value,
                }
            )

        row.row_status = self._derive_row_status(row)
        row.system_values = {
            **row.system_values,
            "row_status": row.row_status,
            "last_task_id": task.id,
            "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
        }
        self.repo.save_wide_table_row(row)
        if task.batch_id:
            self.repo.save_wide_table_row_snapshots(
                [
                    WideTableRowSnapshot(
                        batch_id=task.batch_id,
                        wide_table_id=row.wide_table_id,
                        row_id=row.row_id,
                        row_binding_key=row.row_binding_key,
                        business_date=row.business_date,
                        dimension_values=row.dimension_values,
                        row_status=row.row_status,
                        indicator_values=row.indicator_values,
                        system_values=row.system_values,
                        created_at=record.started_at,
                        updated_at=datetime.now().isoformat(),
                    )
                ]
            )

        for index, retrieval in enumerate(response.retrieval_tasks, start=1):
            self.repo.save_retrieval_task(
                RetrievalTask(
                    id=f"{record.id}-{index}",
                    parent_task_id=task.id,
                    wide_table_id=task.wide_table_id,
                    row_id=task.row_id,
                    name=f"{retrieval.narrow_row.indicator_name} 检索 - {task.business_date or task.row_binding_key}",
                    indicator_key=retrieval.indicator_key,
                    query=retrieval.query,
                    status=retrieval.status,
                    confidence=retrieval.confidence,
                    narrow_row=retrieval.narrow_row,
                )
            )

        average_confidence = (
            round(
                sum(item.confidence for item in response.indicators) / len(response.indicators),
                4,
            )
            if response.indicators
            else 0.0
        )
        self.repo.update_fetch_task(
            task.id,
            status="completed",
            confidence=average_confidence,
            can_rerun=True,
        )
        self.repo.save_execution_record(
            record.model_copy(
                update={
                    "status": "completed",
                    "ended_at": datetime.now().isoformat(),
                    "output_ref": f"agent://executions/{record.id}",
                }
            )
        )

    @staticmethod
    def _derive_row_status(row: WideTableRow) -> str:
        populated = [
            cell
            for cell in row.indicator_values.values()
            if cell.value not in (None, "")
        ]
        if not populated:
            return "initialized"
        if len(populated) == len(row.indicator_values):
            return "completed"
        return "partial"
