from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Request

from app.schemas import (
    WideTableRow,
    WideTableRowBatchUpdateInput,
    WideTableRowUpdateInput,
)

router = APIRouter(tags=["wide_table_rows"])


def _repo(request: Request):
    return request.app.state.repository


@router.get(
    "/api/projects/{project_id}/requirements/{requirement_id}/rows",
    response_model=list[WideTableRow],
)
def list_requirement_rows(project_id: str, requirement_id: str, request: Request):
    repo = _repo(request)
    requirement = repo.get_requirement(project_id, requirement_id)
    if not requirement:
        raise HTTPException(status_code=404, detail="Requirement not found")
    return repo.list_requirement_rows(requirement_id)


@router.get("/api/wide-tables/{wide_table_id}/rows", response_model=list[WideTableRow])
def list_wide_table_rows(
    wide_table_id: str,
    request: Request,
    batch_id: str | None = Query(default=None),
):
    repo = _repo(request)
    wt = repo.get_wide_table(wide_table_id)
    if not wt:
        raise HTTPException(status_code=404, detail="Wide table not found")
    return repo.list_wide_table_rows(wide_table_id, batch_id=batch_id)


@router.put("/api/wide-tables/{wide_table_id}/rows/{row_id}", response_model=dict)
def update_wide_table_row(
    wide_table_id: str, row_id: int,
    body: WideTableRowUpdateInput, request: Request,
):
    repo = _repo(request)
    existing = repo.get_wide_table_row(wide_table_id, row_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Row not found")
    updates = body.model_dump(exclude_unset=True)
    if "indicator_values" in updates and updates["indicator_values"]:
        merged = {**existing.indicator_values}
        for key, patch in updates["indicator_values"].items():
            existing_cell = existing.indicator_values.get(key)
            if existing_cell is None:
                merged[key] = patch
                continue

            merged[key] = {
                **existing_cell.model_dump(mode="json"),
                **patch,
            }
        updates["indicator_values"] = merged
    repo.update_wide_table_row(wide_table_id, row_id, **updates)
    return {"ok": True}
