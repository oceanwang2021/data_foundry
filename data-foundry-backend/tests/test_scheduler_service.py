"""Unit tests for scheduler_service: FetchTask state transition validation."""

import pytest

from app.services.scheduler_service import validate_fetch_task_transition


# --- Legal transitions ---

_VALID_TRANSITIONS = [
    ("pending", "running"),
    ("running", "completed"),
    ("running", "failed"),
    ("failed", "running"),
    ("completed", "running"),
    ("pending", "invalidated"),
    ("failed", "invalidated"),
]


@pytest.mark.parametrize("current,target", _VALID_TRANSITIONS)
def test_valid_transitions_do_not_raise(current: str, target: str) -> None:
    """Each legal transition should succeed without raising."""
    validate_fetch_task_transition(current, target)  # no exception


# --- Illegal transitions ---

_INVALID_TRANSITIONS = [
    ("pending", "completed"),
    ("pending", "failed"),
    ("running", "pending"),
    ("running", "invalidated"),
    ("completed", "pending"),
    ("completed", "failed"),
    ("completed", "invalidated"),
    ("failed", "pending"),
    ("failed", "completed"),
    ("invalidated", "pending"),
    ("invalidated", "running"),
    ("invalidated", "completed"),
    ("invalidated", "failed"),
    ("invalidated", "invalidated"),
    ("pending", "pending"),
    ("running", "running"),
    ("completed", "completed"),
    ("failed", "failed"),
]


@pytest.mark.parametrize("current,target", _INVALID_TRANSITIONS)
def test_invalid_transitions_raise_value_error(current: str, target: str) -> None:
    """Every non-legal transition must raise ValueError."""
    with pytest.raises(ValueError, match="Illegal FetchTask transition"):
        validate_fetch_task_transition(current, target)
