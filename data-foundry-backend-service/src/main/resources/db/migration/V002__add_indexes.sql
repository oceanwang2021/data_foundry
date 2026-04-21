-- Add missing composite indexes for query patterns (backend-service)
-- Safe for re-application: guard each index creation by checking information_schema.

-- requirements: list by project_id order by created_at desc
SELECT IF(
  (SELECT COUNT(1) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'requirements' AND index_name = 'idx_requirements_project_created_at') = 0,
  'CREATE INDEX idx_requirements_project_created_at ON requirements (project_id, created_at)',
  'SELECT 1'
) INTO @sql_req;
PREPARE stmt FROM @sql_req; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- wide_tables: primary lookup by requirement_id + sort_order
SELECT IF(
  (SELECT COUNT(1) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'wide_tables' AND index_name = 'idx_wide_tables_requirement_sort') = 0,
  'CREATE INDEX idx_wide_tables_requirement_sort ON wide_tables (requirement_id, sort_order)',
  'SELECT 1'
) INTO @sql_wt;
PREPARE stmt FROM @sql_wt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- task_groups: list by requirement_id order by sort_order, plus batch_id lookup
SELECT IF(
  (SELECT COUNT(1) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'task_groups' AND index_name = 'idx_tg_requirement_sort') = 0,
  'CREATE INDEX idx_tg_requirement_sort ON task_groups (requirement_id, sort_order)',
  'SELECT 1'
) INTO @sql_tg1;
PREPARE stmt FROM @sql_tg1; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- task_groups: list by requirement_id + wide_table_id order by sort_order
SELECT IF(
  (SELECT COUNT(1) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'task_groups' AND index_name = 'idx_tg_requirement_wide_table_sort') = 0,
  'CREATE INDEX idx_tg_requirement_wide_table_sort ON task_groups (requirement_id, wide_table_id, sort_order)',
  'SELECT 1'
) INTO @sql_tg_wt;
PREPARE stmt FROM @sql_tg_wt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT IF(
  (SELECT COUNT(1) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'task_groups' AND index_name = 'idx_tg_batch_id') = 0,
  'CREATE INDEX idx_tg_batch_id ON task_groups (batch_id)',
  'SELECT 1'
) INTO @sql_tg2;
PREPARE stmt FROM @sql_tg2; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- fetch_tasks: list by requirement_id / task_group_id order by sort_order, plus batch_id lookup
SELECT IF(
  (SELECT COUNT(1) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'fetch_tasks' AND index_name = 'idx_ft_requirement_sort') = 0,
  'CREATE INDEX idx_ft_requirement_sort ON fetch_tasks (requirement_id, sort_order)',
  'SELECT 1'
) INTO @sql_ft1;
PREPARE stmt FROM @sql_ft1; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT IF(
  (SELECT COUNT(1) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'fetch_tasks' AND index_name = 'idx_ft_task_group_sort') = 0,
  'CREATE INDEX idx_ft_task_group_sort ON fetch_tasks (task_group_id, sort_order)',
  'SELECT 1'
) INTO @sql_ft2;
PREPARE stmt FROM @sql_ft2; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT IF(
  (SELECT COUNT(1) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'fetch_tasks' AND index_name = 'idx_ft_batch_id') = 0,
  'CREATE INDEX idx_ft_batch_id ON fetch_tasks (batch_id)',
  'SELECT 1'
) INTO @sql_ft3;
PREPARE stmt FROM @sql_ft3; EXECUTE stmt; DEALLOCATE PREPARE stmt;
