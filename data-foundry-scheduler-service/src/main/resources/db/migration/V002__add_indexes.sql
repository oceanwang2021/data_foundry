-- Add missing indexes for query patterns (scheduler-service)
-- Safe for re-application: guard each index creation by checking information_schema.

-- list by status/trigger_type order by created_at desc
SELECT IF(
  (SELECT COUNT(1) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'schedule_jobs' AND index_name = 'idx_schedule_jobs_status_created_at') = 0,
  'CREATE INDEX idx_schedule_jobs_status_created_at ON schedule_jobs (status, created_at)',
  'SELECT 1'
) INTO @sql_sj1;
PREPARE stmt FROM @sql_sj1; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT IF(
  (SELECT COUNT(1) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'schedule_jobs' AND index_name = 'idx_schedule_jobs_trigger_created_at') = 0,
  'CREATE INDEX idx_schedule_jobs_trigger_created_at ON schedule_jobs (trigger_type, created_at)',
  'SELECT 1'
) INTO @sql_sj2;
PREPARE stmt FROM @sql_sj2; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- list by trigger_type + status order by created_at desc
SELECT IF(
  (SELECT COUNT(1) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'schedule_jobs' AND index_name = 'idx_schedule_jobs_trigger_status_created_at') = 0,
  'CREATE INDEX idx_schedule_jobs_trigger_status_created_at ON schedule_jobs (trigger_type, status, created_at)',
  'SELECT 1'
) INTO @sql_sj_ts;
PREPARE stmt FROM @sql_sj_ts; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- potential lookups / grouping
SELECT IF(
  (SELECT COUNT(1) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'schedule_jobs' AND index_name = 'idx_schedule_jobs_task_group_id') = 0,
  'CREATE INDEX idx_schedule_jobs_task_group_id ON schedule_jobs (task_group_id)',
  'SELECT 1'
) INTO @sql_sj3;
PREPARE stmt FROM @sql_sj3; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT IF(
  (SELECT COUNT(1) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'schedule_jobs' AND index_name = 'idx_schedule_jobs_task_id') = 0,
  'CREATE INDEX idx_schedule_jobs_task_id ON schedule_jobs (task_id)',
  'SELECT 1'
) INTO @sql_sj4;
PREPARE stmt FROM @sql_sj4; EXECUTE stmt; DEALLOCATE PREPARE stmt;
