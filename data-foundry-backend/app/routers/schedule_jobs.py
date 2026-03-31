"""Schedule jobs API router."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.schemas import ScheduleJob

router = APIRouter(tags=["schedule_jobs"])


def _repo(request: Request):
    return request.app.state.repository


def _scheduler(request: Request):
    return request.app.state.scheduler


class CreateScheduleJobInput(BaseModel):
    task_group_id: str | None = None
    task_id: str | None = None
    trigger_type: str = "manual"
    operator: str = "manual"
    # For backfill
    backfill_request_id: str | None = None


@router.get("/api/schedule-jobs", response_model=list[ScheduleJob])
def list_schedule_jobs(
    request: Request,
    trigger_type: str | None = None,
    status: str | None = None,
):
    repo = _repo(request)
    return repo.list_schedule_jobs(trigger_type=trigger_type, status=status)


@router.get("/api/schedule-jobs/{job_id}", response_model=ScheduleJob)
def get_schedule_job(job_id: str, request: Request):
    repo = _repo(request)
    job = repo.get_schedule_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="ScheduleJob not found")
    return job


@router.post("/api/schedule-jobs", response_model=ScheduleJob)
async def create_schedule_job(body: CreateScheduleJobInput, request: Request):
    scheduler = _scheduler(request)

    if body.trigger_type == "backfill" and body.backfill_request_id:
        repo = _repo(request)
        # Find the backfill request
        # We need to search across all requirements
        for project in repo.list_projects():
            for requirement in repo.list_requirements(project.id):
                for br in repo.list_backfill_requests(requirement.id):
                    if br.id == body.backfill_request_id:
                        jobs = await scheduler.trigger_backfill(br)
                        if jobs:
                            return jobs[0]
        raise HTTPException(status_code=404, detail="BackfillRequest not found")

    if body.task_group_id:
        job = await scheduler.trigger_manual_task_group(
            body.task_group_id, body.operator
        )
        return job

    if body.task_id:
        job = await scheduler.trigger_manual_task(body.task_id, body.operator)
        return job

    raise HTTPException(
        status_code=400,
        detail="Must provide task_group_id, task_id, or backfill_request_id",
    )
