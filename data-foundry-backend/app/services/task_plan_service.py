"""Task plan generation: expand requirement into TaskGroups + FetchTasks."""
from __future__ import annotations

from datetime import date

from app.modeling import (
    build_backfill_requests,
    build_collection_batches,
    build_fetch_tasks,
    build_row_snapshots,
    build_task_groups,
)
from app.schemas import Requirement, TaskGroup


def generate_task_groups(requirement: Requirement, repo) -> list[TaskGroup]:
    """Generate task groups and fetch tasks for the requirement's wide table."""
    wide_table = requirement.wide_table
    if wide_table is None:
        return []

    reference_date = date.today()
    backfill_requests = build_backfill_requests(
        requirement,
        wide_table,
        reference_date=reference_date,
    )
    collection_batches = build_collection_batches(
        requirement,
        wide_table,
        reference_date=reference_date,
    )
    task_groups = build_task_groups(
        requirement,
        wide_table,
        reference_date=reference_date,
        backfill_requests=backfill_requests,
        collection_batches=collection_batches,
    )
    if not task_groups:
        return []

    if backfill_requests:
        for backfill_request in backfill_requests:
            repo.create_backfill_request(backfill_request)

    if collection_batches:
        repo.save_collection_batches(collection_batches)

    repo.save_task_groups(task_groups)
    rows = repo.list_wide_table_rows(wide_table.id)
    if collection_batches:
        snapshots = []
        for batch in collection_batches:
            snapshots.extend(build_row_snapshots(batch, rows))
        repo.save_wide_table_row_snapshots(snapshots)
    fetch_tasks = build_fetch_tasks(
        requirement,
        wide_table,
        rows=rows,
        task_groups=task_groups,
    )
    if fetch_tasks:
        repo.save_fetch_tasks(fetch_tasks)

    for task_group in task_groups:
        scoped_fetch_tasks = [
            task for task in fetch_tasks if task.task_group_id == task_group.id
        ]
        repo.update_task_group(task_group.id, total_tasks=len(scoped_fetch_tasks))

    return task_groups
