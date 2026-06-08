SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema = DATABASE() AND table_name = 'task_groups'
     AND index_name = 'uk_tg_rule_business_date') > 0,
  'DROP INDEX uk_tg_rule_business_date ON task_groups',
  'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema = DATABASE() AND table_name = 'task_groups'
     AND index_name = 'uk_tg_rule_period_group') = 0,
  'CREATE UNIQUE INDEX uk_tg_rule_period_group ON task_groups (schedule_rule_id, business_date, indicator_group_id)',
  'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
