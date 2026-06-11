SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'schedule_rules'
     AND column_name = 'xxl_sync_status') = 0,
  'ALTER TABLE schedule_rules ADD COLUMN xxl_sync_status VARCHAR(32) NOT NULL DEFAULT ''PENDING_SYNC'' AFTER xxl_job_id',
  'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'schedule_rules'
     AND column_name = 'xxl_sync_hash') = 0,
  'ALTER TABLE schedule_rules ADD COLUMN xxl_sync_hash VARCHAR(64) NULL AFTER xxl_sync_status',
  'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'schedule_rules'
     AND column_name = 'xxl_last_sync_time') = 0,
  'ALTER TABLE schedule_rules ADD COLUMN xxl_last_sync_time DATETIME NULL AFTER xxl_sync_hash',
  'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'schedule_rules'
     AND column_name = 'xxl_last_error_message') = 0,
  'ALTER TABLE schedule_rules ADD COLUMN xxl_last_error_message TEXT NULL AFTER xxl_last_sync_time',
  'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'schedule_rules'
     AND column_name = 'xxl_sync_retry_count') = 0,
  'ALTER TABLE schedule_rules ADD COLUMN xxl_sync_retry_count INT NOT NULL DEFAULT 0 AFTER xxl_last_error_message',
  'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema = DATABASE() AND table_name = 'schedule_rules'
     AND index_name = 'idx_schedule_rules_xxl_sync') = 0,
  'CREATE INDEX idx_schedule_rules_xxl_sync ON schedule_rules (xxl_sync_status, enabled, updated_at)',
  'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
