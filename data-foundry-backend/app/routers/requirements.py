from __future__ import annotations

import uuid
from fastapi import APIRouter, HTTPException, Request

from app.schemas import (
    Requirement,
    RequirementCreateInput,
    RequirementSummary,
    RequirementUpdateInput,
    WideTable,
)

router = APIRouter(prefix="/api/projects/{project_id}/requirements", tags=["requirements"])


def _repo(request: Request):
    return request.app.state.repository


@router.get("", response_model=list[RequirementSummary])
def list_requirements(project_id: str, request: Request):
    repo = _repo(request)
    project = repo.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    response: list[RequirementSummary] = []
    for requirement in repo.list_requirements(project_id):
        requirement_tasks = repo.list_tasks(requirement.id)
        retrieval_count = sum(
            len(repo.list_retrieval_tasks(task.id)) for task in requirement_tasks
        )
        response.append(
            RequirementSummary(
                requirement=requirement,
                wide_table_count=1 if requirement.wide_table else 0,
                wide_row_count=repo.count_current_requirement_rows(requirement.id),
                task_group_count=repo.count_task_groups(requirement.id),
                task_count=len(requirement_tasks),
                retrieval_task_count=retrieval_count,
                backfill_request_count=repo.count_backfill_requests(requirement.id),
            )
        )
    return response


@router.get("/{requirement_id}", response_model=Requirement)
def read_requirement(project_id: str, requirement_id: str, request: Request):
    requirement = _repo(request).get_requirement(project_id, requirement_id)
    if not requirement:
        raise HTTPException(status_code=404, detail="Requirement not found")
    return requirement


@router.post("", response_model=Requirement, status_code=201)
def create_requirement(project_id: str, body: RequirementCreateInput, request: Request):
    repo = _repo(request)
    project = repo.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    req_id = f"REQ-{uuid.uuid4().hex[:8]}"
    wide_table = None
    if body.wide_table is not None:
        wt = body.wide_table
        wide_table = WideTable(
            id=wt.id if wt.id else f"wt_{uuid.uuid4().hex[:8]}",
            title=wt.title,
            description=wt.description,
            schema=wt.table_schema,
            scope=wt.scope,
            indicator_groups=wt.indicator_groups,
            schedule_rules=wt.schedule_rules,
        )

    requirement = Requirement(
        id=req_id,
        project_id=project_id,
        title=body.title,
        # Demo 阶段已取消：新建需求一律按正式需求处理。
        phase="production",
        parent_requirement_id=None,
        # Schema 在首次运行前可编辑，进入运行态后锁定。
        schema_locked=False,
        status="draft",
        owner=body.owner,
        assignee=body.assignee,
        business_goal=body.business_goal,
        background_knowledge=body.background_knowledge,
        business_boundary=body.business_boundary,
        delivery_scope=body.delivery_scope,
        data_update_enabled=body.data_update_enabled,
        data_update_mode=body.data_update_mode,
        wide_table=wide_table,
        collection_policy=body.collection_policy,
    )
    repo.create_requirement(requirement)
    return requirement


@router.put("/{requirement_id}", response_model=Requirement)
def update_requirement(
    project_id: str, requirement_id: str,
    body: RequirementUpdateInput, request: Request,
):
    repo = _repo(request)
    existing = repo.get_requirement(project_id, requirement_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Requirement not found")
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        return existing
    repo.update_requirement(requirement_id, **updates)
    return repo.get_requirement(project_id, requirement_id)


@router.delete("/{requirement_id}", status_code=204)
def delete_requirement(project_id: str, requirement_id: str, request: Request):
    repo = _repo(request)
    existing = repo.get_requirement(project_id, requirement_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Requirement not found")
    repo.delete_requirement(requirement_id)


#
# Demo → 正式转换流程已取消：不再提供 convert 接口。
#
