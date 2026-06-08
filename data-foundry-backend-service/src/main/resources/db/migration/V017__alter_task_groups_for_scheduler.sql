SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'task_groups' AND column_name = 'frequency') = 0,
  'ALTER TABLE task_groups ADD COLUMN frequency VARCHAR(32) NULL AFTER business_date',
  'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'task_groups'
     AND column_name = 'indicator_group_id') = 0,
  'ALTER TABLE task_groups ADD COLUMN indicator_group_id VARCHAR(64) NULL AFTER schedule_rule_id',
  'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema = DATABASE() AND table_name = 'task_groups'
     AND index_name = 'idx_tg_schedule_rule_id') = 0,
  'CREATE INDEX idx_tg_schedule_rule_id ON task_groups (schedule_rule_id)',
  'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema = DATABASE() AND table_name = 'task_groups'
     AND index_name = 'idx_tg_indicator_group_id') = 0,
  'CREATE INDEX idx_tg_indicator_group_id ON task_groups (indicator_group_id)',
  'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
