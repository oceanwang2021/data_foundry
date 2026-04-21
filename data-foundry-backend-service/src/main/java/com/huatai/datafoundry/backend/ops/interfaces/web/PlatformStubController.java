package com.huatai.datafoundry.backend.ops.interfaces.web;

import com.huatai.datafoundry.backend.ops.application.service.DemoDataService;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * Frontend already contains an API client and a `/api/*` proxy route.
 *
 * <p>This controller provides minimal placeholder endpoints so pages can render before full domain
 * migration is completed.
 */
@RestController
public class PlatformStubController {
  private final DemoDataService demoDataService;
  private final boolean adminEnabled;

  public PlatformStubController(
      DemoDataService demoDataService,
      @Value("${datafoundry.admin.enabled:false}") boolean adminEnabled) {
    this.demoDataService = demoDataService;
    this.adminEnabled = adminEnabled;
  }

  @GetMapping("/api/knowledge-bases")
  public List<Map<String, Object>> listKnowledgeBases() {
    return new ArrayList<Map<String, Object>>();
  }

  @GetMapping("/api/preprocess-rules")
  public List<Map<String, Object>> listPreprocessRules() {
    return new ArrayList<Map<String, Object>>();
  }

  @GetMapping("/api/audit-rules")
  public List<Map<String, Object>> listAuditRules() {
    return new ArrayList<Map<String, Object>>();
  }

  @GetMapping("/api/acceptance-tickets")
  public List<Map<String, Object>> listAcceptanceTickets() {
    return new ArrayList<Map<String, Object>>();
  }

  @GetMapping("/api/dashboard/metrics")
  public Map<String, Object> dashboardMetrics() {
    DemoDataService.DemoMetrics metrics = demoDataService.metrics();
    Map<String, Object> out = new HashMap<String, Object>();
    out.put("projects", metrics.projects);
    out.put("requirements", metrics.requirements);
    out.put("task_groups", 0);
    out.put("fetch_tasks", 0);
    out.put("running_task_groups", 0);
    out.put("pending_backfills", 0);
    return out;
  }

  @GetMapping("/api/ops/overview")
  public List<Map<String, Object>> opsOverview() {
    return new ArrayList<Map<String, Object>>();
  }

  @GetMapping("/api/ops/task-status-counts")
  public List<Map<String, Object>> taskStatusCounts() {
    return new ArrayList<Map<String, Object>>();
  }

  @GetMapping("/api/ops/data-status-counts")
  public List<Map<String, Object>> dataStatusCounts() {
    return new ArrayList<Map<String, Object>>();
  }

  @PostMapping("/api/admin/seed")
  public Map<String, Object> seedDemoData() {
    ensureAdminEnabled();
    Map<String, Object> out = new HashMap<String, Object>();
    try {
      DemoDataService.SeedResult result = demoDataService.seed();
      out.put("ok", result.ok);
      out.put("message", result.message);
      out.put("projects", result.projects);
      out.put("requirements", result.requirements);
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
  public Map<String, Object> resetAllData() {
    ensureAdminEnabled();
    Map<String, Object> out = new HashMap<String, Object>();
    try {
      demoDataService.reset();
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

  private void ensureAdminEnabled() {
    if (!adminEnabled) {
      throw new ResponseStatusException(
          HttpStatus.FORBIDDEN, "Admin endpoints are disabled (datafoundry.admin.enabled=false)");
    }
  }
}
