-- Persist complete runtime counters on task_groups so frontend runtime views
-- can map every displayed aggregate directly to database fields.

SELECT IF(
  (SELECT COUNT(1) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'task_groups' AND column_name = 'pending_tasks') = 0,
  'ALTER TABLE task_groups ADD COLUMN pending_tasks INT NOT NULL DEFAULT 0 AFTER total_tasks',
  'SELECT 1'
) INTO @sql_tg_pending;
PREPARE stmt FROM @sql_tg_pending; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT IF(
  (SELECT COUNT(1) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'task_groups' AND column_name = 'running_tasks') = 0,
  'ALTER TABLE task_groups ADD COLUMN running_tasks INT NOT NULL DEFAULT 0 AFTER pending_tasks',
  'SELECT 1'
) INTO @sql_tg_running;
PREPARE stmt FROM @sql_tg_running; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT IF(
  (SELECT COUNT(1) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'task_groups' AND column_name = 'cancelled_tasks') = 0,
  'ALTER TABLE task_groups ADD COLUMN cancelled_tasks INT NOT NULL DEFAULT 0 AFTER failed_tasks',
  'SELECT 1'
) INTO @sql_tg_cancelled;
PREPARE stmt FROM @sql_tg_cancelled; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT IF(
  (SELECT COUNT(1) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'task_groups' AND column_name = 'invalidated_tasks') = 0,
  'ALTER TABLE task_groups ADD COLUMN invalidated_tasks INT NOT NULL DEFAULT 0 AFTER cancelled_tasks',
  'SELECT 1'
) INTO @sql_tg_invalidated;
PREPARE stmt FROM @sql_tg_invalidated; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT IF(
  (SELECT COUNT(1) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'task_groups' AND column_name = 'last_aggregated_at') = 0,
  'ALTER TABLE task_groups ADD COLUMN last_aggregated_at DATETIME NULL AFTER triggered_by',
  'SELECT 1'
) INTO @sql_tg_last_aggregated;
PREPARE stmt FROM @sql_tg_last_aggregated; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT IF(
  (SELECT COUNT(1) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'task_groups' AND index_name = 'idx_tg_requirement_status_sort') = 0,
  'CREATE INDEX idx_tg_requirement_status_sort ON task_groups (requirement_id, status, sort_order)',
  'SELECT 1'
) INTO @sql_tg_idx_requirement_status_sort;
PREPARE stmt FROM @sql_tg_idx_requirement_status_sort; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT IF(
  (SELECT COUNT(1) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'fetch_tasks' AND index_name = 'idx_ft_task_group_status') = 0,
  'CREATE INDEX idx_ft_task_group_status ON fetch_tasks (task_group_id, status)',
  'SELECT 1'
) INTO @sql_ft_idx_task_group_status;
PREPARE stmt FROM @sql_ft_idx_task_group_status; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT IF(
  (SELECT COUNT(1) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'fetch_tasks' AND index_name = 'idx_ft_task_group_row_binding') = 0,
  'CREATE INDEX idx_ft_task_group_row_binding ON fetch_tasks (task_group_id, row_binding_key(191))',
  'SELECT 1'
) INTO @sql_ft_idx_task_group_row_binding;
PREPARE stmt FROM @sql_ft_idx_task_group_row_binding; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT IF(
  (SELECT COUNT(1) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'fetch_tasks' AND index_name = 'idx_ft_task_group_row') = 0,
  'CREATE INDEX idx_ft_task_group_row ON fetch_tasks (task_group_id, row_id)',
  'SELECT 1'
) INTO @sql_ft_idx_task_group_row;
PREPARE stmt FROM @sql_ft_idx_task_group_row; EXECUTE stmt; DEALLOCATE PREPARE stmt;
