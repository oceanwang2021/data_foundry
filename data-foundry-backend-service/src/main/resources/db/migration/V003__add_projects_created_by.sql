-- Add created_by column to projects (backend-service)
-- Safe for re-application: guard by checking information_schema.columns.

SELECT IF(
  (SELECT COUNT(1) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'projects' AND column_name = 'created_by') = 0,
  'ALTER TABLE projects ADD COLUMN created_by VARCHAR(255) NOT NULL DEFAULT '''' AFTER name',
  'SELECT 1'
) INTO @sql_projects_created_by;
PREPARE stmt FROM @sql_projects_created_by; EXECUTE stmt; DEALLOCATE PREPARE stmt;

