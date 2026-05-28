-- Scheduler DB schema (runtime/scheduling data)
--
-- Note:
-- - This complete DDL consolidates the former scheduler-service migration
--   scripts. For an existing old schema, use db/mysql/scheduler/002_incremental_upgrade.sql.

CREATE TABLE IF NOT EXISTS schedule_jobs (
  id             VARCHAR(64)  NOT NULL PRIMARY KEY,
  task_group_id  VARCHAR(64)  NULL,
  task_id        VARCHAR(64)  NULL,
  trigger_type   VARCHAR(32)  NOT NULL,
  status         VARCHAR(32)  NOT NULL,
  started_at     VARCHAR(64)  NOT NULL,
  ended_at       VARCHAR(64)  NULL,
  operator       VARCHAR(64)  NOT NULL,
  log_ref        VARCHAR(255) NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_schedule_jobs_created_at (created_at),
  INDEX idx_schedule_jobs_status_created_at (status, created_at),
  INDEX idx_schedule_jobs_trigger_created_at (trigger_type, created_at),
  INDEX idx_schedule_jobs_trigger_status_created_at (trigger_type, status, created_at),
  INDEX idx_schedule_jobs_task_group_id (task_group_id),
  INDEX idx_schedule_jobs_task_id (task_id)
);
