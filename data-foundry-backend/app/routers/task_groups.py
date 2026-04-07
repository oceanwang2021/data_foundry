from __future__ import annotations

from datetime import datetime
import uuid

from fastapi import APIRouter, HTTPException, Request

from app.schemas import (
    CollectionBatch,
    FetchTask,
    IndicatorCell,
    TaskGroup,
    TrialRunCreateInput,
    TrialRunResult,
    WideTableRow,
    WideTableRowSnapshot,
)
from app.services.task_plan_service import generate_task_groups

router = APIRouter(tags=["task_groups"])


def _repo(request: Request):
    return request.app.state.repository


@router.get(
    "/api/projects/{project_id}/requirements/{requirement_id}/task-groups",
    response_model=list[TaskGroup],
)
def list_task_groups(project_id: str, requirement_id: str, request: Request):
    repo = _repo(request)
    requirement = repo.get_requirement(project_id, requirement_id)
    if not requirement:
        raise HTTPException(status_code=404, detail="Requirement not found")
    return repo.list_task_groups(requirement_id)


@router.post(
    "/api/requirements/{requirement_id}/task-groups/generate",
    response_model=list[TaskGroup],
)
def generate_task_groups_endpoint(requirement_id: str, request: Request):
    """Auto-generate task groups from wide table scope."""
    repo = _repo(request)
    # find project_id from any requirement
    rows = repo._fetchall(
        "SELECT project_id FROM requirements WHERE id = ?", (requirement_id,)
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Requirement not found")
    project_id = rows[0]["project_id"]
    requirement = repo.get_requirement(project_id, requirement_id)
    if not requirement:
        raise HTTPException(status_code=404, detail="Requirement not found")
    task_groups = generate_task_groups(requirement, repo)
    return task_groups


@router.post(
    "/api/requirements/{requirement_id}/trial-run",
    response_model=TrialRunResult,
)
def create_trial_run_endpoint(
    requirement_id: str,
    body: TrialRunCreateInput,
    request: Request,
):
    """Create a small-scope trial collection batch without changing formal rows."""
    repo = _repo(request)
    rows = repo._fetchall(
        "SELECT project_id FROM requirements WHERE id = ?", (requirement_id,)
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Requirement not found")

    requirement = repo.get_requirement(rows[0]["project_id"], requirement_id)
    if not requirement:
        raise HTTPException(status_code=404, detail="Requirement not found")

    wide_table = repo.get_wide_table(body.wide_table_id)
    if not wide_table or wide_table.id != body.wide_table_id:
        raise HTTPException(status_code=404, detail="Wide table not found")
    if not wide_table.indicator_groups:
        raise HTTPException(status_code=400, detail="Wide table has no indicator groups")

    base_rows = _filter_trial_rows(
        repo.list_wide_table_rows(wide_table.id),
        business_dates=body.business_dates if wide_table.semantic_time_axis == "business_date" else [],
        dimension_values=body.dimension_values,
    )[: body.max_rows]
    if not base_rows:
        raise HTTPException(status_code=400, detail="No rows matched the trial scope")

    timestamp = datetime.now()
    timestamp_iso = timestamp.isoformat()
    token = f"{timestamp.strftime('%Y%m%d%H%M%S')}_{uuid.uuid4().hex[:6]}"
    plan_version = max((row.plan_version for row in base_rows), default=1)
    date_values = sorted({row.business_date for row in base_rows if row.business_date})
    batch = CollectionBatch(
        id=f"TRB-{wide_table.id}-{token}",
        requirement_id=requirement_id,
        wide_table_id=wide_table.id,
        snapshot_at=timestamp_iso,
        snapshot_label=f"试运行 {timestamp.strftime('%Y-%m-%d %H:%M')}",
        coverage_mode=wide_table.collection_coverage_mode,
        semantic_time_axis=wide_table.semantic_time_axis,
        status="pending",
        is_current=False,
        plan_version=plan_version,
        triggered_by="trial",
        start_business_date=date_values[0] if date_values else None,
        end_business_date=date_values[-1] if date_values else None,
        created_at=timestamp_iso,
        updated_at=timestamp_iso,
    )
    repo.save_collection_batches([batch])

    trial_rows = _build_trial_rows(wide_table, base_rows, timestamp_iso)
    repo.save_wide_table_row_snapshots(
        [
            WideTableRowSnapshot(
                batch_id=batch.id,
                wide_table_id=row.wide_table_id,
                row_id=row.row_id,
                row_binding_key=row.row_binding_key,
                business_date=row.business_date,
                dimension_values=row.dimension_values,
                row_status=row.row_status,
                indicator_values=row.indicator_values,
                system_values=row.system_values,
                created_at=timestamp_iso,
                updated_at=timestamp_iso,
            )
            for row in trial_rows
        ]
    )

    task_groups = _build_trial_task_groups(
        requirement_id=requirement_id,
        wide_table_id=wide_table.id,
        batch_id=batch.id,
        plan_version=plan_version,
        rows=trial_rows,
        indicator_group_count=len(wide_table.indicator_groups),
        schedule_rule_id=wide_table.schedule_rules[0].id if wide_table.schedule_rules else "trial",
        timestamp_iso=timestamp_iso,
        token=token,
        uses_business_date_axis=wide_table.semantic_time_axis == "business_date",
        snapshot_label=batch.snapshot_label,
    )
    fetch_tasks = _build_trial_fetch_tasks(
        requirement=requirement,
        wide_table=wide_table,
        task_groups=task_groups,
        rows=trial_rows,
        timestamp_iso=timestamp_iso,
    )
    repo.save_task_groups(task_groups)
    repo.save_fetch_tasks(fetch_tasks)
    for task_group in task_groups:
        repo.update_task_group(
            task_group.id,
            total_tasks=sum(1 for task in fetch_tasks if task.task_group_id == task_group.id),
        )

    refreshed_groups = [
        task_group for task_group in repo.list_task_groups(requirement_id)
        if task_group.id in {item.id for item in task_groups}
    ]
    return TrialRunResult(
        batch=batch,
        task_groups=refreshed_groups,
        fetch_tasks=fetch_tasks,
        row_count=len(trial_rows),
        task_count=len(fetch_tasks),
    )


def _filter_trial_rows(
    rows: list[WideTableRow],
    *,
    business_dates: list[str],
    dimension_values: dict[str, list[str]],
) -> list[WideTableRow]:
    business_date_set = {item for item in business_dates if item}
    dimension_filters = {
        key: {value for value in values if value}
        for key, values in dimension_values.items()
        if values
    }
    result: list[WideTableRow] = []
    for row in rows:
        if business_date_set and row.business_date not in business_date_set:
            continue
        if any(
            row.dimension_values.get(key) not in allowed_values
            for key, allowed_values in dimension_filters.items()
        ):
            continue
        result.append(row)
    return sorted(result, key=lambda item: (item.business_date or "", item.row_id))


def _build_trial_rows(
    wide_table,
    rows: list[WideTableRow],
    timestamp_iso: str,
) -> list[WideTableRow]:
    indicator_values = {
        column.key: IndicatorCell()
        for column in wide_table.table_schema.indicator_columns
    }
    return [
        row.model_copy(
            deep=True,
            update={
                "row_status": "initialized",
                "indicator_values": {key: cell.model_copy(deep=True) for key, cell in indicator_values.items()},
                "system_values": {
                    **row.system_values,
                    "row_status": "initialized",
                    "last_task_id": None,
                    "updated_at": timestamp_iso,
                    "data_kind": "trial",
                },
            },
        )
        for row in rows
    ]


def _build_trial_task_groups(
    *,
    requirement_id: str,
    wide_table_id: str,
    batch_id: str,
    plan_version: int,
    rows: list[WideTableRow],
    indicator_group_count: int,
    schedule_rule_id: str,
    timestamp_iso: str,
    token: str,
    uses_business_date_axis: bool,
    snapshot_label: str,
) -> list[TaskGroup]:
    if not uses_business_date_axis:
        return [
            TaskGroup(
                id=f"TG-TRIAL-{wide_table_id}-{token}",
                requirement_id=requirement_id,
                wide_table_id=wide_table_id,
                batch_id=batch_id,
                source_type="scheduled",
                status="pending",
                schedule_rule_id=schedule_rule_id,
                plan_version=plan_version,
                group_kind="trial",
                partition_type="full_table",
                partition_key="trial",
                partition_label=snapshot_label,
                total_tasks=len(rows) * indicator_group_count,
                triggered_by="trial",
                business_date_label=snapshot_label,
                created_at=timestamp_iso,
                updated_at=timestamp_iso,
            )
        ]

    rows_by_date: dict[str, list[WideTableRow]] = {}
    for row in rows:
        rows_by_date.setdefault(row.business_date or "", []).append(row)
    return [
        TaskGroup(
            id=f"TG-TRIAL-{wide_table_id}-{business_date.replace('-', '')}-{token}",
            requirement_id=requirement_id,
            wide_table_id=wide_table_id,
            batch_id=batch_id,
            business_date=business_date,
            source_type="scheduled",
            status="pending",
            schedule_rule_id=schedule_rule_id,
            plan_version=plan_version,
            group_kind="trial",
            partition_type="business_date",
            partition_key=business_date,
            partition_label=f"{business_date} 试运行",
            total_tasks=len(scoped_rows) * indicator_group_count,
            triggered_by="trial",
            business_date_label=business_date,
            created_at=timestamp_iso,
            updated_at=timestamp_iso,
        )
        for business_date, scoped_rows in sorted(rows_by_date.items())
        if business_date
    ]


def _build_trial_fetch_tasks(
    *,
    requirement,
    wide_table,
    task_groups: list[TaskGroup],
    rows: list[WideTableRow],
    timestamp_iso: str,
) -> list[FetchTask]:
    rows_by_date: dict[str, list[WideTableRow]] = {}
    for row in rows:
        rows_by_date.setdefault(row.business_date or "", []).append(row)

    tasks: list[FetchTask] = []
    for task_group in task_groups:
        scoped_rows = (
            rows_by_date.get(task_group.business_date or "", [])
            if task_group.partition_type == "business_date"
            else rows
        )
        for row in scoped_rows:
            for indicator_group in wide_table.indicator_groups:
                tasks.append(
                    FetchTask(
                        id=f"FT-{task_group.id}-R{row.row_id:03d}-{indicator_group.id}",
                        requirement_id=requirement.id,
                        wide_table_id=wide_table.id,
                        task_group_id=task_group.id,
                        batch_id=task_group.batch_id,
                        row_id=row.row_id,
                        indicator_group_id=indicator_group.id,
                        name=f"{indicator_group.name} - {row.business_date or row.row_binding_key}",
                        schema_version=wide_table.table_schema.version,
                        execution_mode=indicator_group.execution_mode,
                        indicator_keys=indicator_group.indicator_keys,
                        dimension_values=row.dimension_values,
                        business_date=row.business_date,
                        status="pending",
                        can_rerun=True,
                        owner=requirement.assignee,
                        plan_version=task_group.plan_version,
                        row_binding_key=row.row_binding_key,
                        created_at=timestamp_iso,
                        updated_at=timestamp_iso,
                    )
                )
    return tasks
