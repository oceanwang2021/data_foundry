-- Add task-instance prompt fields (backend-service)
-- - rendered_prompt_text: placeholder-filled final prompt bound to a fetch_task instance
-- - prompt_template_snapshot: original template snapshot used at task creation
-- Safe for re-application: guard each alteration by checking information_schema.

SELECT IF(
  (SELECT COUNT(1) FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'fetch_tasks'
      AND column_name = 'rendered_prompt_text') = 0,
  'ALTER TABLE fetch_tasks ADD COLUMN rendered_prompt_text LONGTEXT NULL',
  'SELECT 1'
) INTO @sql_ft_rpt;
PREPARE stmt FROM @sql_ft_rpt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT IF(
  (SELECT COUNT(1) FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'fetch_tasks'
      AND column_name = 'prompt_template_snapshot') = 0,
  'ALTER TABLE fetch_tasks ADD COLUMN prompt_template_snapshot LONGTEXT NULL',
  'SELECT 1'
) INTO @sql_ft_pts;
PREPARE stmt FROM @sql_ft_pts; EXECUTE stmt; DEALLOCATE PREPARE stmt;

