"""Scheduler service — lightweight scheduling layer for fetch tasks."""
from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from app.schemas import ScheduleJob
from app.services.agent_service import CollectionAgentService

if TYPE_CHECKING:
    from app.repository import DataFoundryRepository
    from app.schemas import BackfillRequest, FetchTask, TaskGroup

logger = logging.getLogger(__name__)

DEFAULT_MAX_CONCURRENCY = 5

# --- FetchTask state machine ---

_VALID_FETCH_TASK_TRANSITIONS: set[tuple[str, str]] = {
    ("pending", "running"),
    ("running", "completed"),
    ("running", "failed"),
    ("failed", "running"),
    ("completed", "running"),
    ("pending", "invalidated"),
    ("failed", "invalidated"),
}


def validate_fetch_task_transition(current: str, target: str) -> None:
    """Raise ``ValueError`` if *current → target* is not a legal FetchTask transition."""
    if (current, target) not in _VALID_FETCH_TASK_TRANSITIONS:
        raise ValueError(
            f"Illegal FetchTask transition: {current!r} → {target!r}"
        )


def normalize_max_concurrency(value: object, default: int = DEFAULT_MAX_CONCURRENCY) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return min(max(parsed, 1), 64)


# --- TaskGroup status derivation ---

def derive_task_group_status(task_statuses: list[str]) -> str:
    """Derive the TaskGroup status from its child FetchTask statuses.

    Priority (high → low):
    1. All invalidated          → invalidated
    2. Any running              → running
    3. Any completed AND pending → running
    4. All terminal AND any failed → partial
    5. All completed            → completed
    6. All pending              → pending
    """
    if not task_statuses:
        return "pending"

    status_set = set(task_statuses)

    if status_set == {"invalidated"}:
        return "invalidated"
    if "running" in status_set:
        return "running"
    if "completed" in status_set and "pending" in status_set:
        return "running"

    terminal = {"completed", "failed", "invalidated"}
    if status_set <= terminal and "failed" in status_set:
        return "partial"
    if status_set == {"completed"}:
        return "completed"
    if status_set == {"pending"}:
        return "pending"

    # fallback
    return "running"


# --- SchedulerService ---

class SchedulerService:
    """Lightweight scheduler that wraps the remote collection agent with concurrency control."""

    def __init__(
        self,
        repo: DataFoundryRepository,
        semaphore: asyncio.Semaphore,
        agent_service: CollectionAgentService,
        *,
        max_concurrency: int = DEFAULT_MAX_CONCURRENCY,
    ) -> None:
        self.repo = repo
        self.semaphore = semaphore
        self.agent_service = agent_service
        self.max_concurrency = normalize_max_concurrency(max_concurrency)

    # ---- internal helpers ----

    def _sync_task_group_status(self, task_group_id: str) -> None:
        """Recompute and persist TaskGroup status from child FetchTask statuses."""
        tasks = self.repo.list_tasks_by_task_group(task_group_id)
        statuses = [t.status for t in tasks]
        status = derive_task_group_status(statuses)
        total = len(tasks)
        completed = sum(1 for s in statuses if s == "completed")
        failed = sum(1 for s in statuses if s == "failed")
        self.repo.update_task_group(
            task_group_id,
            status=status,
            total_tasks=total,
            completed_tasks=completed,
            failed_tasks=failed,
        )
        task_group = self.repo.get_task_group(task_group_id)
        if task_group is None or not task_group.batch_id:
            return
        sibling_groups = [
            item
            for item in self.repo.list_task_groups(task_group.requirement_id)
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
        self.repo.update_collection_batch(task_group.batch_id, status=batch_status)

    def _get_auto_retry_limit(self, task: FetchTask) -> int:
        """Look up the auto_retry_limit from the ScheduleRule associated with the task's WideTable."""
        wide_table = self.repo.get_wide_table(task.wide_table_id)
        if wide_table and wide_table.schedule_rules:
            return wide_table.schedule_rules[0].auto_retry_limit
        return 0

    def set_max_concurrency(self, value: int) -> int:
        self.max_concurrency = normalize_max_concurrency(value)
        self.semaphore = asyncio.Semaphore(self.max_concurrency)
        return self.max_concurrency

    def _count_retries(self, task_id: str) -> int:
        """Count how many execution records exist for a task (proxy for retry count)."""
        records = self.repo.list_execution_records(task_id)
        return len(records)

    async def _reconcile_missing_historical_task_groups(
        self,
        requirement,
        wide_table,
        *,
        current_date,
    ) -> list[ScheduleJob]:
        if (
            wide_table.semantic_time_axis != "business_date"
            or wide_table.collection_coverage_mode != "incremental_by_business_date"
            or wide_table.scope.business_date is None
        ):
            return []
        from app.modeling import build_fetch_tasks, business_date_sort_key, is_past_business_date
        from app.schemas import TaskGroup as TaskGroupModel

        rows = self.repo.list_wide_table_rows(wide_table.id)
        if not rows:
            return []

        existing_groups = [
            group
            for group in self.repo.list_task_groups(requirement.id)
            if group.wide_table_id == wide_table.id
        ]
        existing_dates = {group.business_date for group in existing_groups}
        historical_rows_by_date: dict[str, list] = {}
        for row in rows:
            if is_past_business_date(
                row.business_date,
                frequency=wide_table.scope.business_date.frequency,
                reference_date=current_date,
            ):
                historical_rows_by_date.setdefault(row.business_date, []).append(row)

        missing_dates = sorted(
            [
                business_date
                for business_date in historical_rows_by_date
                if business_date not in existing_dates
            ],
            key=business_date_sort_key,
        )
        if not missing_dates:
            return []

        schedule_rule_id = (
            next((rule.id for rule in wide_table.schedule_rules if rule.enabled), None)
            or (wide_table.schedule_rules[0].id if wide_table.schedule_rules else None)
        )
        if schedule_rule_id is None:
            return []

        indicator_group_count = len(wide_table.indicator_groups)
        timestamp = datetime.now().isoformat()
        task_groups: list[TaskGroupModel] = []
        for business_date in missing_dates:
            scoped_rows = historical_rows_by_date[business_date]
            plan_version = max((row.plan_version for row in scoped_rows), default=1)
            task_groups.append(
                TaskGroupModel(
                    id=f"tg_{wide_table.id}_{business_date.replace('-', '')}_r{plan_version}",
                    requirement_id=requirement.id,
                    wide_table_id=wide_table.id,
                    business_date=business_date,
                    source_type="scheduled",
                    status="pending",
                    schedule_rule_id=schedule_rule_id,
                    plan_version=plan_version,
                    group_kind="baseline",
                    total_tasks=len(scoped_rows) * indicator_group_count,
                    completed_tasks=0,
                    failed_tasks=0,
                    triggered_by="backfill",
                    business_date_label=business_date,
                    created_at=timestamp,
                    updated_at=timestamp,
                )
            )

        self.repo.save_task_groups(task_groups)
        fetch_tasks = build_fetch_tasks(
            requirement,
            wide_table,
            rows=rows,
            task_groups=task_groups,
        )
        if fetch_tasks:
            self.repo.save_fetch_tasks(fetch_tasks)

        return await self._execute_task_groups(
            task_groups,
            trigger_type="backfill",
            operator="system",
        )

    async def _execute_task(
        self,
        task: FetchTask,
        trigger_type: str,
        operator: str,
    ) -> None:
        """Execute a single FetchTask with semaphore-based concurrency control."""
        async with self.semaphore:
            validate_fetch_task_transition(task.status, "running")
            self.repo.update_fetch_task(task.id, status="running")

            # Reload task with running status
            task_running = self.repo.get_task_by_id(task.id)
            if task_running is None:
                return

            try:
                await self.agent_service.run_task(
                    task_running,
                    trigger_type=trigger_type,
                    operator=operator,
                )
            except Exception:
                logger.exception("Agent execution failed for task %s", task.id)
                self.repo.update_fetch_task(task.id, status="failed")

            # Reload to get final status set by agent
            updated_task = self.repo.get_task_by_id(task.id)
            if updated_task and updated_task.status == "failed":
                # Check auto-retry
                retry_limit = self._get_auto_retry_limit(updated_task)
                retry_count = self._count_retries(updated_task.id)
                if retry_count < retry_limit:
                    self.repo.update_fetch_task(updated_task.id, status="running")
                    reloaded = self.repo.get_task_by_id(updated_task.id)
                    if reloaded:
                        try:
                            await self.agent_service.run_task(
                                reloaded,
                                trigger_type="resample",
                                operator="system",
                            )
                        except Exception:
                            logger.exception("Auto-retry failed for task %s", updated_task.id)
                            self.repo.update_fetch_task(updated_task.id, status="failed")

            # Sync group status after task completes
            self._sync_task_group_status(task.task_group_id)

    async def _execute_task_group(
        self, task_group: TaskGroup, trigger_type: str, operator: str
    ) -> ScheduleJob:
        """Execute pending/failed tasks, or rerun a completed group on demand."""
        job = ScheduleJob(
            id=str(uuid.uuid4()),
            task_group_id=task_group.id,
            wide_table_id=task_group.wide_table_id,
            trigger_type=trigger_type,
            status="running",
            started_at=datetime.now().isoformat(),
            operator=operator,
        )
        self.repo.save_schedule_job(job)

        original_status = task_group.status
        self.repo.update_task_group(task_group.id, status="running")
        tasks = self.repo.list_tasks_by_task_group(task_group.id)
        allowed_statuses = ("pending", "failed")
        if trigger_type == "manual" and original_status == "completed":
            allowed_statuses = ("completed",)
        executable = [t for t in tasks if t.status in allowed_statuses]

        coros = [self._execute_task(t, trigger_type, operator) for t in executable]
        await asyncio.gather(*coros, return_exceptions=True)

        self._sync_task_group_status(task_group.id)

        # Update job status
        updated_group = self.repo.get_task_group(task_group.id)
        job_status = "completed" if updated_group and updated_group.status in ("completed", "partial") else "failed"
        self.repo.update_schedule_job(job.id, status=job_status, ended_at=datetime.now().isoformat())
        return job

    async def _execute_task_groups(
        self,
        task_groups: list[TaskGroup],
        *,
        trigger_type: str,
        operator: str,
    ) -> list[ScheduleJob]:
        if not task_groups:
            return []

        results = await asyncio.gather(
            *[
                self._execute_task_group(task_group, trigger_type, operator)
                for task_group in task_groups
            ],
            return_exceptions=True,
        )
        jobs: list[ScheduleJob] = []
        for task_group, result in zip(task_groups, results, strict=False):
            if isinstance(result, Exception):
                logger.error(
                    "TaskGroup execution crashed for %s",
                    task_group.id,
                    exc_info=(type(result), result, result.__traceback__),
                )
                continue
            jobs.append(result)
        return jobs

    # ---- public API ----

    async def trigger_manual_task_group(self, task_group_id: str, operator: str = "manual") -> ScheduleJob:
        """Manually execute a TaskGroup.

        Partial groups only backfill pending/failed tasks; completed groups rerun
        the full group.
        """
        task_group = self.repo.get_task_group(task_group_id)
        if not task_group:
            raise ValueError(f"TaskGroup {task_group_id!r} not found")
        return await self._execute_task_group(task_group, "manual", operator)

    async def trigger_backfill_task_group(self, task_group_id: str, operator: str = "system") -> ScheduleJob:
        """Execute a historical backfill task group."""
        task_group = self.repo.get_task_group(task_group_id)
        if not task_group:
            raise ValueError(f"TaskGroup {task_group_id!r} not found")
        return await self._execute_task_group(task_group, "backfill", operator)

    async def trigger_backfill_task_groups(
        self,
        task_group_ids: list[str],
        operator: str = "system",
    ) -> list[ScheduleJob]:
        task_groups: list[TaskGroup] = []
        for task_group_id in task_group_ids:
            task_group = self.repo.get_task_group(task_group_id)
            if not task_group:
                raise ValueError(f"TaskGroup {task_group_id!r} not found")
            task_groups.append(task_group)
        return await self._execute_task_groups(
            task_groups,
            trigger_type="backfill",
            operator=operator,
        )

    async def trigger_manual_task(self, task_id: str, operator: str = "manual") -> ScheduleJob:
        """Manually trigger execution of a single FetchTask."""
        task = self.repo.get_task_by_id(task_id)
        if not task:
            raise ValueError(f"FetchTask {task_id!r} not found")
        if task.status not in ("pending", "failed", "completed"):
            raise ValueError(f"Cannot execute task in status {task.status!r}")

        task_group = self.repo.get_task_group(task.task_group_id)
        if not task_group:
            raise ValueError(f"TaskGroup {task.task_group_id!r} not found")

        job = ScheduleJob(
            id=str(uuid.uuid4()),
            task_group_id=task.task_group_id,
            wide_table_id=task.wide_table_id,
            trigger_type="manual",
            status="running",
            started_at=datetime.now().isoformat(),
            operator=operator,
        )
        self.repo.save_schedule_job(job)

        await self._execute_task(task, "manual", operator)

        updated_task = self.repo.get_task_by_id(task_id)
        job_status = "completed" if updated_task and updated_task.status == "completed" else "failed"
        self.repo.update_schedule_job(job.id, status=job_status, ended_at=datetime.now().isoformat())
        return job

    async def trigger_scheduled(self) -> list[ScheduleJob]:
        """Scan all enabled ScheduleRules and trigger execution for due ones."""
        from app.modeling import (
            build_collection_batches,
            build_fetch_tasks,
            build_row_snapshots,
            build_task_groups,
            business_date_sort_key,
            expand_business_dates,
            is_due_business_date,
        )
        from app.schemas import TaskGroup as TaskGroupModel

        jobs: list[ScheduleJob] = []
        current_date = datetime.now().date()
        # Get all requirements to find wide tables with schedule rules
        projects = self.repo.list_projects()
        for project in projects:
            requirements = self.repo.list_requirements(project.id)
            for requirement in requirements:
                if requirement.phase != "production":
                    continue
                if requirement.status == "ready":
                    continue
                wide_table = requirement.wide_table
                if wide_table is None:
                    continue
                jobs.extend(
                    await self._reconcile_missing_historical_task_groups(
                        requirement,
                        wide_table,
                        current_date=current_date,
                    )
                )
                for rule in wide_table.schedule_rules:
                    if not rule.enabled:
                        continue
                    # Check if trigger_time has arrived (compare HH:MM)
                    now_time = datetime.now().strftime("%H:%M")
                    if now_time < rule.trigger_time:
                        continue
                    if wide_table.collection_coverage_mode == "full_snapshot":
                        current_label = current_date.isoformat()
                        existing_batches = self.repo.list_collection_batches(wide_table.id)
                        if any(batch.snapshot_label == current_label for batch in existing_batches):
                            continue
                        batches = build_collection_batches(
                            requirement,
                            wide_table,
                            reference_date=current_date,
                        )
                        if not batches:
                            continue
                        self.repo.save_collection_batches(batches)
                        rows = self.repo.list_wide_table_rows(wide_table.id)
                        self.repo.save_wide_table_row_snapshots(
                            [
                                snapshot
                                for batch in batches
                                for snapshot in build_row_snapshots(batch, rows)
                            ]
                        )
                        new_task_groups = build_task_groups(
                            requirement,
                            wide_table,
                            reference_date=current_date,
                            backfill_requests=[],
                            collection_batches=batches,
                        )
                        if new_task_groups:
                            self.repo.save_task_groups(new_task_groups)
                            fetch_tasks = build_fetch_tasks(
                                requirement,
                                wide_table,
                                rows=rows,
                                task_groups=new_task_groups,
                            )
                            if fetch_tasks:
                                self.repo.save_fetch_tasks(fetch_tasks)
                            jobs.extend(
                                await self._execute_task_groups(
                                    new_task_groups,
                                    trigger_type="cron",
                                    operator="system",
                                )
                            )
                        continue
                    existing_groups = [
                        group
                        for group in self.repo.list_task_groups(requirement.id)
                        if group.wide_table_id == wide_table.id
                    ]
                    due_existing_groups = sorted(
                        [
                            group
                            for group in existing_groups
                            if group.triggered_by in ("schedule", "backfill")
                            and group.status in ("pending", "failed")
                            and is_due_business_date(
                                group.business_date,
                                frequency=wide_table.scope.business_date.frequency,
                                reference_date=current_date,
                            )
                        ],
                        key=lambda group: business_date_sort_key(group.business_date),
                    )
                    jobs.extend(
                        await self._execute_task_groups(
                            due_existing_groups,
                            trigger_type="cron",
                            operator="system",
                        )
                    )

                    existing_dates = {group.business_date for group in existing_groups}
                    due_missing_dates = [
                        business_date
                        for business_date in expand_business_dates(
                            wide_table.scope,
                            reference_date=current_date,
                        )
                        if business_date not in existing_dates
                        and is_due_business_date(
                            business_date,
                            frequency=wide_table.scope.business_date.frequency,
                            reference_date=current_date,
                        )
                    ]
                    new_task_groups = [
                        TaskGroupModel(
                            id=str(uuid.uuid4()),
                            requirement_id=requirement.id,
                            wide_table_id=wide_table.id,
                            business_date=business_date,
                            source_type="scheduled",
                            status="pending",
                            schedule_rule_id=rule.id,
                            business_date_label=business_date,
                            triggered_by="schedule",
                        )
                        for business_date in sorted(due_missing_dates, key=business_date_sort_key)
                    ]
                    if new_task_groups:
                        self.repo.save_task_groups(new_task_groups)
                        rows = self.repo.list_wide_table_rows(wide_table.id)
                        fetch_tasks = build_fetch_tasks(
                            requirement,
                            wide_table,
                            rows=rows,
                            task_groups=new_task_groups,
                        )
                        if fetch_tasks:
                            self.repo.save_fetch_tasks(fetch_tasks)
                        jobs.extend(
                            await self._execute_task_groups(
                                new_task_groups,
                                trigger_type="cron",
                                operator="system",
                            )
                        )
        return jobs

    async def trigger_backfill(self, backfill_request: BackfillRequest) -> list[ScheduleJob]:
        """Create TaskGroups for each business date in the backfill range and execute."""
        from app.modeling import expand_business_dates, build_fetch_tasks

        jobs: list[ScheduleJob] = []
        # Find the requirement and wide table
        requirement = self.repo.get_requirement(
            backfill_request.requirement_id.split("-")[0] if "-" in backfill_request.requirement_id else "",
            backfill_request.requirement_id,
        )
        if not requirement:
            # Try to find requirement by iterating projects
            for project in self.repo.list_projects():
                req = self.repo.get_requirement(project.id, backfill_request.requirement_id)
                if req:
                    requirement = req
                    break
        if not requirement:
            raise ValueError(f"Requirement not found for backfill request {backfill_request.id}")

        wide_table = self.repo.get_wide_table(backfill_request.wide_table_id)
        if not wide_table:
            raise ValueError(f"WideTable {backfill_request.wide_table_id!r} not found")
        if (
            wide_table.semantic_time_axis != "business_date"
            or wide_table.collection_coverage_mode != "incremental_by_business_date"
            or wide_table.scope.business_date is None
        ):
            return jobs

        all_dates = expand_business_dates(wide_table.scope)
        target_dates = [
            d for d in all_dates
            if backfill_request.start_business_date <= d <= backfill_request.end_business_date
        ]

        from app.schemas import TaskGroup as TaskGroupModel
        task_groups = [
            TaskGroupModel(
                id=str(uuid.uuid4()),
                requirement_id=requirement.id,
                wide_table_id=wide_table.id,
                business_date=biz_date,
                source_type="backfill",
                status="pending",
                backfill_request_id=backfill_request.id,
                business_date_label=biz_date,
            )
            for biz_date in target_dates
        ]
        if not task_groups:
            return jobs

        self.repo.save_task_groups(task_groups)
        rows = self.repo.list_wide_table_rows(wide_table.id)
        fetch_tasks = build_fetch_tasks(
            requirement,
            wide_table,
            rows=rows,
            task_groups=task_groups,
        )
        if fetch_tasks:
            self.repo.save_fetch_tasks(fetch_tasks)
        jobs.extend(
            await self._execute_task_groups(
                task_groups,
                trigger_type="backfill",
                operator="system",
            )
        )
        return jobs

    async def retry_task(self, task_id: str, operator: str = "manual") -> None:
        """Manually retry a failed FetchTask."""
        task = self.repo.get_task_by_id(task_id)
        if not task:
            raise ValueError(f"FetchTask {task_id!r} not found")
        if task.status != "failed":
            raise ValueError(f"Can only retry failed tasks, current status: {task.status!r}")

        await self._execute_task(task, "resample", operator)
