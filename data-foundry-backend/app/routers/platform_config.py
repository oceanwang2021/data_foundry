from __future__ import annotations

import uuid
from datetime import datetime
from fastapi import APIRouter, HTTPException, Request

from app.schemas import (
    AcceptanceTicket,
    AcceptanceTicketCreateInput,
    AcceptanceTicketUpdateInput,
    AuditRule,
    DashboardMetrics,
    DataLineage,
    KnowledgeBase,
    OpsOverview,
    PreprocessRule,
    PromptTemplate,
    StatusCount,
)
from app.database import connect_database, _drop_app_schema, _create_schema, _seed_if_empty, _write_schema_version, CURRENT_SCHEMA_VERSION

router = APIRouter(tags=["platform"])


def _repo(request: Request):
    return request.app.state.repository


# ---- Preprocess Rules ----

@router.get("/api/knowledge-bases", response_model=list[KnowledgeBase])
def list_knowledge_bases(request: Request):
    repo = _repo(request)
    rows = repo._fetchall("SELECT * FROM knowledge_bases ORDER BY name")
    return [
        KnowledgeBase(
            id=row["id"],
            name=row["name"],
            description=row["description"],
            document_count=row["document_count"],
            status=row["status"],
            last_updated=row["last_updated"],
        )
        for row in rows
    ]


@router.get("/api/preprocess-rules", response_model=list[PreprocessRule])
def list_preprocess_rules(request: Request):
    return _repo(request).list_preprocess_rules()


# ---- Audit Rules ----

@router.get("/api/audit-rules", response_model=list[AuditRule])
def list_audit_rules(request: Request):
    return _repo(request).list_audit_rules()


# ---- Acceptance Tickets ----

@router.get("/api/acceptance-tickets", response_model=list[AcceptanceTicket])
def list_acceptance_tickets(request: Request):
    return _repo(request).list_acceptance_tickets()


@router.post("/api/acceptance-tickets", response_model=AcceptanceTicket, status_code=201)
def create_acceptance_ticket(body: AcceptanceTicketCreateInput, request: Request):
    ticket = AcceptanceTicket(
        id=f"AC-{uuid.uuid4().hex[:6]}",
        dataset=body.dataset,
        requirement_id=body.requirement_id,
        status="rejected",
        owner=body.owner,
        feedback=body.feedback,
        latest_action_at=datetime.now().strftime("%Y-%m-%d %H:%M"),
    )
    _repo(request).create_acceptance_ticket(ticket)
    return ticket


@router.put("/api/acceptance-tickets/{ticket_id}", response_model=dict)
def update_acceptance_ticket(
    ticket_id: str, body: AcceptanceTicketUpdateInput, request: Request,
):
    updates = body.model_dump(exclude_unset=True)
    if updates:
        updates["latest_action_at"] = datetime.now().strftime("%Y-%m-%d %H:%M")
        _repo(request).update_acceptance_ticket(ticket_id, **updates)
    return {"ok": True}


# ---- Dashboard & Ops ----

@router.get("/api/dashboard/metrics", response_model=DashboardMetrics)
def dashboard_metrics(request: Request):
    repo = _repo(request)
    return DashboardMetrics(
        projects=repo.count_all_projects(),
        requirements=repo.count_all_requirements(),
        task_groups=repo.count_all_task_groups(),
        fetch_tasks=repo.count_all_fetch_tasks(),
        running_task_groups=repo.count_task_groups_by_status("running"),
        pending_backfills=repo.count_backfill_requests_by_status("pending"),
    )


@router.get("/api/ops/overview", response_model=list[OpsOverview])
def ops_overview(request: Request):
    repo = _repo(request)
    running = repo.count_task_groups_by_status("running")
    failed = repo.count_task_groups_by_status("failed") + repo.count_task_groups_by_status("invalidated")
    status = "healthy" if failed == 0 else ("warning" if failed < 3 else "error")
    return [
        OpsOverview(environment="demo", stage="Demo数据采集环境", status=status, running_tasks=running, failed_tasks=failed),
        OpsOverview(environment="production", stage="正式数据采集环境", status="healthy", running_tasks=0, failed_tasks=0),
    ]


@router.get("/api/ops/task-status-counts", response_model=list[StatusCount])
def task_status_counts(request: Request):
    repo = _repo(request)
    statuses = [
        ("待采集", "pending"), ("采集中", "running"),
        ("采集异常", "failed"), ("采集完成", "completed"),
    ]
    return [StatusCount(status=label, count=repo.count_task_groups_by_status(s)) for label, s in statuses]


@router.get("/api/ops/data-status-counts", response_model=list[StatusCount])
def data_status_counts(request: Request):
    # simplified: count rows by status
    repo = _repo(request)
    row = repo._fetchone("SELECT COUNT(*) AS c FROM wide_table_rows WHERE row_status = 'initialized'")
    init_count = int(row["c"]) if row else 0
    row = repo._fetchone("SELECT COUNT(*) AS c FROM wide_table_rows WHERE row_status IN ('collecting','partial')")
    proc_count = int(row["c"]) if row else 0
    row = repo._fetchone("SELECT COUNT(*) AS c FROM wide_table_rows WHERE row_status = 'completed'")
    done_count = int(row["c"]) if row else 0
    return [
        StatusCount(status="原始数据待处理", count=init_count),
        StatusCount(status="宽表待审核", count=proc_count),
        StatusCount(status="数据已回填", count=done_count),
    ]


# ---- Admin: Seed & Reset ----

@router.post("/api/admin/seed", response_model=dict)
def seed_demo_data(request: Request):
    """清空当前数据后重新填充演示数据。"""
    repo = _repo(request)
    with connect_database(repo.db_path) as conn:
        _drop_app_schema(conn)
        _create_schema(conn)
        _write_schema_version(conn, CURRENT_SCHEMA_VERSION)
        _seed_if_empty(conn)
        conn.commit()
    return {"ok": True, "message": "演示数据已重置"}


@router.post("/api/admin/reset", response_model=dict)
def reset_all_data(request: Request):
    """清空所有业务数据（保留表结构）。"""
    repo = _repo(request)
    with connect_database(repo.db_path) as conn:
        _drop_app_schema(conn)
        _create_schema(conn)
        _write_schema_version(conn, CURRENT_SCHEMA_VERSION)
        conn.commit()
    return {"ok": True, "message": "所有数据已清空"}
