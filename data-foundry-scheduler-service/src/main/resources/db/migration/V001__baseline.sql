-- Flyway baseline (scheduler-service)
--
-- Notes:
-- - Keep it DROP-free (safe to migrate an empty schema).
-- - When enabling Flyway on an existing non-empty schema, use baseline-on-migrate (configured in application.yml).

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
  INDEX idx_schedule_jobs_created_at (created_at)
);

