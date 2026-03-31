from __future__ import annotations

from decimal import Decimal

from fastapi.testclient import TestClient

from app.main import create_app


def test_health() -> None:
    client = TestClient(create_app())
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_execute_returns_mock_indicator_results() -> None:
    client = TestClient(create_app())
    response = client.post(
        "/agent/executions",
        json={
            "task_id": "ft-demo-1",
            "requirement_id": "REQ-2026-001",
            "wide_table_id": "WT-AD-OPS",
            "row_id": 1,
            "business_date": "2025-01",
            "dimension_values": {"company": "Waymo", "city": "旧金山"},
            "indicator_keys": ["order_volume", "fleet_size"],
            "indicator_names": {
                "order_volume": "订单量",
                "fleet_size": "车队规模",
            },
            "indicator_descriptions": {
                "order_volume": "月订单量",
                "fleet_size": "可运营车队规模",
            },
            "indicator_units": {
                "order_volume": "单",
                "fleet_size": "辆",
            },
            "search_engines": ["bing"],
            "preferred_sites": ["waymo.com"],
            "site_policy": "preferred",
            "knowledge_bases": ["自动驾驶知识库"],
            "fixed_urls": ["https://waymo.com/safety"],
            "prompt_template": "按月采集",
            "execution_mode": "agent",
            "default_agent": "ops-agent",
        },
    )
    assert response.status_code == 200

    payload = response.json()
    assert payload["task_id"] == "ft-demo-1"
    assert payload["status"] == "completed"
    assert len(payload["indicators"]) == 2
    assert len(payload["retrieval_tasks"]) == 2
    assert payload["indicators"][0]["value"] is not None
    assert payload["retrieval_tasks"][0]["narrow_row"]["result"]["value"] is not None


def test_execute_supports_full_snapshot_without_business_date() -> None:
    client = TestClient(create_app())
    response = client.post(
        "/agent/executions",
        json={
            "task_id": "FT-TG-WT-AD-SAFE-20260324-R001-IG-SAFE",
            "requirement_id": "REQ-2026-004",
            "wide_table_id": "WT-AD-SAFE",
            "row_id": 1,
            "business_date": None,
            "task_group_id": "TG-WT-AD-SAFE-20260324",
            "batch_id": "CB-WT-AD-SAFE-20260324",
            "collection_coverage_mode": "full_snapshot",
            "snapshot_label": "2026-03-24",
            "snapshot_at": "2026-03-24T09:00:00",
            "dimension_values": {"company": "Waymo", "city": "旧金山"},
            "indicator_keys": ["incident_rate"],
            "indicator_names": {"incident_rate": "事故率"},
            "indicator_descriptions": {"incident_rate": "按百万公里归一化后的事故率"},
            "indicator_units": {"incident_rate": "次/百万公里"},
            "search_engines": ["bing"],
            "preferred_sites": ["waymo.com"],
            "site_policy": "preferred",
            "knowledge_bases": ["自动驾驶知识库"],
            "fixed_urls": ["https://waymo.com/safety"],
            "prompt_template": "按快照采集",
            "execution_mode": "agent",
            "default_agent": "ops-agent",
        },
    )
    assert response.status_code == 200

    payload = response.json()
    assert payload["status"] == "completed"
    assert payload["retrieval_tasks"][0]["narrow_row"]["business_date"] is None
    assert payload["retrieval_tasks"][0]["narrow_row"]["published_at"] == "2026-03-24"
    assert "2026-03-24 全量快照" in payload["indicators"][0]["quote_text"]


def test_full_snapshot_values_only_shift_slightly_between_batches() -> None:
    client = TestClient(create_app())
    base_request = {
        "requirement_id": "REQ-2026-004",
        "wide_table_id": "WT-AD-SAFE",
        "row_id": 1,
        "business_date": None,
        "collection_coverage_mode": "full_snapshot",
        "dimension_values": {"company": "Waymo", "city": "旧金山"},
        "indicator_keys": ["mpi_takeover_miles"],
        "indicator_names": {"mpi_takeover_miles": "MPI接管里程"},
        "indicator_descriptions": {"mpi_takeover_miles": "发生人工接管前的自动驾驶里程"},
        "indicator_units": {"mpi_takeover_miles": "公里"},
        "search_engines": ["bing"],
        "preferred_sites": ["waymo.com"],
        "site_policy": "preferred",
        "knowledge_bases": [],
        "fixed_urls": ["https://waymo.com/safety"],
        "execution_mode": "agent",
    }
    response_a = client.post(
        "/agent/executions",
        json={
            **base_request,
            "task_id": "FT-TG-WT-AD-SAFE-20260324-R001-IG-SAFE",
            "task_group_id": "TG-WT-AD-SAFE-20260324",
            "batch_id": "CB-WT-AD-SAFE-20260324",
            "snapshot_label": "2026-03-24",
            "snapshot_at": "2026-03-24T09:00:00",
        },
    )
    response_b = client.post(
        "/agent/executions",
        json={
            **base_request,
            "task_id": "FT-TG-WT-AD-SAFE-20260424-R001-IG-SAFE",
            "task_group_id": "TG-WT-AD-SAFE-20260424",
            "batch_id": "CB-WT-AD-SAFE-20260424",
            "snapshot_label": "2026-04-24",
            "snapshot_at": "2026-04-24T09:00:00",
        },
    )
    assert response_a.status_code == 200
    assert response_b.status_code == 200

    value_a = Decimal(response_a.json()["indicators"][0]["value"])
    value_b = Decimal(response_b.json()["indicators"][0]["value"])
    diff_ratio = abs(value_a - value_b) / value_a

    assert value_a != value_b
    assert diff_ratio < Decimal("0.12")


def test_execute_autodrive_safety_returns_realistic_incremental_values() -> None:
    client = TestClient(create_app())
    response = client.post(
        "/agent/executions",
        json={
            "task_id": "FT-WT-AD-SAFE-R006-IG-AD-SAFE-MIXED",
            "requirement_id": "REQ-2026-004",
            "wide_table_id": "WT-AD-SAFE",
            "row_id": 6,
            "business_date": "2026-02-28",
            "dimension_values": {"company": "Pony.ai", "city": "旧金山"},
            "indicator_keys": ["mpi_takeover_miles", "incident_rate"],
            "indicator_names": {
                "mpi_takeover_miles": "MPI接管里程",
                "incident_rate": "事故率",
            },
            "indicator_descriptions": {
                "mpi_takeover_miles": "发生人工接管前的自动驾驶里程",
                "incident_rate": "按百万公里归一化后的事故率",
            },
            "indicator_units": {
                "mpi_takeover_miles": "公里",
                "incident_rate": "次/百万公里",
            },
            "search_engines": ["bing"],
            "preferred_sites": ["waymo.com", "pony.ai", "dmv.ca.gov"],
            "site_policy": "preferred",
            "knowledge_bases": ["自动驾驶知识库"],
            "fixed_urls": [
                "https://waymo.com/safety/",
                "https://pony.ai/",
                "https://dmv.ca.gov/",
            ],
            "prompt_template": "按月采集",
            "execution_mode": "agent",
            "default_agent": "safety-agent",
        },
    )
    assert response.status_code == 200

    payload = response.json()
    indicators = {item["indicator_key"]: item for item in payload["indicators"]}
    retrievals = {item["indicator_key"]: item for item in payload["retrieval_tasks"]}

    mpi_value = Decimal(indicators["mpi_takeover_miles"]["value"])
    incident_value = Decimal(indicators["incident_rate"]["value"])
    assert Decimal("70000") <= mpi_value <= Decimal("80000")
    assert Decimal("0.20") <= incident_value <= Decimal("0.40")

    assert indicators["mpi_takeover_miles"]["data_source"] == "pony.ai"
    assert indicators["incident_rate"]["data_source"] == "dmv.ca.gov"

    incident_row = retrievals["incident_rate"]["narrow_row"]
    assert Decimal(str(incident_row["min_value"])) > Decimal("0.10")
    assert Decimal(str(incident_row["max_value"])) < Decimal("0.50")
