-- Flyway baseline (backend-service)
--
-- Notes:
-- - Keep it DROP-free (safe to migrate an empty schema).
-- - When enabling Flyway on an existing non-empty schema, use baseline-on-migrate (configured in application.yml).

CREATE TABLE IF NOT EXISTS projects (
  id            VARCHAR(64)  NOT NULL PRIMARY KEY,
  name          VARCHAR(255) NOT NULL,
  business_background TEXT   NULL,
  description   TEXT         NULL,
  status        VARCHAR(32)  NOT NULL DEFAULT 'active',
  owner_team    VARCHAR(255) NOT NULL DEFAULT '',
  data_source   JSON         NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_projects_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS requirements (
  id            VARCHAR(64)  NOT NULL PRIMARY KEY,
  project_id    VARCHAR(64)  NOT NULL,
  title         VARCHAR(255) NOT NULL,
  phase         VARCHAR(32)  NOT NULL DEFAULT 'demo',
  status        VARCHAR(32)  NOT NULL DEFAULT 'draft',
  schema_locked TINYINT(1)   NULL,
  owner         VARCHAR(255) NULL,
  assignee      VARCHAR(255) NULL,
  business_goal TEXT         NULL,
  background_knowledge TEXT  NULL,
  business_boundary TEXT     NULL,
  delivery_scope TEXT        NULL,
  processing_rule_drafts JSON NULL,
  collection_policy JSON     NULL,
  data_update_enabled TINYINT(1) NULL,
  data_update_mode VARCHAR(32)   NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_requirements_project_id (project_id),
  INDEX idx_requirements_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS wide_tables (
  id                      VARCHAR(64)   NOT NULL PRIMARY KEY,
  sort_order              INT           NOT NULL DEFAULT 0,
  requirement_id          VARCHAR(64)   NOT NULL,
  title                   VARCHAR(255)  NOT NULL,
  description             TEXT          NULL,
  table_name              VARCHAR(255)  NOT NULL,
  schema_version          INT           NOT NULL DEFAULT 1,
  schema_json             JSON          NULL,
  scope_json              JSON          NULL,
  indicator_groups_json   JSON          NULL,
  schedule_rules_json     JSON          NULL,
  semantic_time_axis      VARCHAR(32)   NULL,
  collection_coverage_mode VARCHAR(64)  NULL,
  status                  VARCHAR(32)   NOT NULL DEFAULT 'active',
  record_count            INT           NOT NULL DEFAULT 0,
  created_at              DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_wide_tables_requirement_id (requirement_id),
  INDEX idx_wide_tables_sort_order (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS task_groups (
  id                 VARCHAR(64)  NOT NULL PRIMARY KEY,
  sort_order          INT          NOT NULL DEFAULT 0,
  requirement_id      VARCHAR(64)  NOT NULL,
  wide_table_id       VARCHAR(64)  NOT NULL,
  batch_id            VARCHAR(64)  NULL,
  business_date       VARCHAR(32)  NULL,
  source_type         VARCHAR(32)  NULL,
  status              VARCHAR(32)  NOT NULL DEFAULT 'pending',
  schedule_rule_id    VARCHAR(64)  NULL,
  backfill_request_id VARCHAR(64)  NULL,
  plan_version        INT          NOT NULL DEFAULT 1,
  group_kind          VARCHAR(32)  NULL,
  partition_type      VARCHAR(32)  NULL,
  partition_key       VARCHAR(255) NULL,
  partition_label     VARCHAR(255) NULL,
  total_tasks         INT          NOT NULL DEFAULT 0,
  completed_tasks     INT          NOT NULL DEFAULT 0,
  failed_tasks        INT          NOT NULL DEFAULT 0,
  triggered_by        VARCHAR(64)  NULL,
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_tg_requirement_id (requirement_id),
  INDEX idx_tg_wide_table_id (wide_table_id),
  INDEX idx_tg_business_date (business_date),
  INDEX idx_tg_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS fetch_tasks (
  id                    VARCHAR(128) NOT NULL PRIMARY KEY,
  sort_order            INT          NOT NULL DEFAULT 0,
  requirement_id        VARCHAR(64)  NOT NULL,
  wide_table_id         VARCHAR(64)  NOT NULL,
  task_group_id         VARCHAR(64)  NULL,
  batch_id              VARCHAR(64)  NULL,
  row_id                INT          NULL,
  indicator_group_id    VARCHAR(64)  NULL,
  indicator_group_name  VARCHAR(255) NULL,
  name                  VARCHAR(512) NULL,
  schema_version        INT          NOT NULL DEFAULT 1,
  execution_mode        VARCHAR(32)  NULL,
  indicator_keys_json   JSON         NULL,
  dimension_values_json JSON         NULL,
  business_date         VARCHAR(32)  NULL,
  status                VARCHAR(32)  NOT NULL DEFAULT 'pending',
  can_rerun             TINYINT(1)   NOT NULL DEFAULT 1,
  invalidated_reason    TEXT         NULL,
  owner                 VARCHAR(255) NULL,
  confidence            DECIMAL(5,2) NULL,
  plan_version          INT          NOT NULL DEFAULT 1,
  row_binding_key       VARCHAR(512) NULL,
  created_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ft_requirement_id (requirement_id),
  INDEX idx_ft_wide_table_id (wide_table_id),
  INDEX idx_ft_task_group_id (task_group_id),
  INDEX idx_ft_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

