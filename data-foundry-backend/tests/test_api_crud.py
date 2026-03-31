"""Integration tests for the new CRUD API endpoints."""
from __future__ import annotations

import asyncio
import json
import tempfile
import unittest
from pathlib import Path

import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.main import create_app
from app.services.agent_service import CollectionAgentService


class ApiCrudTestCase(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "test-api.sqlite3"
        self.app = create_app(str(self.db_path))
        self.client = TestClient(self.app, raise_server_exceptions=True)
        self.client.__enter__()

    def test_health(self):
        r = self.client.get("/health")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["status"], "ok")

    def tearDown(self):
        self.client.__exit__(None, None, None)
        self.temp_dir.cleanup()

    def test_list_projects_returns_seed_data(self):
        r = self.client.get("/api/projects")
        self.assertEqual(r.status_code, 200)
        projects = r.json()
        self.assertGreater(len(projects), 0)

    def test_create_and_read_project(self):
        body = {
            "name": "Test Project",
            "owner_team": "QA",
            "description": "A test project",
        }
        r = self.client.post("/api/projects", json=body)
        self.assertEqual(r.status_code, 201)
        created = r.json()
        self.assertEqual(created["name"], "Test Project")
        self.assertTrue(created["id"].startswith("PRJ-"))

        r2 = self.client.get(f"/api/projects/{created['id']}")
        self.assertEqual(r2.status_code, 200)
        self.assertEqual(r2.json()["name"], "Test Project")

    def test_update_project(self):
        r = self.client.get("/api/projects")
        pid = r.json()[0]["id"]
        r2 = self.client.put(f"/api/projects/{pid}", json={"name": "Updated"})
        self.assertEqual(r2.status_code, 200)
        self.assertEqual(r2.json()["name"], "Updated")

    def test_list_requirements_with_summaries(self):
        r = self.client.get("/api/projects")
        pid = r.json()[0]["id"]
        r2 = self.client.get(f"/api/projects/{pid}/requirements")
        self.assertEqual(r2.status_code, 200)
        reqs = r2.json()
        self.assertGreater(len(reqs), 0)
        # each item should have summary fields
        first = reqs[0]
        self.assertIn("requirement", first)
        self.assertIn("wide_table_count", first)
        self.assertIn("task_count", first)

    def test_read_requirement(self):
        r = self.client.get("/api/projects")
        pid = r.json()[0]["id"]
        r2 = self.client.get(f"/api/projects/{pid}/requirements")
        rid = r2.json()[0]["requirement"]["id"]
        r3 = self.client.get(f"/api/projects/{pid}/requirements/{rid}")
        self.assertEqual(r3.status_code, 200)
        self.assertEqual(r3.json()["id"], rid)

    def test_create_draft_requirement_without_wide_table(self):
        body = {
            "title": "空白草稿需求",
            "phase": "demo",
            "owner": "业务-待定",
            "assignee": "算法-待定",
            "business_goal": "",
            "background_knowledge": "",
            "delivery_scope": "",
            "collection_policy": {
                "search_engines": [],
                "preferred_sites": [],
                "site_policy": "preferred",
                "knowledge_bases": [],
                "fixed_urls": [],
                "null_policy": "未提及填 NULL",
                "source_priority": "官网优先",
                "value_format": "默认格式",
            },
            "wide_table": None,
        }
        r = self.client.post("/api/projects/PROJ-001/requirements", json=body)
        self.assertEqual(r.status_code, 201)
        created = r.json()
        self.assertEqual(created["phase"], "demo")
        self.assertEqual(created["status"], "draft")
        self.assertIsNone(created["wide_table"])

        r2 = self.client.get(f"/api/projects/PROJ-001/requirements/{created['id']}")
        self.assertEqual(r2.status_code, 200)
        self.assertIsNone(r2.json()["wide_table"])

    def test_convert_requirement_persists_phase_and_status(self):
        r = self.client.post("/api/projects/PROJ-001/requirements/REQ-2026-001/convert")
        self.assertEqual(r.status_code, 200)
        converted = r.json()
        self.assertEqual(converted["phase"], "production")
        self.assertEqual(converted["status"], "scoping")
        self.assertTrue(converted["schema_locked"])
        self.assertIsNone(converted["data_update_enabled"])
        self.assertIsNone(converted["data_update_mode"])

        r2 = self.client.get("/api/projects/PROJ-001/requirements/REQ-2026-001")
        self.assertEqual(r2.status_code, 200)
        self.assertEqual(r2.json()["phase"], "production")
        self.assertEqual(r2.json()["status"], "scoping")
        self.assertIsNone(r2.json()["data_update_enabled"])
        self.assertIsNone(r2.json()["data_update_mode"])

    def test_convert_requirement_is_idempotent_after_first_success(self):
        first = self.client.post("/api/projects/PROJ-001/requirements/REQ-2026-001/convert")
        self.assertEqual(first.status_code, 200)

        second = self.client.post("/api/projects/PROJ-001/requirements/REQ-2026-001/convert")
        self.assertEqual(second.status_code, 200)
        converted = second.json()
        self.assertEqual(converted["phase"], "production")
        self.assertEqual(converted["status"], "scoping")

    def test_list_requirement_rows(self):
        r = self.client.get("/api/projects")
        pid = r.json()[0]["id"]
        r2 = self.client.get(f"/api/projects/{pid}/requirements")
        rid = r2.json()[0]["requirement"]["id"]
        r3 = self.client.get(f"/api/projects/{pid}/requirements/{rid}/rows")
        self.assertEqual(r3.status_code, 200)
        self.assertIsInstance(r3.json(), list)

    def test_update_wide_table_row_preserves_existing_indicator_metadata(self):
        before = self.client.get("/api/wide-tables/WT-AD-OPS/rows")
        self.assertEqual(before.status_code, 200)
        target_row = next(row for row in before.json() if row["row_id"] == 1)
        self.assertEqual(target_row["indicator_values"]["order_volume"]["source_link"], "https://waymo.com/safety/")

        updated = self.client.put(
            "/api/wide-tables/WT-AD-OPS/rows/1",
            json={
                "indicator_values": {
                    "order_volume": {
                        "value": 153500,
                    }
                }
            },
        )
        self.assertEqual(updated.status_code, 200)

        after = self.client.get("/api/wide-tables/WT-AD-OPS/rows").json()
        updated_row = next(row for row in after if row["row_id"] == 1)
        self.assertEqual(updated_row["indicator_values"]["order_volume"]["value"], 153500)
        self.assertEqual(updated_row["indicator_values"]["order_volume"]["source_link"], "https://waymo.com/safety/")

    def test_persist_wide_table_preview_preserves_existing_indicator_values(self):
        response = self.client.post(
            "/api/requirements/REQ-2026-001/wide-tables/WT-AD-OPS/preview",
            json={
                "scope": {
                    "business_date": {
                        "column_key": "biz_date",
                        "start": "2025-01",
                        "end": "2025-01",
                        "frequency": "monthly",
                        "latest_year_quarterly": False,
                    },
                    "dimensions": [
                        {"column_key": "company", "values": ["Waymo", "Pony.ai"]},
                        {"column_key": "city", "values": ["旧金山"]},
                    ],
                },
                "indicator_groups": [
                    {
                        "id": "IG-AD-OPS-CORE",
                        "name": "运营核心指标组",
                        "indicator_columns": ["order_volume", "fleet_size"],
                        "priority": 10,
                        "description": "",
                    }
                ],
                "rows": [
                    {
                        "row_id": 1,
                        "plan_version": 1,
                        "row_status": "initialized",
                        "dimension_values": {"company": "Waymo", "city": "旧金山"},
                        "business_date": "2025-01",
                        "system_values": {"category_note": "保留现有指标值"},
                    }
                ],
                "task_groups": [],
                "status": "initialized",
                "record_count": 1,
            },
        )
        self.assertEqual(response.status_code, 200)

        rows = self.client.get("/api/wide-tables/WT-AD-OPS/rows").json()
        updated_row = next(row for row in rows if row["row_id"] == 1)
        self.assertEqual(updated_row["indicator_values"]["order_volume"]["value"], 152000)
        self.assertEqual(updated_row["system_values"]["category_note"], "保留现有指标值")

    def test_persist_wide_table_preview_persists_indicator_group_prompt_config(self):
        response = self.client.post(
            "/api/requirements/REQ-2026-001/wide-tables/WT-AD-OPS/preview",
            json={
                "scope": {
                    "business_date": None,
                    "dimensions": [
                        {"column_key": "company", "values": ["Waymo"]},
                    ],
                },
                "indicator_groups": [
                    {
                        "id": "IG-AD-OPS-CORE",
                        "name": "运营核心指标组",
                        "indicator_columns": [
                            "fleet_size",
                            "operating_mileage",
                            "order_price",
                            "order_count",
                        ],
                        "priority": 10,
                        "description": "优先核对官网快照口径",
                        "prompt_config": {
                            "core_query_requirement": "先采集公开披露的运营快照。",
                            "business_knowledge": "不同运营商之间必须保持同口径对比。",
                            "output_constraints": "只返回结构化结果。",
                            "last_edited_at": "2026-03-25T10:00:00",
                        },
                    }
                ],
                "rows": [
                    {
                        "row_id": 1,
                        "plan_version": 1,
                        "row_status": "initialized",
                        "dimension_values": {"company": "Waymo"},
                        "business_date": None,
                        "system_values": {},
                    }
                ],
                "task_groups": [],
                "semantic_time_axis": "none",
                "collection_coverage_mode": "full_snapshot",
                "status": "initialized",
                "record_count": 1,
            },
        )
        self.assertEqual(response.status_code, 200)

        requirement = self.client.get("/api/projects/PROJ-001/requirements/REQ-2026-001").json()
        indicator_group = requirement["wide_table"]["indicator_groups"][0]
        self.assertEqual(indicator_group["description"], "优先核对官网快照口径")
        self.assertEqual(
            indicator_group["prompt_config"]["core_query_requirement"],
            "先采集公开披露的运营快照。",
        )

    def test_persist_wide_table_preview_supports_snapshot_only_tables(self):
        response = self.client.post(
            "/api/requirements/REQ-2026-004/wide-tables/WT-AD-SAFE/preview",
            json={
                "schema": {
                    "table_name": "ads_autodrive_safety_snapshot",
                    "version": 1,
                    "id_column": {
                        "key": "id",
                        "name": "行ID",
                        "role": "id",
                        "data_type": "integer",
                        "description": "宽表整数型行主键。",
                        "required": True,
                        "is_business_date": False,
                    },
                    "dimension_columns": [
                        {
                            "key": "company",
                            "name": "公司",
                            "role": "dimension",
                            "data_type": "string",
                            "description": "运营主体。",
                            "required": True,
                            "is_business_date": False,
                        },
                        {
                            "key": "city",
                            "name": "城市",
                            "role": "dimension",
                            "data_type": "string",
                            "description": "业务发生城市。",
                            "required": True,
                            "is_business_date": False,
                        },
                    ],
                    "indicator_columns": [
                        {
                            "key": "mpi_takeover_miles",
                            "name": "MPI接管里程",
                            "role": "indicator",
                            "data_type": "number",
                            "description": "发生人工接管前的自动驾驶里程。",
                            "required": True,
                            "unit": "公里",
                            "is_business_date": False,
                        },
                        {
                            "key": "incident_rate",
                            "name": "事故率",
                            "role": "indicator",
                            "data_type": "number",
                            "description": "按百万公里归一化后的事故率。",
                            "required": True,
                            "unit": "次/百万公里",
                            "is_business_date": False,
                        },
                    ],
                    "system_columns": [
                        {
                            "key": "row_status",
                            "name": "行状态",
                            "role": "system",
                            "data_type": "string",
                            "description": "系统维护的宽表行状态。",
                            "required": True,
                            "is_business_date": False,
                        },
                        {
                            "key": "last_task_id",
                            "name": "最近任务ID",
                            "role": "system",
                            "data_type": "string",
                            "description": "最近一次触发采集的任务ID。",
                            "required": True,
                            "is_business_date": False,
                        },
                        {
                            "key": "updated_at",
                            "name": "更新时间",
                            "role": "system",
                            "data_type": "datetime",
                            "description": "最近一次写回宽表的时间。",
                            "required": True,
                            "is_business_date": False,
                        },
                    ],
                },
                "scope": {
                    "dimensions": [
                        {"column_key": "company", "values": ["Waymo", "Pony.ai"]},
                        {"column_key": "city", "values": ["旧金山"]},
                    ],
                },
                "indicator_groups": [
                    {
                        "id": "IG-AD-SAFE-MPI",
                        "name": "接管里程指标组",
                        "indicator_columns": ["mpi_takeover_miles"],
                        "priority": 20,
                        "description": "",
                    },
                    {
                        "id": "IG-AD-SAFE-INCIDENT",
                        "name": "事故率指标组",
                        "indicator_columns": ["incident_rate"],
                        "priority": 20,
                        "description": "",
                    },
                ],
                "rows": [
                    {
                        "row_id": 1,
                        "plan_version": 2,
                        "row_status": "initialized",
                        "dimension_values": {"company": "Waymo", "city": "旧金山"},
                        "business_date": None,
                        "row_binding_key": "company:Waymo|city:旧金山",
                        "system_values": {},
                    },
                    {
                        "row_id": 2,
                        "plan_version": 2,
                        "row_status": "initialized",
                        "dimension_values": {"company": "Pony.ai", "city": "旧金山"},
                        "business_date": None,
                        "row_binding_key": "company:Pony.ai|city:旧金山",
                        "system_values": {},
                    },
                ],
                "task_groups": [],
                "semantic_time_axis": "none",
                "collection_coverage_mode": "full_snapshot",
                "status": "initialized",
                "record_count": 2,
            },
        )
        self.assertEqual(response.status_code, 200)

        wide_table = self.app.state.repository.get_wide_table("WT-AD-SAFE")
        self.assertIsNotNone(wide_table)
        assert wide_table is not None
        self.assertEqual(wide_table.semantic_time_axis, "none")
        self.assertEqual(wide_table.collection_coverage_mode, "full_snapshot")
        self.assertIsNone(wide_table.scope.business_date)

        rows = self.app.state.repository.list_wide_table_rows("WT-AD-SAFE")
        current_rows = [row for row in rows if row.plan_version == 2]
        self.assertEqual(len(current_rows), 2)
        self.assertTrue(all(row.business_date is None for row in current_rows))
        self.assertTrue(
            all(row.schema_version == wide_table.table_schema.version for row in current_rows)
        )

        current_requirement_rows = self.app.state.repository.list_requirement_rows("REQ-2026-004")
        self.assertEqual(len(current_requirement_rows), 2)

    def test_persist_wide_table_plan_supports_snapshot_only_full_table_partition(self):
        response = self.client.post(
            "/api/requirements/REQ-2026-004/wide-tables/WT-AD-SAFE/plan",
            json={
                "schema": {
                    "table_name": "ads_autodrive_safety_snapshot",
                    "version": 1,
                    "id_column": {
                        "key": "id",
                        "name": "行ID",
                        "role": "id",
                        "data_type": "integer",
                        "description": "宽表整数型行主键。",
                        "required": True,
                        "is_business_date": False,
                    },
                    "dimension_columns": [
                        {
                            "key": "company",
                            "name": "公司",
                            "role": "dimension",
                            "data_type": "string",
                            "description": "运营主体。",
                            "required": True,
                            "is_business_date": False,
                        },
                        {
                            "key": "city",
                            "name": "城市",
                            "role": "dimension",
                            "data_type": "string",
                            "description": "业务发生城市。",
                            "required": True,
                            "is_business_date": False,
                        },
                    ],
                    "indicator_columns": [
                        {
                            "key": "mpi_takeover_miles",
                            "name": "MPI接管里程",
                            "role": "indicator",
                            "data_type": "number",
                            "description": "发生人工接管前的自动驾驶里程。",
                            "required": True,
                            "unit": "公里",
                            "is_business_date": False,
                        },
                        {
                            "key": "incident_rate",
                            "name": "事故率",
                            "role": "indicator",
                            "data_type": "number",
                            "description": "按百万公里归一化后的事故率。",
                            "required": True,
                            "unit": "次/百万公里",
                            "is_business_date": False,
                        },
                    ],
                    "system_columns": [
                        {
                            "key": "row_status",
                            "name": "行状态",
                            "role": "system",
                            "data_type": "string",
                            "description": "系统维护的宽表行状态。",
                            "required": True,
                            "is_business_date": False,
                        },
                        {
                            "key": "last_task_id",
                            "name": "最近任务ID",
                            "role": "system",
                            "data_type": "string",
                            "description": "最近一次触发采集的任务ID。",
                            "required": True,
                            "is_business_date": False,
                        },
                        {
                            "key": "updated_at",
                            "name": "更新时间",
                            "role": "system",
                            "data_type": "datetime",
                            "description": "最近一次写回宽表的时间。",
                            "required": True,
                            "is_business_date": False,
                        },
                    ],
                },
                "scope": {
                    "dimensions": [
                        {"column_key": "company", "values": ["Waymo", "Pony.ai"]},
                        {"column_key": "city", "values": ["旧金山"]},
                    ],
                },
                "indicator_groups": [
                    {
                        "id": "IG-AD-SAFE-MPI",
                        "name": "接管里程指标组",
                        "indicator_columns": ["mpi_takeover_miles"],
                        "priority": 20,
                        "description": "",
                    },
                    {
                        "id": "IG-AD-SAFE-INCIDENT",
                        "name": "事故率指标组",
                        "indicator_columns": ["incident_rate"],
                        "priority": 20,
                        "description": "",
                    },
                ],
                "rows": [
                    {
                        "row_id": 1,
                        "plan_version": 2,
                        "row_status": "initialized",
                        "dimension_values": {"company": "Waymo", "city": "旧金山"},
                        "business_date": None,
                        "row_binding_key": "company:Waymo|city:旧金山",
                        "system_values": {},
                    },
                    {
                        "row_id": 2,
                        "plan_version": 2,
                        "row_status": "initialized",
                        "dimension_values": {"company": "Pony.ai", "city": "旧金山"},
                        "business_date": None,
                        "row_binding_key": "company:Pony.ai|city:旧金山",
                        "system_values": {},
                    },
                ],
                "task_groups": [
                    {
                        "id": "tg_WT-AD-SAFE_snapshot_r2",
                        "batch_id": None,
                        "business_date": None,
                        "plan_version": 2,
                        "status": "pending",
                        "partition_type": "full_table",
                        "partition_key": "full_table",
                        "partition_label": "当前快照",
                        "total_tasks": 4,
                        "completed_tasks": 0,
                        "failed_tasks": 0,
                        "triggered_by": "manual",
                    }
                ],
                "semantic_time_axis": "none",
                "collection_coverage_mode": "full_snapshot",
                "status": "initialized",
                "record_count": 2,
            },
        )
        self.assertEqual(response.status_code, 200)

        task_groups = self.app.state.repository.list_task_groups("REQ-2026-004")
        scoped_groups = [group for group in task_groups if group.wide_table_id == "WT-AD-SAFE"]
        self.assertEqual(len(scoped_groups), 1)
        self.assertEqual(scoped_groups[0].partition_type, "full_table")
        self.assertIsNone(scoped_groups[0].business_date)

    def test_execute_snapshot_only_task_group_passes_snapshot_context_to_agent(self):
        response = self.client.post(
            "/api/requirements/REQ-2026-004/wide-tables/WT-AD-SAFE/plan",
            json={
                "schema": {
                    "table_name": "ads_autodrive_safety_snapshot",
                    "version": 1,
                    "id_column": {
                        "key": "id",
                        "name": "行ID",
                        "role": "id",
                        "data_type": "integer",
                        "description": "宽表整数型行主键。",
                        "required": True,
                        "is_business_date": False,
                    },
                    "dimension_columns": [
                        {
                            "key": "company",
                            "name": "公司",
                            "role": "dimension",
                            "data_type": "string",
                            "description": "运营主体。",
                            "required": True,
                            "is_business_date": False,
                        },
                        {
                            "key": "city",
                            "name": "城市",
                            "role": "dimension",
                            "data_type": "string",
                            "description": "业务发生城市。",
                            "required": True,
                            "is_business_date": False,
                        },
                    ],
                    "indicator_columns": [
                        {
                            "key": "mpi_takeover_miles",
                            "name": "MPI接管里程",
                            "role": "indicator",
                            "data_type": "number",
                            "description": "发生人工接管前的自动驾驶里程。",
                            "required": True,
                            "unit": "公里",
                            "is_business_date": False,
                        },
                        {
                            "key": "incident_rate",
                            "name": "事故率",
                            "role": "indicator",
                            "data_type": "number",
                            "description": "按百万公里归一化后的事故率。",
                            "required": True,
                            "unit": "次/百万公里",
                            "is_business_date": False,
                        },
                    ],
                    "system_columns": [
                        {
                            "key": "row_status",
                            "name": "行状态",
                            "role": "system",
                            "data_type": "string",
                            "description": "系统维护的宽表行状态。",
                            "required": True,
                            "is_business_date": False,
                        },
                        {
                            "key": "last_task_id",
                            "name": "最近任务ID",
                            "role": "system",
                            "data_type": "string",
                            "description": "最近一次触发采集的任务ID。",
                            "required": True,
                            "is_business_date": False,
                        },
                        {
                            "key": "updated_at",
                            "name": "更新时间",
                            "role": "system",
                            "data_type": "datetime",
                            "description": "最近一次写回宽表的时间。",
                            "required": True,
                            "is_business_date": False,
                        },
                    ],
                },
                "scope": {
                    "dimensions": [
                        {"column_key": "company", "values": ["Waymo"]},
                        {"column_key": "city", "values": ["旧金山"]},
                    ],
                },
                "indicator_groups": [
                    {
                        "id": "IG-AD-SAFE-SNAPSHOT",
                        "name": "安全快照指标组",
                        "indicator_columns": ["mpi_takeover_miles", "incident_rate"],
                        "priority": 20,
                        "description": "",
                        "agent": "ops-agent",
                    }
                ],
                "rows": [
                    {
                        "row_id": 1,
                        "plan_version": 3,
                        "row_status": "initialized",
                        "dimension_values": {"company": "Waymo", "city": "旧金山"},
                        "business_date": None,
                        "row_binding_key": "company:Waymo|city:旧金山",
                        "system_values": {},
                    }
                ],
                "task_groups": [
                    {
                        "id": "tg_WT-AD-SAFE_snapshot_r3",
                        "batch_id": None,
                        "business_date": None,
                        "plan_version": 3,
                        "status": "pending",
                        "partition_type": "full_table",
                        "partition_key": "full_table",
                        "partition_label": "2026-03-24 快照",
                        "total_tasks": 1,
                        "completed_tasks": 0,
                        "failed_tasks": 0,
                        "triggered_by": "manual",
                        "created_at": "2026-03-24T09:00:00",
                        "updated_at": "2026-03-24T09:00:00",
                    }
                ],
                "semantic_time_axis": "none",
                "collection_coverage_mode": "full_snapshot",
                "status": "initialized",
                "record_count": 1,
            },
        )
        self.assertEqual(response.status_code, 200)

        def mock_handler(request: httpx.Request) -> httpx.Response:
            payload = json.loads(request.content.decode())
            self.assertIsNone(payload["business_date"])
            self.assertEqual(payload["collection_coverage_mode"], "full_snapshot")
            self.assertEqual(payload["task_group_id"], "tg_WT-AD-SAFE_snapshot_r3")
            self.assertEqual(payload["snapshot_label"], "2026-03-24 快照")
            self.assertEqual(payload["snapshot_at"], "2026-03-24T09:00:00")
            return httpx.Response(
                200,
                json={
                    "task_id": payload["task_id"],
                    "status": "completed",
                    "indicators": [
                        {
                            "indicator_key": "mpi_takeover_miles",
                            "value": "865.40",
                            "value_description": "MPI接管里程 mock 结果",
                            "data_source": "waymo.com",
                            "source_url": "https://waymo.com/safety",
                            "source_link": "https://waymo.com/safety",
                            "quote_text": "在 2026-03-24 全量快照中，Waymo / 旧金山的MPI接管里程为 865.40公里。",
                            "confidence": 0.93,
                            "semantic": {"kind": "exact", "value": 865.4, "unit": "公里", "confidence": 0.93},
                        },
                        {
                            "indicator_key": "incident_rate",
                            "value": "3.80",
                            "value_description": "事故率 mock 结果",
                            "data_source": "waymo.com",
                            "source_url": "https://waymo.com/incidents",
                            "source_link": "https://waymo.com/incidents",
                            "quote_text": "在 2026-03-24 全量快照中，Waymo / 旧金山的事故率为 3.80次/百万公里。",
                            "confidence": 0.9,
                            "semantic": {"kind": "exact", "value": 3.8, "unit": "次/百万公里", "confidence": 0.9},
                        },
                    ],
                    "retrieval_tasks": [
                        {
                            "indicator_key": "mpi_takeover_miles",
                            "query": "MPI接管里程 2026-03-24 快照 Waymo 旧金山",
                            "status": "completed",
                            "confidence": 0.93,
                            "narrow_row": {
                                "wide_table_id": "WT-AD-SAFE",
                                "row_id": 1,
                                "dimension_values": {"company": "Waymo", "city": "旧金山"},
                                "business_date": None,
                                "indicator_key": "mpi_takeover_miles",
                                "indicator_name": "MPI接管里程",
                                "indicator_description": "发生人工接管前的自动驾驶里程。",
                                "indicator_unit": "公里",
                                "unit": "公里",
                                "published_at": "2026-03-24",
                                "source_site": "waymo.com",
                                "indicator_logic": "发生人工接管前的自动驾驶里程。",
                                "indicator_logic_supplement": "mock agent=ops-agent snapshot=2026-03-24 快照",
                                "max_value": 934.63,
                                "min_value": 796.17,
                                "source_url": "https://waymo.com/safety",
                                "quote_text": "在 2026-03-24 全量快照中，Waymo / 旧金山的MPI接管里程为 865.40公里。",
                                "result": {
                                    "value": "865.40",
                                    "value_description": "MPI接管里程 mock 结果",
                                    "max_value": 934.63,
                                    "min_value": 796.17,
                                    "data_source": "waymo.com",
                                    "source_link": "https://waymo.com/safety",
                                },
                            },
                        },
                        {
                            "indicator_key": "incident_rate",
                            "query": "事故率 2026-03-24 快照 Waymo 旧金山",
                            "status": "completed",
                            "confidence": 0.9,
                            "narrow_row": {
                                "wide_table_id": "WT-AD-SAFE",
                                "row_id": 1,
                                "dimension_values": {"company": "Waymo", "city": "旧金山"},
                                "business_date": None,
                                "indicator_key": "incident_rate",
                                "indicator_name": "事故率",
                                "indicator_description": "按百万公里归一化后的事故率。",
                                "indicator_unit": "次/百万公里",
                                "unit": "次/百万公里",
                                "published_at": "2026-03-24",
                                "source_site": "waymo.com",
                                "indicator_logic": "按百万公里归一化后的事故率。",
                                "indicator_logic_supplement": "mock agent=ops-agent snapshot=2026-03-24 快照",
                                "max_value": 4.1,
                                "min_value": 3.5,
                                "source_url": "https://waymo.com/incidents",
                                "quote_text": "在 2026-03-24 全量快照中，Waymo / 旧金山的事故率为 3.80次/百万公里。",
                                "result": {
                                    "value": "3.80",
                                    "value_description": "事故率 mock 结果",
                                    "max_value": 4.1,
                                    "min_value": 3.5,
                                    "data_source": "waymo.com",
                                    "source_link": "https://waymo.com/incidents",
                                },
                            },
                        },
                    ],
                    "duration_ms": 96,
                    "error_message": None,
                },
            )

        agent_service = CollectionAgentService(
            self.app.state.repository,
            base_url="http://agent.test",
            transport=httpx.MockTransport(mock_handler),
        )
        self.app.state.agent_service = agent_service
        self.app.state.scheduler.agent_service = agent_service

        execute = self.client.post("/api/task-groups/tg_WT-AD-SAFE_snapshot_r3/execute")
        self.assertEqual(execute.status_code, 200)

        row = self.app.state.repository.get_wide_table_row("WT-AD-SAFE", 1)
        self.assertIsNotNone(row)
        assert row is not None
        self.assertEqual(row.row_status, "completed")
        self.assertEqual(str(row.indicator_values["mpi_takeover_miles"].value), "865.40")
        self.assertEqual(str(row.indicator_values["incident_rate"].value), "3.80")

    def test_persist_wide_table_plan_replaces_rows_and_task_plan(self):
        response = self.client.post(
            "/api/requirements/REQ-2026-001/wide-tables/WT-AD-OPS/plan",
            json={
                "scope": {
                    "business_date": {
                        "column_key": "biz_date",
                        "start": "2025-01",
                        "end": "2025-01",
                        "frequency": "monthly",
                        "latest_year_quarterly": False,
                    },
                    "dimensions": [
                        {"column_key": "company", "values": ["Waymo", "Pony.ai"]},
                        {"column_key": "city", "values": ["旧金山"]},
                    ],
                },
                "indicator_groups": [
                    {
                        "id": "IG-AD-OPS-CORE",
                        "name": "运营核心指标组",
                        "indicator_columns": ["order_volume", "fleet_size"],
                        "priority": 10,
                        "description": "",
                    }
                ],
                "rows": [
                    {
                        "row_id": 1,
                        "plan_version": 2,
                        "row_status": "initialized",
                        "dimension_values": {"company": "Waymo", "city": "旧金山"},
                        "business_date": "2025-01",
                        "system_values": {},
                    },
                    {
                        "row_id": 2,
                        "plan_version": 2,
                        "row_status": "initialized",
                        "dimension_values": {"company": "Pony.ai", "city": "旧金山"},
                        "business_date": "2025-01",
                        "system_values": {},
                    },
                ],
                "task_groups": [
                    {
                        "id": "tg_WT-AD-OPS_2025-01_r2",
                        "business_date": "2025-01",
                        "plan_version": 2,
                        "status": "pending",
                        "total_tasks": 2,
                        "completed_tasks": 0,
                        "failed_tasks": 0,
                        "triggered_by": "manual",
                    }
                ],
                "status": "initialized",
                "record_count": 2,
            },
        )
        self.assertEqual(response.status_code, 200)

        rows = self.client.get("/api/wide-tables/WT-AD-OPS/rows").json()
        self.assertEqual(len(rows), 2)
        self.assertTrue(all(row["plan_version"] == 2 for row in rows))

        task_groups = self.client.get("/api/projects/PROJ-001/requirements/REQ-2026-001/task-groups").json()
        self.assertEqual(len(task_groups), 1)
        self.assertEqual(task_groups[0]["id"], "tg_WT-AD-OPS_2025-01_r2")
        self.assertEqual(task_groups[0]["triggered_by"], "manual")

        tasks = self.client.get("/api/projects/PROJ-001/requirements/REQ-2026-001/tasks").json()
        self.assertEqual(len(tasks), 2)
        self.assertTrue(all(item["task"]["id"].startswith("ft_tg_WT-AD-OPS_2025-01_r2") for item in tasks))

    def test_execute_task_group_calls_remote_agent_and_persists_results(self):
        response = self.client.post(
            "/api/requirements/REQ-2026-001/wide-tables/WT-AD-OPS/plan",
            json={
                "scope": {
                    "business_date": {
                        "column_key": "biz_date",
                        "start": "2025-01",
                        "end": "2025-01",
                        "frequency": "monthly",
                        "latest_year_quarterly": False,
                    },
                    "dimensions": [
                        {"column_key": "company", "values": ["Waymo"]},
                        {"column_key": "city", "values": ["旧金山"]},
                    ],
                },
                "indicator_groups": [
                    {
                        "id": "IG-AD-OPS-CORE",
                        "name": "运营核心指标组",
                        "indicator_columns": ["order_volume", "fleet_size"],
                        "priority": 10,
                        "description": "",
                        "agent": "ops-agent",
                    }
                ],
                "rows": [
                    {
                        "row_id": 1,
                        "plan_version": 3,
                        "row_status": "initialized",
                        "dimension_values": {"company": "Waymo", "city": "旧金山"},
                        "business_date": "2025-01",
                        "system_values": {},
                    }
                ],
                "task_groups": [
                    {
                        "id": "tg_WT-AD-OPS_2025-01_agent",
                        "business_date": "2025-01",
                        "plan_version": 3,
                        "status": "pending",
                        "total_tasks": 1,
                        "completed_tasks": 0,
                        "failed_tasks": 0,
                        "triggered_by": "manual",
                    }
                ],
                "status": "initialized",
                "record_count": 1,
            },
        )
        self.assertEqual(response.status_code, 200)

        def mock_handler(request: httpx.Request) -> httpx.Response:
            self.assertEqual(request.url.path, "/agent/executions")
            payload = json.loads(request.content.decode())
            return httpx.Response(
                200,
                json={
                    "task_id": payload["task_id"],
                    "status": "completed",
                    "indicators": [
                        {
                            "indicator_key": "order_volume",
                            "value": "128000",
                            "value_description": "订单量 mock 结果",
                            "data_source": "waymo.com",
                            "source_url": "https://waymo.com/safety",
                            "source_link": "https://waymo.com/safety",
                            "quote_text": "在 2025-01 的披露中，Waymo / 旧金山的订单量为 128000 单。",
                            "confidence": 0.95,
                            "semantic": {"kind": "exact", "value": 128000, "unit": "单", "confidence": 0.95},
                        },
                        {
                            "indicator_key": "fleet_size",
                            "value": "860",
                            "value_description": "车队规模 mock 结果",
                            "data_source": "waymo.com",
                            "source_url": "https://waymo.com/fleet",
                            "source_link": "https://waymo.com/fleet",
                            "quote_text": "在 2025-01 的披露中，Waymo / 旧金山的车队规模为 860 辆。",
                            "confidence": 0.9,
                            "semantic": {"kind": "exact", "value": 860, "unit": "辆", "confidence": 0.9},
                        },
                    ],
                    "retrieval_tasks": [
                        {
                            "indicator_key": "order_volume",
                            "query": "订单量 2025-01 Waymo 旧金山",
                            "status": "completed",
                            "confidence": 0.95,
                            "narrow_row": {
                                "wide_table_id": "WT-AD-OPS",
                                "row_id": 1,
                                "dimension_values": {"company": "Waymo", "city": "旧金山"},
                                "business_date": "2025-01",
                                "indicator_key": "order_volume",
                                "indicator_name": "订单量",
                                "indicator_description": "月订单量",
                                "indicator_unit": "单",
                                "unit": "单",
                                "published_at": "2025-01-28",
                                "source_site": "waymo.com",
                                "indicator_logic": "月订单量",
                                "indicator_logic_supplement": "mock agent=ops-agent",
                                "max_value": 138240,
                                "min_value": 117760,
                                "source_url": "https://waymo.com/safety",
                                "quote_text": "在 2025-01 的披露中，Waymo / 旧金山的订单量为 128000 单。",
                                "result": {
                                    "value": "128000",
                                    "value_description": "订单量 mock 结果",
                                    "max_value": 138240,
                                    "min_value": 117760,
                                    "data_source": "waymo.com",
                                    "source_link": "https://waymo.com/safety",
                                },
                            },
                        },
                        {
                            "indicator_key": "fleet_size",
                            "query": "车队规模 2025-01 Waymo 旧金山",
                            "status": "completed",
                            "confidence": 0.9,
                            "narrow_row": {
                                "wide_table_id": "WT-AD-OPS",
                                "row_id": 1,
                                "dimension_values": {"company": "Waymo", "city": "旧金山"},
                                "business_date": "2025-01",
                                "indicator_key": "fleet_size",
                                "indicator_name": "车队规模",
                                "indicator_description": "可运营车队规模",
                                "indicator_unit": "辆",
                                "unit": "辆",
                                "published_at": "2025-01-28",
                                "source_site": "waymo.com",
                                "indicator_logic": "可运营车队规模",
                                "indicator_logic_supplement": "mock agent=ops-agent",
                                "max_value": 928.8,
                                "min_value": 791.2,
                                "source_url": "https://waymo.com/fleet",
                                "quote_text": "在 2025-01 的披露中，Waymo / 旧金山的车队规模为 860 辆。",
                                "result": {
                                    "value": "860",
                                    "value_description": "车队规模 mock 结果",
                                    "max_value": 928.8,
                                    "min_value": 791.2,
                                    "data_source": "waymo.com",
                                    "source_link": "https://waymo.com/fleet",
                                },
                            },
                        },
                    ],
                    "duration_ms": 120,
                    "error_message": None,
                },
            )

        agent_service = CollectionAgentService(
            self.app.state.repository,
            base_url="http://agent.test",
            transport=httpx.MockTransport(mock_handler),
        )
        self.app.state.agent_service = agent_service
        self.app.state.scheduler.agent_service = agent_service

        execute = self.client.post("/api/task-groups/tg_WT-AD-OPS_2025-01_agent/execute")
        self.assertEqual(execute.status_code, 200)

        row = self.app.state.repository.get_wide_table_row("WT-AD-OPS", 1)
        self.assertIsNotNone(row)
        assert row is not None
        self.assertEqual(row.row_status, "completed")
        self.assertEqual(str(row.indicator_values["order_volume"].value), "128000")
        self.assertEqual(str(row.indicator_values["fleet_size"].value), "860")

        task_id = "ft_tg_WT-AD-OPS_2025-01_agent_IG-AD-OPS-CORE_1"
        task = self.app.state.repository.get_task_by_id(task_id)
        self.assertIsNotNone(task)
        assert task is not None
        self.assertEqual(task.status, "completed")
        self.assertAlmostEqual(task.confidence, 0.925, places=3)

        retrieval_tasks = self.app.state.repository.list_retrieval_tasks(task_id)
        self.assertEqual(len(retrieval_tasks), 2)
        self.assertEqual(retrieval_tasks[0].status, "completed")

        execution_records = self.app.state.repository.list_execution_records(task_id)
        self.assertEqual(len(execution_records), 1)
        self.assertEqual(execution_records[0].status, "completed")

    def test_production_plan_auto_executes_historical_groups_and_keeps_future_dates_planned(self):
        converted = self.client.post("/api/projects/PROJ-001/requirements/REQ-2026-001/convert")
        self.assertEqual(converted.status_code, 200)

        called_task_ids: list[str] = []

        def mock_handler(request: httpx.Request) -> httpx.Response:
            payload = json.loads(request.content.decode())
            called_task_ids.append(payload["task_id"])
            return httpx.Response(
                200,
                json={
                    "task_id": payload["task_id"],
                    "status": "completed",
                    "indicators": [
                        {
                            "indicator_key": "order_volume",
                            "value": "101000",
                            "value_description": "订单量 mock 结果",
                            "data_source": "waymo.com",
                            "source_url": "https://waymo.com/safety",
                            "source_link": "https://waymo.com/safety",
                            "quote_text": "在 2026-02 的披露中，Waymo / 旧金山的订单量为 101000 单。",
                            "confidence": 0.91,
                            "semantic": {"kind": "exact", "value": 101000, "unit": "单", "confidence": 0.91},
                        },
                        {
                            "indicator_key": "fleet_size",
                            "value": "620",
                            "value_description": "车队规模 mock 结果",
                            "data_source": "waymo.com",
                            "source_url": "https://waymo.com/fleet",
                            "source_link": "https://waymo.com/fleet",
                            "quote_text": "在 2026-02 的披露中，Waymo / 旧金山的车队规模为 620 辆。",
                            "confidence": 0.89,
                            "semantic": {"kind": "exact", "value": 620, "unit": "辆", "confidence": 0.89},
                        },
                    ],
                    "retrieval_tasks": [
                        {
                            "indicator_key": "order_volume",
                            "query": "订单量 2026-02 Waymo 旧金山",
                            "status": "completed",
                            "confidence": 0.91,
                            "narrow_row": {
                                "wide_table_id": "WT-AD-OPS",
                                "row_id": 1,
                                "dimension_values": {"company": "Waymo", "city": "旧金山"},
                                "business_date": "2026-02-28",
                                "indicator_key": "order_volume",
                                "indicator_name": "订单量",
                                "indicator_description": "月订单量",
                                "indicator_unit": "单",
                                "unit": "单",
                                "published_at": "2026-02-28",
                                "source_site": "waymo.com",
                                "indicator_logic": "月订单量",
                                "indicator_logic_supplement": "mock agent=ops-agent",
                                "max_value": 109080,
                                "min_value": 92920,
                                "source_url": "https://waymo.com/safety",
                                "quote_text": "在 2026-02 的披露中，Waymo / 旧金山的订单量为 101000 单。",
                                "result": {
                                    "value": "101000",
                                    "value_description": "订单量 mock 结果",
                                    "max_value": 109080,
                                    "min_value": 92920,
                                    "data_source": "waymo.com",
                                    "source_link": "https://waymo.com/safety",
                                },
                            },
                        },
                        {
                            "indicator_key": "fleet_size",
                            "query": "车队规模 2026-02 Waymo 旧金山",
                            "status": "completed",
                            "confidence": 0.89,
                            "narrow_row": {
                                "wide_table_id": "WT-AD-OPS",
                                "row_id": 1,
                                "dimension_values": {"company": "Waymo", "city": "旧金山"},
                                "business_date": "2026-02-28",
                                "indicator_key": "fleet_size",
                                "indicator_name": "车队规模",
                                "indicator_description": "可运营车队规模",
                                "indicator_unit": "辆",
                                "unit": "辆",
                                "published_at": "2026-02-28",
                                "source_site": "waymo.com",
                                "indicator_logic": "可运营车队规模",
                                "indicator_logic_supplement": "mock agent=ops-agent",
                                "max_value": 669.6,
                                "min_value": 570.4,
                                "source_url": "https://waymo.com/fleet",
                                "quote_text": "在 2026-02 的披露中，Waymo / 旧金山的车队规模为 620 辆。",
                                "result": {
                                    "value": "620",
                                    "value_description": "车队规模 mock 结果",
                                    "max_value": 669.6,
                                    "min_value": 570.4,
                                    "data_source": "waymo.com",
                                    "source_link": "https://waymo.com/fleet",
                                },
                            },
                        },
                    ],
                    "duration_ms": 98,
                    "error_message": None,
                },
            )

        agent_service = CollectionAgentService(
            self.app.state.repository,
            base_url="http://agent.test",
            transport=httpx.MockTransport(mock_handler),
        )
        self.app.state.agent_service = agent_service
        self.app.state.scheduler.agent_service = agent_service

        response = self.client.post(
            "/api/requirements/REQ-2026-001/wide-tables/WT-AD-OPS/plan",
            json={
                "scope": {
                    "business_date": {
                        "column_key": "biz_date",
                        "start": "2026-02-28",
                        "end": "2026-04-30",
                        "frequency": "monthly",
                        "latest_year_quarterly": False,
                    },
                    "dimensions": [
                        {"column_key": "company", "values": ["Waymo"]},
                        {"column_key": "city", "values": ["旧金山"]},
                    ],
                },
                "indicator_groups": [
                    {
                        "id": "IG-AD-OPS-CORE",
                        "name": "运营核心指标组",
                        "indicator_columns": ["order_volume", "fleet_size"],
                        "priority": 10,
                        "description": "",
                        "agent": "ops-agent",
                    }
                ],
                "rows": [
                    {
                        "row_id": 1,
                        "plan_version": 4,
                        "row_status": "initialized",
                        "dimension_values": {"company": "Waymo", "city": "旧金山"},
                        "business_date": "2026-02-28",
                        "system_values": {},
                    },
                    {
                        "row_id": 2,
                        "plan_version": 4,
                        "row_status": "initialized",
                        "dimension_values": {"company": "Waymo", "city": "旧金山"},
                        "business_date": "2026-03-31",
                        "system_values": {},
                    },
                    {
                        "row_id": 3,
                        "plan_version": 4,
                        "row_status": "initialized",
                        "dimension_values": {"company": "Waymo", "city": "旧金山"},
                        "business_date": "2026-04-30",
                        "system_values": {},
                    },
                ],
                "task_groups": [
                    {
                        "id": "tg_WT-AD-OPS_20260228_r4",
                        "business_date": "2026-02-28",
                        "plan_version": 4,
                        "status": "pending",
                        "total_tasks": 1,
                        "completed_tasks": 0,
                        "failed_tasks": 0,
                        "triggered_by": "backfill",
                    },
                    {
                        "id": "tg_WT-AD-OPS_20260331_r4",
                        "business_date": "2026-03-31",
                        "plan_version": 4,
                        "status": "pending",
                        "total_tasks": 1,
                        "completed_tasks": 0,
                        "failed_tasks": 0,
                        "triggered_by": "schedule",
                    },
                    {
                        "id": "tg_WT-AD-OPS_20260430_r4",
                        "business_date": "2026-04-30",
                        "plan_version": 4,
                        "status": "pending",
                        "total_tasks": 1,
                        "completed_tasks": 0,
                        "failed_tasks": 0,
                        "triggered_by": "schedule",
                    },
                ],
                "status": "initialized",
                "record_count": 3,
            },
        )
        self.assertEqual(response.status_code, 200)

        requirement = self.client.get("/api/projects/PROJ-001/requirements/REQ-2026-001").json()
        self.assertEqual(requirement["status"], "running")

        task_groups = self.client.get("/api/projects/PROJ-001/requirements/REQ-2026-001/task-groups").json()
        scoped_groups = [group for group in task_groups if group["wide_table_id"] == "WT-AD-OPS"]
        self.assertEqual(len(scoped_groups), 1)
        self.assertEqual(scoped_groups[0]["business_date"], "2026-02-28")
        self.assertEqual(scoped_groups[0]["status"], "completed")
        self.assertEqual(scoped_groups[0]["triggered_by"], "backfill")

        tasks = self.client.get("/api/projects/PROJ-001/requirements/REQ-2026-001/tasks").json()
        scoped_tasks = [item for item in tasks if item["task"]["wide_table_id"] == "WT-AD-OPS"]
        self.assertEqual(len(scoped_tasks), 1)
        self.assertEqual(scoped_tasks[0]["task"]["business_date"], "2026-02-28")
        self.assertEqual(scoped_tasks[0]["task"]["status"], "completed")

        rows = self.client.get("/api/wide-tables/WT-AD-OPS/rows").json()
        self.assertEqual(len(rows), 3)
        self.assertEqual(rows[0]["indicator_values"]["order_volume"]["value"], "101000")
        self.assertEqual(called_task_ids, ["ft_tg_WT-AD-OPS_20260228_r4_IG-AD-OPS-CORE_1"])

    def test_production_plan_batch_executes_historical_groups_with_runtime_concurrency_limit(self):
        converted = self.client.post("/api/projects/PROJ-001/requirements/REQ-2026-001/convert")
        self.assertEqual(converted.status_code, 200)

        self.app.state.repository.set_system_setting("max_concurrent_agent_tasks", 2)
        self.app.state.scheduler.set_max_concurrency(2)
        self.assertEqual(self.app.state.scheduler.max_concurrency, 2)

        agent_state = {
            "inflight": 0,
            "max_inflight": 0,
            "calls": [],
        }
        agent_app = FastAPI()

        @agent_app.post("/agent/executions")
        async def execute_agent(payload: dict):
            agent_state["inflight"] += 1
            agent_state["max_inflight"] = max(
                agent_state["max_inflight"],
                agent_state["inflight"],
            )
            agent_state["calls"].append(payload["task_id"])
            try:
                await asyncio.sleep(0.03)
                return {
                    "task_id": payload["task_id"],
                    "status": "completed",
                    "indicators": [
                        {
                            "indicator_key": indicator_key,
                            "value": str(100000 + index),
                            "value_description": f"{indicator_key} mock 结果",
                            "data_source": "mock-agent",
                            "source_url": "https://agent.test/mock",
                            "source_link": "https://agent.test/mock",
                            "quote_text": f"{payload['business_date']} {indicator_key} mock",
                            "confidence": 0.92,
                            "semantic": {
                                "kind": "exact",
                                "value": 100000 + index,
                                "confidence": 0.92,
                            },
                        }
                        for index, indicator_key in enumerate(payload["indicator_keys"], start=1)
                    ],
                    "retrieval_tasks": [],
                    "duration_ms": 30,
                    "error_message": None,
                }
            finally:
                agent_state["inflight"] -= 1

        agent_service = CollectionAgentService(
            self.app.state.repository,
            base_url="http://agent.test",
            transport=httpx.ASGITransport(app=agent_app),
        )
        self.app.state.agent_service = agent_service
        self.app.state.scheduler.agent_service = agent_service

        response = self.client.post(
            "/api/requirements/REQ-2026-001/wide-tables/WT-AD-OPS/plan",
            json={
                "scope": {
                    "business_date": {
                        "column_key": "biz_date",
                        "start": "2022-08-31",
                        "end": "2022-11-30",
                        "frequency": "monthly",
                        "latest_year_quarterly": False,
                    },
                    "dimensions": [
                        {"column_key": "company", "values": ["Waymo"]},
                        {"column_key": "city", "values": ["旧金山"]},
                    ],
                },
                "indicator_groups": [
                    {
                        "id": "IG-AD-OPS-CORE",
                        "name": "运营核心指标组",
                        "indicator_columns": ["order_volume", "fleet_size"],
                        "priority": 10,
                        "description": "",
                        "agent": "ops-agent",
                    }
                ],
                "rows": [
                    {
                        "row_id": 201,
                        "plan_version": 6,
                        "row_status": "initialized",
                        "dimension_values": {"company": "Waymo", "city": "旧金山"},
                        "business_date": "2022-08-31",
                        "system_values": {},
                    },
                    {
                        "row_id": 202,
                        "plan_version": 6,
                        "row_status": "initialized",
                        "dimension_values": {"company": "Waymo", "city": "旧金山"},
                        "business_date": "2022-09-30",
                        "system_values": {},
                    },
                    {
                        "row_id": 203,
                        "plan_version": 6,
                        "row_status": "initialized",
                        "dimension_values": {"company": "Waymo", "city": "旧金山"},
                        "business_date": "2022-10-31",
                        "system_values": {},
                    },
                    {
                        "row_id": 204,
                        "plan_version": 6,
                        "row_status": "initialized",
                        "dimension_values": {"company": "Waymo", "city": "旧金山"},
                        "business_date": "2022-11-30",
                        "system_values": {},
                    },
                ],
                "task_groups": [
                    {
                        "id": "tg_WT-AD-OPS_20220831_r6",
                        "business_date": "2022-08-31",
                        "plan_version": 6,
                        "status": "pending",
                        "total_tasks": 1,
                        "completed_tasks": 0,
                        "failed_tasks": 0,
                        "triggered_by": "backfill",
                    },
                    {
                        "id": "tg_WT-AD-OPS_20220930_r6",
                        "business_date": "2022-09-30",
                        "plan_version": 6,
                        "status": "pending",
                        "total_tasks": 1,
                        "completed_tasks": 0,
                        "failed_tasks": 0,
                        "triggered_by": "backfill",
                    },
                    {
                        "id": "tg_WT-AD-OPS_20221031_r6",
                        "business_date": "2022-10-31",
                        "plan_version": 6,
                        "status": "pending",
                        "total_tasks": 1,
                        "completed_tasks": 0,
                        "failed_tasks": 0,
                        "triggered_by": "backfill",
                    },
                    {
                        "id": "tg_WT-AD-OPS_20221130_r6",
                        "business_date": "2022-11-30",
                        "plan_version": 6,
                        "status": "pending",
                        "total_tasks": 1,
                        "completed_tasks": 0,
                        "failed_tasks": 0,
                        "triggered_by": "backfill",
                    },
                ],
                "status": "initialized",
                "record_count": 4,
            },
        )
        self.assertEqual(response.status_code, 200)

        task_groups = self.client.get("/api/projects/PROJ-001/requirements/REQ-2026-001/task-groups").json()
        scoped_groups = [group for group in task_groups if group["wide_table_id"] == "WT-AD-OPS"]
        self.assertEqual(len(scoped_groups), 4)
        self.assertTrue(all(group["status"] == "completed" for group in scoped_groups))
        self.assertEqual(agent_state["max_inflight"], 2)
        self.assertEqual(len(agent_state["calls"]), 4)

    def test_trigger_scheduled_reconciles_missing_historical_backfill_groups_from_rows(self):
        converted = self.client.post("/api/projects/PROJ-001/requirements/REQ-2026-001/convert")
        self.assertEqual(converted.status_code, 200)

        called_task_ids: list[str] = []

        def mock_handler(request: httpx.Request) -> httpx.Response:
            payload = json.loads(request.content.decode())
            called_task_ids.append(payload["task_id"])
            return httpx.Response(
                200,
                json={
                    "task_id": payload["task_id"],
                    "status": "completed",
                    "indicators": [
                        {
                            "indicator_key": "order_volume",
                            "value": "100001",
                            "value_description": "订单量补数结果",
                            "data_source": "waymo.com",
                            "source_url": "https://waymo.com/safety",
                            "source_link": "https://waymo.com/safety",
                            "quote_text": "mock quote",
                            "confidence": 0.91,
                            "semantic": {"kind": "exact", "value": 100001, "unit": "单", "confidence": 0.91},
                        },
                        {
                            "indicator_key": "fleet_size",
                            "value": "600",
                            "value_description": "车队规模补数结果",
                            "data_source": "waymo.com",
                            "source_url": "https://waymo.com/fleet",
                            "source_link": "https://waymo.com/fleet",
                            "quote_text": "mock quote",
                            "confidence": 0.88,
                            "semantic": {"kind": "exact", "value": 600, "unit": "辆", "confidence": 0.88},
                        },
                    ],
                    "retrieval_tasks": [],
                    "duration_ms": 42,
                    "error_message": None,
                },
            )

        agent_service = CollectionAgentService(
            self.app.state.repository,
            base_url="http://agent.test",
            transport=httpx.MockTransport(mock_handler),
        )
        self.app.state.agent_service = agent_service
        self.app.state.scheduler.agent_service = agent_service

        response = self.client.post(
            "/api/requirements/REQ-2026-001/wide-tables/WT-AD-OPS/preview",
            json={
                "scope": {
                    "business_date": {
                        "column_key": "biz_date",
                        "start": "2026-01-31",
                        "end": "2026-04-30",
                        "frequency": "monthly",
                        "latest_year_quarterly": False,
                    },
                    "dimensions": [
                        {"column_key": "company", "values": ["Waymo"]},
                        {"column_key": "city", "values": ["旧金山"]},
                    ],
                },
                "indicator_groups": [
                    {
                        "id": "IG-AD-OPS-CORE",
                        "name": "运营核心指标组",
                        "indicator_columns": ["order_volume", "fleet_size"],
                        "priority": 10,
                        "description": "",
                        "agent": "ops-agent",
                    }
                ],
                "rows": [
                    {
                        "row_id": 101,
                        "plan_version": 5,
                        "row_status": "initialized",
                        "dimension_values": {"company": "Waymo", "city": "旧金山"},
                        "business_date": "2026-01-31",
                        "system_values": {},
                    },
                    {
                        "row_id": 102,
                        "plan_version": 5,
                        "row_status": "initialized",
                        "dimension_values": {"company": "Waymo", "city": "旧金山"},
                        "business_date": "2026-02-28",
                        "system_values": {},
                    },
                    {
                        "row_id": 103,
                        "plan_version": 5,
                        "row_status": "initialized",
                        "dimension_values": {"company": "Waymo", "city": "旧金山"},
                        "business_date": "2026-03-31",
                        "system_values": {},
                    },
                    {
                        "row_id": 104,
                        "plan_version": 5,
                        "row_status": "initialized",
                        "dimension_values": {"company": "Waymo", "city": "旧金山"},
                        "business_date": "2026-04-30",
                        "system_values": {},
                    },
                ],
                "task_groups": [],
                "status": "initialized",
                "record_count": 4,
            },
        )
        self.assertEqual(response.status_code, 200)
        rows = [
            row
            for row in self.app.state.repository.list_wide_table_rows("WT-AD-OPS")
            if row.row_id >= 101
        ]
        self.app.state.repository.replace_wide_table_plan("WT-AD-OPS", rows, [], [])

        jobs = asyncio.run(self.app.state.scheduler.trigger_scheduled())
        ad_ops_job_ids = [job.task_group_id for job in jobs if job.wide_table_id == "WT-AD-OPS"]
        self.assertEqual(
            ad_ops_job_ids,
            ["tg_WT-AD-OPS_20260131_r5", "tg_WT-AD-OPS_20260228_r5"],
        )

        task_groups = self.client.get("/api/projects/PROJ-001/requirements/REQ-2026-001/task-groups").json()
        scoped_groups = [group for group in task_groups if group["wide_table_id"] == "WT-AD-OPS"]
        self.assertEqual([group["business_date"] for group in scoped_groups], ["2026-01-31", "2026-02-28"])
        self.assertTrue(all(group["triggered_by"] == "backfill" for group in scoped_groups))
        scoped_tasks = [
            task
            for task in self.app.state.repository.list_tasks("REQ-2026-001")
            if task.wide_table_id == "WT-AD-OPS"
        ]
        self.assertEqual(
            [task.business_date for task in scoped_tasks],
            [
                "2026-01-31",
                "2026-02-28",
            ],
        )
        self.assertTrue(all(task.status == "completed" for task in scoped_tasks))
        self.assertGreaterEqual(len(called_task_ids), 2)

    def test_list_task_groups(self):
        r = self.client.get("/api/projects")
        pid = r.json()[0]["id"]
        r2 = self.client.get(f"/api/projects/{pid}/requirements")
        rid = r2.json()[0]["requirement"]["id"]
        r3 = self.client.get(f"/api/projects/{pid}/requirements/{rid}/task-groups")
        self.assertEqual(r3.status_code, 200)
        task_groups = r3.json()
        self.assertGreater(len(task_groups), 0)
        self.assertIn("row_snapshots", task_groups[0])
        self.assertEqual(len(task_groups[0]["row_snapshots"]), 5)
        self.assertEqual(
            task_groups[0]["row_snapshots"][0]["dimension_values"]["company"],
            "Waymo",
        )

    def test_list_tasks(self):
        r = self.client.get("/api/projects")
        pid = r.json()[0]["id"]
        r2 = self.client.get(f"/api/projects/{pid}/requirements")
        rid = r2.json()[0]["requirement"]["id"]
        r3 = self.client.get(f"/api/projects/{pid}/requirements/{rid}/tasks")
        self.assertEqual(r3.status_code, 200)

    def test_dashboard_metrics(self):
        r = self.client.get("/api/dashboard/metrics")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertIn("projects", data)
        self.assertGreater(data["projects"], 0)

    def test_ops_overview(self):
        r = self.client.get("/api/ops/overview")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.json()), 2)

    def test_ops_task_status_counts(self):
        r = self.client.get("/api/ops/task-status-counts")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.json()), 4)

    def test_ops_data_status_counts(self):
        r = self.client.get("/api/ops/data-status-counts")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.json()), 3)

    def test_wide_table_endpoints(self):
        r = self.client.get("/api/projects")
        pid = r.json()[0]["id"]
        r2 = self.client.get(f"/api/projects/{pid}/requirements")
        rid = r2.json()[0]["requirement"]["id"]
        # list wide tables
        r3 = self.client.get(f"/api/requirements/{rid}/wide-tables")
        self.assertEqual(r3.status_code, 200)
        wts = r3.json()
        self.assertGreater(len(wts), 0)
        # read single
        wtid = wts[0]["id"]
        r4 = self.client.get(f"/api/requirements/{rid}/wide-tables/{wtid}")
        self.assertEqual(r4.status_code, 200)

    def test_backfill_requests(self):
        r = self.client.get("/api/projects")
        pid = r.json()[0]["id"]
        r2 = self.client.get(f"/api/projects/{pid}/requirements")
        rid = r2.json()[0]["requirement"]["id"]
        r3 = self.client.get(f"/api/projects/{pid}/requirements/{rid}/backfill-requests")
        self.assertEqual(r3.status_code, 200)

    def test_404_for_missing_project(self):
        r = self.client.get("/api/projects/nonexistent")
        self.assertEqual(r.status_code, 404)

    def test_404_for_missing_requirement(self):
        r = self.client.get("/api/projects")
        pid = r.json()[0]["id"]
        r2 = self.client.get(f"/api/projects/{pid}/requirements/nonexistent")
        self.assertEqual(r2.status_code, 404)


if __name__ == "__main__":
    unittest.main()
