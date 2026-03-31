from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from app.schemas import (
    TaskGroup,
    TaskGroupCreateInput,
    TaskSummary,
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
