from __future__ import annotations

import uuid
from datetime import date, datetime

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request

from app.modeling import build_row_binding_key, is_past_business_date
from app.schemas import (
    CollectionBatch,
    FetchTask,
    IndicatorCell,
    IndicatorGroup,
    TaskGroup,
    WideTable,
    WideTableCreateInput,
    WideTablePlanPersistInput,
    WideTableRow,
    WideTableUpdateInput,
    resolve_collection_coverage_mode,
    resolve_semantic_time_axis,
)
from app.services.wide_table_service import initialize_wide_table_rows

router = APIRouter(prefix="/api/requirements/{requirement_id}/wide-tables", tags=["wide_tables"])


def _repo(request: Request):
    return request.app.state.repository


def _resolve_requirement(repo, requirement_id: str):
    rows = repo._fetchall(
        "SELECT project_id FROM requirements WHERE id = ?",
        (requirement_id,),
    )
    if not rows:
        return None
    return repo.get_requirement(rows[0]["project_id"], requirement_id)


def _build_indicator_groups(body: WideTablePlanPersistInput) -> list[IndicatorGroup]:
    return [
        IndicatorGroup(
            id=group.id,
            name=group.name,
            indicator_keys=group.indicator_columns,
            execution_mode="agent",
            default_agent=group.agent,
            prompt_template=group.prompt_template,
            prompt_config=group.prompt_config,
            description=group.description,
            priority=group.priority,
            source_preference=[],
        )
        for group in body.indicator_groups
    ]


def _reconcile_schema_with_scope(
    schema: "WideTableSchema",
    scope: "WideTableScope",
    indicator_groups: list["IndicatorGroup"],
) -> "WideTableSchema":
    """Ensure the schema covers every key referenced by *scope* and *indicator_groups*.

    When a plan changes the scope (e.g. adding a business_date or new
    dimension) or indicator groups without supplying an explicit
    table_schema, the existing schema may be missing the corresponding
    columns.  This helper adds any missing columns so that the WideTable
    model validator does not reject the combination.
    """
    from app.schemas import WideTableColumn, WideTableSchema

    # ---- dimension columns ----
    existing_dim_keys = {col.key for col in schema.dimension_columns}
    new_dim_columns: list[WideTableColumn] = list(schema.dimension_columns)

    if scope.business_date is not None:
        bd_key = scope.business_date.column_key
        if bd_key not in existing_dim_keys:
            new_dim_columns.append(
                WideTableColumn(
                    key=bd_key,
                    name=bd_key,
                    role="dimension",
                    data_type="date",
                    description="业务日期维度（由计划自动补充）。",
                    is_business_date=True,
                )
            )
            existing_dim_keys.add(bd_key)

    for dim in scope.dimensions:
        if dim.column_key not in existing_dim_keys:
            new_dim_columns.append(
                WideTableColumn(
                    key=dim.column_key,
                    name=dim.column_key,
                    role="dimension",
                    data_type="string",
                    description="维度列（由计划自动补充）。",
                )
            )
            existing_dim_keys.add(dim.column_key)

    # ---- indicator columns ----
    # Keep only indicator columns that are referenced by at least one group,
    # and add any new keys that are missing from the schema.
    all_group_keys: set[str] = set()
    for group in indicator_groups:
        all_group_keys.update(group.indicator_keys)

    existing_ind_map = {col.key: col for col in schema.indicator_columns}
    new_ind_columns: list[WideTableColumn] = []

    # Preserve existing columns that are still referenced
    for col in schema.indicator_columns:
        if col.key in all_group_keys:
            new_ind_columns.append(col)

    # Add new columns for keys not yet in the schema
    existing_ind_keys = {col.key for col in new_ind_columns}
    for key in all_group_keys:
        if key not in existing_ind_keys:
            new_ind_columns.append(
                WideTableColumn(
                    key=key,
                    name=key,
                    role="indicator",
                    data_type="number",
                    description="指标列（由计划自动补充）。",
                    unit="-",
                )
            )

    dims_changed = len(new_dim_columns) != len(schema.dimension_columns)
    inds_changed = (
        len(new_ind_columns) != len(schema.indicator_columns)
        or {c.key for c in new_ind_columns} != {c.key for c in schema.indicator_columns}
    )
    if not dims_changed and not inds_changed:
        return schema

    return WideTableSchema(
        table_name=schema.table_name,
        version=schema.version,
        id_column=schema.id_column,
        dimension_columns=new_dim_columns,
        indicator_columns=new_ind_columns,
        system_columns=schema.system_columns,
    )


def _build_plan_wide_table_updates(
    *,
    existing: WideTable,
    body: WideTablePlanPersistInput,
    indicator_groups: list[IndicatorGroup],
) -> dict[str, object]:
    next_table_schema = body.table_schema or existing.table_schema
    next_scope = body.scope
    next_table_schema = _reconcile_schema_with_scope(next_table_schema, next_scope, indicator_groups)
    semantic_time_axis = resolve_semantic_time_axis(
        table_schema=next_table_schema,
        scope=next_scope,
    )
    return {
        "table_schema": next_table_schema,
        "scope": next_scope,
        "indicator_groups": indicator_groups,
        "semantic_time_axis": semantic_time_axis,
        "collection_coverage_mode": resolve_collection_coverage_mode(
            semantic_time_axis,
        ),
        "status": body.status,
        "record_count": body.record_count,
    }


def _sync_requirement_data_update_state(repo, requirement_id: str, requirement, wide_table: WideTable) -> None:
    if wide_table.collection_coverage_mode == "incremental_by_business_date":
        repo.update_requirement(
            requirement_id,
            data_update_enabled=True,
            data_update_mode="incremental",
        )
        return
    repo.update_requirement(
        requirement_id,
        data_update_enabled=False,
        data_update_mode=None,
    )


def _build_plan_rows(
    *,
    requirement_id: str,
    wide_table: WideTable,
    body: WideTablePlanPersistInput,
    existing_rows_by_id: dict[int, WideTableRow] | None = None,
) -> list[WideTableRow]:
    indicator_keys = [
        column.key for column in wide_table.table_schema.indicator_columns
    ]
    rows: list[WideTableRow] = []
    for item in body.rows:
        existing_row = existing_rows_by_id.get(item.row_id) if existing_rows_by_id else None
        rows.append(
            WideTableRow(
                row_id=item.row_id,
                requirement_id=requirement_id,
                wide_table_id=wide_table.id,
                schema_version=wide_table.table_schema.version,
                plan_version=item.plan_version,
                row_status=item.row_status,
                dimension_values=item.dimension_values,
                business_date=item.business_date,
                row_binding_key=item.row_binding_key
                or build_row_binding_key(
                    wide_table,
                    business_date=item.business_date,
                    dimension_values=item.dimension_values,
                ),
                indicator_values=(
                    existing_row.indicator_values
                    if existing_row is not None
                    else {key: IndicatorCell() for key in indicator_keys}
                ),
                system_values={
                    **(existing_row.system_values if existing_row is not None else {}),
                    "row_status": item.row_status,
                    "last_task_id": None,
                    "updated_at": None,
                    **item.system_values,
                },
            )
        )
    return rows


def _build_plan_task_groups(
    *,
    requirement_id: str,
    wide_table: WideTable,
    body: WideTablePlanPersistInput,
) -> list[TaskGroup]:
    default_rule_id = (
        wide_table.schedule_rules[0].id if wide_table.schedule_rules else "manual-plan"
    )
    return [
        TaskGroup(
            id=item.id,
            requirement_id=requirement_id,
            wide_table_id=wide_table.id,
            batch_id=item.batch_id,
            business_date=item.business_date,
            source_type="scheduled",
            status=item.status,
            schedule_rule_id=default_rule_id,
            plan_version=item.plan_version,
            group_kind="baseline",
            partition_type=item.partition_type,
            partition_key=item.partition_key or item.business_date or "full_table",
            partition_label=item.partition_label or item.business_date or item.id,
            total_tasks=item.total_tasks,
            completed_tasks=item.completed_tasks,
            failed_tasks=item.failed_tasks,
            triggered_by=item.triggered_by,
            business_date_label=item.business_date,
            created_at=item.created_at,
            updated_at=item.updated_at,
        )
        for item in body.task_groups
    ]


def _build_plan_fetch_tasks(
    *,
    requirement,
    wide_table: WideTable,
    rows: list[WideTableRow],
    task_groups: list[TaskGroup],
) -> list[FetchTask]:
    rows_by_business_date: dict[str, list[WideTableRow]] = {}
    for row in rows:
        if row.business_date:
            rows_by_business_date.setdefault(row.business_date, []).append(row)

    indicator_groups = sorted(
        wide_table.indicator_groups,
        key=lambda group: (group.priority, group.id),
    )
    tasks: list[FetchTask] = []
    for task_group in task_groups:
        if task_group.partition_type == "business_date":
            scoped_rows = rows_by_business_date.get(task_group.business_date or "", [])
        else:
            scoped_rows = rows
        for row in scoped_rows:
            for indicator_group in indicator_groups:
                tasks.append(
                    FetchTask(
                        id=f"ft_{task_group.id}_{indicator_group.id}_{row.row_id}",
                        requirement_id=requirement.id,
                        wide_table_id=wide_table.id,
                        task_group_id=task_group.id,
                        batch_id=task_group.batch_id,
                        row_id=row.row_id,
                        indicator_group_id=indicator_group.id,
                        name=indicator_group.name,
                        schema_version=wide_table.table_schema.version,
                        execution_mode=indicator_group.execution_mode,
                        indicator_keys=indicator_group.indicator_keys,
                        dimension_values=row.dimension_values,
                        business_date=row.business_date,
                        status="invalidated" if task_group.status == "invalidated" else "pending",
                        can_rerun=True,
                        owner=requirement.assignee,
                        plan_version=task_group.plan_version,
                        row_binding_key=row.row_binding_key or build_row_binding_key(
                            wide_table,
                            business_date=row.business_date,
                            dimension_values=row.dimension_values,
                        ),
                        created_at=task_group.created_at,
                        updated_at=task_group.updated_at,
                    )
                )
    return tasks


def _resolve_default_schedule_rule_id(wide_table: WideTable) -> str:
    if wide_table.schedule_rules:
        return wide_table.schedule_rules[0].id
    return "manual-plan"


def _normalize_business_date_token(business_date: str) -> str:
    return business_date.replace("-", "")


def _build_production_historical_task_groups(
    *,
    requirement_id: str,
    wide_table: WideTable,
    rows: list[WideTableRow],
    candidate_task_groups: list[TaskGroup],
    reference_date: date,
) -> list[TaskGroup]:
    if wide_table.semantic_time_axis != "business_date" or wide_table.scope.business_date is None:
        return candidate_task_groups
    candidate_task_groups_by_date = {
        task_group.business_date: task_group
        for task_group in candidate_task_groups
        if task_group.business_date
    }
    rows_by_business_date: dict[str, list[WideTableRow]] = {}
    for row in rows:
        if is_past_business_date(
            row.business_date,
            frequency=wide_table.scope.business_date.frequency,
            reference_date=reference_date,
        ):
            rows_by_business_date.setdefault(row.business_date, []).append(row)

    if not rows_by_business_date:
        return []

    schedule_rule_id = _resolve_default_schedule_rule_id(wide_table)
    indicator_group_count = len(wide_table.indicator_groups)
    timestamp = datetime.now().isoformat()
    persisted_task_groups: list[TaskGroup] = []
    for business_date, scoped_rows in sorted(rows_by_business_date.items()):
        existing_task_group = candidate_task_groups_by_date.get(business_date)
        plan_version = max(
            [row.plan_version for row in scoped_rows],
            default=existing_task_group.plan_version if existing_task_group else 1,
        )
        persisted_task_groups.append(
            TaskGroup(
                id=existing_task_group.id if existing_task_group else f"tg_{wide_table.id}_{_normalize_business_date_token(business_date)}_r{plan_version}",
                requirement_id=requirement_id,
                wide_table_id=wide_table.id,
                business_date=business_date,
                source_type="scheduled",
                status="pending",
                schedule_rule_id=existing_task_group.schedule_rule_id if existing_task_group else schedule_rule_id,
                plan_version=plan_version,
                group_kind=existing_task_group.group_kind if existing_task_group else "baseline",
                total_tasks=len(scoped_rows) * indicator_group_count,
                completed_tasks=0,
                failed_tasks=0,
                triggered_by="backfill",
                business_date_label=existing_task_group.business_date_label if existing_task_group else business_date,
                created_at=existing_task_group.created_at if existing_task_group else timestamp,
                updated_at=timestamp,
            )
        )

    return persisted_task_groups


@router.get("", response_model=list[WideTable])
def list_wide_tables(requirement_id: str, request: Request):
    return _repo(request).list_wide_tables(requirement_id)


@router.get("/{wide_table_id}", response_model=WideTable)
def read_wide_table(requirement_id: str, wide_table_id: str, request: Request):
    wt = _repo(request).get_wide_table(wide_table_id)
    if not wt:
        raise HTTPException(status_code=404, detail="Wide table not found")
    return wt


@router.get("/{wide_table_id}/collection-batches", response_model=list[CollectionBatch])
def list_collection_batches(requirement_id: str, wide_table_id: str, request: Request):
    wt = _repo(request).get_wide_table(wide_table_id)
    if not wt:
        raise HTTPException(status_code=404, detail="Wide table not found")
    return _repo(request).list_collection_batches(wide_table_id)


@router.post("", response_model=WideTable, status_code=201)
def create_wide_table(requirement_id: str, body: WideTableCreateInput, request: Request):
    wt = WideTable(
        id=f"wt_{uuid.uuid4().hex[:8]}",
        title=body.title,
        description=body.description,
        schema=body.table_schema,
        scope=body.scope,
        indicator_groups=body.indicator_groups,
        schedule_rules=body.schedule_rules,
        semantic_time_axis=body.semantic_time_axis,
        collection_coverage_mode=body.collection_coverage_mode,
    )
    try:
        _repo(request).create_wide_table(requirement_id, wt)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return wt


@router.put("/{wide_table_id}", response_model=WideTable)
def update_wide_table(
    requirement_id: str, wide_table_id: str,
    body: WideTableUpdateInput, request: Request,
):
    repo = _repo(request)
    existing = repo.get_wide_table(wide_table_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Wide table not found")
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        return existing

    next_wide_table = WideTable(
        id=existing.id,
        title=body.title if body.title is not None else existing.title,
        description=body.description if body.description is not None else existing.description,
        schema=body.table_schema if body.table_schema is not None else existing.table_schema,
        scope=body.scope if body.scope is not None else existing.scope,
        indicator_groups=body.indicator_groups if body.indicator_groups is not None else existing.indicator_groups,
        schedule_rules=body.schedule_rules if body.schedule_rules is not None else existing.schedule_rules,
        semantic_time_axis=body.semantic_time_axis if body.semantic_time_axis is not None else existing.semantic_time_axis,
        collection_coverage_mode=body.collection_coverage_mode if body.collection_coverage_mode is not None else existing.collection_coverage_mode,
        status=existing.status,
        record_count=existing.record_count,
        created_at=existing.created_at,
        updated_at=existing.updated_at,
    )
    repo.update_wide_table(
        wide_table_id,
        title=next_wide_table.title,
        description=next_wide_table.description,
        table_schema=next_wide_table.table_schema,
        scope=next_wide_table.scope,
        indicator_groups=next_wide_table.indicator_groups,
        schedule_rules=next_wide_table.schedule_rules,
        semantic_time_axis=next_wide_table.semantic_time_axis,
        collection_coverage_mode=next_wide_table.collection_coverage_mode,
    )
    return repo.get_wide_table(wide_table_id)


@router.post("/{wide_table_id}/preview", response_model=dict)
def persist_wide_table_preview(
    requirement_id: str,
    wide_table_id: str,
    body: WideTablePlanPersistInput,
    request: Request,
):
    repo = _repo(request)
    requirement = _resolve_requirement(repo, requirement_id)
    if not requirement:
        raise HTTPException(status_code=404, detail="Requirement not found")

    existing = repo.get_wide_table(wide_table_id)
    if not existing or requirement.wide_table is None or requirement.wide_table.id != wide_table_id:
        raise HTTPException(status_code=404, detail="Wide table not found")

    indicator_groups = _build_indicator_groups(body)
    repo.update_wide_table(
        wide_table_id,
        **_build_plan_wide_table_updates(
            existing=existing,
            body=body,
            indicator_groups=indicator_groups,
        ),
    )
    updated_wide_table = repo.get_wide_table(wide_table_id)
    if not updated_wide_table:
        raise HTTPException(status_code=404, detail="Wide table not found")
    _sync_requirement_data_update_state(repo, requirement_id, requirement, updated_wide_table)

    existing_rows_by_id = {
        row.row_id: row for row in repo.list_wide_table_rows(wide_table_id)
    }
    rows = _build_plan_rows(
        requirement_id=requirement_id,
        wide_table=updated_wide_table,
        body=body,
        existing_rows_by_id=existing_rows_by_id,
    )
    new_row_ids = {row.row_id for row in rows}
    stale_row_ids = [
        rid for rid in existing_rows_by_id if rid not in new_row_ids
    ]
    if stale_row_ids:
        repo.delete_orphan_wide_table_rows(wide_table_id, stale_row_ids)
    repo.save_wide_table_rows(rows)

    return {
        "ok": True,
        "wide_table_id": wide_table_id,
        "row_count": len(rows),
    }


@router.post("/{wide_table_id}/plan", response_model=dict)
def persist_wide_table_plan(
    requirement_id: str,
    wide_table_id: str,
    body: WideTablePlanPersistInput,
    background_tasks: BackgroundTasks,
    request: Request,
):
    repo = _repo(request)
    requirement = _resolve_requirement(repo, requirement_id)
    if not requirement:
        raise HTTPException(status_code=404, detail="Requirement not found")

    existing = repo.get_wide_table(wide_table_id)
    if not existing or requirement.wide_table is None or requirement.wide_table.id != wide_table_id:
        raise HTTPException(status_code=404, detail="Wide table not found")

    indicator_groups = _build_indicator_groups(body)
    repo.update_wide_table(
        wide_table_id,
        **_build_plan_wide_table_updates(
            existing=existing,
            body=body,
            indicator_groups=indicator_groups,
        ),
    )
    updated_wide_table = repo.get_wide_table(wide_table_id)
    if not updated_wide_table:
        raise HTTPException(status_code=404, detail="Wide table not found")
    _sync_requirement_data_update_state(repo, requirement_id, requirement, updated_wide_table)

    rows = _build_plan_rows(
        requirement_id=requirement_id,
        wide_table=updated_wide_table,
        body=body,
    )
    task_groups = _build_plan_task_groups(
        requirement_id=requirement_id,
        wide_table=updated_wide_table,
        body=body,
    )
    tasks = _build_plan_fetch_tasks(
        requirement=requirement,
        wide_table=updated_wide_table,
        rows=rows,
        task_groups=task_groups,
    )
    persisted_task_groups = task_groups
    persisted_tasks = tasks
    auto_execute_task_group_ids: list[str] = []

    # Demo 阶段已取消：保存计划时统一走“正式需求”行为：补齐历史任务组并自动执行。
    persisted_task_groups = _build_production_historical_task_groups(
        requirement_id=requirement_id,
        wide_table=updated_wide_table,
        rows=rows,
        candidate_task_groups=task_groups,
        reference_date=date.today(),
    )
    persisted_tasks = [
        task
        for task in tasks
        if task.task_group_id in {task_group.id for task_group in persisted_task_groups}
    ]
    auto_execute_task_group_ids = [task_group.id for task_group in persisted_task_groups]

    repo.replace_wide_table_plan(wide_table_id, rows, persisted_task_groups, persisted_tasks)

    # 进入运行态后锁定 Schema（schema_locked=True）。
    if requirement.status != "running":
        repo.update_requirement(requirement_id, status="running", schema_locked=True)

    if auto_execute_task_group_ids:
        scheduler = request.app.state.scheduler
        background_tasks.add_task(
            scheduler.trigger_backfill_task_groups,
            auto_execute_task_group_ids,
            "system",
        )

    return {
        "ok": True,
        "wide_table_id": wide_table_id,
        "row_count": len(rows),
        "task_group_count": len(persisted_task_groups),
        "task_count": len(persisted_tasks),
    }


@router.delete("/{wide_table_id}", status_code=204)
def delete_wide_table(requirement_id: str, wide_table_id: str, request: Request):
    repo = _repo(request)
    existing = repo.get_wide_table(wide_table_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Wide table not found")
    repo.delete_wide_table(wide_table_id)


@router.post("/{wide_table_id}/initialize", response_model=list[WideTableRow])
def initialize_wide_table(requirement_id: str, wide_table_id: str, request: Request):
    """Initialize wide table rows by expanding dimensions × business dates."""
    repo = _repo(request)
    wt = repo.get_wide_table(wide_table_id)
    if not wt:
        raise HTTPException(status_code=404, detail="Wide table not found")
    rows = initialize_wide_table_rows(requirement_id, wt)
    repo.save_wide_table_rows(rows)
    repo.update_wide_table(wide_table_id, status="initialized", record_count=len(rows))
    return rows
