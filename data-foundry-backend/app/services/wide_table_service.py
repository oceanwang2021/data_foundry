"""Wide table initialization: expand dimensions × business dates into rows."""
from __future__ import annotations

from itertools import product

from app.modeling import build_row_binding_key, expand_business_dates
from app.schemas import IndicatorCell, WideTable, WideTableRow, WideTableScope


def initialize_wide_table_rows(
    requirement_id: str,
    wide_table: WideTable,
) -> list[WideTableRow]:
    """Generate WideTableRow entries from dimension combinations × business dates."""
    business_dates: list[str | None]
    if wide_table.semantic_time_axis == "business_date":
        business_dates = expand_business_dates(wide_table.scope)
    else:
        business_dates = [None]
    dimension_scopes = wide_table.scope.dimensions
    dimension_keys = [scope.column_key for scope in dimension_scopes]
    dimension_values = [scope.values for scope in dimension_scopes]
    combinations = list(product(*dimension_values)) if dimension_values else [()]

    indicator_keys = [col.key for col in wide_table.table_schema.indicator_columns]
    rows: list[WideTableRow] = []
    row_id = 1

    for bd in business_dates:
        for combo in combinations:
            dim_vals = {k: v for k, v in zip(dimension_keys, combo, strict=False)}
            rows.append(
                WideTableRow(
                    row_id=row_id,
                    requirement_id=requirement_id,
                    wide_table_id=wide_table.id,
                    schema_version=wide_table.table_schema.version,
                    row_status="initialized",
                    dimension_values=dim_vals,
                    business_date=bd,
                    row_binding_key=build_row_binding_key(
                        wide_table,
                        business_date=bd,
                        dimension_values=dim_vals,
                    ),
                    indicator_values={k: IndicatorCell() for k in indicator_keys},
                    system_values={
                        "row_status": "initialized",
                        "last_task_id": None,
                        "updated_at": None,
                    },
                )
            )
            row_id += 1

    return rows
