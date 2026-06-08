SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'fetch_tasks' AND column_name = 'retry_count') = 0,
  'ALTER TABLE fetch_tasks ADD COLUMN retry_count INT NOT NULL DEFAULT 0 AFTER can_rerun',
  'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'fetch_tasks' AND column_name = 'error_message') = 0,
  'ALTER TABLE fetch_tasks ADD COLUMN error_message TEXT NULL AFTER retry_count',
  'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
