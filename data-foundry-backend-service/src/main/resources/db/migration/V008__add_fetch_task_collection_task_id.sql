-- Add collection api task id field to fetch_tasks (backend-service)
-- - collection_task_id: downstream /api/search returned task_id for tracing and status binding
-- Safe for re-application: guard alteration by checking information_schema.

SELECT IF(
  (SELECT COUNT(1) FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'fetch_tasks'
      AND column_name = 'collection_task_id') = 0,
  'ALTER TABLE fetch_tasks ADD COLUMN collection_task_id VARCHAR(128) NULL',
  'SELECT 1'
) INTO @sql_ft_ctid;
PREPARE stmt FROM @sql_ft_ctid; EXECUTE stmt; DEALLOCATE PREPARE stmt;

