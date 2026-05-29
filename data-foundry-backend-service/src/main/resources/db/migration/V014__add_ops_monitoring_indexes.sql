-- Monitoring dashboard reads current-state aggregates from task_groups, fetch_tasks,
-- and acceptance_tickets. These indexes keep the summary endpoint responsive without
-- introducing a duplicated snapshot table.

SET @sql := IF(
  (SELECT COUNT(1)
     FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'task_groups'
      AND index_name = 'idx_tg_triggered_status_updated') = 0,
  'CREATE INDEX idx_tg_triggered_status_updated ON task_groups (triggered_by, status, updated_at)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(1)
     FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'task_groups'
      AND index_name = 'idx_tg_status_aggregated') = 0,
  'CREATE INDEX idx_tg_status_aggregated ON task_groups (status, last_aggregated_at)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(1)
     FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'fetch_tasks'
      AND index_name = 'idx_ft_status_updated') = 0,
  'CREATE INDEX idx_ft_status_updated ON fetch_tasks (status, updated_at)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(1)
     FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'acceptance_tickets'
      AND index_name = 'idx_at_task_group_status') = 0,
  'CREATE INDEX idx_at_task_group_status ON acceptance_tickets (task_group_id, status)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
