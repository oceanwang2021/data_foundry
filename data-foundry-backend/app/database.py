from __future__ import annotations

import json
import os
import sqlite3
from pathlib import Path
from typing import Any

from app.seed_data import (
    SEED_BACKFILL_REQUESTS,
    SEED_COLLECTION_BATCHES,
    SEED_EXECUTION_RECORDS,
    SEED_FETCH_TASKS,
    SEED_PROJECTS,
    SEED_REQUIREMENTS,
    SEED_RETRIEVAL_TASKS,
    SEED_TASK_GROUPS,
    SEED_WIDE_TABLE_ROWS,
    SEED_WIDE_TABLE_ROW_SNAPSHOTS,
)


CURRENT_SCHEMA_VERSION = 8


def resolve_database_path(db_path: str | Path | None = None) -> str:
    if db_path is None:
        env_path = os.getenv("DATA_FOUNDRY_DB_PATH")
        if env_path:
            return env_path
        default_path = Path(__file__).resolve().parents[1] / "data" / "data-foundry.sqlite3"
        return str(default_path)
    if isinstance(db_path, Path):
        return str(db_path)
    return db_path


def connect_database(db_path: str | Path | None = None) -> sqlite3.Connection:
    resolved_path = resolve_database_path(db_path)
    if resolved_path != ":memory:":
        Path(resolved_path).parent.mkdir(parents=True, exist_ok=True)

    connection = sqlite3.connect(resolved_path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA busy_timeout = 5000")
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def initialize_database(db_path: str | Path | None = None) -> str:
    resolved_path = resolve_database_path(db_path)
    with connect_database(resolved_path) as connection:
        _prepare_schema(connection)
        _ensure_runtime_columns(connection)
        _migrate_multi_wide_table_requirements(connection)
        _seed_if_empty(connection)
        connection.commit()
    return resolved_path


def _prepare_schema(connection: sqlite3.Connection) -> None:
    existing_version = _read_schema_version(connection)
    if existing_version != CURRENT_SCHEMA_VERSION or _schema_requires_rebuild(connection):
        _drop_app_schema(connection)
    try:
        _create_schema(connection)
    except sqlite3.OperationalError as exc:
        if not _is_rebuildable_schema_error(exc):
            raise
        _drop_app_schema(connection)
        _create_schema(connection)
    _write_schema_version(connection, CURRENT_SCHEMA_VERSION)


def _schema_requires_rebuild(connection: sqlite3.Connection) -> bool:
    required_columns: dict[str, set[str]] = {
        "wide_tables": {"semantic_time_axis", "collection_coverage_mode"},
        "wide_table_rows": {"row_binding_key"},
        "task_groups": {"batch_id", "partition_type", "partition_key", "partition_label"},
        "fetch_tasks": {"batch_id", "row_binding_key"},
        "collection_batches": {"coverage_mode", "semantic_time_axis", "is_current"},
        "wide_table_row_snapshots": {"row_binding_key", "business_date"},
    }
    required_nullable_columns: dict[str, set[str]] = {
        "wide_table_rows": {"business_date"},
        "task_groups": {"business_date"},
        "fetch_tasks": {"business_date"},
    }

    for table_name in required_columns:
        row = connection.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
            (table_name,),
        ).fetchone()
        if row is None:
            return True

    for table_name, columns in required_columns.items():
        table_info = _read_table_info(connection, table_name)
        existing_columns = set(table_info)
        if not columns.issubset(existing_columns):
            return True

    for table_name, columns in required_nullable_columns.items():
        table_info = _read_table_info(connection, table_name)
        for column_name in columns:
            column_info = table_info.get(column_name)
            if column_info is None:
                return True
            if bool(column_info["notnull"]):
                return True

    return False


def _read_table_info(
    connection: sqlite3.Connection,
    table_name: str,
) -> dict[str, sqlite3.Row]:
    return {
        row["name"]: row
        for row in connection.execute(f"PRAGMA table_info({table_name})").fetchall()
    }


def _is_rebuildable_schema_error(exc: sqlite3.OperationalError) -> bool:
    message = str(exc).lower()
    return (
        "no such column" in message
        or "has no column named" in message
        or "malformed database schema" in message
    )


def _migrate_multi_wide_table_requirements(connection: sqlite3.Connection) -> None:
    multi_table_requirements = connection.execute(
        """
        SELECT requirement_id
        FROM wide_tables
        GROUP BY requirement_id
        HAVING COUNT(*) > 1
        """
    ).fetchall()
    if not multi_table_requirements:
        return

    for requirement_row in multi_table_requirements:
        requirement_id = requirement_row["requirement_id"]
        requirement = connection.execute(
            "SELECT * FROM requirements WHERE id = ?",
            (requirement_id,),
        ).fetchone()
        if requirement is None:
            continue

        wide_tables = connection.execute(
            """
            SELECT *
            FROM wide_tables
            WHERE requirement_id = ?
            ORDER BY sort_order
            """,
            (requirement_id,),
        ).fetchall()
        if len(wide_tables) <= 1:
            continue

        next_sort_order_row = connection.execute(
            "SELECT COALESCE(MAX(sort_order), 0) AS max_sort_order FROM requirements"
        ).fetchone()
        next_sort_order = int(next_sort_order_row["max_sort_order"]) + 1

        for split_index, wide_table in enumerate(wide_tables[1:], start=2):
            new_requirement_id = _build_split_requirement_id(
                connection,
                requirement_id=requirement_id,
                split_index=split_index,
            )
            new_title = f"{requirement['title']} - {wide_table['title']}"
            connection.execute(
                """
                INSERT INTO requirements (
                    id, sort_order, project_id, title, phase, parent_requirement_id,
                    schema_locked, status, owner, assignee, business_goal,
                    background_knowledge, business_boundary, delivery_scope,
                    data_update_enabled, data_update_mode,
                    processing_rule_drafts_json, collection_policy_json,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    new_requirement_id,
                    next_sort_order,
                    requirement["project_id"],
                    new_title,
                    requirement["phase"],
                    requirement["parent_requirement_id"],
                    requirement["schema_locked"],
                    requirement["status"],
                    requirement["owner"],
                    requirement["assignee"],
                    requirement["business_goal"],
                    requirement["background_knowledge"],
                    requirement["business_boundary"],
                    requirement["delivery_scope"],
                    requirement["data_update_enabled"] if "data_update_enabled" in requirement.keys() else None,
                    requirement["data_update_mode"] if "data_update_mode" in requirement.keys() else None,
                    requirement["processing_rule_drafts_json"],
                    requirement["collection_policy_json"],
                    requirement["created_at"],
                    requirement["updated_at"],
                ),
            )
            next_sort_order += 1

            connection.execute(
                "UPDATE wide_tables SET requirement_id = ?, sort_order = 1 WHERE id = ?",
                (new_requirement_id, wide_table["id"]),
            )
            connection.execute(
                "UPDATE wide_table_rows SET requirement_id = ? WHERE wide_table_id = ?",
                (new_requirement_id, wide_table["id"]),
            )
            connection.execute(
                "UPDATE backfill_requests SET requirement_id = ? WHERE wide_table_id = ?",
                (new_requirement_id, wide_table["id"]),
            )
            connection.execute(
                "UPDATE task_groups SET requirement_id = ? WHERE wide_table_id = ?",
                (new_requirement_id, wide_table["id"]),
            )
            connection.execute(
                "UPDATE fetch_tasks SET requirement_id = ? WHERE wide_table_id = ?",
                (new_requirement_id, wide_table["id"]),
            )


def _ensure_runtime_columns(connection: sqlite3.Connection) -> None:
    _ensure_column(
        connection,
        table_name="requirements",
        column_name="data_update_enabled",
        definition="INTEGER",
    )
    _ensure_column(
        connection,
        table_name="requirements",
        column_name="data_update_mode",
        definition="TEXT",
    )
    _ensure_column(
        connection,
        table_name="wide_table_rows",
        column_name="plan_version",
        definition="INTEGER NOT NULL DEFAULT 1",
    )


def _ensure_column(
    connection: sqlite3.Connection,
    *,
    table_name: str,
    column_name: str,
    definition: str,
) -> None:
    columns = {
        row["name"]
        for row in connection.execute(f"PRAGMA table_info({table_name})").fetchall()
    }
    if column_name in columns:
        return
    connection.execute(
        f"ALTER TABLE {table_name} ADD COLUMN {column_name} {definition}"
    )


def _build_split_requirement_id(
    connection: sqlite3.Connection,
    *,
    requirement_id: str,
    split_index: int,
) -> str:
    candidate = f"{requirement_id}-S{split_index}"
    suffix = 1
    while connection.execute(
        "SELECT 1 FROM requirements WHERE id = ?",
        (candidate,),
    ).fetchone():
        suffix += 1
        candidate = f"{requirement_id}-S{split_index}-{suffix}"
    return candidate


def _read_schema_version(connection: sqlite3.Connection) -> int | None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS app_meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
        """
    )
    row = connection.execute(
        "SELECT value FROM app_meta WHERE key = 'schema_version'"
    ).fetchone()
    if not row:
        return None
    try:
        return int(row["value"])
    except (TypeError, ValueError):
        return None


def _write_schema_version(connection: sqlite3.Connection, version: int) -> None:
    connection.execute(
        """
        INSERT INTO app_meta (key, value)
        VALUES ('schema_version', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
        """,
        (str(version),),
    )


def _drop_app_schema(connection: sqlite3.Connection) -> None:
    connection.execute("PRAGMA foreign_keys = OFF")
    connection.executescript(
        """
        DROP TABLE IF EXISTS data_lineage;
        DROP TABLE IF EXISTS prompt_templates;
        DROP TABLE IF EXISTS knowledge_bases;
        DROP TABLE IF EXISTS system_settings;
        DROP TABLE IF EXISTS schedule_jobs;
        DROP TABLE IF EXISTS acceptance_tickets;
        DROP TABLE IF EXISTS audit_rules;
        DROP TABLE IF EXISTS preprocess_rules;
        DROP TABLE IF EXISTS execution_records;
        DROP TABLE IF EXISTS retrieval_tasks;
        DROP TABLE IF EXISTS fetch_tasks;
        DROP TABLE IF EXISTS task_groups;
        DROP TABLE IF EXISTS backfill_requests;
        DROP TABLE IF EXISTS wide_table_row_snapshots;
        DROP TABLE IF EXISTS collection_batches;
        DROP TABLE IF EXISTS wide_table_rows;
        DROP TABLE IF EXISTS wide_tables;
        DROP TABLE IF EXISTS requirements;
        DROP TABLE IF EXISTS projects;
        """
    )
    connection.execute("PRAGMA foreign_keys = ON")


def _create_schema(connection: sqlite3.Connection) -> None:
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            sort_order INTEGER NOT NULL,
            name TEXT NOT NULL,
            owner_team TEXT NOT NULL,
            description TEXT NOT NULL,
            status TEXT NOT NULL,
            business_background TEXT,
            data_source_json TEXT,
            created_at TEXT NOT NULL DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS requirements (
            id TEXT PRIMARY KEY,
            sort_order INTEGER NOT NULL,
            project_id TEXT NOT NULL,
            title TEXT NOT NULL,
            phase TEXT NOT NULL,
            parent_requirement_id TEXT,
            schema_locked INTEGER NOT NULL,
            status TEXT NOT NULL,
            owner TEXT NOT NULL,
            assignee TEXT NOT NULL,
            business_goal TEXT NOT NULL,
            background_knowledge TEXT,
            business_boundary TEXT,
            delivery_scope TEXT,
            data_update_enabled INTEGER,
            data_update_mode TEXT,
            processing_rule_drafts_json TEXT,
            collection_policy_json TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL DEFAULT '',
            FOREIGN KEY(project_id) REFERENCES projects(id),
            FOREIGN KEY(parent_requirement_id) REFERENCES requirements(id)
        );

        CREATE TABLE IF NOT EXISTS wide_tables (
            id TEXT PRIMARY KEY,
            sort_order INTEGER NOT NULL,
            requirement_id TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            table_name TEXT NOT NULL,
            schema_version INTEGER NOT NULL,
            schema_json TEXT NOT NULL,
            scope_json TEXT NOT NULL,
            indicator_groups_json TEXT NOT NULL,
            schedule_rules_json TEXT NOT NULL,
            semantic_time_axis TEXT NOT NULL DEFAULT 'business_date',
            collection_coverage_mode TEXT NOT NULL DEFAULT 'incremental_by_business_date',
            status TEXT NOT NULL DEFAULT 'draft',
            record_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL DEFAULT '',
            FOREIGN KEY(requirement_id) REFERENCES requirements(id)
        );

        CREATE TABLE IF NOT EXISTS wide_table_rows (
            wide_table_id TEXT NOT NULL,
            row_id INTEGER NOT NULL,
            sort_order INTEGER NOT NULL,
            requirement_id TEXT NOT NULL,
            schema_version INTEGER NOT NULL,
            plan_version INTEGER NOT NULL DEFAULT 1,
            row_status TEXT NOT NULL,
            dimension_values_json TEXT NOT NULL,
            business_date TEXT,
            row_binding_key TEXT NOT NULL DEFAULT '',
            indicator_values_json TEXT NOT NULL,
            system_values_json TEXT NOT NULL,
            metadata_json TEXT NOT NULL DEFAULT '{}',
            PRIMARY KEY (wide_table_id, row_id),
            FOREIGN KEY(requirement_id) REFERENCES requirements(id),
            FOREIGN KEY(wide_table_id) REFERENCES wide_tables(id)
        );

        CREATE TABLE IF NOT EXISTS collection_batches (
            id TEXT PRIMARY KEY,
            sort_order INTEGER NOT NULL,
            requirement_id TEXT NOT NULL,
            wide_table_id TEXT NOT NULL,
            snapshot_at TEXT NOT NULL,
            snapshot_label TEXT NOT NULL,
            coverage_mode TEXT NOT NULL,
            semantic_time_axis TEXT NOT NULL,
            status TEXT NOT NULL,
            is_current INTEGER NOT NULL DEFAULT 0,
            plan_version INTEGER NOT NULL DEFAULT 1,
            triggered_by TEXT NOT NULL DEFAULT 'manual',
            start_business_date TEXT,
            end_business_date TEXT,
            created_at TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL DEFAULT '',
            FOREIGN KEY(requirement_id) REFERENCES requirements(id),
            FOREIGN KEY(wide_table_id) REFERENCES wide_tables(id)
        );

        CREATE TABLE IF NOT EXISTS wide_table_row_snapshots (
            batch_id TEXT NOT NULL,
            wide_table_id TEXT NOT NULL,
            row_id INTEGER NOT NULL,
            row_binding_key TEXT NOT NULL,
            business_date TEXT,
            row_status TEXT NOT NULL,
            dimension_values_json TEXT NOT NULL,
            indicator_values_json TEXT NOT NULL,
            system_values_json TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL DEFAULT '',
            PRIMARY KEY (batch_id, row_binding_key),
            FOREIGN KEY(batch_id) REFERENCES collection_batches(id),
            FOREIGN KEY(wide_table_id, row_id) REFERENCES wide_table_rows(wide_table_id, row_id)
        );

        CREATE TABLE IF NOT EXISTS backfill_requests (
            id TEXT PRIMARY KEY,
            sort_order INTEGER NOT NULL,
            requirement_id TEXT NOT NULL,
            wide_table_id TEXT NOT NULL,
            start_business_date TEXT NOT NULL,
            end_business_date TEXT NOT NULL,
            requested_by TEXT NOT NULL,
            origin TEXT NOT NULL,
            status TEXT NOT NULL,
            reason TEXT,
            task_group_ids_json TEXT NOT NULL DEFAULT '[]',
            created_at TEXT NOT NULL DEFAULT '',
            FOREIGN KEY(requirement_id) REFERENCES requirements(id),
            FOREIGN KEY(wide_table_id) REFERENCES wide_tables(id)
        );

        CREATE TABLE IF NOT EXISTS task_groups (
            id TEXT PRIMARY KEY,
            sort_order INTEGER NOT NULL,
            requirement_id TEXT NOT NULL,
            wide_table_id TEXT NOT NULL,
            batch_id TEXT,
            business_date TEXT,
            source_type TEXT NOT NULL,
            status TEXT NOT NULL,
            schedule_rule_id TEXT,
            backfill_request_id TEXT,
            plan_version INTEGER NOT NULL DEFAULT 1,
            group_kind TEXT NOT NULL DEFAULT 'baseline',
            partition_type TEXT NOT NULL DEFAULT 'business_date',
            partition_key TEXT NOT NULL DEFAULT '',
            partition_label TEXT NOT NULL DEFAULT '',
            total_tasks INTEGER NOT NULL DEFAULT 0,
            completed_tasks INTEGER NOT NULL DEFAULT 0,
            failed_tasks INTEGER NOT NULL DEFAULT 0,
            triggered_by TEXT NOT NULL DEFAULT 'manual',
            created_at TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL DEFAULT '',
            FOREIGN KEY(requirement_id) REFERENCES requirements(id),
            FOREIGN KEY(wide_table_id) REFERENCES wide_tables(id),
            FOREIGN KEY(backfill_request_id) REFERENCES backfill_requests(id),
            FOREIGN KEY(batch_id) REFERENCES collection_batches(id)
        );

        CREATE TABLE IF NOT EXISTS fetch_tasks (
            id TEXT PRIMARY KEY,
            sort_order INTEGER NOT NULL,
            requirement_id TEXT NOT NULL,
            wide_table_id TEXT NOT NULL,
            task_group_id TEXT NOT NULL,
            batch_id TEXT,
            row_id INTEGER NOT NULL,
            indicator_group_id TEXT NOT NULL,
            indicator_group_name TEXT NOT NULL DEFAULT '',
            name TEXT NOT NULL,
            schema_version INTEGER NOT NULL,
            execution_mode TEXT NOT NULL,
            indicator_keys_json TEXT NOT NULL,
            dimension_values_json TEXT NOT NULL,
            business_date TEXT,
            status TEXT NOT NULL,
            can_rerun INTEGER NOT NULL,
            invalidated_reason TEXT,
            owner TEXT NOT NULL,
            confidence REAL,
            plan_version INTEGER NOT NULL DEFAULT 1,
            row_binding_key TEXT,
            created_at TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL DEFAULT '',
            FOREIGN KEY(requirement_id) REFERENCES requirements(id),
            FOREIGN KEY(wide_table_id) REFERENCES wide_tables(id),
            FOREIGN KEY(task_group_id) REFERENCES task_groups(id),
            FOREIGN KEY(batch_id) REFERENCES collection_batches(id),
            FOREIGN KEY(wide_table_id, row_id) REFERENCES wide_table_rows(wide_table_id, row_id)
        );

        CREATE TABLE IF NOT EXISTS retrieval_tasks (
            id TEXT PRIMARY KEY,
            sort_order INTEGER NOT NULL,
            parent_task_id TEXT NOT NULL,
            wide_table_id TEXT NOT NULL,
            row_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            indicator_key TEXT NOT NULL,
            query TEXT NOT NULL,
            status TEXT NOT NULL,
            confidence REAL NOT NULL,
            narrow_row_json TEXT NOT NULL,
            FOREIGN KEY(parent_task_id) REFERENCES fetch_tasks(id),
            FOREIGN KEY(wide_table_id, row_id) REFERENCES wide_table_rows(wide_table_id, row_id)
        );

        CREATE TABLE IF NOT EXISTS execution_records (
            id TEXT PRIMARY KEY,
            sort_order INTEGER NOT NULL,
            task_id TEXT NOT NULL,
            trigger_type TEXT NOT NULL,
            status TEXT NOT NULL,
            started_at TEXT NOT NULL,
            ended_at TEXT,
            operator TEXT NOT NULL,
            output_ref TEXT,
            log_ref TEXT NOT NULL,
            FOREIGN KEY(task_id) REFERENCES fetch_tasks(id)
        );

        CREATE TABLE IF NOT EXISTS preprocess_rules (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            source TEXT NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 1,
            category TEXT NOT NULL,
            expression TEXT NOT NULL,
            sample_issue TEXT,
            indicator_bindings_json TEXT NOT NULL DEFAULT '[]',
            filling_config_json TEXT
        );

        CREATE TABLE IF NOT EXISTS audit_rules (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            mode TEXT NOT NULL,
            scenario_rigour TEXT NOT NULL,
            condition_expr TEXT NOT NULL,
            action_text TEXT NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS acceptance_tickets (
            id TEXT PRIMARY KEY,
            task_group_id TEXT NOT NULL UNIQUE,
            dataset TEXT NOT NULL,
            requirement_id TEXT NOT NULL,
            status TEXT NOT NULL,
            owner TEXT NOT NULL,
            feedback TEXT,
            latest_action_at TEXT NOT NULL,
            FOREIGN KEY(requirement_id) REFERENCES requirements(id),
            FOREIGN KEY(task_group_id) REFERENCES task_groups(id)
        );

        CREATE TABLE IF NOT EXISTS schedule_jobs (
            id TEXT PRIMARY KEY,
            sort_order INTEGER NOT NULL DEFAULT 0,
            task_group_id TEXT NOT NULL,
            wide_table_id TEXT,
            trigger_type TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'queued',
            started_at TEXT NOT NULL,
            ended_at TEXT,
            operator TEXT NOT NULL DEFAULT 'system',
            log_ref TEXT,
            FOREIGN KEY(task_group_id) REFERENCES task_groups(id)
        );

        CREATE TABLE IF NOT EXISTS system_settings (
            key TEXT PRIMARY KEY,
            value_json TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS knowledge_bases (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            document_count INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'ready',
            last_updated TEXT
        );

        CREATE TABLE IF NOT EXISTS prompt_templates (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            industry TEXT,
            rigour TEXT,
            description TEXT,
            recommended_model TEXT,
            updated_at TEXT
        );

        CREATE TABLE IF NOT EXISTS data_lineage (
            id TEXT PRIMARY KEY,
            dataset TEXT NOT NULL,
            upstream TEXT NOT NULL,
            downstream TEXT NOT NULL,
            last_sync_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_requirements_project_id
            ON requirements(project_id, sort_order);
        CREATE INDEX IF NOT EXISTS idx_wide_tables_requirement_id
            ON wide_tables(requirement_id, sort_order);
        CREATE INDEX IF NOT EXISTS idx_wide_table_rows_requirement_id
            ON wide_table_rows(requirement_id, wide_table_id, business_date, sort_order);
        CREATE INDEX IF NOT EXISTS idx_wide_table_rows_binding_key
            ON wide_table_rows(wide_table_id, row_binding_key);
        CREATE INDEX IF NOT EXISTS idx_collection_batches_requirement_id
            ON collection_batches(requirement_id, wide_table_id, sort_order);
        CREATE INDEX IF NOT EXISTS idx_collection_batches_current
            ON collection_batches(wide_table_id, is_current, sort_order);
        CREATE INDEX IF NOT EXISTS idx_row_snapshots_batch_id
            ON wide_table_row_snapshots(batch_id, wide_table_id, row_id);
        CREATE INDEX IF NOT EXISTS idx_backfill_requests_requirement_id
            ON backfill_requests(requirement_id, sort_order);
        CREATE INDEX IF NOT EXISTS idx_task_groups_requirement_id
            ON task_groups(requirement_id, wide_table_id, batch_id, business_date, sort_order);
        CREATE INDEX IF NOT EXISTS idx_fetch_tasks_requirement_id
            ON fetch_tasks(requirement_id, task_group_id, sort_order);
        CREATE INDEX IF NOT EXISTS idx_fetch_tasks_row
            ON fetch_tasks(wide_table_id, row_id);
        CREATE INDEX IF NOT EXISTS idx_retrieval_tasks_parent_task_id
            ON retrieval_tasks(parent_task_id, sort_order);
        CREATE INDEX IF NOT EXISTS idx_execution_records_task_id
            ON execution_records(task_id, sort_order);
        CREATE INDEX IF NOT EXISTS idx_acceptance_tickets_requirement_id
            ON acceptance_tickets(requirement_id);
        CREATE INDEX IF NOT EXISTS idx_acceptance_tickets_task_group_id
            ON acceptance_tickets(task_group_id);
        """
    )


def _seed_if_empty(connection: sqlite3.Connection) -> None:
    has_projects = connection.execute("SELECT COUNT(*) FROM projects").fetchone()[0]
    if has_projects:
        return

    wide_table_record_counts: dict[str, int] = {}
    for row in SEED_WIDE_TABLE_ROWS:
        wide_table_record_counts[row.wide_table_id] = (
            wide_table_record_counts.get(row.wide_table_id, 0) + 1
        )

    connection.executemany(
        """
        INSERT INTO projects (
            id, sort_order, name, owner_team, description, status,
            business_background, data_source_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            (
                project.id,
                sort_order,
                project.name,
                project.owner_team,
                project.description,
                project.status,
                getattr(project, "business_background", None),
                _to_json(getattr(project, "data_source", None)),
                "",
            )
            for sort_order, project in enumerate(SEED_PROJECTS, start=1)
        ],
    )

    connection.executemany(
        """
        INSERT INTO requirements (
            id, sort_order, project_id, title, phase, parent_requirement_id,
            schema_locked, status, owner, assignee, business_goal,
            background_knowledge, business_boundary, delivery_scope,
            data_update_enabled, data_update_mode,
            processing_rule_drafts_json, collection_policy_json,
            created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            (
                requirement.id,
                sort_order,
                requirement.project_id,
                requirement.title,
                requirement.phase,
                requirement.parent_requirement_id,
                int(requirement.schema_locked),
                requirement.status,
                requirement.owner,
                requirement.assignee,
                requirement.business_goal,
                requirement.background_knowledge,
                getattr(requirement, "business_boundary", None),
                getattr(requirement, "delivery_scope", None),
                None if requirement.data_update_enabled is None else int(requirement.data_update_enabled),
                getattr(requirement, "data_update_mode", None),
                _to_json(getattr(requirement, "processing_rule_drafts", None)),
                _to_json(requirement.collection_policy.model_dump(mode="json")),
                "",
                "",
            )
            for sort_order, requirement in enumerate(SEED_REQUIREMENTS, start=1)
        ],
    )

    connection.executemany(
        """
        INSERT INTO wide_tables (
            id, sort_order, requirement_id, title, description, table_name,
            schema_version, schema_json, scope_json, indicator_groups_json,
            schedule_rules_json, semantic_time_axis, collection_coverage_mode,
            status, record_count, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            (
                wide_table.id,
                1,
                requirement.id,
                wide_table.title,
                wide_table.description,
                wide_table.table_schema.table_name,
                wide_table.table_schema.version,
                _to_json(wide_table.table_schema.model_dump(mode="json")),
                _to_json(wide_table.scope.model_dump(mode="json")),
                _to_json([group.model_dump(mode="json") for group in wide_table.indicator_groups]),
                _to_json([rule.model_dump(mode="json") for rule in wide_table.schedule_rules]),
                wide_table.semantic_time_axis,
                wide_table.collection_coverage_mode,
                "active",
                wide_table_record_counts.get(wide_table.id, 0),
                "",
                "",
            )
            for requirement in SEED_REQUIREMENTS
            for wide_table in ([requirement.wide_table] if requirement.wide_table else [])
        ],
    )

    connection.executemany(
        """
        INSERT INTO wide_table_rows (
            wide_table_id, row_id, sort_order, requirement_id, schema_version,
            plan_version, row_status, dimension_values_json, business_date,
            row_binding_key, indicator_values_json, system_values_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
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
            )
            for sort_order, row in enumerate(SEED_WIDE_TABLE_ROWS, start=1)
        ],
    )

    connection.executemany(
        """
        INSERT INTO collection_batches (
            id, sort_order, requirement_id, wide_table_id, snapshot_at,
            snapshot_label, coverage_mode, semantic_time_axis, status,
            is_current, plan_version, triggered_by, start_business_date,
            end_business_date, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
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
            )
            for sort_order, batch in enumerate(SEED_COLLECTION_BATCHES, start=1)
        ],
    )

    connection.executemany(
        """
        INSERT INTO wide_table_row_snapshots (
            batch_id, wide_table_id, row_id, row_binding_key, business_date,
            row_status, dimension_values_json, indicator_values_json,
            system_values_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
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
            )
            for snapshot in SEED_WIDE_TABLE_ROW_SNAPSHOTS
        ],
    )

    connection.executemany(
        """
        INSERT INTO backfill_requests (
            id, sort_order, requirement_id, wide_table_id, start_business_date,
            end_business_date, requested_by, origin, status, reason
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            (
                request.id,
                sort_order,
                request.requirement_id,
                request.wide_table_id,
                request.start_business_date,
                request.end_business_date,
                request.requested_by,
                request.origin,
                request.status,
                request.reason,
            )
            for sort_order, request in enumerate(SEED_BACKFILL_REQUESTS, start=1)
        ],
    )

    connection.executemany(
        """
        INSERT INTO task_groups (
            id, sort_order, requirement_id, wide_table_id, batch_id, business_date,
            source_type, status, schedule_rule_id, backfill_request_id,
            plan_version, group_kind, partition_type, partition_key, partition_label,
            total_tasks, completed_tasks, failed_tasks,
            triggered_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
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
                task_group.created_at,
                task_group.updated_at,
            )
            for sort_order, task_group in enumerate(SEED_TASK_GROUPS, start=1)
        ],
    )

    connection.executemany(
        """
        INSERT INTO fetch_tasks (
            id, sort_order, requirement_id, wide_table_id, task_group_id, batch_id,
            row_id, indicator_group_id, indicator_group_name, name,
            schema_version, execution_mode,
            indicator_keys_json, dimension_values_json, business_date,
            status, can_rerun, invalidated_reason, owner,
            confidence, plan_version, row_binding_key,
            created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
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
                1,
                task.row_binding_key,
                "",
                "",
            )
            for sort_order, task in enumerate(SEED_FETCH_TASKS, start=1)
        ],
    )

    connection.executemany(
        """
        INSERT INTO retrieval_tasks (
            id, sort_order, parent_task_id, wide_table_id, row_id, name,
            indicator_key, query, status, confidence, narrow_row_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            (
                task.id,
                sort_order,
                task.parent_task_id,
                task.wide_table_id,
                task.row_id,
                task.name,
                task.indicator_key,
                task.query,
                task.status,
                task.confidence,
                _to_json(task.narrow_row.model_dump(mode="json")),
            )
            for sort_order, task in enumerate(SEED_RETRIEVAL_TASKS, start=1)
        ],
    )

    connection.executemany(
        """
        INSERT INTO execution_records (
            id, sort_order, task_id, trigger_type, status, started_at,
            ended_at, operator, output_ref, log_ref
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            (
                record.id,
                sort_order,
                record.task_id,
                record.trigger_type,
                record.status,
                record.started_at,
                record.ended_at,
                record.operator,
                record.output_ref,
                record.log_ref,
            )
            for sort_order, record in enumerate(SEED_EXECUTION_RECORDS, start=1)
        ],
    )

    # Seed knowledge bases
    knowledge_bases = [
        ("kb_autodrive_industry", "自动驾驶行业知识库", "包含自动驾驶行业报告、政策法规、技术标准等文档", 156, "ready", "2026-03-01T10:00:00Z"),
        ("kb_pharma_reports", "医药行业研报库", "包含医药行业研究报告、临床试验数据、FDA审批文档", 89, "ready", "2026-02-28T14:30:00Z"),
        ("kb_macro_economy", "宏观经济数据库", "包含宏观经济指标、央行政策、国际贸易数据", 234, "ready", "2026-03-02T09:15:00Z"),
    ]
    connection.executemany(
        """
        INSERT INTO knowledge_bases (id, name, description, document_count, status, last_updated)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        knowledge_bases,
    )

    # Seed preprocess rules
    preprocess_rules = [
        ("PR-001", "ORR 百分率统一为数值", "business", 1, "unit_convert", "percent_to_decimal(ORR_VALUE, scale=2)", "ORR 同列出现 45% 与 0.45", '[]', None),
        ("PR-002", "PFS 月数格式修复", "platform", 1, "format_fix", "normalize_numeric(PFS_VALUE, unit='月')", "PFS 出现 12 months、12.0mo、约12月 等混用", '[]', None),
        ("PR-003", "TEAE 空值语义修复", "platform", 1, "null_fix", "map_unknown_to_null(['未披露','N/A'])", "TEAE 字段混入未披露、N/A 等文本", '[]', None),
        ("PR-004", "OS 衍生环比变化", "business", 0, "derived", "mom_change = (curr - prev) / prev", "需要在导入前自动补充 OS 趋势字段", '[]', None),
    ]
    connection.executemany(
        """
        INSERT INTO preprocess_rules (id, name, source, enabled, category, expression, sample_issue, indicator_bindings_json, filling_config_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        preprocess_rules,
    )

    # Seed audit rules
    audit_rules = [
        ("AR-001", "环比异常阈值", "non_blocking", "low", "abs(mom_change) > 0.5", "标记异常，不阻断导入", 1),
        ("AR-002", "高严谨性单指标元数据缺失", "blocking", "high", "单指标来源链接或摘录缺失", "阻断并打回重采", 1),
        ("AR-003", "指标类型校验", "blocking", "high", "指标列无法转换为目标类型", "阻断并触发后处理修复", 1),
    ]
    connection.executemany(
        """
        INSERT INTO audit_rules (id, name, mode, scenario_rigour, condition_expr, action_text, enabled)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        audit_rules,
    )


def _to_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, default=_json_default)


def _json_default(value: Any) -> Any:
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json")
    raise TypeError(f"Object of type {value.__class__.__name__} is not JSON serializable")
