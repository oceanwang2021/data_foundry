-- Add indexes to support requirement search (backend-service)
-- Safe for re-application: guard each index creation by checking information_schema.

-- requirements: filter/sort
SELECT IF(
  (SELECT COUNT(1) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'requirements' AND index_name = 'idx_requirements_updated_at') = 0,
  'CREATE INDEX idx_requirements_updated_at ON requirements (updated_at)',
  'SELECT 1'
) INTO @sql_req_u;
PREPARE stmt FROM @sql_req_u; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT IF(
  (SELECT COUNT(1) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'requirements' AND index_name = 'idx_requirements_status') = 0,
  'CREATE INDEX idx_requirements_status ON requirements (status)',
  'SELECT 1'
) INTO @sql_req_s;
PREPARE stmt FROM @sql_req_s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT IF(
  (SELECT COUNT(1) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'requirements' AND index_name = 'idx_requirements_owner') = 0,
  'CREATE INDEX idx_requirements_owner ON requirements (owner)',
  'SELECT 1'
) INTO @sql_req_o;
PREPARE stmt FROM @sql_req_o; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT IF(
  (SELECT COUNT(1) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'requirements' AND index_name = 'idx_requirements_assignee') = 0,
  'CREATE INDEX idx_requirements_assignee ON requirements (assignee)',
  'SELECT 1'
) INTO @sql_req_a;
PREPARE stmt FROM @sql_req_a; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- requirements: common query pattern project_id + updated_at
SELECT IF(
  (SELECT COUNT(1) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'requirements' AND index_name = 'idx_requirements_project_updated_at') = 0,
  'CREATE INDEX idx_requirements_project_updated_at ON requirements (project_id, updated_at)',
  'SELECT 1'
) INTO @sql_req_pu;
PREPARE stmt FROM @sql_req_pu; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- wide_tables: filter by table_name for primary wide table join
SELECT IF(
  (SELECT COUNT(1) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'wide_tables' AND index_name = 'idx_wide_tables_table_name') = 0,
  'CREATE INDEX idx_wide_tables_table_name ON wide_tables (table_name)',
  'SELECT 1'
) INTO @sql_wt_tn;
PREPARE stmt FROM @sql_wt_tn; EXECUTE stmt; DEALLOCATE PREPARE stmt;

