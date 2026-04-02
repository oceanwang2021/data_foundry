from __future__ import annotations

from hashlib import blake2b
from datetime import date, datetime, timedelta
from itertools import product
from urllib.parse import urlparse

from app.schemas import (
    BackfillRequest,
    CollectionBatch,
    ExecutionRecord,
    FetchTask,
    IndicatorCell,
    NarrowIndicatorRow,
    Requirement,
    RetrievalTask,
    RowStatus,
    TaskGroup,
    WideTableColumn,
    WideTable,
    WideTableScope,
    WideTableRow,
    WideTableRowSnapshot,
)

OPEN_ENDED_FUTURE_PERIODS = 6


def expand_business_dates(
    scope: WideTableScope,
    *,
    reference_date: date | None = None,
    open_ended_future_periods: int = OPEN_ENDED_FUTURE_PERIODS,
) -> list[str]:
    business_date = scope.business_date
    if business_date is None:
        return []
    end = business_date.end
    if end == "never":
        end = _resolve_open_ended_end(
            start=business_date.start,
            frequency=business_date.frequency,
            reference_date=reference_date or date.today(),
            open_ended_future_periods=open_ended_future_periods,
        )
    if business_date.frequency == "monthly":
        return _expand_months(business_date.start, end)
    return _expand_years(
        business_date.start,
        end,
        latest_year_quarterly=business_date.latest_year_quarterly,
    )


def build_rows(requirement: Requirement, wide_table: WideTable) -> list[WideTableRow]:
    business_dates: list[str | None]
    if wide_table.semantic_time_axis == "business_date":
        business_dates = expand_business_dates(wide_table.scope)
    else:
        business_dates = [None]
    dimension_scopes = wide_table.scope.dimensions
    dimension_keys = [scope.column_key for scope in dimension_scopes]
    dimension_values = [scope.values for scope in dimension_scopes]
    dimension_combinations = list(product(*dimension_values)) if dimension_values else [()]

    rows: list[WideTableRow] = []
    indicator_keys = [column.key for column in wide_table.table_schema.indicator_columns]
    row_id = 1
    for business_date in business_dates:
        for combination in dimension_combinations:
            row_dimensions = {
                key: value for key, value in zip(dimension_keys, combination, strict=False)
            }
            rows.append(
                WideTableRow(
                    row_id=row_id,
                    requirement_id=requirement.id,
                    wide_table_id=wide_table.id,
                    schema_version=wide_table.table_schema.version,
                    row_status="initialized",
                    dimension_values=row_dimensions,
                    business_date=business_date,
                    row_binding_key=build_row_binding_key(
                        wide_table,
                        business_date=business_date,
                        dimension_values=row_dimensions,
                    ),
                    indicator_values={key: IndicatorCell() for key in indicator_keys},
                    system_values={
                        "row_status": "initialized",
                        "last_task_id": None,
                        "updated_at": None,
                    },
                )
            )
            row_id += 1
    return rows


def build_backfill_requests(
    requirement: Requirement,
    wide_table: WideTable,
    *,
    reference_date: date,
) -> list[BackfillRequest]:
    if (
        wide_table.semantic_time_axis != "business_date"
        or wide_table.collection_coverage_mode != "incremental_by_business_date"
        or wide_table.scope.business_date is None
    ):
        return []
    business_dates = expand_business_dates(wide_table.scope)
    past_dates = [
        business_date
        for business_date in business_dates
        if is_past_business_date(
            business_date,
            frequency=wide_table.scope.business_date.frequency,
            reference_date=reference_date,
        )
    ]
    if not past_dates:
        return []

    return [
        BackfillRequest(
            id=f"BFR-{requirement.id}-{wide_table.id}",
            requirement_id=requirement.id,
            wide_table_id=wide_table.id,
            start_business_date=past_dates[0],
            end_business_date=past_dates[-1],
            requested_by="system",
            origin="initialization",
            status="running",
            reason="初始化阶段补齐历史业务日期范围。",
        )
    ]


def build_collection_batches(
    requirement: Requirement,
    wide_table: WideTable,
    *,
    reference_date: date,
) -> list[CollectionBatch]:
    timestamp = datetime.combine(reference_date, datetime.min.time()).isoformat()
    if wide_table.collection_coverage_mode == "full_snapshot":
        snapshot_label = reference_date.isoformat()
        return [
            CollectionBatch(
                id=f"CB-{wide_table.id}-{reference_date.strftime('%Y%m%d')}",
                requirement_id=requirement.id,
                wide_table_id=wide_table.id,
                snapshot_at=timestamp,
                snapshot_label=snapshot_label,
                coverage_mode=wide_table.collection_coverage_mode,
                semantic_time_axis=wide_table.semantic_time_axis,
                status="pending",
                is_current=True,
                plan_version=1,
                triggered_by="cron",
                created_at=timestamp,
                updated_at=timestamp,
            )
        ]

    if wide_table.scope.business_date is None:
        return []

    batches: list[CollectionBatch] = []
    for business_date in expand_business_dates(wide_table.scope):
        is_past = is_past_business_date(
            business_date,
            frequency=wide_table.scope.business_date.frequency,
            reference_date=reference_date,
        )
        batches.append(
            CollectionBatch(
                id=f"CB-{wide_table.id}-{_normalize_business_date_token(business_date)}",
                requirement_id=requirement.id,
                wide_table_id=wide_table.id,
                snapshot_at=timestamp,
                snapshot_label=business_date,
                coverage_mode=wide_table.collection_coverage_mode,
                semantic_time_axis=wide_table.semantic_time_axis,
                status="running" if is_past else "pending",
                is_current=not is_past,
                plan_version=1,
                triggered_by="backfill" if is_past else "cron",
                start_business_date=business_date,
                end_business_date=business_date,
                created_at=timestamp,
                updated_at=timestamp,
            )
        )
    return batches


def build_task_groups(
    requirement: Requirement,
    wide_table: WideTable,
    *,
    reference_date: date,
    backfill_requests: list[BackfillRequest],
    collection_batches: list[CollectionBatch] | None = None,
) -> list[TaskGroup]:
    collection_batches = collection_batches or build_collection_batches(
        requirement,
        wide_table,
        reference_date=reference_date,
    )
    backfill_request = backfill_requests[0] if backfill_requests else None
    schedule_rule = next((rule for rule in wide_table.schedule_rules if rule.enabled), None)

    task_groups: list[TaskGroup] = []
    for batch in collection_batches:
        business_date = batch.start_business_date
        if wide_table.collection_coverage_mode == "full_snapshot":
            task_groups.append(
                TaskGroup(
                    id=f"TG-{wide_table.id}-{batch.snapshot_label.replace('-', '')}",
                    requirement_id=requirement.id,
                    wide_table_id=wide_table.id,
                    batch_id=batch.id,
                    business_date=business_date,
                    source_type="scheduled",
                    status=batch.status if batch.status != "failed" else "partial",
                    schedule_rule_id=schedule_rule.id if schedule_rule else None,
                    partition_type="full_table",
                    partition_key="full_table",
                    partition_label=batch.snapshot_label,
                    triggered_by=batch.triggered_by,
                    created_at=batch.created_at,
                    updated_at=batch.updated_at,
                )
            )
            continue

        if schedule_rule is None:
            continue
        task_groups.append(
            TaskGroup(
                id=f"TG-{wide_table.id}-{_normalize_business_date_token(business_date or '')}",
                requirement_id=requirement.id,
                wide_table_id=wide_table.id,
                batch_id=batch.id,
                business_date=business_date,
                source_type="backfill" if batch.triggered_by == "backfill" else "scheduled",
                status=batch.status if batch.status != "failed" else "partial",
                schedule_rule_id=schedule_rule.id,
                backfill_request_id=backfill_request.id if batch.triggered_by == "backfill" and backfill_request else None,
                partition_type="business_date",
                partition_key=business_date or "",
                partition_label=business_date or "",
                triggered_by=batch.triggered_by,
                created_at=batch.created_at,
                updated_at=batch.updated_at,
            )
        )
    return task_groups


def build_fetch_tasks(
    requirement: Requirement,
    wide_table: WideTable,
    *,
    rows: list[WideTableRow],
    task_groups: list[TaskGroup],
) -> list[FetchTask]:
    rows_by_business_date = _group_rows_by_business_date(rows)
    tasks: list[FetchTask] = []

    for task_group in task_groups:
        if task_group.partition_type == "business_date":
            grouped_rows = rows_by_business_date.get(task_group.business_date or "", [])
        else:
            grouped_rows = sorted(rows, key=lambda row: row.row_id)
        for row in grouped_rows:
            for indicator_group in wide_table.indicator_groups:
                task_status = derive_fetch_task_status(row, indicator_group.indicator_keys)
                task_id = _build_fetch_task_id(
                    wide_table=wide_table,
                    task_group=task_group,
                    row=row,
                    indicator_group_id=indicator_group.id,
                )
                tasks.append(
                    FetchTask(
                        id=task_id,
                        requirement_id=requirement.id,
                        wide_table_id=wide_table.id,
                        task_group_id=task_group.id,
                        batch_id=task_group.batch_id,
                        row_id=row.row_id,
                        indicator_group_id=indicator_group.id,
                        name=_build_fetch_task_name(
                            wide_table=wide_table,
                            indicator_group_name=indicator_group.name,
                            business_date=row.business_date,
                            dimension_values=row.dimension_values,
                        ),
                        schema_version=wide_table.table_schema.version,
                        execution_mode=indicator_group.execution_mode,
                        indicator_keys=indicator_group.indicator_keys,
                        dimension_values=row.dimension_values,
                        business_date=row.business_date,
                        status=task_status,
                        can_rerun=True,
                        owner=requirement.assignee,
                        row_binding_key=row.row_binding_key,
                    )
                )
    return tasks


def build_retrieval_tasks(
    wide_table: WideTable,
    *,
    rows: list[WideTableRow],
    fetch_tasks: list[FetchTask],
) -> list[RetrievalTask]:
    row_index = {row.row_id: row for row in rows}
    indicator_columns = {
        column.key: column for column in wide_table.table_schema.indicator_columns
    }
    retrieval_tasks: list[RetrievalTask] = []

    for fetch_task in fetch_tasks:
        row = row_index[fetch_task.row_id]
        for indicator_key in fetch_task.indicator_keys:
            indicator_cell = row.indicator_values[indicator_key]
            indicator_column = indicator_columns[indicator_key]
            retrieval_tasks.append(
                RetrievalTask(
                    id=f"IRT-{fetch_task.id}-{indicator_key}",
                    parent_task_id=fetch_task.id,
                    wide_table_id=fetch_task.wide_table_id,
                    row_id=fetch_task.row_id,
                    name=(
                        f"{indicator_column.name} 检索 - "
                        f"{_build_row_context_label(row.dimension_values, row.business_date)}"
                    ),
                    indicator_key=indicator_key,
                    query=_build_indicator_query(
                        indicator_name=indicator_column.name,
                        business_date=row.business_date,
                        dimension_values=row.dimension_values,
                    ),
                    status=derive_retrieval_status(fetch_task.status, indicator_cell),
                    confidence=derive_retrieval_confidence(indicator_cell),
                    narrow_row=NarrowIndicatorRow(
                        wide_table_id=fetch_task.wide_table_id,
                        row_id=fetch_task.row_id,
                        dimension_values=row.dimension_values,
                        business_date=row.business_date,
                        indicator_key=indicator_key,
                        indicator_name=indicator_column.name,
                        indicator_description=indicator_column.description,
                        indicator_unit=indicator_column.unit or "",
                        unit=indicator_column.unit,
                        published_at=row.business_date,
                        source_site=indicator_cell.data_source,
                        indicator_logic=_build_indicator_logic(indicator_column),
                        indicator_logic_supplement=_build_indicator_logic_supplement(indicator_cell),
                        max_value=indicator_cell.max_value,
                        min_value=indicator_cell.min_value,
                        source_url=indicator_cell.source_link,
                        quote_text=_build_quote_text(indicator_column, row, indicator_cell),
                        result=indicator_cell,
                    ),
                )
            )
    return retrieval_tasks


def build_row_snapshots(
    batch: CollectionBatch,
    rows: list[WideTableRow],
) -> list[WideTableRowSnapshot]:
    timestamp = batch.updated_at or batch.snapshot_at
    return [
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
            created_at=timestamp,
            updated_at=timestamp,
        )
        for row in rows
    ]


def _build_indicator_logic(indicator_column: WideTableColumn) -> str:
    return indicator_column.description or indicator_column.name


def _build_indicator_logic_supplement(indicator_cell: IndicatorCell) -> str:
    parts: list[str] = []
    if indicator_cell.data_source:
        parts.append(f"来源站点：{indicator_cell.data_source}")
    if indicator_cell.source_link:
        parts.append(f"来源URL：{indicator_cell.source_link}")
    if indicator_cell.max_value is not None and indicator_cell.min_value is not None:
        parts.append(f"范围：{indicator_cell.min_value} ~ {indicator_cell.max_value}")
    return "；".join(parts)


def _build_quote_text(
    indicator_column: WideTableColumn,
    row: WideTableRow,
    indicator_cell: IndicatorCell,
) -> str:
    focus_label = _shorten_text(
        indicator_cell.value_description or indicator_column.description or indicator_column.name,
        32,
    )
    scope_label = _shorten_text(_format_dimension_label(row.dimension_values), 32)
    source_label = _shorten_text(_build_source_label(indicator_cell), 24)
    value_text = _format_indicator_cell_value(indicator_cell, indicator_column.unit)
    row_context = _build_row_context_label(row.dimension_values, row.business_date)

    if not value_text:
        return _shorten_text(" · ".join(part for part in [row_context, focus_label] if part))

    candidates: list[str] = []
    if source_label:
        candidates.append(f"{source_label}显示，{focus_label}为{value_text}。")
        candidates.append(f"{source_label}披露：{focus_label}达到{value_text}。")

    if scope_label and row.business_date:
        candidates.append(f"在{row.business_date}的披露中，{scope_label}的{focus_label}为{value_text}。")
        candidates.append(f"{scope_label}方面，{focus_label}记录为{value_text}。")

    if row.business_date:
        candidates.append(f"在{row.business_date}披露中，{focus_label}为{value_text}。")
    if row_context:
        candidates.append(f"{row_context}中，{focus_label}为{value_text}。")
    candidates.append(f"原文提到，{focus_label}为{value_text}。")
    candidates.append(f"{focus_label}：{value_text}。")

    template_index = _quote_template_index(
        row.business_date or "",
        scope_label,
        focus_label,
        source_label,
        value_text,
    )
    return _shorten_text(candidates[template_index % len(candidates)])


def _build_source_label(indicator_cell: IndicatorCell) -> str:
    if indicator_cell.data_source:
        return indicator_cell.data_source
    if indicator_cell.source_link:
        hostname = urlparse(indicator_cell.source_link).hostname
        if hostname:
            return hostname.removeprefix("www.")
    return ""


def _format_indicator_cell_value(indicator_cell: IndicatorCell, unit: str | None = None) -> str:
    if indicator_cell.value is not None:
        return _append_unit(str(indicator_cell.value), unit)
    if indicator_cell.min_value is not None and indicator_cell.max_value is not None:
        lower = _append_unit(_format_numeric_value(indicator_cell.min_value), unit)
        upper = _append_unit(_format_numeric_value(indicator_cell.max_value), unit)
        return f"{lower}~{upper}"
    if indicator_cell.max_value is not None:
        return _append_unit(_format_numeric_value(indicator_cell.max_value), unit)
    if indicator_cell.min_value is not None:
        return _append_unit(_format_numeric_value(indicator_cell.min_value), unit)
    return ""


def _format_numeric_value(value: float) -> str:
    if float(value).is_integer():
        return str(int(value))
    return f"{value:.4f}".rstrip("0").rstrip(".")


def _append_unit(value: str, unit: str | None) -> str:
    if not unit or not value:
        return value
    if value.endswith(unit):
        return value
    if value.replace(".", "", 1).replace("-", "", 1).isdigit():
        return f"{value}{unit}"
    return value


def _quote_template_index(*parts: str) -> int:
    hasher = blake2b(digest_size=4)
    for part in parts:
        hasher.update(part.encode("utf-8"))
        hasher.update(b"\0")
    return int.from_bytes(hasher.digest(), "big")


def _shorten_text(value: str, max_length: int = 80) -> str:
    text = value.strip()
    if len(text) <= max_length:
        return text
    return f"{text[: max_length - 1].rstrip()}…"


def build_execution_records(
    requirement: Requirement,
    fetch_tasks: list[FetchTask],
) -> list[ExecutionRecord]:
    records: list[ExecutionRecord] = []
    base_time = datetime(2026, 3, 1, 9, 0)
    for index, task in enumerate(fetch_tasks, start=1):
        if task.status not in {"running", "completed", "failed"}:
            continue
        started_at = base_time + timedelta(minutes=20 * (index - 1))
        ended_at = (
            started_at + timedelta(minutes=18)
            if task.status in {"completed", "failed"}
            else None
        )
        trigger_type = "cron"
        records.append(
            ExecutionRecord(
                id=f"RUN-{task.id}",
                task_id=task.id,
                trigger_type=trigger_type,
                status="running" if task.status == "running" else task.status,
                started_at=started_at.strftime("%Y-%m-%d %H:%M"),
                ended_at=ended_at.strftime("%Y-%m-%d %H:%M") if ended_at else None,
                operator="系统",
                output_ref=(
                    f"artifact://tasks/{task.id}/long-table.csv"
                    if task.status in {"running", "completed"}
                    else None
                ),
                log_ref=f"log://requirements/{task.id}/{started_at.strftime('%Y%m%d-%H%M')}",
            )
        )
    return records


def recompute_row_state(row: WideTableRow) -> WideTableRow:
    next_status = derive_row_status(row.indicator_values)
    row.row_status = next_status
    row.system_values = {
        **row.system_values,
        "row_status": next_status,
    }
    return row


def derive_row_status(indicator_values: dict[str, IndicatorCell]) -> RowStatus:
    completed_count = sum(1 for cell in indicator_values.values() if _indicator_is_completed(cell))
    if completed_count == 0:
        return "initialized"
    if completed_count == len(indicator_values):
        return "completed"
    return "partial"


def derive_fetch_task_status(
    row: WideTableRow,
    indicator_keys: list[str],
) -> str:
    cells = [row.indicator_values[key] for key in indicator_keys]
    completed_count = sum(1 for cell in cells if _indicator_is_completed(cell))
    if completed_count == 0:
        return "pending"
    if completed_count == len(cells):
        return "completed"
    return "running"


def derive_retrieval_status(
    fetch_task_status: str,
    indicator_cell: IndicatorCell,
) -> str:
    if _indicator_is_completed(indicator_cell):
        return "completed"
    if fetch_task_status == "running":
        return "running"
    if fetch_task_status == "failed":
        return "failed"
    return "pending"


def derive_retrieval_confidence(indicator_cell: IndicatorCell) -> float:
    if not _indicator_is_completed(indicator_cell):
        return 0.0
    if indicator_cell.max_value is not None and indicator_cell.min_value is not None:
        return 0.93
    return 0.88


def is_past_business_date(
    business_date: str,
    *,
    frequency: str,
    reference_date: date,
) -> bool:
    parsed_date = _parse_iso_date_token(business_date)
    if parsed_date is not None:
        return parsed_date < reference_date

    if frequency == "monthly":
        year, month = _parse_month_token(business_date)
        return (year, month) < (reference_date.year, reference_date.month)

    if "-Q" in business_date:
        year, quarter = _parse_quarter_token(business_date)
        current_quarter = (reference_date.month - 1) // 3 + 1
        return (year, quarter) < (reference_date.year, current_quarter)

    return int(business_date) < reference_date.year


def is_due_business_date(
    business_date: str,
    *,
    frequency: str,
    reference_date: date,
) -> bool:
    parsed_date = _parse_iso_date_token(business_date)
    if parsed_date is not None:
        return parsed_date <= reference_date

    if frequency == "monthly":
        year, month = _parse_month_token(business_date)
        return (year, month) <= (reference_date.year, reference_date.month)

    if "-Q" in business_date:
        year, quarter = _parse_quarter_token(business_date)
        current_quarter = (reference_date.month - 1) // 3 + 1
        return (year, quarter) <= (reference_date.year, current_quarter)

    return int(business_date) <= reference_date.year


def business_date_sort_key(business_date: str) -> tuple[int, int, int]:
    parsed_date = _parse_iso_date_token(business_date)
    if parsed_date is not None:
        return (parsed_date.year, parsed_date.month, parsed_date.day)
    if "-Q" in business_date:
        year, quarter = _parse_quarter_token(business_date)
        return (year, 1, quarter)
    if "-" in business_date:
        year, month = _parse_month_token(business_date)
        return (year, 0, month)
    return (int(business_date), 2, 0)


def _expand_months(start: str, end: str) -> list[str]:
    start_year, start_month = _parse_month_token(start)
    end_year, end_month = _parse_month_token(end)
    use_period_end_dates = _uses_period_end_dates(start, end)
    values: list[str] = []
    current_year, current_month = start_year, start_month
    while (current_year, current_month) <= (end_year, end_month):
        values.append(_format_month_value(current_year, current_month, use_period_end_dates))
        if current_month == 12:
            current_year += 1
            current_month = 1
        else:
            current_month += 1
    return values


def _expand_years(start: str, end: str, *, latest_year_quarterly: bool) -> list[str]:
    start_year = _parse_year_token(start)
    end_year = _parse_year_token(end)
    use_period_end_dates = _uses_period_end_dates(start, end)
    if not latest_year_quarterly:
        return [
            _format_year_value(year, use_period_end_dates)
            for year in range(start_year, end_year + 1)
        ]

    values = [
        _format_year_value(year, use_period_end_dates)
        for year in range(start_year, end_year)
    ]
    values.extend(
        _format_quarter_value(end_year, quarter, use_period_end_dates)
        for quarter in range(1, 5)
    )
    return values


def _resolve_open_ended_end(
    *,
    start: str,
    frequency: str,
    reference_date: date,
    open_ended_future_periods: int,
) -> str:
    future_periods = max(open_ended_future_periods, 0)
    use_period_end_dates = _parse_iso_date_token(start) is not None

    if frequency == "monthly":
        start_year, start_month = _parse_month_token(start)
        anchor_year, anchor_month = max(
            (start_year, start_month),
            (reference_date.year, reference_date.month),
        )
        end_year, end_month = _add_month_periods(anchor_year, anchor_month, future_periods)
        return _format_month_value(end_year, end_month, use_period_end_dates)

    start_year = _parse_year_token(start)
    anchor_year = max(start_year, reference_date.year)
    return _format_year_value(anchor_year + future_periods, use_period_end_dates)


def _parse_month_token(token: str) -> tuple[int, int]:
    parts = token.split("-")
    if len(parts) < 2:
        raise ValueError(f"invalid month token: {token!r}")
    year_text, month_text = parts[0], parts[1]
    return int(year_text), int(month_text)


def _parse_year_token(token: str) -> int:
    if _parse_iso_date_token(token) is not None:
        return int(token[:4])
    if "-Q" in token:
        year_text, _quarter_text = token.split("-Q", maxsplit=1)
        return int(year_text)
    return int(token)


def _parse_quarter_token(token: str) -> tuple[int, int]:
    year_text, quarter_text = token.split("-Q", maxsplit=1)
    return int(year_text), int(quarter_text)


def _parse_iso_date_token(token: str) -> date | None:
    try:
        return datetime.strptime(token, "%Y-%m-%d").date()
    except ValueError:
        return None


def _uses_period_end_dates(start: str, end: str) -> bool:
    return _parse_iso_date_token(start) is not None or _parse_iso_date_token(end) is not None


def _format_month_value(year: int, month: int, use_period_end_dates: bool) -> str:
    if not use_period_end_dates:
        return f"{year:04d}-{month:02d}"
    return _month_end_date(year, month).isoformat()


def _format_year_value(year: int, use_period_end_dates: bool) -> str:
    if not use_period_end_dates:
        return str(year)
    return date(year, 12, 31).isoformat()


def _format_quarter_value(year: int, quarter: int, use_period_end_dates: bool) -> str:
    if not use_period_end_dates:
        return f"{year}-Q{quarter}"
    end_month = quarter * 3
    return _month_end_date(year, end_month).isoformat()


def _month_end_date(year: int, month: int) -> date:
    if month == 12:
        return date(year, month, 31)
    return date(year, month + 1, 1) - timedelta(days=1)


def _add_month_periods(year: int, month: int, offset: int) -> tuple[int, int]:
    total_months = year * 12 + (month - 1) + offset
    return total_months // 12, total_months % 12 + 1


def _normalize_business_date_token(business_date: str) -> str:
    return business_date.replace("-", "").replace("Q", "Q")


def _group_rows_by_business_date(rows: list[WideTableRow]) -> dict[str, list[WideTableRow]]:
    grouped: dict[str, list[WideTableRow]] = {}
    for row in rows:
        if row.business_date is None:
            continue
        grouped.setdefault(row.business_date, []).append(row)
    for item in grouped.values():
        item.sort(key=lambda row: row.row_id)
    return grouped


def _build_fetch_task_id(
    *,
    wide_table: WideTable,
    task_group: TaskGroup,
    row: WideTableRow,
    indicator_group_id: str,
) -> str:
    if wide_table.collection_coverage_mode == "full_snapshot":
        return f"FT-{task_group.id}-R{row.row_id:03d}-{indicator_group_id}"
    return f"FT-{wide_table.id}-R{row.row_id:03d}-{indicator_group_id}"


def build_row_binding_key(
    wide_table: WideTable,
    *,
    business_date: str | None,
    dimension_values: dict[str, str],
) -> str:
    segments: list[str] = []
    if wide_table.semantic_time_axis == "business_date" and business_date:
        segments.append(f"business_date:{business_date}")
    segments.extend(
        f"{column.key}:{dimension_values.get(column.key, '')}"
        for column in wide_table.table_schema.dimension_columns
        if not column.is_business_date
    )
    return "|".join(segments) if segments else "__singleton__"


def _build_fetch_task_name(
    *,
    wide_table: WideTable,
    indicator_group_name: str,
    business_date: str | None,
    dimension_values: dict[str, str],
) -> str:
    row_context = _build_row_context_label(dimension_values, business_date)
    if row_context:
        return f"{wide_table.title} - {indicator_group_name} - {row_context}"
    return f"{wide_table.title} - {indicator_group_name}"


def _build_indicator_query(
    *,
    indicator_name: str,
    business_date: str | None,
    dimension_values: dict[str, str],
) -> str:
    dimension_label = " / ".join(value for _, value in sorted(dimension_values.items()))
    if business_date and dimension_label:
        return f"采集 {dimension_label} 在 {business_date} 的 {indicator_name}，返回来源与摘录。"
    if business_date:
        return f"采集 {business_date} 的 {indicator_name}，返回来源与摘录。"
    if dimension_label:
        return f"采集 {dimension_label} 的 {indicator_name}，返回来源与摘录。"
    return f"采集当前快照中的 {indicator_name}，返回来源与摘录。"


def _format_dimension_label(dimension_values: dict[str, str]) -> str:
    return " / ".join(value for _, value in sorted(dimension_values.items()))


def _build_row_context_label(
    dimension_values: dict[str, str],
    business_date: str | None,
) -> str:
    scope_label = _format_dimension_label(dimension_values)
    if business_date and scope_label:
        return f"{scope_label} / {business_date}"
    return business_date or scope_label


def _indicator_is_completed(cell: IndicatorCell) -> bool:
    return cell.value is not None
