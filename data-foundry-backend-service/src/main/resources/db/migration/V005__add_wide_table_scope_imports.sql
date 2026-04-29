CREATE TABLE IF NOT EXISTS wide_table_scope_imports (
  wide_table_id VARCHAR(64) NOT NULL PRIMARY KEY,
  requirement_id VARCHAR(64) NOT NULL,
  import_mode VARCHAR(64) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_type VARCHAR(64) NOT NULL,
  content_hash VARCHAR(64) NULL,
  row_count INT NOT NULL DEFAULT 0,
  header_json JSON NULL,
  file_content MEDIUMTEXT NULL,
  created_by VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_wide_table_scope_imports_wide_table
    FOREIGN KEY (wide_table_id) REFERENCES wide_tables(id) ON DELETE CASCADE,
  INDEX idx_wide_table_scope_imports_requirement_id (requirement_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
