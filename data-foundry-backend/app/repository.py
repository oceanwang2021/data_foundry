from __future__ import annotations

import json
import sqlite3
from datetime import datetime
from pathlib import Path

from app.database import connect_database, initialize_database, resolve_database_path
from app.schemas import (
    BackfillRequest,
    CollectionBatch,
    ExecutionRecord,
    FetchTask,
    IndicatorGroup,
    NarrowIndicatorRow,
    Project,
    Requirement,
    RequirementCollectionPolicy,
    RetrievalTask,
    ScheduleJob,
    ScheduleRule,
    TaskGroup,
    WideTable,
    WideTableRow,
    WideTableRowSnapshot,
    WideTableSchema,
    WideTableScope,
)


class DataFoundryRepository:
    def __init__(self, db_path: str | Path | None = None):
        self.db_path = resolve_database_path(db_path)

    def init_database(self) -> str:
        return initialize_database(self.db_path)

    def list_projects(self) -> list[Project]:
        rows = self._fetchall(
            """
            SELECT id, name, owner_team, description, status,
                   business_background, data_source_json, created_at
            FROM projects
            ORDER BY sort_order
            """
        )
        return [self._row_to_project(row) for row in rows]

    def get_project(self, project_id: str) -> Project | None:
        row = self._fetchone(
            """
            SELECT id, name, owner_team, description, status,
                   business_background, data_source_json, created_at
            FROM projects
            WHERE id = ?
            """,
            (project_id,),
        )
        return self._row_to_project(row) if row else None

    def list_requirements(self, project_id: str) -> list[Requirement]:
        rows = self._fetchall(
            """
            SELECT *
            FROM requirements
            WHERE project_id = ?
            ORDER BY sort_order
            """,
            (project_id,),
        )
        return [self._row_to_requirement(row) for row in rows]

    def get_requirement(self, project_id: str, requirement_id: str) -> Requirement | None:
        row = self._fetchone(
            """
            SELECT *
            FROM requirements
            WHERE project_id = ? AND id = ?
            """,
            (project_id, requirement_id),
        )
        return self._row_to_requirement(row) if row else None

    def count_current_requirement_rows(self, requirement_id: str) -> int:
        row = self._fetchone(
            """
            SELECT COUNT(*) AS row_count
            FROM wide_table_rows AS rows
            WHERE rows.requirement_id = ?
              AND rows.plan_version = (
                  SELECT MAX(current_rows.plan_version)
                  FROM wide_table_rows AS current_rows
                  WHERE current_rows.wide_table_id = rows.wide_table_id
              )
            """,
            (requirement_id,),
        )
        return int(row["row_count"]) if row else 0

    def count_task_groups(self, requirement_id: str) -> int:
        row = self._fetchone(
            """
            SELECT COUNT(*) AS group_count
            FROM task_groups
            WHERE requirement_id = ?
            """,
            (requirement_id,),
        )
        return int(row["group_count"]) if row else 0

    def count_backfill_requests(self, requirement_id: str) -> int:
        row = self._fetchone(
            """
            SELECT COUNT(*) AS request_count
            FROM backfill_requests
            WHERE requirement_id = ?
            """,
            (requirement_id,),
        )
        return int(row["request_count"]) if row else 0

    def list_requirement_rows(
        self,
        requirement_id: str,
        *,
        current_only: bool = True,
    ) -> list[WideTableRow]:
        if current_only:
            rows = self._fetchall(
                """
                SELECT rows.*
                FROM wide_table_rows AS rows
                WHERE rows.requirement_id = ?
                  AND rows.plan_version = (
                      SELECT MAX(current_rows.plan_version)
                      FROM wide_table_rows AS current_rows
                      WHERE current_rows.wide_table_id = rows.wide_table_id
                  )
                ORDER BY rows.sort_order
                """,
                (requirement_id,),
            )
        else:
            rows = self._fetchall(
                """
                SELECT *
                FROM wide_table_rows
                WHERE requirement_id = ?
                ORDER BY sort_order
                """,
                (requirement_id,),
            )
        return [self._row_to_requirement_row(row) for row in rows]

    def list_backfill_requests(self, requirement_id: str) -> list[BackfillRequest]:
        rows = self._fetchall(
            """
            SELECT *
            FROM backfill_requests
            WHERE requirement_id = ?
            ORDER BY sort_order
            """,
            (requirement_id,),
        )
        return [self._row_to_backfill_request(row) for row in rows]

    def list_task_groups(self, requirement_id: str) -> list[TaskGroup]:
        rows = self._fetchall(
            """
            SELECT *
            FROM task_groups
            WHERE requirement_id = ?
            ORDER BY sort_order
            """,
            (requirement_id,),
        )
        task_groups = [self._row_to_task_group(row) for row in rows]
        snapshot_rows_by_batch: dict[str, list[WideTableRow]] = {}
        enriched_task_groups: list[TaskGroup] = []

        for task_group in task_groups:
            if not task_group.batch_id:
                enriched_task_groups.append(task_group)
                continue

            if task_group.batch_id not in snapshot_rows_by_batch:
                snapshot_rows_by_batch[task_group.batch_id] = self.list_wide_table_rows(
                    task_group.wide_table_id,
                    batch_id=task_group.batch_id,
                )

            enriched_task_groups.append(
                task_group.model_copy(
                    update={"row_snapshots": snapshot_rows_by_batch[task_group.batch_id]},
                )
            )

        return enriched_task_groups

    def list_tasks(self, requirement_id: str) -> list[FetchTask]:
        rows = self._fetchall(
            """
            SELECT *
            FROM fetch_tasks
            WHERE requirement_id = ?
            ORDER BY sort_order
            """,
            (requirement_id,),
        )
        return [self._row_to_task(row) for row in rows]

    def get_task(self, requirement_id: str, task_id: str) -> FetchTask | None:
        row = self._fetchone(
            """
            SELECT *
            FROM fetch_tasks
            WHERE requirement_id = ? AND id = ?
            """,
            (requirement_id, task_id),
        )
        return self._row_to_task(row) if row else None

    def get_task_by_id(self, task_id: str) -> FetchTask | None:
        row = self._fetchone(
            """
            SELECT *
            FROM fetch_tasks
            WHERE id = ?
            """,
            (task_id,),
        )
        return self._row_to_task(row) if row else None

    def list_retrieval_tasks(self, task_id: str) -> list[RetrievalTask]:
        rows = self._fetchall(
            """
            SELECT *
            FROM retrieval_tasks
            WHERE parent_task_id = ?
            ORDER BY sort_order
            """,
            (task_id,),
        )
        return [self._row_to_retrieval_task(row) for row in rows]

    def list_execution_records(self, task_id: str) -> list[ExecutionRecord]:
        rows = self._fetchall(
            """
            SELECT *
            FROM execution_records
            WHERE task_id = ?
            ORDER BY sort_order
            """,
            (task_id,),
        )
        return [self._row_to_execution_record(row) for row in rows]

    # ==================== Create / Update / Delete ====================

    def create_project(self, project: Project) -> None:
        max_order = self._fetchone("SELECT COALESCE(MAX(sort_order), 0) AS m FROM projects")
        sort_order = (int(max_order["m"]) if max_order else 0) + 1
        now = _now_timestamp()
        with connect_database(self.db_path) as conn:
            conn.execute(
                """
                INSERT INTO projects (
                    id, sort_order, name, owner_team, description, status,
                    business_background, data_source_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    project.id, sort_order, project.name, project.owner_team,
                    project.description, project.status,
                    getattr(project, "business_background", None),
                    _to_json(getattr(project, "data_source", None)),
                    now,
                ),
            )
            conn.commit()

    def update_project(self, project_id: str, **kwargs: object) -> bool:
        sets, params = _build_update_clause(kwargs, {
            "name": "name", "owner_team": "owner_team",
            "description": "description", "status": "status",
            "business_background": "business_background",
        })
        if "data_source" in kwargs:
            sets.append("data_source_json = ?")
            params.append(_to_json(kwargs["data_source"]))
        if not sets:
            return False
        params.append(project_id)
        with connect_database(self.db_path) as conn:
            cursor = conn.execute(
                f"UPDATE projects SET {', '.join(sets)} WHERE id = ?", params,
            )
            conn.commit()
            return cursor.rowcount > 0

    def delete_project(self, project_id: str) -> bool:
        with connect_database(self.db_path) as conn:
            conn.execute("PRAGMA foreign_keys = ON")
            # cascade: delete requirements and downstream
            for req in self.list_requirements(project_id):
                self._delete_requirement_cascade(conn, req.id)
            cursor = conn.execute("DELETE FROM projects WHERE id = ?", (project_id,))
            conn.commit()
            return cursor.rowcount > 0

    def create_requirement(self, requirement: Requirement) -> None:
        max_order = self._fetchone(
            "SELECT COALESCE(MAX(sort_order), 0) AS m FROM requirements"
        )
        sort_order = (int(max_order["m"]) if max_order else 0) + 1
        now = _now_timestamp()
        with connect_database(self.db_path) as conn:
            conn.execute(
                """
                INSERT INTO requirements (
                    id, sort_order, project_id, title, phase,
                    parent_requirement_id, schema_locked, status,
                    owner, assignee, business_goal, background_knowledge,
                    business_boundary, delivery_scope,
                    data_update_enabled, data_update_mode,
                    processing_rule_drafts_json, collection_policy_json,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    requirement.id, sort_order, requirement.project_id,
                    requirement.title, requirement.phase,
                    requirement.parent_requirement_id,
                    int(requirement.schema_locked), requirement.status,
                    requirement.owner, requirement.assignee,
                    requirement.business_goal, requirement.background_knowledge,
                    getattr(requirement, "business_boundary", None),
                    getattr(requirement, "delivery_scope", None),
                    None if requirement.data_update_enabled is None else int(requirement.data_update_enabled),
                    getattr(requirement, "data_update_mode", None),
                    _to_json(getattr(requirement, "processing_rule_drafts", None)),
                    _to_json(requirement.collection_policy.model_dump(mode="json")),
                    now, now,
                ),
            )
            if requirement.wide_table is not None:
                self._insert_wide_table(conn, requirement.id, requirement.wide_table, 1)
            conn.commit()

    def update_requirement(self, requirement_id: str, **kwargs: object) -> bool:
        sets, params = _build_update_clause(kwargs, {
            "title": "title", "status": "status", "phase": "phase",
            "owner": "owner", "assignee": "assignee",
            "business_goal": "business_goal",
            "background_knowledge": "background_knowledge",
            "business_boundary": "business_boundary",
            "delivery_scope": "delivery_scope",
            "data_update_enabled": "data_update_enabled",
            "data_update_mode": "data_update_mode",
            "schema_locked": "schema_locked",
        })
        if "schema_locked" in kwargs:
            # convert bool to int for sqlite
            for i, s in enumerate(sets):
                if "schema_locked" in s:
                    params[i] = int(params[i])
        if "data_update_enabled" in kwargs:
            for i, s in enumerate(sets):
                if "data_update_enabled" in s and params[i] is not None:
                    params[i] = int(bool(params[i]))
        if "collection_policy" in kwargs:
            sets.append("collection_policy_json = ?")
            cp = kwargs["collection_policy"]
            params.append(_to_json(cp.model_dump(mode="json") if hasattr(cp, "model_dump") else cp))
        if "processing_rule_drafts" in kwargs:
            sets.append("processing_rule_drafts_json = ?")
            params.append(_to_json(kwargs["processing_rule_drafts"]))
        if not sets:
            return False
        sets.append("updated_at = ?")
        params.append(_now_timestamp())
        params.append(requirement_id)
        with connect_database(self.db_path) as conn:
            cursor = conn.execute(
                f"UPDATE requirements SET {', '.join(sets)} WHERE id = ?", params,
            )
            conn.commit()
            return cursor.rowcount > 0

    def delete_requirement(self, requirement_id: str) -> bool:
        with connect_database(self.db_path) as conn:
            self._delete_requirement_cascade(conn, requirement_id)
            conn.commit()
            return True

    def _delete_requirement_cascade(self, conn: sqlite3.Connection, requirement_id: str) -> None:
        conn.execute("DELETE FROM execution_records WHERE task_id IN (SELECT id FROM fetch_tasks WHERE requirement_id = ?)", (requirement_id,))
        conn.execute("DELETE FROM retrieval_tasks WHERE parent_task_id IN (SELECT id FROM fetch_tasks WHERE requirement_id = ?)", (requirement_id,))
        conn.execute("DELETE FROM fetch_tasks WHERE requirement_id = ?", (requirement_id,))
        conn.execute("DELETE FROM task_groups WHERE requirement_id = ?", (requirement_id,))
        conn.execute("DELETE FROM backfill_requests WHERE requirement_id = ?", (requirement_id,))
        conn.execute("DELETE FROM wide_table_row_snapshots WHERE batch_id IN (SELECT id FROM collection_batches WHERE requirement_id = ?)", (requirement_id,))
        conn.execute("DELETE FROM collection_batches WHERE requirement_id = ?", (requirement_id,))
        conn.execute("DELETE FROM wide_table_rows WHERE requirement_id = ?", (requirement_id,))
        conn.execute("DELETE FROM wide_tables WHERE requirement_id = ?", (requirement_id,))
        conn.execute("DELETE FROM requirements WHERE id = ?", (requirement_id,))

    # ---- Wide Table CRUD ----

    def get_wide_table(self, wide_table_id: str) -> WideTable | None:
        row = self._fetchone("SELECT * FROM wide_tables WHERE id = ?", (wide_table_id,))
        return self._row_to_wide_table(row) if row else None

    def list_wide_tables(self, requirement_id: str) -> list[WideTable]:
        wide_table = self._get_requirement_wide_table(requirement_id)
        return [wide_table] if wide_table else []

    def create_wide_table(self, requirement_id: str, wide_table: WideTable) -> None:
        existing_wide_table = self._get_requirement_wide_table(requirement_id)
        if existing_wide_table is not None:
            raise ValueError("requirement already defines a wide table")
        max_order = self._fetchone(
            "SELECT COALESCE(MAX(sort_order), 0) AS m FROM wide_tables WHERE requirement_id = ?",
            (requirement_id,),
        )
        sort_order = (int(max_order["m"]) if max_order else 0) + 1
        with connect_database(self.db_path) as conn:
            self._insert_wide_table(conn, requirement_id, wide_table, sort_order)
            conn.commit()

    def _insert_wide_table(self, conn: sqlite3.Connection, requirement_id: str, wt: WideTable, sort_order: int) -> None:
        now = _now_timestamp()
        conn.execute(
            """
            INSERT INTO wide_tables (
                id, sort_order, requirement_id, title, description, table_name,
                schema_version, schema_json, scope_json, indicator_groups_json,
                schedule_rules_json, semantic_time_axis, collection_coverage_mode,
                status, record_count, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                wt.id, sort_order, requirement_id, wt.title, wt.description,
                wt.table_schema.table_name, wt.table_schema.version,
                _to_json(wt.table_schema.model_dump(mode="json")),
                _to_json(wt.scope.model_dump(mode="json")),
                _to_json([g.model_dump(mode="json") for g in wt.indicator_groups]),
                _to_json([r.model_dump(mode="json") for r in wt.schedule_rules]),
                wt.semantic_time_axis,
                wt.collection_coverage_mode,
                wt.status, wt.record_count, wt.created_at or now, wt.updated_at or now,
            ),
        )

    def update_wide_table(self, wide_table_id: str, **kwargs: object) -> bool:
        sets: list[str] = []
        params: list[object] = []
        next_schema_version: int | None = None
        if "title" in kwargs:
            sets.append("title = ?")
            params.append(kwargs["title"])
        if "description" in kwargs:
            sets.append("description = ?")
            params.append(kwargs["description"])
        if "table_schema" in kwargs:
            schema = kwargs["table_schema"]
            current_schema_version_row = self._fetchone(
                "SELECT schema_version FROM wide_tables WHERE id = ?",
                (wide_table_id,),
            )
            current_schema_version = (
                int(current_schema_version_row["schema_version"])
                if current_schema_version_row is not None
                else 0
            )
            next_schema_version = current_schema_version + 1
            schema_payload = (
                schema.model_dump(mode="json")
                if hasattr(schema, "model_dump")
                else dict(schema)
            )
            schema_payload["version"] = next_schema_version
            sets.append("schema_json = ?")
            params.append(_to_json(schema_payload))
            sets.append("schema_version = ?")
            params.append(next_schema_version)
        if "scope" in kwargs:
            scope = kwargs["scope"]
            sets.append("scope_json = ?")
            params.append(_to_json(scope.model_dump(mode="json") if hasattr(scope, "model_dump") else scope))
        if "indicator_groups" in kwargs:
            sets.append("indicator_groups_json = ?")
            params.append(_to_json([g.model_dump(mode="json") if hasattr(g, "model_dump") else g for g in kwargs["indicator_groups"]]))
        if "schedule_rules" in kwargs:
            sets.append("schedule_rules_json = ?")
            params.append(_to_json([r.model_dump(mode="json") if hasattr(r, "model_dump") else r for r in kwargs["schedule_rules"]]))
        if "semantic_time_axis" in kwargs:
            sets.append("semantic_time_axis = ?")
            params.append(kwargs["semantic_time_axis"])
        if "collection_coverage_mode" in kwargs:
            sets.append("collection_coverage_mode = ?")
            params.append(kwargs["collection_coverage_mode"])
        if "status" in kwargs:
            sets.append("status = ?")
            params.append(kwargs["status"])
        if "record_count" in kwargs:
            sets.append("record_count = ?")
            params.append(kwargs["record_count"])
        if not sets:
            return False
        sets.append("updated_at = ?")
        params.append(_now_timestamp())
        params.append(wide_table_id)
        with connect_database(self.db_path) as conn:
            cursor = conn.execute(
                f"UPDATE wide_tables SET {', '.join(sets)} WHERE id = ?", params,
            )
            conn.commit()
            return cursor.rowcount > 0

    def delete_wide_table(self, wide_table_id: str) -> bool:
        with connect_database(self.db_path) as conn:
            conn.execute("DELETE FROM execution_records WHERE task_id IN (SELECT id FROM fetch_tasks WHERE wide_table_id = ?)", (wide_table_id,))
            conn.execute("DELETE FROM retrieval_tasks WHERE wide_table_id = ?", (wide_table_id,))
            conn.execute("DELETE FROM wide_table_row_snapshots WHERE wide_table_id = ?", (wide_table_id,))
            conn.execute("DELETE FROM fetch_tasks WHERE wide_table_id = ?", (wide_table_id,))
            conn.execute("DELETE FROM task_groups WHERE wide_table_id = ?", (wide_table_id,))
            conn.execute("DELETE FROM backfill_requests WHERE wide_table_id = ?", (wide_table_id,))
            conn.execute("DELETE FROM collection_batches WHERE wide_table_id = ?", (wide_table_id,))
            conn.execute("DELETE FROM wide_table_rows WHERE wide_table_id = ?", (wide_table_id,))
            cursor = conn.execute("DELETE FROM wide_tables WHERE id = ?", (wide_table_id,))
            conn.commit()
            return cursor.rowcount > 0

    # ---- Wide Table Rows ----

    def list_wide_table_rows(
        self,
        wide_table_id: str,
        *,
        batch_id: str | None = None,
    ) -> list[WideTableRow]:
        rows = self._fetchall(
            "SELECT * FROM wide_table_rows WHERE wide_table_id = ? ORDER BY sort_order",
            (wide_table_id,),
        )
        anchors = [self._row_to_requirement_row(row) for row in rows]
        if batch_id is None:
            return anchors

        snapshots = {
            snapshot.row_binding_key: snapshot
            for snapshot in self.list_wide_table_row_snapshots(batch_id)
        }
        resolved_rows: list[WideTableRow] = []
        for anchor in anchors:
            snapshot = snapshots.get(anchor.row_binding_key)
            if snapshot is None:
                resolved_rows.append(anchor)
                continue
            resolved_rows.append(
                anchor.model_copy(
                    update={
                        "business_date": snapshot.business_date,
                        "row_status": snapshot.row_status,
                        "dimension_values": snapshot.dimension_values,
                        "indicator_values": snapshot.indicator_values,
                        "system_values": snapshot.system_values,
                    }
                )
            )
        return resolved_rows

    def get_wide_table_row(self, wide_table_id: str, row_id: int) -> WideTableRow | None:
        row = self._fetchone(
            "SELECT * FROM wide_table_rows WHERE wide_table_id = ? AND row_id = ?",
            (wide_table_id, row_id),
        )
        return self._row_to_requirement_row(row) if row else None

    def save_wide_table_rows(self, rows: list[WideTableRow]) -> None:
        if not rows:
            return
        with connect_database(self.db_path) as conn:
            self._insert_wide_table_rows(conn, rows)
            conn.commit()

    def delete_orphan_wide_table_rows(
        self, wide_table_id: str, row_ids: list[int],
    ) -> None:
        """Delete rows that are no longer referenced by executable plan artifacts."""
        if not row_ids:
            return
        with connect_database(self.db_path) as conn:
            for row_id in row_ids:
                # Rows already linked to fetch tasks belong to an executed/persisted plan
                # and must be retained to keep downstream FK chains intact.
                has_fetch_task_deps = conn.execute(
                    """
                    SELECT 1 FROM fetch_tasks
                    WHERE wide_table_id = ? AND row_id = ?
                    LIMIT 1
                    """,
                    (wide_table_id, row_id),
                ).fetchone()
                if has_fetch_task_deps:
                    continue
                conn.execute(
                    """
                    DELETE FROM retrieval_tasks
                    WHERE wide_table_id = ? AND row_id = ?
                    """,
                    (wide_table_id, row_id),
                )
                conn.execute(
                    """
                    DELETE FROM wide_table_row_snapshots
                    WHERE wide_table_id = ? AND row_id = ?
                    """,
                    (wide_table_id, row_id),
                )
                conn.execute(
                    "DELETE FROM wide_table_rows WHERE wide_table_id = ? AND row_id = ?",
                    (wide_table_id, row_id),
                )
            conn.commit()

    def list_collection_batches(self, wide_table_id: str) -> list[CollectionBatch]:
        rows = self._fetchall(
            """
            SELECT *
            FROM collection_batches
            WHERE wide_table_id = ?
            ORDER BY sort_order
            """,
            (wide_table_id,),
        )
        return [self._row_to_collection_batch(row) for row in rows]

    def get_collection_batch(self, batch_id: str) -> CollectionBatch | None:
        row = self._fetchone(
            "SELECT * FROM collection_batches WHERE id = ?",
            (batch_id,),
        )
        return self._row_to_collection_batch(row) if row else None

    def get_current_collection_batch(self, wide_table_id: str) -> CollectionBatch | None:
        row = self._fetchone(
            """
            SELECT *
            FROM collection_batches
            WHERE wide_table_id = ? AND is_current = 1
            ORDER BY sort_order DESC
            LIMIT 1
            """,
            (wide_table_id,),
        )
        return self._row_to_collection_batch(row) if row else None

    def save_collection_batches(self, batches: list[CollectionBatch]) -> None:
        if not batches:
            return
        with connect_database(self.db_path) as conn:
            self._insert_collection_batches(conn, batches)
            conn.commit()

    def update_collection_batch(self, batch_id: str, **kwargs: object) -> bool:
        sets: list[str] = []
        params: list[object] = []
        for key in (
            "status",
            "snapshot_label",
            "plan_version",
            "triggered_by",
            "start_business_date",
            "end_business_date",
        ):
            if key not in kwargs:
                continue
            sets.append(f"{key} = ?")
            params.append(kwargs[key])
        if "is_current" in kwargs:
            sets.append("is_current = ?")
            params.append(int(bool(kwargs["is_current"])))
        if not sets:
            return False
        sets.append("updated_at = ?")
        params.append(_now_timestamp())
        params.append(batch_id)
        with connect_database(self.db_path) as conn:
            if "is_current" in kwargs and kwargs["is_current"]:
                wide_table_id_row = conn.execute(
                    "SELECT wide_table_id FROM collection_batches WHERE id = ?",
                    (batch_id,),
                ).fetchone()
                if wide_table_id_row is not None:
                    conn.execute(
                        "UPDATE collection_batches SET is_current = 0 WHERE wide_table_id = ?",
                        (wide_table_id_row["wide_table_id"],),
                    )
            cursor = conn.execute(
                f"UPDATE collection_batches SET {', '.join(sets)} WHERE id = ?",
                params,
            )
            conn.commit()
            return cursor.rowcount > 0

    def save_wide_table_row_snapshots(self, snapshots: list[WideTableRowSnapshot]) -> None:
        if not snapshots:
            return
        with connect_database(self.db_path) as conn:
            self._insert_wide_table_row_snapshots(conn, snapshots)
            conn.commit()

    def list_wide_table_row_snapshots(self, batch_id: str) -> list[WideTableRowSnapshot]:
        rows = self._fetchall(
            """
            SELECT *
            FROM wide_table_row_snapshots
            WHERE batch_id = ?
            ORDER BY row_id
            """,
            (batch_id,),
        )
        return [self._row_to_wide_table_row_snapshot(row) for row in rows]

    def replace_wide_table_rows(self, wide_table_id: str, rows: list[WideTableRow]) -> None:
        with connect_database(self.db_path) as conn:
            conn.execute("DELETE FROM wide_table_rows WHERE wide_table_id = ?", (wide_table_id,))
            self._insert_wide_table_rows(conn, rows)
            conn.commit()

    def replace_wide_table_plan(
        self,
        wide_table_id: str,
        rows: list[WideTableRow],
        task_groups: list[TaskGroup],
        tasks: list[FetchTask],
    ) -> None:
        with connect_database(self.db_path) as conn:
            conn.execute(
                """
                DELETE FROM execution_records
                WHERE task_id IN (SELECT id FROM fetch_tasks WHERE wide_table_id = ?)
                """,
                (wide_table_id,),
            )
            conn.execute("DELETE FROM retrieval_tasks WHERE wide_table_id = ?", (wide_table_id,))
            conn.execute(
                """
                DELETE FROM schedule_jobs
                WHERE task_group_id IN (SELECT id FROM task_groups WHERE wide_table_id = ?)
                """,
                (wide_table_id,),
            )
            conn.execute("DELETE FROM fetch_tasks WHERE wide_table_id = ?", (wide_table_id,))
            conn.execute("DELETE FROM task_groups WHERE wide_table_id = ?", (wide_table_id,))
            conn.execute("DELETE FROM backfill_requests WHERE wide_table_id = ?", (wide_table_id,))
            conn.execute("DELETE FROM wide_table_row_snapshots WHERE wide_table_id = ?", (wide_table_id,))
            conn.execute("DELETE FROM collection_batches WHERE wide_table_id = ?", (wide_table_id,))
            conn.execute("DELETE FROM wide_table_rows WHERE wide_table_id = ?", (wide_table_id,))
            self._insert_wide_table_rows(conn, rows)
            self._insert_task_groups(conn, task_groups)
            self._insert_fetch_tasks(conn, tasks)
            conn.commit()

    def update_wide_table_row(self, wide_table_id: str, row_id: int, **kwargs: object) -> bool:
        sets: list[str] = []
        params: list[object] = []
        if "indicator_values" in kwargs:
            sets.append("indicator_values_json = ?")
            params.append(_to_json(kwargs["indicator_values"]))
        if "row_status" in kwargs:
            sets.append("row_status = ?")
            params.append(kwargs["row_status"])
        if "system_values" in kwargs:
            sets.append("system_values_json = ?")
            params.append(_to_json(kwargs["system_values"]))
        if not sets:
            return False
        params.extend([wide_table_id, row_id])
        with connect_database(self.db_path) as conn:
            cursor = conn.execute(
                f"UPDATE wide_table_rows SET {', '.join(sets)} WHERE wide_table_id = ? AND row_id = ?",
                params,
            )
            conn.commit()
            return cursor.rowcount > 0

    def save_wide_table_row(self, row: WideTableRow) -> None:
        self.update_wide_table_row(
            row.wide_table_id, row.row_id,
            indicator_values=row.indicator_values,
            row_status=row.row_status,
            system_values=row.system_values,
        )

    # ---- Task Groups ----

    def save_task_groups(self, task_groups: list[TaskGroup]) -> None:
        if not task_groups:
            return
        with connect_database(self.db_path) as conn:
            self._insert_task_groups(conn, task_groups)
            conn.commit()

    def replace_task_plan(
        self,
        wide_table_id: str,
        plan_version: int,
        task_groups: list[TaskGroup],
        tasks: list[FetchTask],
    ) -> None:
        with connect_database(self.db_path) as conn:
            conn.execute(
                """
                DELETE FROM execution_records
                WHERE task_id IN (
                    SELECT id FROM fetch_tasks WHERE wide_table_id = ? AND plan_version = ?
                )
                """,
                (wide_table_id, plan_version),
            )
            conn.execute(
                """
                DELETE FROM retrieval_tasks
                WHERE parent_task_id IN (
                    SELECT id FROM fetch_tasks WHERE wide_table_id = ? AND plan_version = ?
                )
                """,
                (wide_table_id, plan_version),
            )
            conn.execute(
                """
                DELETE FROM schedule_jobs
                WHERE task_group_id IN (
                    SELECT id FROM task_groups WHERE wide_table_id = ? AND plan_version = ?
                )
                """,
                (wide_table_id, plan_version),
            )
            conn.execute(
                "DELETE FROM fetch_tasks WHERE wide_table_id = ? AND plan_version = ?",
                (wide_table_id, plan_version),
            )
            conn.execute(
                "DELETE FROM task_groups WHERE wide_table_id = ? AND plan_version = ?",
                (wide_table_id, plan_version),
            )
            self._insert_task_groups(conn, task_groups)
            self._insert_fetch_tasks(conn, tasks)
            conn.commit()

    def update_task_group(self, task_group_id: str, **kwargs: object) -> bool:
        sets, params = _build_update_clause(kwargs, {
            "status": "status", "total_tasks": "total_tasks",
            "completed_tasks": "completed_tasks", "failed_tasks": "failed_tasks",
        })
        if not sets:
            return False
        params.append(task_group_id)
        with connect_database(self.db_path) as conn:
            cursor = conn.execute(
                f"UPDATE task_groups SET {', '.join(sets)} WHERE id = ?", params,
            )
            conn.commit()
            return cursor.rowcount > 0

    def get_task_group(self, task_group_id: str) -> TaskGroup | None:
        row = self._fetchone("SELECT * FROM task_groups WHERE id = ?", (task_group_id,))
        return self._row_to_task_group(row) if row else None

    # ---- Fetch Tasks ----

    def save_fetch_tasks(self, tasks: list[FetchTask]) -> None:
        if not tasks:
            return
        with connect_database(self.db_path) as conn:
            self._insert_fetch_tasks(conn, tasks)
            conn.commit()

    def save_task(self, task: FetchTask) -> None:
        with connect_database(self.db_path) as conn:
            conn.execute(
                "UPDATE fetch_tasks SET status = ?, can_rerun = ? WHERE id = ?",
                (task.status, int(task.can_rerun), task.id),
            )
            conn.commit()

    def update_fetch_task(self, task_id: str, **kwargs: object) -> bool:
        sets, params = _build_update_clause(kwargs, {
            "status": "status", "confidence": "confidence",
        })
        if "can_rerun" in kwargs:
            sets.append("can_rerun = ?")
            params.append(int(kwargs["can_rerun"]))
        if not sets:
            return False
        params.append(task_id)
        with connect_database(self.db_path) as conn:
            cursor = conn.execute(
                f"UPDATE fetch_tasks SET {', '.join(sets)} WHERE id = ?", params,
            )
            conn.commit()
            return cursor.rowcount > 0

    def list_tasks_by_task_group(self, task_group_id: str) -> list[FetchTask]:
        rows = self._fetchall(
            "SELECT * FROM fetch_tasks WHERE task_group_id = ? ORDER BY sort_order",
            (task_group_id,),
        )
        return [self._row_to_task(row) for row in rows]

    def _insert_wide_table_rows(
        self,
        conn: sqlite3.Connection,
        rows: list[WideTableRow],
    ) -> None:
        if not rows:
            return
        sort_order = self._next_sort_order(conn, "wide_table_rows")
        for row in rows:
            conn.execute(
                """
                INSERT INTO wide_table_rows (
                    wide_table_id, row_id, sort_order, requirement_id,
                    schema_version, plan_version, row_status,
                    dimension_values_json, business_date, row_binding_key,
                    indicator_values_json, system_values_json, metadata_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(wide_table_id, row_id) DO UPDATE SET
                    sort_order = excluded.sort_order,
                    requirement_id = excluded.requirement_id,
                    schema_version = excluded.schema_version,
                    plan_version = excluded.plan_version,
                    row_status = excluded.row_status,
                    dimension_values_json = excluded.dimension_values_json,
                    business_date = excluded.business_date,
                    row_binding_key = excluded.row_binding_key,
                    indicator_values_json = excluded.indicator_values_json,
                    system_values_json = excluded.system_values_json,
                    metadata_json = excluded.metadata_json
                """,
                (
                    row.wide_table_id,
                    row.row_id,
                    sort_order,
                    row.requirement_id,
                    row.schema_version,
                    row.plan_version,
                    row.row_status,
                    _to_json(row.dimension_values),
                    row.business_date,
                    row.row_binding_key,
                    _to_json(row.indicator_values),
                    _to_json(row.system_values),
                    "{}",
                ),
            )
            sort_order += 1

    def _insert_collection_batches(
        self,
        conn: sqlite3.Connection,
        batches: list[CollectionBatch],
    ) -> None:
        if not batches:
            return
        sort_order = self._next_sort_order(conn, "collection_batches")
        for batch in batches:
            if batch.is_current:
                conn.execute(
                    "UPDATE collection_batches SET is_current = 0 WHERE wide_table_id = ?",
                    (batch.wide_table_id,),
                )
            conn.execute(
                """
                INSERT OR REPLACE INTO collection_batches (
                    id, sort_order, requirement_id, wide_table_id,
                    snapshot_at, snapshot_label, coverage_mode, semantic_time_axis,
                    status, is_current, plan_version, triggered_by,
                    start_business_date, end_business_date, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    batch.id,
                    sort_order,
                    batch.requirement_id,
                    batch.wide_table_id,
                    batch.snapshot_at,
                    batch.snapshot_label,
                    batch.coverage_mode,
                    batch.semantic_time_axis,
                    batch.status,
                    int(batch.is_current),
                    batch.plan_version,
                    batch.triggered_by,
                    batch.start_business_date,
                    batch.end_business_date,
                    batch.created_at or "",
                    batch.updated_at or "",
                ),
            )
            sort_order += 1

    def _insert_wide_table_row_snapshots(
        self,
        conn: sqlite3.Connection,
        snapshots: list[WideTableRowSnapshot],
    ) -> None:
        for snapshot in snapshots:
            conn.execute(
                """
                INSERT OR REPLACE INTO wide_table_row_snapshots (
                    batch_id, wide_table_id, row_id, row_binding_key,
                    business_date, row_status, dimension_values_json,
                    indicator_values_json, system_values_json,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    snapshot.batch_id,
                    snapshot.wide_table_id,
                    snapshot.row_id,
                    snapshot.row_binding_key,
                    snapshot.business_date,
                    snapshot.row_status,
                    _to_json(snapshot.dimension_values),
                    _to_json(snapshot.indicator_values),
                    _to_json(snapshot.system_values),
                    snapshot.created_at or "",
                    snapshot.updated_at or "",
                ),
            )

    def _insert_task_groups(
        self,
        conn: sqlite3.Connection,
        task_groups: list[TaskGroup],
    ) -> None:
        if not task_groups:
            return
        sort_order = self._next_sort_order(conn, "task_groups")
        for task_group in task_groups:
            conn.execute(
                """
                INSERT OR REPLACE INTO task_groups (
                    id, sort_order, requirement_id, wide_table_id,
                    batch_id, business_date, source_type, status,
                    schedule_rule_id, backfill_request_id,
                    plan_version, group_kind, partition_type, partition_key, partition_label, total_tasks,
                    completed_tasks, failed_tasks, triggered_by,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    task_group.id,
                    sort_order,
                    task_group.requirement_id,
                    task_group.wide_table_id,
                    task_group.batch_id,
                    task_group.business_date,
                    task_group.source_type,
                    task_group.status,
                    task_group.schedule_rule_id,
                    task_group.backfill_request_id,
                    task_group.plan_version,
                    task_group.group_kind,
                    task_group.partition_type,
                    task_group.partition_key,
                    task_group.partition_label,
                    task_group.total_tasks,
                    task_group.completed_tasks,
                    task_group.failed_tasks,
                    task_group.triggered_by,
                    task_group.created_at or "",
                    task_group.updated_at or "",
                ),
            )
            sort_order += 1

    def _insert_fetch_tasks(
        self,
        conn: sqlite3.Connection,
        tasks: list[FetchTask],
    ) -> None:
        if not tasks:
            return
        sort_order = self._next_sort_order(conn, "fetch_tasks")
        for task in tasks:
            conn.execute(
                """
                INSERT OR REPLACE INTO fetch_tasks (
                    id, sort_order, requirement_id, wide_table_id,
                    task_group_id, batch_id, row_id, indicator_group_id,
                    indicator_group_name, name, schema_version,
                    execution_mode, indicator_keys_json,
                    dimension_values_json, business_date, status,
                    can_rerun, invalidated_reason, owner,
                    confidence, plan_version, row_binding_key,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    task.id,
                    sort_order,
                    task.requirement_id,
                    task.wide_table_id,
                    task.task_group_id,
                    task.batch_id,
                    task.row_id,
                    task.indicator_group_id,
                    task.name,
                    task.name,
                    task.schema_version,
                    task.execution_mode,
                    _to_json(task.indicator_keys),
                    _to_json(task.dimension_values),
                    task.business_date,
                    task.status,
                    int(task.can_rerun),
                    task.invalidated_reason,
                    task.owner,
                    None,
                    task.plan_version,
                    task.row_binding_key,
                    task.created_at or "",
                    task.updated_at or "",
                ),
            )
            sort_order += 1

    @staticmethod
    def _next_sort_order(conn: sqlite3.Connection, table_name: str) -> int:
        max_order_row = conn.execute(
            f"SELECT COALESCE(MAX(sort_order), 0) AS m FROM {table_name}"
        ).fetchone()
        return (int(max_order_row["m"]) if max_order_row else 0) + 1

    # ---- Execution Records ----

    def save_execution_record(self, record: ExecutionRecord) -> None:
        with connect_database(self.db_path) as conn:
            max_order_row = conn.execute("SELECT COALESCE(MAX(sort_order), 0) AS m FROM execution_records").fetchone()
            sort_order = (int(max_order_row["m"]) if max_order_row else 0) + 1
            conn.execute(
                """
                INSERT OR REPLACE INTO execution_records (
                    id, sort_order, task_id, trigger_type, status,
                    started_at, ended_at, operator, output_ref, log_ref
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record.id, sort_order, record.task_id,
                    record.trigger_type, record.status,
                    record.started_at, record.ended_at,
                    record.operator, record.output_ref, record.log_ref,
                ),
            )
            conn.commit()

    # ---- Retrieval Tasks ----

    def save_retrieval_task(self, task: RetrievalTask) -> None:
        with connect_database(self.db_path) as conn:
            max_order_row = conn.execute("SELECT COALESCE(MAX(sort_order), 0) AS m FROM retrieval_tasks").fetchone()
            sort_order = (int(max_order_row["m"]) if max_order_row else 0) + 1
            conn.execute(
                """
                INSERT OR REPLACE INTO retrieval_tasks (
                    id, sort_order, parent_task_id, wide_table_id, row_id,
                    name, indicator_key, query, status, confidence, narrow_row_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    task.id, sort_order, task.parent_task_id,
                    task.wide_table_id, task.row_id, task.name,
                    task.indicator_key, task.query, task.status,
                    task.confidence,
                    _to_json(task.narrow_row.model_dump(mode="json")),
                ),
            )
            conn.commit()

    # ---- Backfill Requests ----

    def create_backfill_request(self, request: BackfillRequest) -> None:
        max_order = self._fetchone("SELECT COALESCE(MAX(sort_order), 0) AS m FROM backfill_requests")
        sort_order = (int(max_order["m"]) if max_order else 0) + 1
        with connect_database(self.db_path) as conn:
            conn.execute(
                """
                INSERT INTO backfill_requests (
                    id, sort_order, requirement_id, wide_table_id,
                    start_business_date, end_business_date,
                    requested_by, origin, status, reason,
                    task_group_ids_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    request.id, sort_order, request.requirement_id,
                    request.wide_table_id, request.start_business_date,
                    request.end_business_date, request.requested_by,
                    request.origin, request.status, request.reason,
                    "[]", "",
                ),
            )
            conn.commit()

    def update_backfill_request(self, request_id: str, **kwargs: object) -> bool:
        sets, params = _build_update_clause(kwargs, {"status": "status", "reason": "reason"})
        if "task_group_ids" in kwargs:
            sets.append("task_group_ids_json = ?")
            params.append(_to_json(kwargs["task_group_ids"]))
        if not sets:
            return False
        params.append(request_id)
        with connect_database(self.db_path) as conn:
            cursor = conn.execute(
                f"UPDATE backfill_requests SET {', '.join(sets)} WHERE id = ?", params,
            )
            conn.commit()
            return cursor.rowcount > 0

    # ---- Platform Config Tables ----

    def list_preprocess_rules(self) -> list["PreprocessRule"]:
        from app.schemas import PreprocessRule
        rows = self._fetchall("SELECT * FROM preprocess_rules ORDER BY id")
        return [PreprocessRule(
            id=r["id"], name=r["name"], source=r["source"],
            enabled=bool(r["enabled"]), category=r["category"],
            expression=r["expression"], sample_issue=r["sample_issue"],
            indicator_bindings=_from_json(r["indicator_bindings_json"]),
            filling_config=_from_json(r["filling_config_json"]) if r["filling_config_json"] else None,
        ) for r in rows]

    def list_audit_rules(self) -> list["AuditRule"]:
        from app.schemas import AuditRule
        rows = self._fetchall("SELECT * FROM audit_rules ORDER BY id")
        return [AuditRule(
            id=r["id"], name=r["name"], mode=r["mode"],
            scenario_rigour=r["scenario_rigour"],
            condition_expr=r["condition_expr"], action_text=r["action_text"],
            enabled=bool(r["enabled"]),
        ) for r in rows]

    def list_acceptance_tickets(self) -> list["AcceptanceTicket"]:
        from app.schemas import AcceptanceTicket
        rows = self._fetchall("SELECT * FROM acceptance_tickets ORDER BY latest_action_at DESC")
        return [AcceptanceTicket(
            id=r["id"], dataset=r["dataset"], requirement_id=r["requirement_id"],
            status=r["status"], owner=r["owner"], feedback=r["feedback"],
            latest_action_at=r["latest_action_at"],
        ) for r in rows]

    def create_acceptance_ticket(self, ticket: "AcceptanceTicket") -> None:
        with connect_database(self.db_path) as conn:
            conn.execute(
                """
                INSERT INTO acceptance_tickets (id, dataset, requirement_id, status, owner, feedback, latest_action_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (ticket.id, ticket.dataset, ticket.requirement_id, ticket.status,
                 ticket.owner, ticket.feedback, ticket.latest_action_at),
            )
            conn.commit()

    def update_acceptance_ticket(self, ticket_id: str, **kwargs: object) -> bool:
        sets, params = _build_update_clause(kwargs, {
            "status": "status", "feedback": "feedback", "latest_action_at": "latest_action_at",
        })
        if not sets:
            return False
        params.append(ticket_id)
        with connect_database(self.db_path) as conn:
            cursor = conn.execute(
                f"UPDATE acceptance_tickets SET {', '.join(sets)} WHERE id = ?", params,
            )
            conn.commit()
            return cursor.rowcount > 0

    def count_all_projects(self) -> int:
        row = self._fetchone("SELECT COUNT(*) AS c FROM projects")
        return int(row["c"]) if row else 0

    def count_all_requirements(self) -> int:
        row = self._fetchone("SELECT COUNT(*) AS c FROM requirements")
        return int(row["c"]) if row else 0

    def count_all_task_groups(self) -> int:
        row = self._fetchone("SELECT COUNT(*) AS c FROM task_groups")
        return int(row["c"]) if row else 0

    def count_all_fetch_tasks(self) -> int:
        row = self._fetchone("SELECT COUNT(*) AS c FROM fetch_tasks")
        return int(row["c"]) if row else 0

    def count_task_groups_by_status(self, status: str) -> int:
        row = self._fetchone("SELECT COUNT(*) AS c FROM task_groups WHERE status = ?", (status,))
        return int(row["c"]) if row else 0

    def count_backfill_requests_by_status(self, status: str) -> int:
        row = self._fetchone("SELECT COUNT(*) AS c FROM backfill_requests WHERE status = ?", (status,))
        return int(row["c"]) if row else 0

    def get_system_setting(self, key: str) -> object | None:
        row = self._fetchone(
            "SELECT value_json FROM system_settings WHERE key = ?",
            (key,),
        )
        if row is None:
            return None
        return _from_json(row["value_json"])

    def set_system_setting(self, key: str, value: object) -> None:
        with connect_database(self.db_path) as conn:
            conn.execute(
                """
                INSERT INTO system_settings (key, value_json, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET
                    value_json = excluded.value_json,
                    updated_at = excluded.updated_at
                """,
                (key, _to_json(value), _now_timestamp()),
            )
            conn.commit()

    # --- ScheduleJob methods ---

    def save_schedule_job(self, job: "ScheduleJob") -> None:
        with connect_database(self.db_path) as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO schedule_jobs
                    (id, sort_order, task_group_id, wide_table_id, trigger_type, status, started_at, ended_at, operator, log_ref)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    job.id,
                    0,
                    job.task_group_id,
                    job.wide_table_id,
                    job.trigger_type,
                    job.status,
                    job.started_at,
                    job.ended_at,
                    job.operator,
                    job.log_ref,
                ),
            )
            conn.commit()

    def update_schedule_job(self, job_id: str, **kwargs: object) -> bool:
        sets, params = _build_update_clause(kwargs, {
            "status": "status",
            "ended_at": "ended_at",
            "log_ref": "log_ref",
            "operator": "operator",
            "wide_table_id": "wide_table_id",
        })
        if not sets:
            return False
        params.append(job_id)
        with connect_database(self.db_path) as conn:
            cursor = conn.execute(
                f"UPDATE schedule_jobs SET {', '.join(sets)} WHERE id = ?", params,
            )
            conn.commit()
            return cursor.rowcount > 0

    def list_schedule_jobs(
        self, trigger_type: str | None = None, status: str | None = None
    ) -> list["ScheduleJob"]:
        clauses: list[str] = []
        params: list[object] = []
        if trigger_type:
            clauses.append("trigger_type = ?")
            params.append(trigger_type)
        if status:
            clauses.append("status = ?")
            params.append(status)
        where = f" WHERE {' AND '.join(clauses)}" if clauses else ""
        rows = self._fetchall(f"SELECT * FROM schedule_jobs{where} ORDER BY started_at DESC", tuple(params))
        return [self._row_to_schedule_job(r) for r in rows]

    def get_schedule_job(self, job_id: str) -> "ScheduleJob | None":
        row = self._fetchone("SELECT * FROM schedule_jobs WHERE id = ?", (job_id,))
        return self._row_to_schedule_job(row) if row else None

    def find_task_group_by_date(self, wide_table_id: str, business_date: str) -> "TaskGroup | None":
        row = self._fetchone(
            "SELECT * FROM task_groups WHERE wide_table_id = ? AND business_date = ? LIMIT 1",
            (wide_table_id, business_date),
        )
        return self._row_to_task_group(row) if row else None

    def count_running_tasks(self) -> int:
        row = self._fetchone("SELECT COUNT(*) AS c FROM fetch_tasks WHERE status = 'running'")
        return int(row["c"]) if row else 0

    @staticmethod
    def _row_to_schedule_job(row: sqlite3.Row) -> "ScheduleJob":
        return ScheduleJob(
            id=row["id"],
            task_group_id=row["task_group_id"],
            wide_table_id=row["wide_table_id"],
            trigger_type=row["trigger_type"],
            status=row["status"],
            started_at=row["started_at"],
            ended_at=row["ended_at"],
            operator=row["operator"],
            log_ref=row["log_ref"],
        )

    def _get_requirement_wide_table(self, requirement_id: str) -> WideTable | None:
        rows = self._fetchall(
            """
            SELECT *
            FROM wide_tables
            WHERE requirement_id = ?
            ORDER BY sort_order
            """,
            (requirement_id,),
        )
        if not rows:
            return None
        return self._row_to_wide_table(rows[0])

    def _fetchall(
        self,
        query: str,
        parameters: tuple[object, ...] = (),
    ) -> list[sqlite3.Row]:
        with connect_database(self.db_path) as connection:
            return connection.execute(query, parameters).fetchall()

    def _fetchone(
        self,
        query: str,
        parameters: tuple[object, ...] = (),
    ) -> sqlite3.Row | None:
        with connect_database(self.db_path) as connection:
            return connection.execute(query, parameters).fetchone()

    @staticmethod
    def _normalize_indicator_groups(
        table_schema: WideTableSchema,
        indicator_groups: list[IndicatorGroup],
    ) -> list[IndicatorGroup]:
        indicator_columns = {
            column.key: column for column in table_schema.indicator_columns
        }
        normalized_groups: list[IndicatorGroup] = []
        covered_keys: set[str] = set()

        for group in indicator_groups:
            next_keys: list[str] = []
            for key in group.indicator_keys:
                if key not in indicator_columns or key in covered_keys:
                    continue
                next_keys.append(key)
                covered_keys.add(key)
            if not next_keys:
                continue
            if next_keys == group.indicator_keys:
                normalized_groups.append(group)
                continue
            normalized_groups.append(group.model_copy(update={"indicator_keys": next_keys}))

        if len(covered_keys) == len(indicator_columns):
            return normalized_groups

        fallback_priority = (
            max((group.priority for group in normalized_groups), default=0) + 1
        )
        for column in table_schema.indicator_columns:
            if column.key in covered_keys:
                continue
            normalized_groups.append(
                IndicatorGroup(
                    id=f"IG-AUTO-{column.key.upper().replace('-', '_')}",
                    name=f"{column.name}指标组",
                    indicator_keys=[column.key],
                    execution_mode="agent",
                    description="历史宽表定义缺失该指标分组，系统已自动补齐。",
                    priority=fallback_priority,
                )
            )
            fallback_priority += 1
        return normalized_groups

    @staticmethod
    def _row_to_project(row: sqlite3.Row) -> Project:
        data_source = None
        data_source_json = row["data_source_json"] if "data_source_json" in row.keys() else None
        if data_source_json:
            data_source = json.loads(data_source_json)
        return Project(
            id=row["id"],
            name=row["name"],
            owner_team=row["owner_team"],
            description=row["description"],
            status=row["status"],
            business_background=row["business_background"] if "business_background" in row.keys() else None,
            data_source=data_source,
            created_at=row["created_at"] if "created_at" in row.keys() else None,
        )

    def _row_to_requirement(self, row: sqlite3.Row) -> Requirement:
        phase = row["phase"]
        # Demo 阶段已取消：历史数据中的 demo 一律按 production 处理。
        if phase == "demo":
            phase = "production"

        schema_locked = bool(row["schema_locked"])
        status = row["status"]
        # 进入运行态后必须锁定 Schema；对历史数据做兜底修正。
        if status in ("running", "stabilized") and not schema_locked:
            schema_locked = True

        return Requirement(
            id=row["id"],
            project_id=row["project_id"],
            title=row["title"],
            phase=phase,
            parent_requirement_id=row["parent_requirement_id"],
            schema_locked=schema_locked,
            status=status,
            owner=row["owner"],
            assignee=row["assignee"],
            business_goal=row["business_goal"],
            background_knowledge=row["background_knowledge"],
            wide_table=self._get_requirement_wide_table(row["id"]),
            collection_policy=RequirementCollectionPolicy.model_validate(
                _from_json(row["collection_policy_json"])
            ),
            business_boundary=row["business_boundary"] if "business_boundary" in row.keys() else None,
            delivery_scope=row["delivery_scope"] if "delivery_scope" in row.keys() else None,
            data_update_enabled=(
                bool(row["data_update_enabled"])
                if "data_update_enabled" in row.keys() and row["data_update_enabled"] is not None
                else None
            ),
            data_update_mode=row["data_update_mode"] if "data_update_mode" in row.keys() else None,
            processing_rule_drafts=_from_json(row["processing_rule_drafts_json"]) or []
            if "processing_rule_drafts_json" in row.keys() and row["processing_rule_drafts_json"]
            else [],
            created_at=row["created_at"] if "created_at" in row.keys() else None,
            updated_at=row["updated_at"] if "updated_at" in row.keys() else None,
        )

    @staticmethod
    def _row_to_wide_table(row: sqlite3.Row) -> WideTable:
        table_schema = WideTableSchema.model_validate(_from_json(row["schema_json"]))
        indicator_groups = [
            IndicatorGroup.model_validate(item)
            for item in _from_json(row["indicator_groups_json"])
        ]
        return WideTable(
            id=row["id"],
            title=row["title"],
            description=row["description"],
            schema=table_schema,
            scope=WideTableScope.model_validate(_from_json(row["scope_json"])),
            indicator_groups=DataFoundryRepository._normalize_indicator_groups(
                table_schema,
                indicator_groups,
            ),
            schedule_rules=[
                ScheduleRule.model_validate(item)
                for item in _from_json(row["schedule_rules_json"])
            ],
            semantic_time_axis=row["semantic_time_axis"] if "semantic_time_axis" in row.keys() else "business_date",
            collection_coverage_mode=row["collection_coverage_mode"] if "collection_coverage_mode" in row.keys() else "incremental_by_business_date",
            status=row["status"] if "status" in row.keys() else "draft",
            record_count=row["record_count"] if "record_count" in row.keys() else 0,
            created_at=row["created_at"] if "created_at" in row.keys() else None,
            updated_at=row["updated_at"] if "updated_at" in row.keys() else None,
        )

    @staticmethod
    def _row_to_requirement_row(row: sqlite3.Row) -> WideTableRow:
        return WideTableRow.model_validate(
            {
                "row_id": row["row_id"],
                "requirement_id": row["requirement_id"],
                "wide_table_id": row["wide_table_id"],
                "schema_version": row["schema_version"],
                "plan_version": row["plan_version"] if "plan_version" in row.keys() else 1,
                "row_status": row["row_status"],
                "dimension_values": _from_json(row["dimension_values_json"]),
                "business_date": row["business_date"],
                "row_binding_key": row["row_binding_key"] if "row_binding_key" in row.keys() else "",
                "indicator_values": _from_json(row["indicator_values_json"]),
                "system_values": _from_json(row["system_values_json"]),
            }
        )

    @staticmethod
    def _row_to_backfill_request(row: sqlite3.Row) -> BackfillRequest:
        return BackfillRequest(
            id=row["id"],
            requirement_id=row["requirement_id"],
            wide_table_id=row["wide_table_id"],
            start_business_date=row["start_business_date"],
            end_business_date=row["end_business_date"],
            requested_by=row["requested_by"],
            origin=row["origin"],
            status=row["status"],
            reason=row["reason"],
        )

    @staticmethod
    def _row_to_collection_batch(row: sqlite3.Row) -> CollectionBatch:
        return CollectionBatch(
            id=row["id"],
            requirement_id=row["requirement_id"],
            wide_table_id=row["wide_table_id"],
            snapshot_at=row["snapshot_at"],
            snapshot_label=row["snapshot_label"],
            coverage_mode=row["coverage_mode"],
            semantic_time_axis=row["semantic_time_axis"],
            status=row["status"],
            is_current=bool(row["is_current"]),
            plan_version=row["plan_version"] if "plan_version" in row.keys() else 1,
            triggered_by=row["triggered_by"] if "triggered_by" in row.keys() else "manual",
            start_business_date=row["start_business_date"] if "start_business_date" in row.keys() else None,
            end_business_date=row["end_business_date"] if "end_business_date" in row.keys() else None,
            created_at=row["created_at"] if "created_at" in row.keys() else None,
            updated_at=row["updated_at"] if "updated_at" in row.keys() else None,
        )

    @staticmethod
    def _row_to_wide_table_row_snapshot(row: sqlite3.Row) -> WideTableRowSnapshot:
        return WideTableRowSnapshot(
            batch_id=row["batch_id"],
            wide_table_id=row["wide_table_id"],
            row_id=row["row_id"],
            row_binding_key=row["row_binding_key"],
            business_date=row["business_date"] if "business_date" in row.keys() else None,
            dimension_values=_from_json(row["dimension_values_json"]),
            row_status=row["row_status"],
            indicator_values=_from_json(row["indicator_values_json"]),
            system_values=_from_json(row["system_values_json"]),
            created_at=row["created_at"] if "created_at" in row.keys() else None,
            updated_at=row["updated_at"] if "updated_at" in row.keys() else None,
        )

    @staticmethod
    def _row_to_task_group(row: sqlite3.Row) -> TaskGroup:
        keys = row.keys()
        return TaskGroup(
            id=row["id"],
            requirement_id=row["requirement_id"],
            wide_table_id=row["wide_table_id"],
            batch_id=row["batch_id"] if "batch_id" in keys else None,
            business_date=row["business_date"],
            source_type=row["source_type"],
            status=row["status"],
            schedule_rule_id=row["schedule_rule_id"],
            backfill_request_id=row["backfill_request_id"],
            plan_version=row["plan_version"] if "plan_version" in keys else 1,
            group_kind=row["group_kind"] if "group_kind" in keys else "baseline",
            partition_type=row["partition_type"] if "partition_type" in keys else "business_date",
            partition_key=row["partition_key"] if "partition_key" in keys else (row["business_date"] or ""),
            partition_label=row["partition_label"] if "partition_label" in keys else (row["business_date"] or ""),
            total_tasks=row["total_tasks"] if "total_tasks" in keys else 0,
            completed_tasks=row["completed_tasks"] if "completed_tasks" in keys else 0,
            failed_tasks=row["failed_tasks"] if "failed_tasks" in keys else 0,
            triggered_by=row["triggered_by"] if "triggered_by" in keys else "manual",
            created_at=row["created_at"] if "created_at" in keys else None,
            updated_at=row["updated_at"] if "updated_at" in keys else None,
        )

    @staticmethod
    def _row_to_task(row: sqlite3.Row) -> FetchTask:
        return FetchTask(
            id=row["id"],
            requirement_id=row["requirement_id"],
            wide_table_id=row["wide_table_id"],
            task_group_id=row["task_group_id"],
            batch_id=row["batch_id"] if "batch_id" in row.keys() else None,
            row_id=row["row_id"],
            indicator_group_id=row["indicator_group_id"],
            name=row["name"],
            schema_version=row["schema_version"],
            execution_mode=row["execution_mode"],
            indicator_keys=_from_json(row["indicator_keys_json"]),
            dimension_values=_from_json(row["dimension_values_json"]),
            business_date=row["business_date"],
            status=row["status"],
            confidence=row["confidence"] if "confidence" in row.keys() else None,
            can_rerun=bool(row["can_rerun"]),
            invalidated_reason=row["invalidated_reason"],
            owner=row["owner"],
            plan_version=row["plan_version"] if "plan_version" in row.keys() else 1,
            row_binding_key=row["row_binding_key"] if "row_binding_key" in row.keys() else "",
            created_at=row["created_at"] if "created_at" in row.keys() else None,
            updated_at=row["updated_at"] if "updated_at" in row.keys() else None,
        )

    @staticmethod
    def _row_to_retrieval_task(row: sqlite3.Row) -> RetrievalTask:
        return RetrievalTask(
            id=row["id"],
            parent_task_id=row["parent_task_id"],
            wide_table_id=row["wide_table_id"],
            row_id=row["row_id"],
            name=row["name"],
            indicator_key=row["indicator_key"],
            query=row["query"],
            status=row["status"],
            confidence=row["confidence"],
            narrow_row=NarrowIndicatorRow.model_validate(_from_json(row["narrow_row_json"])),
        )

    @staticmethod
    def _row_to_execution_record(row: sqlite3.Row) -> ExecutionRecord:
        return ExecutionRecord(
            id=row["id"],
            task_id=row["task_id"],
            trigger_type=row["trigger_type"],
            status=row["status"],
            started_at=row["started_at"],
            ended_at=row["ended_at"],
            operator=row["operator"],
            output_ref=row["output_ref"],
            log_ref=row["log_ref"],
        )


def _from_json(value: str) -> object:
    return json.loads(value)


def _to_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, default=_json_default)


def _json_default(value: object) -> object:
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json")
    raise TypeError(f"Object of type {value.__class__.__name__} is not JSON serializable")


def _now_timestamp() -> str:
    return datetime.now().isoformat(timespec="seconds")


def _build_update_clause(
    kwargs: dict[str, object],
    field_map: dict[str, str],
) -> tuple[list[str], list[object]]:
    """Build SET clause fragments from kwargs matching field_map."""
    sets: list[str] = []
    params: list[object] = []
    for kwarg_key, column_name in field_map.items():
        if kwarg_key in kwargs:
            sets.append(f"{column_name} = ?")
            params.append(kwargs[kwarg_key])
    return sets, params
