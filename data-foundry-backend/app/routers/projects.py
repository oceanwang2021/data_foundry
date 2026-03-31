from __future__ import annotations

import uuid
from fastapi import APIRouter, HTTPException, Request

from app.schemas import (
    Project,
    ProjectCreateInput,
    ProjectUpdateInput,
)

router = APIRouter(prefix="/api/projects", tags=["projects"])


def _repo(request: Request):
    return request.app.state.repository


@router.get("", response_model=list[Project])
def list_projects(request: Request):
    return _repo(request).list_projects()


@router.get("/{project_id}", response_model=Project)
def read_project(project_id: str, request: Request):
    project = _repo(request).get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.post("", response_model=Project, status_code=201)
def create_project(body: ProjectCreateInput, request: Request):
    project = Project(
        id=f"PRJ-{uuid.uuid4().hex[:8]}",
        name=body.name,
        owner_team=body.owner_team,
        description=body.description,
        status=body.status,
    )
    _repo(request).create_project(project)
    return project


@router.put("/{project_id}", response_model=Project)
def update_project(project_id: str, body: ProjectUpdateInput, request: Request):
    repo = _repo(request)
    existing = repo.get_project(project_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Project not found")
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        return existing
    repo.update_project(project_id, **updates)
    return repo.get_project(project_id)
