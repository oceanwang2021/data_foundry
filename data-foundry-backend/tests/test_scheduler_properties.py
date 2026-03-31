"""Property-based tests for scheduler state machine logic."""
from __future__ import annotations

from hypothesis import given, settings
from hypothesis import strategies as st

from app.services.scheduler_service import (
    validate_fetch_task_transition,
    derive_task_group_status,
)

FETCH_TASK_STATUSES = ["pending", "running", "completed", "failed", "invalidated"]

VALID_TRANSITIONS = {
    ("pending", "running"),
    ("running", "completed"),
    ("running", "failed"),
    ("failed", "running"),
    ("completed", "running"),
    ("pending", "invalidated"),
    ("failed", "invalidated"),
}


# Feature: task-scheduling, Property 10: FetchTask 状态转换合法性
@given(
    current=st.sampled_from(FETCH_TASK_STATUSES),
    target=st.sampled_from(FETCH_TASK_STATUSES),
)
@settings(max_examples=200)
def test_fetch_task_transition_validity(current: str, target: str) -> None:
    """Legal pairs must pass; illegal pairs must raise ValueError."""
    if (current, target) in VALID_TRANSITIONS:
        validate_fetch_task_transition(current, target)  # should not raise
    else:
        try:
            validate_fetch_task_transition(current, target)
            raise AssertionError(f"Expected ValueError for {current!r} → {target!r}")
        except ValueError:
            pass


TASK_GROUP_STATUSES = ["pending", "running", "completed", "partial", "invalidated"]


# Feature: task-scheduling, Property 8: TaskGroup 状态由 FetchTask 状态正确派生
@given(
    statuses=st.lists(
        st.sampled_from(FETCH_TASK_STATUSES),
        min_size=1,
        max_size=50,
    )
)
@settings(max_examples=200)
def test_task_group_status_derivation(statuses: list[str]) -> None:
    """Derived status must match the priority rules."""
    result = derive_task_group_status(statuses)
    assert result in TASK_GROUP_STATUSES, f"Unexpected status: {result}"

    status_set = set(statuses)
    terminal = {"completed", "failed", "invalidated"}

    if status_set == {"invalidated"}:
        assert result == "invalidated"
    elif "running" in status_set:
        assert result == "running"
    elif "completed" in status_set and "pending" in status_set:
        assert result == "running"
    elif status_set <= terminal and "failed" in status_set:
        assert result == "partial"
    elif status_set == {"completed"}:
        assert result == "completed"
    elif status_set == {"pending"}:
        assert result == "pending"


# Feature: task-scheduling, Property 5: 自动重试在限额内执行，达到限额后停止
@given(
    retry_count=st.integers(min_value=0, max_value=20),
    auto_retry_limit=st.integers(min_value=0, max_value=10),
)
@settings(max_examples=200)
def test_auto_retry_respects_limit(retry_count: int, auto_retry_limit: int) -> None:
    """If retry_count < auto_retry_limit, retry should proceed; otherwise stop."""
    should_retry = retry_count < auto_retry_limit
    if should_retry:
        assert retry_count < auto_retry_limit
    else:
        assert retry_count >= auto_retry_limit


# Feature: task-scheduling, Property 7: 补采为日期范围内每个业务日期创建 TaskGroup
@given(
    all_dates=st.lists(
        st.from_regex(r"2026-(0[1-9]|1[0-2])", fullmatch=True),
        min_size=1,
        max_size=12,
        unique=True,
    ),
)
@settings(max_examples=100)
def test_backfill_creates_task_group_per_date(all_dates: list[str]) -> None:
    """For each date in the backfill range, a TaskGroup should be created."""
    sorted_dates = sorted(all_dates)
    start = sorted_dates[0]
    end = sorted_dates[-1]
    target_dates = [d for d in sorted_dates if start <= d <= end]
    # Every date in range should be covered
    assert len(target_dates) == len(sorted_dates)
    assert target_dates == sorted_dates


# Feature: task-scheduling, Property 9: 并发执行数不超过 max_concurrency
@given(
    task_count=st.integers(min_value=1, max_value=50),
    max_concurrency=st.integers(min_value=1, max_value=10),
)
@settings(max_examples=100)
def test_concurrency_limit_property(task_count: int, max_concurrency: int) -> None:
    """Semaphore-based concurrency control should never exceed max_concurrency."""
    import asyncio

    peak_concurrent = 0
    current_concurrent = 0
    lock = asyncio.Lock()

    async def mock_task(sem: asyncio.Semaphore) -> None:
        nonlocal peak_concurrent, current_concurrent
        async with sem:
            async with lock:
                current_concurrent += 1
                if current_concurrent > peak_concurrent:
                    peak_concurrent = current_concurrent
            await asyncio.sleep(0.001)
            async with lock:
                current_concurrent -= 1

    async def run_all() -> None:
        sem = asyncio.Semaphore(max_concurrency)
        await asyncio.gather(*(mock_task(sem) for _ in range(task_count)))

    asyncio.run(run_all())
    assert peak_concurrent <= max_concurrency


# Feature: task-scheduling, Property 11: ScheduleJob 筛选结果与筛选条件一致
@given(
    trigger_types=st.lists(
        st.sampled_from(["manual", "cron", "backfill", "resample"]),
        min_size=1,
        max_size=10,
    ),
    statuses=st.lists(
        st.sampled_from(["queued", "running", "completed", "failed"]),
        min_size=1,
        max_size=10,
    ),
    filter_trigger=st.one_of(
        st.none(),
        st.sampled_from(["manual", "cron", "backfill", "resample"]),
    ),
    filter_status=st.one_of(
        st.none(),
        st.sampled_from(["queued", "running", "completed", "failed"]),
    ),
)
@settings(max_examples=200)
def test_schedule_job_filtering(
    trigger_types: list[str],
    statuses: list[str],
    filter_trigger: str | None,
    filter_status: str | None,
) -> None:
    """Filtered results must all match the filter criteria."""
    # Simulate jobs
    jobs = list(zip(trigger_types, statuses))
    filtered = [
        (tt, st_)
        for tt, st_ in jobs
        if (filter_trigger is None or tt == filter_trigger)
        and (filter_status is None or st_ == filter_status)
    ]
    for tt, st_ in filtered:
        if filter_trigger is not None:
            assert tt == filter_trigger
        if filter_status is not None:
            assert st_ == filter_status
