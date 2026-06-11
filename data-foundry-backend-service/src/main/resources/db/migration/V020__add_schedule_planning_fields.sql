SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'schedule_rules'
     AND column_name = 'business_date_offset_days') = 0,
  'ALTER TABLE schedule_rules ADD COLUMN business_date_offset_days INT NOT NULL DEFAULT 1 AFTER business_date_mode',
  'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'schedule_rules'
     AND column_name = 'trigger_time') = 0,
  'ALTER TABLE schedule_rules ADD COLUMN trigger_time TIME NOT NULL DEFAULT ''09:00:00'' AFTER business_date_offset_days',
  'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'task_groups'
     AND column_name = 'scheduled_at') = 0,
  'ALTER TABLE task_groups ADD COLUMN scheduled_at DATETIME NULL AFTER schedule_rule_id',
  'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema = DATABASE() AND table_name = 'task_groups'
     AND index_name = 'idx_tg_rule_status_scheduled') = 0,
  'CREATE INDEX idx_tg_rule_status_scheduled ON task_groups (schedule_rule_id, status, scheduled_at)',
  'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
