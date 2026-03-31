"""Reproduce: executing 自动驾驶安全月度采集 task group produces no data."""
from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

import httpx
from fastapi.testclient import TestClient

from app.main import create_app
from app.schemas import ExecutionRecord
from app.services.agent_service import (
    AgentExecutionResponse,
    AgentIndicatorResult,
    CollectionAgentService,
)


def _mock_handler(request: httpx.Request) -> httpx.Response:
    payload = json.loads(request.content.decode())
    indicators = []
    retrieval_tasks = []
    for key in payload["indicator_keys"]:
        indicators.append({
            "indicator_key": key,
            "value": "99.9",
            "value_description": f"{key} mock",
            "data_source": "mock-source",
            "source_url": "https://example.com",
            "source_link": "https://example.com",
            "quote_text": "mock quote",
            "confidence": 0.95,
            "semantic": {
                "kind": "exact",
                "value": 99.9,
                "unit": "test",
                "confidence": 0.95,
                "reasoning": "mock",
            },
        })
        retrieval_tasks.append({
            "indicator_key": key,
            "query": f"search {key}",
            "status": "completed",
            "confidence": 0.95,
            "narrow_row": {
                "wide_table_id": payload["wide_table_id"],
                "row_id": payload["row_id"],
                "dimension_values": payload["dimension_values"],
                "business_date": payload.get("business_date"),
                "indicator_key": key,
                "indicator_name": key,
                "indicator_description": key,
                "indicator_unit": "-",
                "source_site": "mock-source",
                "source_url": "https://example.com",
                "quote_text": "mock quote",
                "result": {
                    "value": "99.9",
                    "data_source": "mock-source",
                    "source_link": "https://example.com",
                },
            },
        })
    return httpx.Response(200, json={
        "task_id": payload["task_id"],
        "status": "completed",
        "indicators": indicators,
        "retrieval_tasks": retrieval_tasks,
        "duration_ms": 50,
    })


class AdSafeExecutionTestCase(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "test.sqlite3"
        self.app = create_app(str(self.db_path))
        self.client = TestClient(self.app, raise_server_exceptions=True)
        self.client.__enter__()

        # Wire mock agent
        agent_service = CollectionAgentService(
            self.app.state.repository,
            base_url="http://agent.test",
            transport=httpx.MockTransport(_mock_handler),
        )
        self.app.state.agent_service = agent_service
        self.app.state.scheduler.agent_service = agent_service

    def tearDown(self):
        self.client.__exit__(None, None, None)
        self.temp_dir.cleanup()

    def test_execute_ad_safe_task_group_fills_wide_table(self):
        """After executing the 自动驾驶安全月度采集 task group, rows must be filled."""
        # --- before ---
        rows_before = self.client.get("/api/wide-tables/WT-AD-SAFE/rows").json()
        target_row_before = next(
            row
            for row in rows_before
            if row["business_date"] == "2026-02-28"
            and row["dimension_values"]["company"] == "Pony.ai"
        )
        self.assertIsNone(target_row_before["indicator_values"]["incident_rate"]["value"])
        self.assertEqual(target_row_before["indicator_values"]["mpi_takeover_miles"]["value"], 74800)

        tgs = self.client.get(
            "/api/projects/PROJ-001/requirements/REQ-2026-004/task-groups"
        ).json()
        self.assertEqual(len(tgs), 3)
        tg_id = next(task_group["id"] for task_group in tgs if task_group["business_date"] == "2026-02-28")
        repo = self.app.state.repository
        records_before = {
            task.id: len(repo.list_execution_records(task.id))
            for task in repo.list_tasks_by_task_group(tg_id)
        }

        # --- execute ---
        resp = self.client.post(f"/api/task-groups/{tg_id}/execute")
        self.assertEqual(resp.status_code, 200)

        # --- after ---
        tg = repo.get_task_group(tg_id)
        self.assertIsNotNone(tg)
        assert tg is not None
        self.assertEqual(tg.status, "completed")

        tasks = repo.list_tasks_by_task_group(tg_id)
        completed = [t for t in tasks if t.status == "completed"]
        self.assertEqual(len(completed), len(tasks), "all tasks should complete")
        self.assertEqual(
            len(repo.list_execution_records("FT-WT-AD-SAFE-R005-IG-AD-SAFE-MPI")),
            records_before["FT-WT-AD-SAFE-R005-IG-AD-SAFE-MPI"],
        )
        self.assertEqual(
            len(repo.list_execution_records("FT-WT-AD-SAFE-R005-IG-AD-SAFE-INCIDENT")),
            records_before["FT-WT-AD-SAFE-R005-IG-AD-SAFE-INCIDENT"],
        )
        self.assertEqual(
            len(repo.list_execution_records("FT-WT-AD-SAFE-R006-IG-AD-SAFE-MPI")),
            records_before["FT-WT-AD-SAFE-R006-IG-AD-SAFE-MPI"],
        )
        self.assertEqual(
            len(repo.list_execution_records("FT-WT-AD-SAFE-R006-IG-AD-SAFE-INCIDENT")),
            records_before["FT-WT-AD-SAFE-R006-IG-AD-SAFE-INCIDENT"] + 1,
        )

        rows_after = self.client.get("/api/wide-tables/WT-AD-SAFE/rows").json()
        target_row_after = next(
            row
            for row in rows_after
            if row["business_date"] == "2026-02-28"
            and row["dimension_values"]["company"] == "Pony.ai"
        )
        self.assertEqual(target_row_after["indicator_values"]["incident_rate"]["value"], "99.9")
        self.assertEqual(target_row_after["indicator_values"]["mpi_takeover_miles"]["value"], 74800)
        self.assertEqual(target_row_after["row_status"], "completed")
        self.assertEqual(target_row_after["system_values"]["row_status"], "completed")
        self.assertEqual(
            target_row_after["system_values"]["last_task_id"],
            "FT-WT-AD-SAFE-R006-IG-AD-SAFE-INCIDENT",
        )
        self.assertIsNotNone(target_row_after["system_values"]["updated_at"])

    def test_persist_success_merges_latest_row_state_before_writing(self):
        repo = self.app.state.repository
        agent_service = self.app.state.agent_service

        mpi_task = repo.get_task_by_id("FT-WT-AD-SAFE-R006-IG-AD-SAFE-MPI")
        incident_task = repo.get_task_by_id("FT-WT-AD-SAFE-R006-IG-AD-SAFE-INCIDENT")
        self.assertIsNotNone(mpi_task)
        self.assertIsNotNone(incident_task)
        assert mpi_task is not None
        assert incident_task is not None

        # Load both contexts before either write happens to reproduce the stale-row race.
        mpi_context = agent_service._load_context(mpi_task)
        incident_context = agent_service._load_context(incident_task)

        incident_record = ExecutionRecord(
            id="run-incident",
            task_id=incident_task.id,
            trigger_type="manual",
            status="running",
            started_at="2026-03-27T10:30:00",
            operator="manual",
            log_ref="log://test/run-incident",
        )
        mpi_record = ExecutionRecord(
            id="run-mpi",
            task_id=mpi_task.id,
            trigger_type="manual",
            status="running",
            started_at="2026-03-27T10:30:01",
            operator="manual",
            log_ref="log://test/run-mpi",
        )

        incident_response = AgentExecutionResponse(
            task_id=incident_task.id,
            status="completed",
            indicators=[
                AgentIndicatorResult(
                    indicator_key="incident_rate",
                    value="64.8",
                    value_description="事故率 mock 采集结果",
                    data_source="dmv.ca.gov",
                    source_url="https://dmv.ca.gov/",
                    source_link="https://dmv.ca.gov/",
                    confidence=0.87,
                )
            ],
            retrieval_tasks=[],
            duration_ms=120,
        )
        mpi_response = AgentExecutionResponse(
            task_id=mpi_task.id,
            status="completed",
            indicators=[
                AgentIndicatorResult(
                    indicator_key="mpi_takeover_miles",
                    value="447.86",
                    value_description="MPI接管里程 mock 采集结果",
                    data_source="dmv.ca.gov",
                    source_url="https://dmv.ca.gov/",
                    source_link="https://dmv.ca.gov/",
                    confidence=0.89,
                )
            ],
            retrieval_tasks=[],
            duration_ms=120,
        )

        agent_service._persist_success(
            incident_task,
            incident_record,
            incident_response,
            incident_context,
        )
        agent_service._persist_success(
            mpi_task,
            mpi_record,
            mpi_response,
            mpi_context,
        )

        merged_row = repo.get_wide_table_row("WT-AD-SAFE", 6)
        self.assertIsNotNone(merged_row)
        assert merged_row is not None
        self.assertEqual(merged_row.row_status, "completed")
        self.assertEqual(merged_row.system_values["row_status"], "completed")
        self.assertEqual(merged_row.indicator_values["incident_rate"].value, "64.8")
        self.assertEqual(merged_row.indicator_values["mpi_takeover_miles"].value, "447.86")
