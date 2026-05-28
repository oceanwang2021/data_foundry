-- Backend DB incremental upgrade (consolidated from former backend-service migrations V002-V012)
-- Use only when upgrading an existing schema. For a fresh schema, use db/mysql/backend/001_schema.sql.

SET NAMES utf8mb4;

-- ===== V002__add_indexes.sql =====
-- Add missing composite indexes for query patterns (backend-service)
-- Safe for re-application: guard each index creation by checking information_schema.

-- requirements: list by project_id order by created_at desc
SELECT IF(
  (SELECT COUNT(1) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'requirements' AND index_name = 'idx_requirements_project_created_at') = 0,
  'CREATE INDEX idx_requirements_project_created_at ON requirements (project_id, created_at)',
  'SELECT 1'
) INTO @sql_req;
PREPARE stmt FROM @sql_req; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- wide_tables: primary lookup by requirement_id + sort_order
SELECT IF(
  (SELECT COUNT(1) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'wide_tables' AND index_name = 'idx_wide_tables_requirement_sort') = 0,
  'CREATE INDEX idx_wide_tables_requirement_sort ON wide_tables (requirement_id, sort_order)',
  'SELECT 1'
) INTO @sql_wt;
PREPARE stmt FROM @sql_wt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- task_groups: list by requirement_id order by sort_order, plus batch_id lookup
SELECT IF(
  (SELECT COUNT(1) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'task_groups' AND index_name = 'idx_tg_requirement_sort') = 0,
  'CREATE INDEX idx_tg_requirement_sort ON task_groups (requirement_id, sort_order)',
  'SELECT 1'
) INTO @sql_tg1;
PREPARE stmt FROM @sql_tg1; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- task_groups: list by requirement_id + wide_table_id order by sort_order
SELECT IF(
  (SELECT COUNT(1) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'task_groups' AND index_name = 'idx_tg_requirement_wide_table_sort') = 0,
  'CREATE INDEX idx_tg_requirement_wide_table_sort ON task_groups (requirement_id, wide_table_id, sort_order)',
  'SELECT 1'
) INTO @sql_tg_wt;
PREPARE stmt FROM @sql_tg_wt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT IF(
  (SELECT COUNT(1) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'task_groups' AND index_name = 'idx_tg_batch_id') = 0,
  'CREATE INDEX idx_tg_batch_id ON task_groups (batch_id)',
  'SELECT 1'
) INTO @sql_tg2;
PREPARE stmt FROM @sql_tg2; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- fetch_tasks: list by requirement_id / task_group_id order by sort_order, plus batch_id lookup
SELECT IF(
  (SELECT COUNT(1) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'fetch_tasks' AND index_name = 'idx_ft_requirement_sort') = 0,
  'CREATE INDEX idx_ft_requirement_sort ON fetch_tasks (requirement_id, sort_order)',
  'SELECT 1'
) INTO @sql_ft1;
PREPARE stmt FROM @sql_ft1; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT IF(
  (SELECT COUNT(1) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'fetch_tasks' AND index_name = 'idx_ft_task_group_sort') = 0,
  'CREATE INDEX idx_ft_task_group_sort ON fetch_tasks (task_group_id, sort_order)',
  'SELECT 1'
) INTO @sql_ft2;
PREPARE stmt FROM @sql_ft2; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT IF(
  (SELECT COUNT(1) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'fetch_tasks' AND index_name = 'idx_ft_batch_id') = 0,
  'CREATE INDEX idx_ft_batch_id ON fetch_tasks (batch_id)',
  'SELECT 1'
) INTO @sql_ft3;
PREPARE stmt FROM @sql_ft3; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ===== V003__add_projects_created_by.sql =====
-- Add created_by column to projects (backend-service)
-- Safe for re-application: guard by checking information_schema.columns.

SELECT IF(
  (SELECT COUNT(1) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'projects' AND column_name = 'created_by') = 0,
  'ALTER TABLE projects ADD COLUMN created_by VARCHAR(255) NOT NULL DEFAULT '''' AFTER name',
  'SELECT 1'
) INTO @sql_projects_created_by;
PREPARE stmt FROM @sql_projects_created_by; EXECUTE stmt; DEALLOCATE PREPARE stmt;



-- ===== V004__add_wide_table_rows.sql =====
CREATE TABLE IF NOT EXISTS wide_table_rows (
  wide_table_id           VARCHAR(64)   NOT NULL,
  row_id                  INT           NOT NULL,
  sort_order              INT           NOT NULL DEFAULT 0,
  requirement_id          VARCHAR(64)   NOT NULL,
  schema_version          INT           NOT NULL DEFAULT 1,
  plan_version            INT           NOT NULL DEFAULT 1,
  row_status              VARCHAR(32)   NOT NULL DEFAULT 'initialized',
  dimension_values_json   JSON          NULL,
  business_date           VARCHAR(32)   NULL,
  row_binding_key         VARCHAR(512)  NULL,
  indicator_values_json   JSON          NULL,
  system_values_json      JSON          NULL,
  PRIMARY KEY (wide_table_id, row_id),
  INDEX idx_wtr_requirement_id (requirement_id),
  INDEX idx_wtr_business_date (business_date),
  INDEX idx_wtr_row_binding_key (row_binding_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ===== V005__add_wide_table_scope_imports.sql =====
CREATE TABLE IF NOT EXISTS wide_table_scope_imports (
  wide_table_id VARCHAR(64) NOT NULL PRIMARY KEY,
  requirement_id VARCHAR(64) NOT NULL,
  import_mode VARCHAR(64) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_type VARCHAR(128) NOT NULL,
  content_hash VARCHAR(64) NULL,
  row_count INT NOT NULL DEFAULT 0,
  header_json JSON NULL,
  file_content MEDIUMTEXT NULL,
  created_by VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_wide_table_scope_imports_wide_table
    FOREIGN KEY (wide_table_id) REFERENCES wide_tables(id) ON DELETE CASCADE,
  INDEX idx_wide_table_scope_imports_requirement_id (requirement_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ===== V006__add_requirement_search_indexes.sql =====
-- Add indexes to support requirement search (backend-service)
-- Safe for re-application: guard each index creation by checking information_schema.

-- requirements: filter/sort
SELECT IF(
  (SELECT COUNT(1) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'requirements' AND index_name = 'idx_requirements_updated_at') = 0,
  'CREATE INDEX idx_requirements_updated_at ON requirements (updated_at)',
  'SELECT 1'
) INTO @sql_req_u;
PREPARE stmt FROM @sql_req_u; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT IF(
  (SELECT COUNT(1) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'requirements' AND index_name = 'idx_requirements_status') = 0,
  'CREATE INDEX idx_requirements_status ON requirements (status)',
  'SELECT 1'
) INTO @sql_req_s;
PREPARE stmt FROM @sql_req_s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT IF(
  (SELECT COUNT(1) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'requirements' AND index_name = 'idx_requirements_owner') = 0,
  'CREATE INDEX idx_requirements_owner ON requirements (owner)',
  'SELECT 1'
) INTO @sql_req_o;
PREPARE stmt FROM @sql_req_o; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT IF(
  (SELECT COUNT(1) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'requirements' AND index_name = 'idx_requirements_assignee') = 0,
  'CREATE INDEX idx_requirements_assignee ON requirements (assignee)',
  'SELECT 1'
) INTO @sql_req_a;
PREPARE stmt FROM @sql_req_a; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- requirements: common query pattern project_id + updated_at
SELECT IF(
  (SELECT COUNT(1) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'requirements' AND index_name = 'idx_requirements_project_updated_at') = 0,
  'CREATE INDEX idx_requirements_project_updated_at ON requirements (project_id, updated_at)',
  'SELECT 1'
) INTO @sql_req_pu;
PREPARE stmt FROM @sql_req_pu; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- wide_tables: filter by table_name for primary wide table join
SELECT IF(
  (SELECT COUNT(1) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'wide_tables' AND index_name = 'idx_wide_tables_table_name') = 0,
  'CREATE INDEX idx_wide_tables_table_name ON wide_tables (table_name)',
  'SELECT 1'
) INTO @sql_wt_tn;
PREPARE stmt FROM @sql_wt_tn; EXECUTE stmt; DEALLOCATE PREPARE stmt;



-- ===== V007__add_fetch_task_prompt_text.sql =====
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



-- ===== V008__add_fetch_task_collection_task_id.sql =====
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



-- ===== V009__add_collection_results.sql =====
CREATE TABLE IF NOT EXISTS collection_results (
  id                   VARCHAR(128) NOT NULL PRIMARY KEY,
  fetch_task_id         VARCHAR(128) NULL,
  schedule_job_id       VARCHAR(64)  NULL,
  external_task_id      VARCHAR(128) NULL,
  task_group_id         VARCHAR(64)  NULL,
  batch_id              VARCHAR(64)  NULL,
  wide_table_id         VARCHAR(64)  NULL,
  row_id                INT          NULL,
  raw_result_json       JSON         NULL,
  final_report          MEDIUMTEXT   NULL,
  normalized_rows_json  JSON         NULL,
  status                VARCHAR(32)  NOT NULL DEFAULT 'success',
  error_msg             TEXT         NULL,
  duration_ms           INT          NULL,
  collected_at          DATETIME     NULL,
  created_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_collection_results_schedule_task (schedule_job_id, fetch_task_id),
  INDEX idx_collection_results_fetch_task_id (fetch_task_id),
  INDEX idx_collection_results_schedule_job_id (schedule_job_id),
  INDEX idx_collection_results_task_group_id (task_group_id),
  INDEX idx_collection_results_wide_table_id (wide_table_id),
  INDEX idx_collection_results_status (status),
  INDEX idx_collection_results_collected_at (collected_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS collection_result_rows (
  id                    VARCHAR(160) NOT NULL PRIMARY KEY,
  collection_result_id  VARCHAR(128) NOT NULL,
  fetch_task_id          VARCHAR(128) NULL,
  schedule_job_id        VARCHAR(64)  NULL,
  wide_table_id          VARCHAR(64)  NULL,
  row_id                 INT          NULL,
  indicator_key          VARCHAR(128) NULL,
  indicator_name         VARCHAR(255) NULL,
  business_date          VARCHAR(32)  NULL,
  dimension_values_json  JSON         NULL,
  raw_value              TEXT         NULL,
  cleaned_value          TEXT         NULL,
  unit                   VARCHAR(64)  NULL,
  published_at           VARCHAR(64)  NULL,
  source_site            VARCHAR(255) NULL,
  source_url             TEXT         NULL,
  quote_text             TEXT         NULL,
  max_value              VARCHAR(128) NULL,
  min_value              VARCHAR(128) NULL,
  confidence             DECIMAL(8,4) NULL,
  status                 VARCHAR(32)  NOT NULL DEFAULT 'accepted',
  warning_msg            TEXT         NULL,
  reasoning              TEXT         NULL,
  why_not_found          TEXT         NULL,
  created_at             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_collection_result_rows_result_id (collection_result_id),
  INDEX idx_collection_result_rows_fetch_task_id (fetch_task_id),
  INDEX idx_collection_result_rows_wide_table_row (wide_table_id, row_id),
  INDEX idx_collection_result_rows_indicator_key (indicator_key),
  INDEX idx_collection_result_rows_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ===== V010__add_metric_field_mappings.sql =====
CREATE TABLE IF NOT EXISTS metric_field_mappings (
  id                    VARCHAR(160) NOT NULL PRIMARY KEY,
  requirement_id         VARCHAR(64)  NOT NULL,
  wide_table_id          VARCHAR(64)  NOT NULL,
  source_metric_name     VARCHAR(255) NOT NULL,
  target_indicator_key   VARCHAR(128) NULL,
  target_indicator_name  VARCHAR(255) NULL,
  match_type             VARCHAR(32)  NOT NULL DEFAULT 'manual',
  confidence             DECIMAL(8,4) NULL,
  status                 VARCHAR(32)  NOT NULL DEFAULT 'pending',
  created_at             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_metric_field_mappings_source (wide_table_id, source_metric_name),
  INDEX idx_metric_field_mappings_requirement (requirement_id),
  INDEX idx_metric_field_mappings_wide_table (wide_table_id),
  INDEX idx_metric_field_mappings_target (wide_table_id, target_indicator_key),
  INDEX idx_metric_field_mappings_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE collection_result_rows
  ADD COLUMN source_metric_name VARCHAR(255) NULL AFTER row_id,
  ADD COLUMN target_indicator_key VARCHAR(128) NULL AFTER source_metric_name,
  ADD INDEX idx_collection_result_rows_source_metric (wide_table_id, source_metric_name),
  ADD INDEX idx_collection_result_rows_target_indicator (wide_table_id, target_indicator_key);


-- ===== V011__add_target_publish_jobs.sql =====
CREATE TABLE IF NOT EXISTS target_publish_jobs (
  id              VARCHAR(128) NOT NULL PRIMARY KEY,
  requirement_id  VARCHAR(64)  NOT NULL,
  wide_table_id   VARCHAR(64)  NOT NULL,
  task_group_id   VARCHAR(64)  NULL,
  target_schema   VARCHAR(128) NOT NULL,
  target_table    VARCHAR(255) NOT NULL,
  status          VARCHAR(32)  NOT NULL DEFAULT 'running',
  total_rows      INT          NOT NULL DEFAULT 0,
  inserted_rows   INT          NOT NULL DEFAULT 0,
  updated_rows    INT          NOT NULL DEFAULT 0,
  skipped_rows    INT          NOT NULL DEFAULT 0,
  failed_rows     INT          NOT NULL DEFAULT 0,
  error_msg       TEXT         NULL,
  approved_at     DATETIME     NULL,
  published_at    DATETIME     NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_target_publish_jobs_requirement (requirement_id),
  INDEX idx_target_publish_jobs_wide_table (wide_table_id),
  INDEX idx_target_publish_jobs_task_group (task_group_id),
  INDEX idx_target_publish_jobs_status (status),
  INDEX idx_target_publish_jobs_published_at (published_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS target_publish_row_logs (
  id                    VARCHAR(160) NOT NULL PRIMARY KEY,
  job_id                VARCHAR(128) NOT NULL,
  requirement_id        VARCHAR(64)  NOT NULL,
  wide_table_id         VARCHAR(64)  NOT NULL,
  row_id                INT          NULL,
  action                VARCHAR(32)  NOT NULL,
  status                VARCHAR(32)  NOT NULL,
  error_msg             TEXT         NULL,
  dimension_values_json JSON         NULL,
  target_values_json    JSON         NULL,
  created_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_target_publish_row_logs_job (job_id),
  INDEX idx_target_publish_row_logs_wide_table_row (wide_table_id, row_id),
  INDEX idx_target_publish_row_logs_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ===== V012__add_acceptance_tickets.sql =====
CREATE TABLE IF NOT EXISTS acceptance_tickets (
  id                 VARCHAR(128) NOT NULL PRIMARY KEY,
  requirement_id     VARCHAR(64)  NOT NULL,
  wide_table_id      VARCHAR(64)  NULL,
  task_group_id      VARCHAR(64)  NULL,
  scope_type         VARCHAR(32)  NOT NULL DEFAULT 'task_group',
  scope_key          VARCHAR(128) NOT NULL,
  dataset            VARCHAR(255) NULL,
  owner              VARCHAR(128) NULL,
  reviewer           VARCHAR(128) NULL,
  status             VARCHAR(32)  NOT NULL DEFAULT 'pending',
  feedback           TEXT         NULL,
  row_ids_json       JSON         NULL,
  publish_job_id     VARCHAR(128) NULL,
  publish_error_msg  TEXT         NULL,
  approved_at        DATETIME     NULL,
  published_at       DATETIME     NULL,
  latest_action_at   DATETIME     NULL,
  created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_acceptance_tickets_scope (requirement_id, scope_type, scope_key),
  INDEX idx_acceptance_tickets_requirement (requirement_id),
  INDEX idx_acceptance_tickets_wide_table (wide_table_id),
  INDEX idx_acceptance_tickets_task_group (task_group_id),
  INDEX idx_acceptance_tickets_status (status),
  INDEX idx_acceptance_tickets_latest_action (latest_action_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


