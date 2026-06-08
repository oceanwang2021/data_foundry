package com.huatai.datafoundry.scheduler.ops.interfaces.web;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import javax.sql.DataSource;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class AdminController {
  private final DataSource dataSource;

  public AdminController(DataSource dataSource) {
    this.dataSource = dataSource;
  }

  @PostMapping("/api/admin/seed")
  public Map<String, Object> seed() {
    Map<String, Object> out = new HashMap<String, Object>();
    try (java.sql.Connection conn = dataSource.getConnection()) {
      conn.setAutoCommit(false);
      try (java.sql.PreparedStatement ps = conn.prepareStatement(
          "insert into schedule_jobs (id, task_group_id, task_id, job_source, schedule_rule_id, "
              + "business_date, request_payload, error_message, trigger_type, status, started_at, "
              + "ended_at, operator, log_ref) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) "
              + "on duplicate key update status=values(status), ended_at=values(ended_at), "
              + "error_message=values(error_message), log_ref=values(log_ref)")) {
        upsertJob(ps,
            "JOB-DEMO-001",
            "TG-PROJ-001-2025-01",
            null,
            "TASK_EXECUTION",
            null,
            "2025-01",
            null,
            null,
            "manual",
            "completed",
            "2026-02-01T10:10:00Z",
            "2026-02-01T10:10:03Z",
            "demo",
            "log://scheduler/JOB-DEMO-001");
        upsertJob(ps,
            "JOB-DEMO-002",
            "TG-PROJ-002-2024",
            null,
            "TASK_EXECUTION",
            null,
            "2024",
            null,
            null,
            "schedule",
            "completed",
            "2026-03-01T08:00:00Z",
            "2026-03-01T08:00:05Z",
            "system",
            "log://scheduler/JOB-DEMO-002");
        upsertJob(ps,
            "JOB-DEMO-003",
            "TG-PROJ-002-2025",
            null,
            "TASK_EXECUTION",
            null,
            "2025",
            null,
            null,
            "manual",
            "running",
            "2026-04-01T08:00:00Z",
            null,
            "demo",
            "log://scheduler/JOB-DEMO-003");
      }
      conn.commit();
      out.put("ok", true);
      out.put("message", "seed ok");
      out.put("at", Instant.now().toString());
      return out;
    } catch (Exception ex) {
      out.put("ok", false);
      out.put("message", ex.getMessage());
      out.put("at", Instant.now().toString());
      return out;
    }
  }

  @PostMapping("/api/admin/reset")
  public Map<String, Object> reset() {
    Map<String, Object> out = new HashMap<String, Object>();
    try (java.sql.Connection conn = dataSource.getConnection();
        java.sql.Statement st = conn.createStatement()) {
      st.execute("delete from schedule_jobs");
      out.put("ok", true);
      out.put("message", "reset ok");
      out.put("at", Instant.now().toString());
      return out;
    } catch (Exception ex) {
      out.put("ok", false);
      out.put("message", ex.getMessage());
      out.put("at", Instant.now().toString());
      return out;
    }
  }

  private void upsertJob(
      java.sql.PreparedStatement ps,
      String id,
      String taskGroupId,
      String taskId,
      String jobSource,
      String scheduleRuleId,
      String businessDate,
      String requestPayload,
      String errorMessage,
      String triggerType,
      String status,
      String startedAt,
      String endedAt,
      String operator,
      String logRef) throws java.sql.SQLException {
    ps.setString(1, id);
    ps.setString(2, taskGroupId);
    ps.setString(3, taskId);
    ps.setString(4, jobSource);
    ps.setString(5, scheduleRuleId);
    ps.setString(6, businessDate);
    ps.setString(7, requestPayload);
    ps.setString(8, errorMessage);
    ps.setString(9, triggerType);
    ps.setString(10, status);
    ps.setString(11, startedAt);
    ps.setString(12, endedAt);
    ps.setString(13, operator);
    ps.setString(14, logRef);
    ps.executeUpdate();
  }
}
