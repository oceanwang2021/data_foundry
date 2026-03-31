from __future__ import annotations

import asyncio
import hashlib
import os
import time
from datetime import datetime
from urllib.parse import urlparse

from app.schemas import (
    AgentExecutionRequest,
    AgentExecutionResponse,
    AgentIndicatorResult,
    IndicatorCell,
    NarrowIndicatorRow,
    RetrievalTaskResult,
    SemanticIndicatorResult,
)

_AUTODRIVE_SAFETY_BASE_MONTH = "2025-12"
_AUTODRIVE_SAFETY_KNOWN_VALUES: dict[tuple[str, str, str], float] = {
    ("Waymo", "mpi_takeover_miles", "2025-12"): 198000,
    ("Waymo", "mpi_takeover_miles", "2026-01"): 205000,
    ("Waymo", "mpi_takeover_miles", "2026-02"): 212000,
    ("Waymo", "incident_rate", "2025-12"): 0.21,
    ("Waymo", "incident_rate", "2026-01"): 0.19,
    ("Waymo", "incident_rate", "2026-02"): 0.18,
    ("Pony.ai", "mpi_takeover_miles", "2025-12"): 71000,
    ("Pony.ai", "mpi_takeover_miles", "2026-01"): 73500,
    ("Pony.ai", "mpi_takeover_miles", "2026-02"): 74800,
    ("Pony.ai", "incident_rate", "2025-12"): 0.34,
    ("Pony.ai", "incident_rate", "2026-01"): 0.31,
    ("Pony.ai", "incident_rate", "2026-02"): 0.29,
}
_AUTODRIVE_SAFETY_TRENDS: dict[str, dict[str, dict[str, float | int]]] = {
    "Waymo": {
        "mpi_takeover_miles": {"base": 198000, "monthly_step": 7000, "minimum": 160000, "maximum": 320000, "precision": 0},
        "incident_rate": {"base": 0.21, "monthly_step": -0.015, "minimum": 0.08, "maximum": 0.5, "precision": 2},
    },
    "Pony.ai": {
        "mpi_takeover_miles": {"base": 71000, "monthly_step": 1900, "minimum": 50000, "maximum": 140000, "precision": 0},
        "incident_rate": {"base": 0.34, "monthly_step": -0.025, "minimum": 0.10, "maximum": 0.6, "precision": 2},
    },
}


class MockCollectionAgent:
    def __init__(self) -> None:
        self.failure_rate = self._read_float("AGENT_MOCK_FAILURE_RATE", 0.0)
        self.latency_ms = int(self._read_float("AGENT_MOCK_LATENCY_MS", 120))

    async def execute(self, request: AgentExecutionRequest) -> AgentExecutionResponse:
        started_at = time.perf_counter()
        if self.latency_ms > 0:
            await asyncio.sleep(self.latency_ms / 1000)

        if self._should_fail(request):
            return AgentExecutionResponse(
                task_id=request.task_id,
                status="failed",
                indicators=[],
                retrieval_tasks=[],
                duration_ms=self._duration_ms(started_at),
                error_message="Mock Agent: 模拟采集超时",
            )

        indicators: list[AgentIndicatorResult] = []
        retrieval_tasks: list[RetrievalTaskResult] = []

        for indicator_key in request.indicator_keys:
            indicator = self._build_indicator(indicator_key, request)
            indicators.append(indicator)
            retrieval_tasks.append(self._build_retrieval(indicator_key, request, indicator))

        return AgentExecutionResponse(
            task_id=request.task_id,
            status="completed",
            indicators=indicators,
            retrieval_tasks=retrieval_tasks,
            duration_ms=self._duration_ms(started_at),
        )

    def _build_indicator(
        self,
        indicator_key: str,
        request: AgentExecutionRequest,
    ) -> AgentIndicatorResult:
        indicator_name = request.indicator_names.get(indicator_key, indicator_key)
        description = request.indicator_descriptions.get(indicator_key) or indicator_name
        unit = request.indicator_units.get(indicator_key, "")
        raw_context = " ".join([indicator_key, indicator_name, description, unit]).lower()
        confidence = round(0.82 + self._fraction(request.task_id, indicator_key, request.run_id or "", "confidence") * 0.15, 2)
        temporal_label = self._temporal_label(request)
        source_url = self._select_source_url(request, indicator_key)
        source_site = self._source_site(source_url)

        if self._is_autodrive_safety_indicator(request, indicator_key):
            numeric_value = self._autodrive_safety_value(request, indicator_key)
            if indicator_key == "incident_rate":
                value_text = f"{numeric_value:.2f}"
            else:
                value_text = str(int(round(numeric_value)))
            semantic = SemanticIndicatorResult(
                kind="exact",
                value=float(numeric_value),
                unit=unit or None,
                confidence=confidence,
                reasoning=self._describe_reasoning("按自动驾驶安全指标的真实量级生成 mock 值。", request),
            )
            scope_text = self._scope_text(request.dimension_values)
            quote_prefix = self._quote_prefix(request)
            if scope_text:
                quote_text = f"{quote_prefix}，{scope_text}的{indicator_name}为 {value_text}{unit}。"
            else:
                quote_text = f"{quote_prefix}，{indicator_name}为 {value_text}{unit}。"
            return AgentIndicatorResult(
                indicator_key=indicator_key,
                value=value_text,
                value_description=f"{indicator_name} mock 采集结果",
                data_source=source_site,
                source_url=source_url,
                source_link=source_url,
                quote_text=quote_text,
                confidence=confidence,
                semantic=semantic,
            )

        value_seed = self._value_seed_parts(request, indicator_key)

        if "date" in raw_context or "日期" in raw_context:
            value_text = self._normalize_published_at(
                request.business_date,
                snapshot_label=request.snapshot_label,
                snapshot_at=request.snapshot_at,
            )
            semantic = SemanticIndicatorResult(
                kind="date",
                confidence=confidence,
                reasoning=(
                    f"按全量快照批次 {temporal_label} 生成日期型 mock 结果。"
                    if self._is_full_snapshot(request)
                    else f"按业务日期 {temporal_label} 生成日期型 mock 结果。"
                ),
            )
            numeric_value = None
        elif "%" in unit or any(token in raw_context for token in ("rate", "ratio", "share", "pct", "percent", "占比")):
            numeric_value = self._apply_snapshot_variation(
                5 + self._fraction(*value_seed, "value") * 90,
                request,
                indicator_key,
                minimum=0.0,
                maximum=100.0,
                precision=1,
            )
            value_text = f"{numeric_value}"
            semantic = SemanticIndicatorResult(
                kind="approximate",
                value=numeric_value,
                unit=unit or "%",
                confidence=confidence,
                reasoning=self._describe_reasoning("按占比/比率类指标生成百分比 mock 值。", request),
            )
        elif any(token in unit for token in ("辆", "台", "人", "个", "家")) or any(
            token in raw_context for token in ("fleet", "count", "volume", "orders", "trip", "车队", "订单", "次数")
        ):
            value_min, value_max = self._integer_range(raw_context)
            numeric_value = self._apply_snapshot_variation(
                self._randint(value_min, value_max, *value_seed, "value"),
                request,
                indicator_key,
                minimum=float(value_min),
                maximum=float(value_max),
                integer=True,
            )
            value_text = str(numeric_value)
            semantic = SemanticIndicatorResult(
                kind="exact",
                value=float(numeric_value),
                unit=unit or None,
                confidence=confidence,
                reasoning=self._describe_reasoning("按规模/计数类指标生成整数 mock 值。", request),
            )
        elif any(token in unit for token in ("元", "万元", "亿元", "美元")) or any(
            token in raw_context for token in ("revenue", "price", "cost", "gmv", "金额", "收入", "成本", "价格")
        ):
            numeric_value = self._apply_snapshot_variation(
                100 + self._fraction(*value_seed, "value") * 9900,
                request,
                indicator_key,
                minimum=0.0,
                precision=2,
            )
            value_text = f"{numeric_value:.2f}"
            semantic = SemanticIndicatorResult(
                kind="exact",
                value=numeric_value,
                unit=unit or None,
                confidence=confidence,
                reasoning=self._describe_reasoning("按金额类指标生成两位小数 mock 值。", request),
            )
        else:
            numeric_value = self._apply_snapshot_variation(
                10 + self._fraction(*value_seed, "value") * 990,
                request,
                indicator_key,
                minimum=0.0,
                precision=2,
            )
            value_text = f"{numeric_value:.2f}"
            semantic = SemanticIndicatorResult(
                kind="exact",
                value=numeric_value,
                unit=unit or None,
                confidence=confidence,
                reasoning=self._describe_reasoning("按通用数值类指标生成 mock 值。", request),
            )

        scope_text = self._scope_text(request.dimension_values)
        quote_prefix = self._quote_prefix(request)
        quote_text = f"{quote_prefix}，{scope_text}的{indicator_name}为 {value_text}{unit}。" if scope_text else f"{quote_prefix}，{indicator_name}为 {value_text}{unit}。"

        return AgentIndicatorResult(
            indicator_key=indicator_key,
            value=value_text,
            value_description=f"{indicator_name} mock 采集结果",
            data_source=source_site,
            source_url=source_url,
            source_link=source_url,
            quote_text=quote_text,
            confidence=confidence,
            semantic=semantic,
        )

    def _build_retrieval(
        self,
        indicator_key: str,
        request: AgentExecutionRequest,
        indicator: AgentIndicatorResult,
    ) -> RetrievalTaskResult:
        indicator_name = request.indicator_names.get(indicator_key, indicator_key)
        indicator_description = request.indicator_descriptions.get(indicator_key) or indicator_name
        indicator_unit = request.indicator_units.get(indicator_key, "")
        source_url = indicator.source_url
        query_parts = [
            indicator_name,
            self._query_temporal_label(request),
            *request.dimension_values.values(),
        ]
        query = " ".join(part for part in query_parts if part)
        value_float = self._safe_float(indicator.value)
        spread = self._result_spread(
            value_float,
            indicator_key=indicator_key,
            indicator_name=indicator_name,
            indicator_description=indicator_description,
            indicator_unit=indicator_unit,
            request=request,
        )
        logic_supplement = f"mock agent={request.default_agent or 'default'}"
        if self._is_full_snapshot(request):
            logic_supplement = f"{logic_supplement} snapshot={self._temporal_label(request)}"
        narrow_row = NarrowIndicatorRow(
            wide_table_id=request.wide_table_id,
            row_id=request.row_id,
            dimension_values=request.dimension_values,
            business_date=request.business_date,
            indicator_key=indicator_key,
            indicator_name=indicator_name,
            indicator_description=indicator_description,
            indicator_unit=indicator_unit,
            unit=indicator_unit or None,
            published_at=self._normalize_published_at(
                request.business_date,
                snapshot_label=request.snapshot_label,
                snapshot_at=request.snapshot_at,
            ),
            source_site=indicator.data_source,
            indicator_logic=indicator_description,
            indicator_logic_supplement=logic_supplement,
            max_value=(value_float + spread) if value_float is not None else None,
            min_value=max(value_float - spread, 0) if value_float is not None else None,
            source_url=source_url,
            quote_text=indicator.quote_text,
            result=IndicatorCell(
                value=indicator.value,
                value_description=indicator.value_description,
                max_value=(value_float + spread) if value_float is not None else None,
                min_value=max(value_float - spread, 0) if value_float is not None else None,
                data_source=indicator.data_source,
                source_link=indicator.source_link,
            ),
        )
        return RetrievalTaskResult(
            indicator_key=indicator_key,
            query=query,
            status="completed",
            confidence=indicator.confidence,
            narrow_row=narrow_row,
        )

    def _should_fail(self, request: AgentExecutionRequest) -> bool:
        if self.failure_rate <= 0:
            return False
        return self._fraction(request.task_id, "failure") < self.failure_rate

    def _select_source_url(self, request: AgentExecutionRequest, indicator_key: str) -> str:
        preferred = self._select_autodrive_safety_source_url(request, indicator_key)
        if preferred:
            return preferred
        source_seed = self._value_seed_parts(request, indicator_key)
        if request.fixed_urls:
            return request.fixed_urls[self._randint(0, len(request.fixed_urls) - 1, *source_seed, "fixed")]
        if request.preferred_sites:
            preferred_site = request.preferred_sites[
                self._randint(0, len(request.preferred_sites) - 1, *source_seed, "site")
            ]
            normalized = preferred_site if preferred_site.startswith("http") else f"https://{preferred_site}"
            return normalized.rstrip("/") + f"/reports/{self._report_suffix(request)}"
        engine = request.search_engines[0] if request.search_engines else "mock-search"
        return f"https://{engine}.example.com/search?q={indicator_key}"

    @staticmethod
    def _normalize_published_at(
        business_date: str | None,
        *,
        snapshot_label: str | None = None,
        snapshot_at: str | None = None,
    ) -> str:
        candidate = business_date or snapshot_label
        if candidate:
            normalized = candidate[:10] if len(candidate) >= 10 and candidate[4:5] == "-" and candidate[7:8] == "-" else candidate
            if len(normalized) == 7:
                return f"{normalized}-28"
            if len(normalized) == 4 and normalized.isdigit():
                return f"{normalized}-12-31"
            return normalized
        if snapshot_at:
            return snapshot_at[:10]
        return "当前快照"

    @staticmethod
    def _safe_float(value: str | None) -> float | None:
        if value is None:
            return None
        try:
            return float(value)
        except ValueError:
            return None

    @staticmethod
    def _scope_text(dimension_values: dict[str, str]) -> str:
        return " / ".join(value for _, value in sorted(dimension_values.items()) if value)

    @staticmethod
    def _source_site(source_url: str | None) -> str | None:
        if not source_url:
            return None
        hostname = urlparse(source_url).hostname
        if hostname:
            return hostname.removeprefix("www.")
        return source_url

    @staticmethod
    def _read_float(env_name: str, default: float) -> float:
        value = os.getenv(env_name)
        if value is None:
            return default
        try:
            return float(value)
        except ValueError:
            return default

    @staticmethod
    def _duration_ms(started_at: float) -> int:
        return int((time.perf_counter() - started_at) * 1000)

    @staticmethod
    def _integer_range(raw_context: str) -> tuple[int, int]:
        if any(token in raw_context for token in ("fleet", "车队")):
            return (50, 3000)
        if any(token in raw_context for token in ("volume", "orders", "订单")):
            return (5_000, 300_000)
        return (10, 10_000)

    @staticmethod
    def _is_full_snapshot(request: AgentExecutionRequest) -> bool:
        return request.collection_coverage_mode == "full_snapshot"

    @staticmethod
    def _month_key(value: str | None) -> str | None:
        if not value or len(value) < 7:
            return None
        candidate = value[:7]
        if candidate[4:5] != "-":
            return None
        year, month = candidate[:4], candidate[5:7]
        if not (year.isdigit() and month.isdigit()):
            return None
        return candidate

    @classmethod
    def _month_index(cls, value: str | None) -> int | None:
        month_key = cls._month_key(value)
        if month_key is None:
            return None
        return int(month_key[:4]) * 12 + int(month_key[5:7])

    def _snapshot_drift(self, request: AgentExecutionRequest, indicator_key: str) -> float:
        if not request.snapshot_label:
            return 0.0
        return (self._fraction(request.wide_table_id, indicator_key, request.snapshot_label, "snapshot-drift") - 0.5) * 0.06

    def _is_autodrive_safety_indicator(self, request: AgentExecutionRequest, indicator_key: str) -> bool:
        return (
            request.wide_table_id == "WT-AD-SAFE"
            and indicator_key in {"mpi_takeover_miles", "incident_rate"}
        )

    def _autodrive_safety_value(self, request: AgentExecutionRequest, indicator_key: str) -> float:
        company = request.dimension_values.get("company", "")
        profile = _AUTODRIVE_SAFETY_TRENDS.get(company, {}).get(indicator_key)
        if profile is None:
            return 0.0

        month_key = self._month_key(request.business_date or request.snapshot_label)
        if month_key is not None:
            known = _AUTODRIVE_SAFETY_KNOWN_VALUES.get((company, indicator_key, month_key))
            if known is not None and request.business_date:
                return known

        month_index = self._month_index(request.business_date or request.snapshot_label)
        base_index = self._month_index(_AUTODRIVE_SAFETY_BASE_MONTH) or 0
        offset = 0 if month_index is None else month_index - base_index
        value = float(profile["base"]) + float(profile["monthly_step"]) * offset

        if month_key is not None:
            known = _AUTODRIVE_SAFETY_KNOWN_VALUES.get((company, indicator_key, month_key))
            if known is not None:
                value = known

        if self._is_full_snapshot(request):
            value = value * (1 + self._snapshot_drift(request, indicator_key))

        minimum = float(profile["minimum"])
        maximum = float(profile["maximum"])
        precision = int(profile["precision"])
        value = min(max(value, minimum), maximum)
        return round(value, precision)

    def _select_autodrive_safety_source_url(self, request: AgentExecutionRequest, indicator_key: str) -> str | None:
        if not self._is_autodrive_safety_indicator(request, indicator_key):
            return None

        company = request.dimension_values.get("company", "").lower()
        candidates = [url for url in request.fixed_urls if url]
        if not candidates:
            candidates = [
                site if site.startswith("http") else f"https://{site}"
                for site in request.preferred_sites
            ]

        def match(keyword: str) -> str | None:
            return next((candidate for candidate in candidates if keyword in candidate.lower()), None)

        if indicator_key == "incident_rate":
            return match("dmv") or match("incident") or match("safety")
        if "waymo" in company:
            return match("waymo") or match("safety")
        if "pony" in company:
            return match("pony") or match("safety")
        return None

    def _result_spread(
        self,
        value: float | None,
        *,
        indicator_key: str,
        indicator_name: str,
        indicator_description: str,
        indicator_unit: str,
        request: AgentExecutionRequest,
    ) -> float | None:
        if value is None:
            return None

        raw_context = " ".join(
            [indicator_key, indicator_name, indicator_description, indicator_unit]
        ).lower()
        if self._is_autodrive_safety_indicator(request, indicator_key):
            if indicator_key == "incident_rate":
                return round(max(value * 0.12, 0.01), 4)
            return round(max(value * 0.035, 800.0), 2)

        if (
            value < 1
            or "rate" in raw_context
            or "ratio" in raw_context
            or "率" in raw_context
            or "占比" in raw_context
        ):
            return round(max(value * 0.12, 0.01), 4)
        return round(max(value * 0.08, 1.0), 2)

    @staticmethod
    def _value_seed_parts(request: AgentExecutionRequest, indicator_key: str) -> tuple[str, ...]:
        """稳定种子：不含 run_id，保证同一行同一指标的基础值稳定。"""
        dimension_parts = tuple(
            f"{key}={value}"
            for key, value in sorted(request.dimension_values.items())
        )
        return (
            request.wide_table_id,
            str(request.row_id),
            indicator_key,
            request.business_date or "",
            *dimension_parts,
        )

    def _apply_snapshot_variation(
        self,
        value: float | int,
        request: AgentExecutionRequest,
        indicator_key: str,
        *,
        minimum: float | None = None,
        maximum: float | None = None,
        precision: int = 2,
        integer: bool = False,
    ) -> float | int:
        adjusted = float(value)
        run_seed = request.run_id or ""
        if run_seed:
            # 用确定性 hash 决定该指标本次执行是否漂移（约 30% 的指标会变）
            should_drift = self._fraction(request.wide_table_id, indicator_key, run_seed, "drift-gate") < 0.30
            if should_drift:
                drift = (self._fraction(request.wide_table_id, indicator_key, run_seed, "run-drift") - 0.5) * 0.10
                adjusted = adjusted * (1 + drift)
        if minimum is not None:
            adjusted = max(adjusted, minimum)
        if maximum is not None:
            adjusted = min(adjusted, maximum)
        if integer:
            return int(round(adjusted))
        return round(adjusted, precision)

    @staticmethod
    def _temporal_label(request: AgentExecutionRequest) -> str:
        return request.business_date or request.snapshot_label or "当前快照"

    def _query_temporal_label(self, request: AgentExecutionRequest) -> str:
        label = self._temporal_label(request)
        if self._is_full_snapshot(request) and label != "当前快照":
            return f"{label} 全量快照"
        return label

    def _quote_prefix(self, request: AgentExecutionRequest) -> str:
        label = self._temporal_label(request)
        if self._is_full_snapshot(request):
            return "在当前快照中" if label == "当前快照" else f"在 {label} 全量快照中"
        return f"在 {label} 的披露中"

    def _report_suffix(self, request: AgentExecutionRequest) -> str:
        label = self._temporal_label(request)
        if label == "当前快照":
            return "current-snapshot"
        return label.replace("/", "-").replace(" ", "-")

    def _describe_reasoning(self, base: str, request: AgentExecutionRequest) -> str:
        if self._is_full_snapshot(request):
            return f"{base.rstrip('。')}，并叠加全量快照批次的小幅扰动。"
        return base

    @staticmethod
    def _fraction(*parts: str) -> float:
        seed = "::".join(parts)
        digest = hashlib.sha256(seed.encode("utf-8")).hexdigest()
        return int(digest[:12], 16) / float(16**12 - 1)

    def _randint(self, start: int, end: int, *parts: str) -> int:
        if start >= end:
            return start
        return start + int(self._fraction(*parts) * (end - start + 1))
