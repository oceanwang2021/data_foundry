-- Monitoring dashboard indexes
-- Keep current-state aggregations on task_groups / fetch_tasks / acceptance_tickets fast.

CREATE INDEX idx_tg_triggered_status_updated
  ON task_groups (triggered_by, status, updated_at);

CREATE INDEX idx_tg_status_aggregated
  ON task_groups (status, last_aggregated_at);

CREATE INDEX idx_ft_status_updated
  ON fetch_tasks (status, updated_at);

CREATE INDEX idx_at_task_group_status
  ON acceptance_tickets (task_group_id, status);
