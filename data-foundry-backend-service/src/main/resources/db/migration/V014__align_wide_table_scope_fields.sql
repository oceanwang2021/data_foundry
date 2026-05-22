-- Align wide table scope-related schema with the latest local database layout.

SELECT IF(
  (SELECT COUNT(1) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'wide_tables' AND column_name = 'scope_input_mode') = 0,
  'ALTER TABLE wide_tables ADD COLUMN scope_input_mode VARCHAR(32) NOT NULL DEFAULT ''parameter_rows'' COMMENT ''scope input mode: parameter_rows/dimension_ranges'' AFTER scope_json',
  'SELECT 1'
) INTO @sql_wt_scope_input_mode;
PREPARE stmt FROM @sql_wt_scope_input_mode; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT IF(
  (SELECT COUNT(1) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'wide_table_rows' AND column_name = 'parameter_values_json') = 0,
  'ALTER TABLE wide_table_rows ADD COLUMN parameter_values_json JSON NULL AFTER dimension_values_json',
  'SELECT 1'
) INTO @sql_wtr_parameter_values_json;
PREPARE stmt FROM @sql_wtr_parameter_values_json; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT IF(
  (SELECT COUNT(1) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'wide_table_rows' AND column_name = 'parameter_source') = 0,
  'ALTER TABLE wide_table_rows ADD COLUMN parameter_source VARCHAR(32) NOT NULL DEFAULT ''manual'' COMMENT ''manual/paste/csv/tsv/xlsx'' AFTER parameter_values_json',
  'SELECT 1'
) INTO @sql_wtr_parameter_source;
PREPARE stmt FROM @sql_wtr_parameter_source; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT IF(
  (SELECT COUNT(1) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'wide_table_rows' AND column_name = 'parameter_row_no') = 0,
  'ALTER TABLE wide_table_rows ADD COLUMN parameter_row_no INT NULL COMMENT ''source row number from import input'' AFTER parameter_source',
  'SELECT 1'
) INTO @sql_wtr_parameter_row_no;
PREPARE stmt FROM @sql_wtr_parameter_row_no; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT IF(
  (SELECT COUNT(1) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'wide_table_rows' AND column_name = 'parameter_group_key') = 0,
  'ALTER TABLE wide_table_rows ADD COLUMN parameter_group_key VARCHAR(255) NULL COMMENT ''group key for imported parameter rows'' AFTER parameter_row_no',
  'SELECT 1'
) INTO @sql_wtr_parameter_group_key;
PREPARE stmt FROM @sql_wtr_parameter_group_key; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT IF(
  (SELECT COUNT(1) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'wide_table_rows' AND index_name = 'idx_wtr_parameter_source') = 0,
  'CREATE INDEX idx_wtr_parameter_source ON wide_table_rows (parameter_source)',
  'SELECT 1'
) INTO @sql_idx_wtr_parameter_source;
PREPARE stmt FROM @sql_idx_wtr_parameter_source; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT IF(
  (SELECT COUNT(1) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'wide_table_rows' AND index_name = 'idx_wtr_parameter_group_key') = 0,
  'CREATE INDEX idx_wtr_parameter_group_key ON wide_table_rows (parameter_group_key)',
  'SELECT 1'
) INTO @sql_idx_wtr_parameter_group_key;
PREPARE stmt FROM @sql_idx_wtr_parameter_group_key; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT IF(
  COALESCE(
    (SELECT CHARACTER_MAXIMUM_LENGTH FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = 'wide_table_scope_imports' AND column_name = 'file_type'),
    255
  ) < 255,
  'ALTER TABLE wide_table_scope_imports MODIFY COLUMN file_type VARCHAR(255) NOT NULL',
  'SELECT 1'
) INTO @sql_wtsi_file_type;
PREPARE stmt FROM @sql_wtsi_file_type; EXECUTE stmt; DEALLOCATE PREPARE stmt;
