CREATE TABLE IF NOT EXISTS metric_field_mappings (
  id                    VARCHAR(160) NOT NULL PRIMARY KEY,
  requirement_id         VARCHAR(64)  NOT NULL,
  wide_table_id          VARCHAR(64)  NOT NULL,
  source_metric_name     VARCHAR(255) NOT NULL,
  target_indicator_key   VARCHAR(128) NULL,
  target_indicator_name  VARCHAR(255) NULL,
  match_type             VARCHAR(32)  NOT NULL DEFAULT 'manual',
  confidence             DECIMAL(8,4) NULL,
  status                 VARCHAR(32)  NOT NULL DEFAULT 'pending',
  created_at             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_metric_field_mappings_source (wide_table_id, source_metric_name),
  INDEX idx_metric_field_mappings_requirement (requirement_id),
  INDEX idx_metric_field_mappings_wide_table (wide_table_id),
  INDEX idx_metric_field_mappings_target (wide_table_id, target_indicator_key),
  INDEX idx_metric_field_mappings_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE collection_result_rows
  ADD COLUMN source_metric_name VARCHAR(255) NULL AFTER row_id,
  ADD COLUMN target_indicator_key VARCHAR(128) NULL AFTER source_metric_name,
  ADD INDEX idx_collection_result_rows_source_metric (wide_table_id, source_metric_name),
  ADD INDEX idx_collection_result_rows_target_indicator (wide_table_id, target_indicator_key);
