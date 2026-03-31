from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request

from app.schemas import (
    ExecutionRecord,
    FetchTask,
    RetrievalTask,
    TaskExecuteInput,
    TaskSummary,
)

router = APIRouter(tags=["fetch_tasks"])


def _repo(request: Request):
    return request.app.state.repository


def _scheduler(request: Request):
    return request.app.state.scheduler


@router.get(
    "/api/projects/{project_id}/requirements/{requirement_id}/tasks",
    response_model=list[TaskSummary],
)
def list_tasks(project_id: str, requirement_id: str, request: Request):
    repo = _repo(request)
    requirement = repo.get_requirement(project_id, requirement_id)
    if not requirement:
        raise HTTPException(status_code=404, detail="Requirement not found")
    response: list[TaskSummary] = []
    for task in repo.list_tasks(requirement_id):
        response.append(
            TaskSummary(
                task=task,
                retrieval_task_count=len(repo.list_retrieval_tasks(task.id)),
                run_count=len(repo.list_execution_records(task.id)),
            )
        )
    return response


@router.get(
    "/api/projects/{project_id}/requirements/{requirement_id}/tasks/{task_id}",
    response_model=FetchTask,
)
def read_task(project_id: str, requirement_id: str, task_id: str, request: Request):
    repo = _repo(request)
    requirement = repo.get_requirement(project_id, requirement_id)
    if not requirement:
        raise HTTPException(status_code=404, detail="Requirement not found")
    task = repo.get_task(requirement_id, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.get("/api/tasks/{task_id}/retrieval-tasks", response_model=list[RetrievalTask])
def list_retrieval_tasks(task_id: str, request: Request):
    repo = _repo(request)
    task = repo.get_task_by_id(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return repo.list_retrieval_tasks(task_id)


@router.get("/api/tasks/{task_id}/runs", response_model=list[ExecutionRecord])
def list_task_runs(task_id: str, request: Request):
    repo = _repo(request)
    task = repo.get_task_by_id(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return repo.list_execution_records(task_id)


@router.post("/api/tasks/{task_id}/execute", response_model=dict)
async def execute_task_endpoint(
    task_id: str, request: Request, background_tasks: BackgroundTasks,
    body: TaskExecuteInput | None = None,
):
    """Trigger execution of a single fetch task via SchedulerService."""
    repo = _repo(request)
    task = repo.get_task_by_id(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.status not in ("pending", "failed", "completed"):
        raise HTTPException(status_code=400, detail=f"Task in status '{task.status}' cannot be executed")
    operator = body.operator if body else "system"
    scheduler = _scheduler(request)
    background_tasks.add_task(scheduler.trigger_manual_task, task_id, operator)
    return {"ok": True, "task_id": task_id, "message": "Task execution started"}


@router.post("/api/tasks/{task_id}/retry", response_model=dict)
async def retry_task_endpoint(task_id: str, request: Request, background_tasks: BackgroundTasks):
    repo = _repo(request)
    task = repo.get_task_by_id(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.status != "failed":
        raise HTTPException(status_code=400, detail="Only failed tasks can be retried")
    scheduler = _scheduler(request)
    background_tasks.add_task(scheduler.retry_task, task_id, "system")
    return {"ok": True, "task_id": task_id, "message": "Task retry started"}


@router.post("/api/task-groups/{task_group_id}/execute", response_model=dict)
async def execute_task_group_endpoint(
    task_group_id: str, request: Request, background_tasks: BackgroundTasks,
):
    """Batch execute all pending tasks in a task group via SchedulerService."""
    repo = _repo(request)
    tg = repo.get_task_group(task_group_id)
    if not tg:
        raise HTTPException(status_code=404, detail="Task group not found")
    scheduler = _scheduler(request)
    background_tasks.add_task(scheduler.trigger_manual_task_group, task_group_id, "manual")
    return {"ok": True, "task_group_id": task_group_id, "message": "Task group execution started"}
