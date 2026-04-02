from __future__ import annotations

import asyncio
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app
from app.schemas import IndicatorCell, WideTableRow


class SchedulerReadyGateTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "test.sqlite3"
        self.app = create_app(str(self.db_path))
        self.client = TestClient(self.app, raise_server_exceptions=True)
        self.client.__enter__()

    def tearDown(self) -> None:
        self.client.__exit__(None, None, None)
        self.temp_dir.cleanup()

    def test_trigger_scheduled_skips_ready_production_requirement(self) -> None:
        repo = self.app.state.repository
        repo.update_requirement("REQ-2026-004", status="ready")

        requirement = repo.get_requirement("PROJ-001", "REQ-2026-004")
        self.assertIsNotNone(requirement)
        assert requirement is not None
        assert requirement.wide_table is not None

        preview_rows = [
            WideTableRow(
                row_id=101,
                requirement_id=requirement.id,
                wide_table_id=requirement.wide_table.id,
                schema_version=requirement.wide_table.table_schema.version,
                plan_version=2,
                row_status="initialized",
                dimension_values={"company": "Waymo", "city": "旧金山"},
                business_date="2025-12-31",
                row_binding_key="business_date:2025-12-31|company:Waymo|city:旧金山",
                indicator_values={
                    "mpi_takeover_miles": IndicatorCell(),
                    "incident_rate": IndicatorCell(),
                },
                system_values={"row_status": "initialized", "last_task_id": None, "updated_at": None},
            ),
            WideTableRow(
                row_id=102,
                requirement_id=requirement.id,
                wide_table_id=requirement.wide_table.id,
                schema_version=requirement.wide_table.table_schema.version,
                plan_version=2,
                row_status="initialized",
                dimension_values={"company": "Pony.ai", "city": "旧金山"},
                business_date="2025-12-31",
                row_binding_key="business_date:2025-12-31|company:Pony.ai|city:旧金山",
                indicator_values={
                    "mpi_takeover_miles": IndicatorCell(),
                    "incident_rate": IndicatorCell(),
                },
                system_values={"row_status": "initialized", "last_task_id": None, "updated_at": None},
            ),
        ]
        repo.save_wide_table_rows(preview_rows)

        task_groups_before = repo.list_task_groups(requirement.id)
        self.assertEqual(len(task_groups_before), 3)

        jobs = asyncio.run(self.app.state.scheduler.trigger_scheduled())

        self.assertFalse(
            any(job.wide_table_id == requirement.wide_table.id for job in jobs),
            "ready requirement should not emit scheduled jobs",
        )
        task_groups_after = repo.list_task_groups(requirement.id)
        self.assertEqual(len(task_groups_after), 3)
        self.assertEqual(
            {task_group.business_date for task_group in task_groups_after},
            {"2025-12-31", "2026-01-31", "2026-02-28"},
        )
