from __future__ import annotations

from datetime import date
import unittest

from app.modeling import (
    build_backfill_requests,
    build_collection_batches,
    build_fetch_tasks,
    build_rows,
    build_task_groups,
    expand_business_dates,
)
from app.services.prompt_service import build_indicator_group_prompt
from app.schemas import (
    IndicatorGroup,
    Project,
    Requirement,
    RequirementCollectionPolicy,
    ScheduleRule,
    WideTable,
    WideTableColumn,
    WideTableSchema,
)


def _column(
    key: str,
    name: str,
    role: WideTableColumn.__annotations__["role"],
    data_type: WideTableColumn.__annotations__["data_type"],
    description: str,
    *,
    unit: str | None = None,
    is_business_date: bool = False,
) -> WideTableColumn:
    return WideTableColumn(
        key=key,
        name=name,
        role=role,
        data_type=data_type,
        description=description,
        unit=unit,
        is_business_date=is_business_date,
    )


class ModelingRulesTestCase(unittest.TestCase):
    def test_latest_year_quarterly_expands_latest_year_to_quarters(self) -> None:
        wide_table = self._build_monthly_like_wide_table(
            start="2024",
            end="2025",
            frequency="yearly",
            latest_year_quarterly=True,
        )

        self.assertEqual(
            expand_business_dates(wide_table.scope),
            ["2024", "2025-Q1", "2025-Q2", "2025-Q3", "2025-Q4"],
        )

    def test_monthly_period_end_dates_expand_without_crashing(self) -> None:
        wide_table = self._build_monthly_like_wide_table(
            start="2025-12-31",
            end="2026-03-31",
            frequency="monthly",
            latest_year_quarterly=False,
        )

        self.assertEqual(
            expand_business_dates(wide_table.scope),
            ["2025-12-31", "2026-01-31", "2026-02-28", "2026-03-31"],
        )

    def test_latest_year_quarterly_supports_period_end_date_scope(self) -> None:
        wide_table = self._build_monthly_like_wide_table(
            start="2024-12-31",
            end="2025-12-31",
            frequency="yearly",
            latest_year_quarterly=True,
        )

        self.assertEqual(
            expand_business_dates(wide_table.scope),
            ["2024-12-31", "2025-03-31", "2025-06-30", "2025-09-30", "2025-12-31"],
        )

    def test_open_ended_monthly_scope_expands_from_reference_window(self) -> None:
        wide_table = self._build_monthly_like_wide_table(
            start="2026-02-28",
            end="never",
            frequency="monthly",
            latest_year_quarterly=False,
        )

        self.assertEqual(
            expand_business_dates(
                wide_table.scope,
                reference_date=date(2026, 3, 23),
                open_ended_future_periods=2,
            ),
            ["2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31"],
        )

    def test_task_groups_split_past_dates_to_backfill_and_current_future_to_schedule(self) -> None:
        requirement = self._build_requirement(
            self._build_monthly_like_wide_table(
                start="2026-02",
                end="2026-04",
                frequency="monthly",
                latest_year_quarterly=False,
            )
        )
        wide_table = requirement.wide_table
        assert wide_table is not None
        backfill_requests = build_backfill_requests(
            requirement,
            wide_table,
            reference_date=date(2026, 3, 13),
        )
        task_groups = build_task_groups(
            requirement,
            wide_table,
            reference_date=date(2026, 3, 13),
            backfill_requests=backfill_requests,
        )

        self.assertEqual(len(backfill_requests), 1)
        self.assertEqual(backfill_requests[0].start_business_date, "2026-02")
        self.assertEqual(backfill_requests[0].end_business_date, "2026-02")
        self.assertEqual(
            [(group.business_date, group.source_type) for group in task_groups],
            [("2026-02", "backfill"), ("2026-03", "scheduled"), ("2026-04", "scheduled")],
        )

    def test_full_snapshot_without_business_date_builds_single_batch_and_full_table_group(self) -> None:
        requirement = self._build_requirement(self._build_snapshot_only_wide_table())
        wide_table = requirement.wide_table
        assert wide_table is not None

        rows = build_rows(requirement, wide_table)
        backfill_requests = build_backfill_requests(
            requirement,
            wide_table,
            reference_date=date(2026, 3, 13),
        )
        batches = build_collection_batches(
            requirement,
            wide_table,
            reference_date=date(2026, 3, 13),
        )
        task_groups = build_task_groups(
            requirement,
            wide_table,
            reference_date=date(2026, 3, 13),
            backfill_requests=backfill_requests,
            collection_batches=batches,
        )
        tasks = build_fetch_tasks(
            requirement,
            wide_table,
            rows=rows,
            task_groups=task_groups,
        )

        self.assertEqual(backfill_requests, [])
        self.assertEqual(len(rows), 2)
        self.assertTrue(all(row.business_date is None for row in rows))
        self.assertEqual({row.row_binding_key for row in rows}, {"company:Waymo", "company:Pony.ai"})
        self.assertEqual(len(batches), 1)
        self.assertEqual(batches[0].coverage_mode, "full_snapshot")
        self.assertEqual(batches[0].semantic_time_axis, "none")
        self.assertEqual(len(task_groups), 1)
        self.assertEqual(task_groups[0].partition_type, "full_table")
        self.assertIsNone(task_groups[0].business_date)
        self.assertEqual(len(tasks), 2)
        self.assertTrue(all(task.batch_id == batches[0].id for task in tasks))
        self.assertTrue(all(task.business_date is None for task in tasks))

    def test_business_date_wide_table_normalizes_to_incremental_collection_mode(self) -> None:
        wide_table = self._build_monthly_like_wide_table(
            start="2026-02",
            end="2026-04",
            frequency="monthly",
            latest_year_quarterly=False,
        )
        normalized = WideTable.model_validate({
            **wide_table.model_dump(mode="json"),
            "collection_coverage_mode": "full_snapshot",
        })

        self.assertEqual(normalized.semantic_time_axis, "business_date")
        self.assertEqual(
            normalized.collection_coverage_mode,
            "incremental_by_business_date",
        )

    def test_snapshot_only_wide_table_normalizes_to_full_snapshot_mode(self) -> None:
        wide_table = self._build_snapshot_only_wide_table()
        normalized = WideTable.model_validate({
            **wide_table.model_dump(mode="json"),
            "semantic_time_axis": "business_date",
            "collection_coverage_mode": "incremental_by_business_date",
        })

        self.assertEqual(normalized.semantic_time_axis, "none")
        self.assertEqual(normalized.collection_coverage_mode, "full_snapshot")

    def test_indicator_group_prompt_contains_definition_sections(self) -> None:
        requirement = self._build_requirement(
            self._build_monthly_like_wide_table(
                start="2026-02",
                end="2026-04",
                frequency="monthly",
                latest_year_quarterly=False,
            )
        )
        wide_table = requirement.wide_table
        assert wide_table is not None

        bundle = build_indicator_group_prompt(
            requirement,
            wide_table,
            wide_table.indicator_groups[0],
        )

        self.assertIn("## 核心查询需求", bundle.markdown)
        self.assertIn("## 业务知识", bundle.markdown)
        self.assertIn("## 指标列表", bundle.markdown)
        self.assertIn("## 维度列信息", bundle.markdown)
        self.assertIn("## 输出限制", bundle.markdown)
        self.assertIn("`metric_a`", bundle.markdown)
        self.assertIn("`entity`", bundle.markdown)

    @staticmethod
    def _build_requirement(wide_table: WideTable) -> Requirement:
        return Requirement(
            id="REQ-MODEL-001",
            project_id="PROJ-TEST",
            title="测试需求",
            phase="production",
            schema_locked=False,
            status="draft",
            owner="业务-测试",
            assignee="算法-测试",
            business_goal="测试调度和补采规则。",
            background_knowledge="测试口径要求统一。",
            wide_table=wide_table,
            collection_policy=RequirementCollectionPolicy(
                search_engines=["bing"],
                site_policy="preferred",
                null_policy="NULL",
                source_priority="官网",
                value_format="原样",
            ),
        )

    @staticmethod
    def _build_monthly_like_wide_table(
        *,
        start: str,
        end: str,
        frequency: str,
        latest_year_quarterly: bool,
    ) -> WideTable:
        return WideTable(
            id="WT-MODEL-001",
            title="测试宽表",
            description="用于测试模型规则。",
            schema=WideTableSchema(
                table_name="ads_model_test",
                version=1,
                id_column=_column("id", "行ID", "id", "integer", "主键"),
                dimension_columns=[
                    _column("entity", "主体", "dimension", "string", "主体"),
                    _column(
                        "biz_date",
                        "业务日期",
                        "dimension",
                        "date",
                        "业务日期",
                        is_business_date=True,
                    ),
                ],
                indicator_columns=[
                    _column("metric_a", "指标A", "indicator", "number", "指标A", unit="个")
                ],
                system_columns=[
                    _column("row_status", "行状态", "system", "string", "行状态")
                ],
            ),
            scope={
                "business_date": {
                    "column_key": "biz_date",
                    "start": start,
                    "end": end,
                    "frequency": frequency,
                    "latest_year_quarterly": latest_year_quarterly,
                },
                "dimensions": [
                    {"column_key": "entity", "values": ["A"]},
                ],
            },
            indicator_groups=[
                IndicatorGroup(
                    id="IG-MODEL-001",
                    name="默认指标组",
                    indicator_keys=["metric_a"],
                    execution_mode="agent",
                )
            ],
            schedule_rules=[
                ScheduleRule(
                    id="SR-MODEL-001",
                    frequency=frequency,
                    trigger_time="09:00",
                )
            ],
        )

    @staticmethod
    def _build_snapshot_only_wide_table() -> WideTable:
        return WideTable(
            id="WT-SNAPSHOT-001",
            title="快照宽表",
            description="无业务日期的全量快照宽表。",
            schema=WideTableSchema(
                table_name="ads_snapshot_test",
                version=1,
                id_column=_column("id", "行ID", "id", "integer", "主键"),
                dimension_columns=[
                    _column("company", "公司", "dimension", "string", "主体"),
                ],
                indicator_columns=[
                    _column("metric_a", "指标A", "indicator", "number", "指标A", unit="个")
                ],
                system_columns=[
                    _column("row_status", "行状态", "system", "string", "行状态")
                ],
            ),
            scope={
                "dimensions": [
                    {"column_key": "company", "values": ["Waymo", "Pony.ai"]},
                ],
            },
            semantic_time_axis="none",
            collection_coverage_mode="full_snapshot",
            indicator_groups=[
                IndicatorGroup(
                    id="IG-SNAPSHOT-001",
                    name="默认指标组",
                    indicator_keys=["metric_a"],
                    execution_mode="agent",
                )
            ],
            schedule_rules=[
                ScheduleRule(
                    id="SR-SNAPSHOT-001",
                    frequency="monthly",
                    trigger_time="09:00",
                )
            ],
        )


if __name__ == "__main__":
    unittest.main()
