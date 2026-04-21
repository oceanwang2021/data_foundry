package com.huatai.datafoundry.backend.requirement.interfaces.web.legacy;

import com.huatai.datafoundry.backend.requirement.application.service.RequirementAppService;
import java.util.Map;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Legacy endpoints for plan/preview persistence (frontend depends on these paths).
 *
 * <p>Keep routes stable; delegate to application service.
 */
@RestController
@RequestMapping("/api/requirements/{requirementId}/wide-tables/{wideTableId}")
public class WideTablePlanLegacyController {
  private final RequirementAppService requirementAppService;

  public WideTablePlanLegacyController(RequirementAppService requirementAppService) {
    this.requirementAppService = requirementAppService;
  }

  @PostMapping("/preview")
  public Map<String, Object> persistPreview(
      @PathVariable("requirementId") String requirementId,
      @PathVariable("wideTableId") String wideTableId,
      @RequestBody Map<String, Object> body) {
    return requirementAppService.persistWideTablePreview(requirementId, wideTableId, body);
  }

  @PostMapping("/plan")
  public Map<String, Object> persistPlan(
      @PathVariable("requirementId") String requirementId,
      @PathVariable("wideTableId") String wideTableId,
      @RequestBody Map<String, Object> body) {
    return requirementAppService.persistWideTablePlan(requirementId, wideTableId, body);
  }
}

