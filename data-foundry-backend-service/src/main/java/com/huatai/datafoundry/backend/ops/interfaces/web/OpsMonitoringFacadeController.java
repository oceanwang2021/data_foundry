package com.huatai.datafoundry.backend.ops.interfaces.web;

import com.huatai.datafoundry.backend.ops.application.query.service.OpsMonitoringQueryService;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class OpsMonitoringFacadeController {
  private final OpsMonitoringQueryService opsMonitoringQueryService;

  public OpsMonitoringFacadeController(OpsMonitoringQueryService opsMonitoringQueryService) {
    this.opsMonitoringQueryService = opsMonitoringQueryService;
  }

  @GetMapping("/api/ops/monitoring/summary")
  public Map<String, Object> summary(
      @RequestParam(value = "include_trial", required = false, defaultValue = "false") boolean includeTrial) {
    return opsMonitoringQueryService.getMonitoringSummary(includeTrial);
  }
}
