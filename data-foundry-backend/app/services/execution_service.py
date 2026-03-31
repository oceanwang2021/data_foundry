"""Task execution orchestration using the remote collection agent."""
from __future__ import annotations

from app.repository import DataFoundryRepository
from app.schemas import FetchTask, TaskGroup
from app.services.agent_service import CollectionAgentService


async def execute_task(
    repo: DataFoundryRepository,
    task: FetchTask,
    trigger_type: str = "manual",
    operator: str = "system",
) -> None:
    """Execute a single fetch task via the remote collection agent."""
    agent_service = CollectionAgentService(repo)
    await agent_service.run_task(task, trigger_type=trigger_type, operator=operator)
    _sync_task_group_status(repo, task.task_group_id)


async def execute_task_group(
    repo: DataFoundryRepository,
    task_group: TaskGroup,
) -> None:
    """Execute all pending/failed tasks in a task group."""
    repo.update_task_group(task_group.id, status="running")
    if task_group.batch_id:
        repo.update_collection_batch(task_group.batch_id, status="running")
    tasks = repo.list_tasks_by_task_group(task_group.id)
    pending = [t for t in tasks if t.status in ("pending", "failed", "completed")]

    for task in pending:
        await execute_task(repo, task)

    _sync_task_group_status(repo, task_group.id)


def _sync_task_group_status(repo: DataFoundryRepository, task_group_id: str) -> None:
    """Recompute task group status from its child tasks."""
    tasks = repo.list_tasks_by_task_group(task_group_id)
    total = len(tasks)
    completed = sum(1 for t in tasks if t.status == "completed")
    failed = sum(1 for t in tasks if t.status == "failed")

    if total == 0:
        status = "pending"
    elif completed + failed >= total:
        status = "completed" if failed == 0 else "partial"
    else:
        status = "running"

    repo.update_task_group(
        task_group_id,
        status=status,
        total_tasks=total,
        completed_tasks=completed,
        failed_tasks=failed,
    )

    task_group = repo.get_task_group(task_group_id)
    if task_group is None or not task_group.batch_id:
        return

    sibling_groups = [
        item
        for item in repo.list_task_groups(task_group.requirement_id)
        if item.batch_id == task_group.batch_id
    ]
    sibling_statuses = {item.status for item in sibling_groups}
    if sibling_statuses == {"completed"}:
        batch_status = "completed"
    elif "running" in sibling_statuses:
        batch_status = "running"
    elif sibling_statuses == {"pending"}:
        batch_status = "pending"
    else:
        batch_status = "failed"
    repo.update_collection_batch(task_group.batch_id, status=batch_status)
