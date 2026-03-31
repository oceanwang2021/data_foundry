from __future__ import annotations

import uuid
from fastapi import APIRouter, HTTPException, Request

from app.schemas import (
    BackfillRequest,
    BackfillRequestCreateInput,
)

router = APIRouter(tags=["backfill"])


def _repo(request: Request):
    return request.app.state.repository


@router.get(
    "/api/projects/{project_id}/requirements/{requirement_id}/backfill-requests",
    response_model=list[BackfillRequest],
)
def list_backfill_requests(project_id: str, requirement_id: str, request: Request):
    repo = _repo(request)
    requirement = repo.get_requirement(project_id, requirement_id)
    if not requirement:
        raise HTTPException(status_code=404, detail="Requirement not found")
    return repo.list_backfill_requests(requirement_id)


@router.post(
    "/api/requirements/{requirement_id}/backfill-requests",
    response_model=BackfillRequest,
    status_code=201,
)
def create_backfill_request(
    requirement_id: str, body: BackfillRequestCreateInput, request: Request,
):
    repo = _repo(request)
    wide_table = repo.get_wide_table(body.wide_table_id)
    if wide_table is None:
        raise HTTPException(status_code=404, detail="Wide table not found")
    if (
        wide_table.semantic_time_axis != "business_date"
        or wide_table.collection_coverage_mode != "incremental_by_business_date"
    ):
        raise HTTPException(status_code=400, detail="Current wide table does not support business-date backfill")
    bf = BackfillRequest(
        id=f"BFR-{uuid.uuid4().hex[:8]}",
        requirement_id=requirement_id,
        wide_table_id=body.wide_table_id,
        start_business_date=body.start_business_date,
        end_business_date=body.end_business_date,
        requested_by=body.requested_by,
        origin="manual",
        status="pending",
        reason=body.reason,
    )
    repo.create_backfill_request(bf)
    return bf
