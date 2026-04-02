from __future__ import annotations

import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

from app.database import CURRENT_SCHEMA_VERSION
from app.repository import DataFoundryRepository


class DataFoundryRepositoryTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "test-data-foundry.sqlite3"
        self.repository = DataFoundryRepository(self.db_path)
        self.repository.init_database()

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_init_database_is_idempotent(self) -> None:
        self.repository.init_database()

        with sqlite3.connect(self.db_path) as connection:
            project_count = connection.execute("SELECT COUNT(*) FROM projects").fetchone()[0]
            requirement_count = connection.execute("SELECT COUNT(*) FROM requirements").fetchone()[0]
            wide_table_count = connection.execute("SELECT COUNT(*) FROM wide_tables").fetchone()[0]
            row_count = connection.execute("SELECT COUNT(*) FROM wide_table_rows").fetchone()[0]
            backfill_request_count = connection.execute(
                "SELECT COUNT(*) FROM backfill_requests"
            ).fetchone()[0]
            task_group_count = connection.execute("SELECT COUNT(*) FROM task_groups").fetchone()[0]
            task_count = connection.execute("SELECT COUNT(*) FROM fetch_tasks").fetchone()[0]
            retrieval_task_count = connection.execute(
                "SELECT COUNT(*) FROM retrieval_tasks"
            ).fetchone()[0]
            run_count = connection.execute("SELECT COUNT(*) FROM execution_records").fetchone()[0]

        self.assertEqual(project_count, 2)
        self.assertEqual(requirement_count, 4)
        self.assertEqual(wide_table_count, 4)
        self.assertEqual(row_count, 36)
        self.assertEqual(backfill_request_count, 3)
        self.assertEqual(task_group_count, 10)
        self.assertEqual(task_count, 39)
        self.assertEqual(retrieval_task_count, 70)
        self.assertEqual(run_count, 18)

    def test_init_database_rebuilds_stale_schema_even_when_version_matches(self) -> None:
        with sqlite3.connect(self.db_path) as connection:
            connection.executescript(
                f"""
                DROP TABLE IF EXISTS app_meta;
                DROP TABLE IF EXISTS wide_table_row_snapshots;
                DROP TABLE IF EXISTS collection_batches;
                DROP TABLE IF EXISTS fetch_tasks;
                DROP TABLE IF EXISTS task_groups;
                DROP TABLE IF EXISTS wide_table_rows;
                DROP TABLE IF EXISTS wide_tables;

                CREATE TABLE app_meta (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );
                INSERT INTO app_meta (key, value)
                VALUES ('schema_version', '{CURRENT_SCHEMA_VERSION}');

                CREATE TABLE wide_tables (
                    id TEXT PRIMARY KEY,
                    semantic_time_axis TEXT NOT NULL DEFAULT 'business_date',
                    collection_coverage_mode TEXT NOT NULL DEFAULT 'incremental_by_business_date'
                );

                CREATE TABLE wide_table_rows (
                    wide_table_id TEXT NOT NULL,
                    row_id INTEGER NOT NULL,
                    sort_order INTEGER NOT NULL,
                    requirement_id TEXT NOT NULL,
                    schema_version INTEGER NOT NULL,
                    plan_version INTEGER NOT NULL DEFAULT 1,
                    row_status TEXT NOT NULL,
                    dimension_values_json TEXT NOT NULL,
                    business_date TEXT NOT NULL,
                    indicator_values_json TEXT NOT NULL,
                    system_values_json TEXT NOT NULL,
                    metadata_json TEXT NOT NULL DEFAULT '{{}}',
                    PRIMARY KEY (wide_table_id, row_id)
                );

                CREATE TABLE collection_batches (
                    id TEXT PRIMARY KEY,
                    coverage_mode TEXT NOT NULL,
                    semantic_time_axis TEXT NOT NULL,
                    is_current INTEGER NOT NULL DEFAULT 0
                );

                CREATE TABLE wide_table_row_snapshots (
                    batch_id TEXT NOT NULL,
                    row_binding_key TEXT NOT NULL,
                    business_date TEXT,
                    PRIMARY KEY (batch_id, row_binding_key)
                );

                CREATE TABLE task_groups (
                    id TEXT PRIMARY KEY,
                    batch_id TEXT,
                    business_date TEXT NOT NULL,
                    partition_type TEXT NOT NULL DEFAULT 'business_date',
                    partition_key TEXT NOT NULL DEFAULT '',
                    partition_label TEXT NOT NULL DEFAULT ''
                );

                CREATE TABLE fetch_tasks (
                    id TEXT PRIMARY KEY,
                    batch_id TEXT,
                    business_date TEXT NOT NULL,
                    row_binding_key TEXT NOT NULL DEFAULT ''
                );
                """
            )
            connection.commit()

        self.repository.init_database()

        with sqlite3.connect(self.db_path) as connection:
            row_columns = {
                row[1]: {"notnull": row[3]}
                for row in connection.execute("PRAGMA table_info(wide_table_rows)")
            }
            task_group_columns = {
                row[1]: {"notnull": row[3]}
                for row in connection.execute("PRAGMA table_info(task_groups)")
            }
            fetch_task_columns = {
                row[1]: {"notnull": row[3]}
                for row in connection.execute("PRAGMA table_info(fetch_tasks)")
            }
            project_count = connection.execute("SELECT COUNT(*) FROM projects").fetchone()[0]
            schema_version = connection.execute(
                "SELECT value FROM app_meta WHERE key = 'schema_version'"
            ).fetchone()[0]

        self.assertIn("row_binding_key", row_columns)
        self.assertEqual(row_columns["business_date"]["notnull"], 0)
        self.assertEqual(task_group_columns["business_date"]["notnull"], 0)
        self.assertEqual(fetch_task_columns["business_date"]["notnull"], 0)
        self.assertEqual(int(schema_version), CURRENT_SCHEMA_VERSION)
        self.assertGreater(project_count, 0)

    def test_list_projects_preserves_existing_order_and_shape(self) -> None:
        projects = self.repository.list_projects()

        self.assertEqual([project.id for project in projects], ["PROJ-001", "PROJ-002"])
        self.assertEqual(projects[0].name, "自动驾驶")
        self.assertEqual(projects[1].name, "创新药")
        self.assertEqual(projects[0].data_source["knowledgeBases"], ["kb_autodrive_industry"])
        self.assertEqual(projects[1].data_source["search"]["sitePolicy"], "whitelist")

    def test_list_requirements_returns_requirement_aggregate_root(self) -> None:
        project_requirements = self.repository.list_requirements("PROJ-001")
        self.assertEqual(
            [requirement.id for requirement in project_requirements],
            ["REQ-2026-001", "REQ-2026-004"],
        )

        ops_requirement = project_requirements[0]
        self.assertEqual(ops_requirement.phase, "production")
        self.assertFalse(ops_requirement.schema_locked)
        self.assertIsNotNone(ops_requirement.wide_table)
        assert ops_requirement.wide_table is not None
        self.assertEqual(ops_requirement.wide_table.id, "WT-AD-OPS")
        self.assertEqual(
            [column.key for column in ops_requirement.wide_table.table_schema.dimension_columns],
            ["company"],
        )
        self.assertEqual(ops_requirement.wide_table.semantic_time_axis, "none")
        self.assertEqual(ops_requirement.wide_table.collection_coverage_mode, "full_snapshot")
        self.assertEqual(ops_requirement.wide_table.record_count, 5)

        safety_requirement = project_requirements[1]
        self.assertEqual(safety_requirement.phase, "production")
        self.assertTrue(safety_requirement.schema_locked)
        self.assertTrue(safety_requirement.data_update_enabled)
        self.assertEqual(safety_requirement.data_update_mode, "incremental")
        self.assertIsNotNone(safety_requirement.wide_table)
        assert safety_requirement.wide_table is not None
        self.assertEqual(safety_requirement.wide_table.id, "WT-AD-SAFE")
        self.assertEqual(safety_requirement.wide_table.table_schema.version, 4)
        self.assertEqual(safety_requirement.wide_table.scope.business_date.start, "2025-12-31")
        self.assertEqual(safety_requirement.wide_table.scope.business_date.end, "never")
        self.assertEqual(safety_requirement.wide_table.record_count, 20)

        production_requirement = self.repository.get_requirement("PROJ-002", "REQ-2026-003")
        self.assertIsNotNone(production_requirement)
        assert production_requirement is not None
        self.assertEqual(production_requirement.phase, "production")
        self.assertTrue(production_requirement.schema_locked)
        self.assertTrue(production_requirement.data_update_enabled)
        self.assertEqual(production_requirement.data_update_mode, "incremental")
        self.assertEqual(production_requirement.parent_requirement_id, "REQ-2026-002")
        self.assertIsNotNone(production_requirement.wide_table)
        assert production_requirement.wide_table is not None
        self.assertTrue(
            production_requirement.wide_table.scope.business_date.latest_year_quarterly
        )
        self.assertEqual(production_requirement.wide_table.record_count, 10)

    def test_get_requirement_backfills_missing_indicator_groups_from_legacy_wide_table_data(self) -> None:
        with sqlite3.connect(self.db_path) as connection:
            row = connection.execute(
                "SELECT indicator_groups_json FROM wide_tables WHERE id = ?",
                ("WT-AD-SAFE",),
            ).fetchone()
            groups = json.loads(row[0])
            connection.execute(
                "UPDATE wide_tables SET indicator_groups_json = ? WHERE id = ?",
                (json.dumps(groups[:1], ensure_ascii=False), "WT-AD-SAFE"),
            )
            connection.commit()

        requirement = self.repository.get_requirement("PROJ-001", "REQ-2026-004")

        self.assertIsNotNone(requirement)
        assert requirement is not None
        assert requirement.wide_table is not None
        self.assertEqual(
            [group.indicator_keys for group in requirement.wide_table.indicator_groups],
            [["mpi_takeover_miles"], ["incident_rate"]],
        )
        self.assertEqual(
            [group.name for group in requirement.wide_table.indicator_groups],
            ["接管里程指标组", "事故率指标组"],
        )

    def test_list_requirement_rows_returns_current_rows_for_requirement_wide_table(self) -> None:
        rows = self.repository.list_requirement_rows("REQ-2026-001")

        self.assertEqual(self.repository.count_current_requirement_rows("REQ-2026-001"), 5)
        self.assertEqual(len(rows), 5)
        self.assertEqual(rows[0].row_id, 1)
        self.assertEqual(rows[0].wide_table_id, "WT-AD-OPS")
        self.assertIsNone(rows[0].business_date)
        self.assertEqual(rows[0].dimension_values["company"], "Waymo")
        self.assertEqual(rows[0].indicator_values["order_volume"].value, 152000)
        self.assertEqual(rows[0].indicator_values["fleet_size"].value, 700)
        self.assertEqual(rows[0].system_values["country"], "美国")

        safety_rows = self.repository.list_requirement_rows("REQ-2026-004")
        self.assertEqual(len(safety_rows), 20)
        self.assertEqual(safety_rows[-1].wide_table_id, "WT-AD-SAFE")
        pending_safe_row = next(
            row
            for row in safety_rows
            if row.business_date == "2026-02-28"
            and row.dimension_values["company"] == "Pony.ai"
        )
        self.assertEqual(pending_safe_row.row_status, "partial")
        self.assertEqual(pending_safe_row.indicator_values["mpi_takeover_miles"].value, 74800)
        self.assertIsNone(pending_safe_row.indicator_values["incident_rate"].value)
        future_safe_row = next(
            row
            for row in safety_rows
            if row.business_date == "2026-09-30"
            and row.dimension_values["company"] == "Waymo"
        )
        self.assertEqual(future_safe_row.row_status, "initialized")
        self.assertIsNone(future_safe_row.indicator_values["mpi_takeover_miles"].value)

        production_rows = self.repository.list_requirement_rows("REQ-2026-003")
        self.assertEqual(len(production_rows), 10)
        self.assertIn("2025-Q4", [row.business_date for row in production_rows])
        target_row = next(
            row
            for row in production_rows
            if row.business_date == "2024"
            and row.dimension_values["drug_name"] == "DS-8201"
        )
        self.assertEqual(target_row.row_status, "partial")
        self.assertEqual(target_row.indicator_values["orr"].value, 78.4)

    def test_task_groups_and_backfill_requests_follow_wide_table_boundaries(self) -> None:
        backfill_requests = self.repository.list_backfill_requests("REQ-2026-001")
        task_groups = self.repository.list_task_groups("REQ-2026-001")

        self.assertEqual(len(backfill_requests), 0)
        self.assertEqual(len(task_groups), 1)
        self.assertTrue(all(group.source_type == "scheduled" for group in task_groups))
        self.assertEqual({group.business_date for group in task_groups}, {None})
        self.assertEqual({group.partition_type for group in task_groups}, {"full_table"})

        safety_backfills = self.repository.list_backfill_requests("REQ-2026-004")
        safety_task_groups = self.repository.list_task_groups("REQ-2026-004")
        self.assertEqual(len(safety_backfills), 1)
        self.assertEqual(len(safety_task_groups), 3)
        self.assertEqual(
            {group.business_date for group in safety_task_groups},
            {"2025-12-31", "2026-01-31", "2026-02-28"},
        )
        self.assertTrue(all(group.triggered_by == "backfill" for group in safety_task_groups))
        self.assertEqual(
            {group.status for group in safety_task_groups},
            {"completed", "partial"},
        )
        completed_group = next(
            group for group in safety_task_groups if group.business_date == "2025-12-31"
        )
        partial_group = next(
            group for group in safety_task_groups if group.business_date == "2026-02-28"
        )
        self.assertEqual(
            (completed_group.total_tasks, completed_group.completed_tasks, completed_group.failed_tasks),
            (4, 4, 0),
        )
        self.assertEqual(
            (partial_group.total_tasks, partial_group.completed_tasks, partial_group.failed_tasks),
            (4, 3, 0),
        )

    def test_list_tasks_follow_row_times_indicator_group_generation_model(self) -> None:
        tasks = self.repository.list_tasks("REQ-2026-001")

        self.assertEqual(len(tasks), 5)
        ops_tasks = [task for task in tasks if task.wide_table_id == "WT-AD-OPS"]

        self.assertEqual(len(ops_tasks), 5)
        self.assertEqual(
            {task.dimension_values["company"] for task in ops_tasks},
            {"Waymo", "滴滴全球", "如祺出行", "曹操出行", "小马智行"},
        )

    def test_retrieval_task_carries_long_table_payload(self) -> None:
        retrieval_tasks = self.repository.list_retrieval_tasks(
            "FT-WT-ADC-PROD-R001-IG-ADC-EFFICACY"
        )

        self.assertEqual(len(retrieval_tasks), 2)
        first_task = retrieval_tasks[0]
        self.assertEqual(first_task.indicator_key, "orr")
        self.assertEqual(first_task.narrow_row.indicator_name, "ORR")
        self.assertEqual(first_task.narrow_row.indicator_unit, "%")
        self.assertEqual(first_task.narrow_row.unit, "%")
        self.assertEqual(first_task.narrow_row.published_at, "2024")
        self.assertEqual(first_task.narrow_row.source_site, "ASCO 摘要")
        self.assertTrue((first_task.narrow_row.indicator_logic or "").startswith("客观缓解率"))
        self.assertIn("来源站点：ASCO 摘要", first_task.narrow_row.indicator_logic_supplement or "")
        self.assertEqual(first_task.narrow_row.source_url, "https://asco.org/")
        self.assertIn("ORR", first_task.narrow_row.quote_text or "")
        self.assertIn("78.4", first_task.narrow_row.quote_text or "")
        self.assertLessEqual(len(first_task.narrow_row.quote_text or ""), 80)
        self.assertEqual(first_task.narrow_row.max_value, 80.1)
        self.assertEqual(first_task.narrow_row.min_value, 76.8)
        self.assertEqual(first_task.narrow_row.result.value, 78.4)
        self.assertEqual(first_task.narrow_row.dimension_values["drug_name"], "DS-8201")

    def test_execution_records_are_attached_to_fetch_tasks(self) -> None:
        records = self.repository.list_execution_records("FT-TG-WT-AD-OPS-20260313-R001-IG-AD-OPS-CORE")

        self.assertEqual(len(records), 1)
        self.assertEqual(records[0].trigger_type, "manual")
        self.assertEqual(records[0].status, "completed")
        self.assertIn("artifact://tasks/FT-TG-WT-AD-OPS-20260313-R001-IG-AD-OPS-CORE", records[0].output_ref)

    def test_getters_return_none_for_missing_entities(self) -> None:
        self.assertIsNone(self.repository.get_project("missing"))
        self.assertIsNone(self.repository.get_requirement("PROJ-001", "missing"))
        self.assertIsNone(self.repository.get_task("REQ-2026-001", "missing"))
        self.assertIsNone(self.repository.get_task_by_id("missing"))


if __name__ == "__main__":
    unittest.main()
