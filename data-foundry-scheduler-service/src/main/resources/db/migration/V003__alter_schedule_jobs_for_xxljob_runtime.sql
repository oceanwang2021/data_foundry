-- Extend scheduler runtime records for XXL-JOB rule dispatches.

SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'schedule_jobs' AND column_name = 'job_source') = 0,
  'ALTER TABLE schedule_jobs ADD COLUMN job_source VARCHAR(32) NOT NULL DEFAULT ''TASK_EXECUTION'' AFTER task_id',
  'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'schedule_jobs' AND column_name = 'schedule_rule_id') = 0,
  'ALTER TABLE schedule_jobs ADD COLUMN schedule_rule_id VARCHAR(64) NULL AFTER job_source',
  'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'schedule_jobs' AND column_name = 'business_date') = 0,
  'ALTER TABLE schedule_jobs ADD COLUMN business_date VARCHAR(32) NULL AFTER schedule_rule_id',
  'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'schedule_jobs' AND column_name = 'request_payload') = 0,
  'ALTER TABLE schedule_jobs ADD COLUMN request_payload LONGTEXT NULL AFTER business_date',
  'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'schedule_jobs' AND column_name = 'error_message') = 0,
  'ALTER TABLE schedule_jobs ADD COLUMN error_message TEXT NULL AFTER request_payload',
  'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema = DATABASE() AND table_name = 'schedule_jobs'
     AND index_name = 'idx_schedule_jobs_rule_created_at') = 0,
  'CREATE INDEX idx_schedule_jobs_rule_created_at ON schedule_jobs (schedule_rule_id, created_at)',
  'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema = DATABASE() AND table_name = 'schedule_jobs'
     AND index_name = 'idx_schedule_jobs_source_created_at') = 0,
  'CREATE INDEX idx_schedule_jobs_source_created_at ON schedule_jobs (job_source, created_at)',
  'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
