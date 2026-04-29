CREATE TABLE IF NOT EXISTS wide_table_rows (
  wide_table_id           VARCHAR(64)   NOT NULL,
  row_id                  INT           NOT NULL,
  sort_order              INT           NOT NULL DEFAULT 0,
  requirement_id          VARCHAR(64)   NOT NULL,
  schema_version          INT           NOT NULL DEFAULT 1,
  plan_version            INT           NOT NULL DEFAULT 1,
  row_status              VARCHAR(32)   NOT NULL DEFAULT 'initialized',
  dimension_values_json   JSON          NULL,
  business_date           VARCHAR(32)   NULL,
  row_binding_key         VARCHAR(512)  NULL,
  indicator_values_json   JSON          NULL,
  system_values_json      JSON          NULL,
  PRIMARY KEY (wide_table_id, row_id),
  INDEX idx_wtr_requirement_id (requirement_id),
  INDEX idx_wtr_business_date (business_date),
  INDEX idx_wtr_row_binding_key (row_binding_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
