package com.huatai.datafoundry.backend.requirement.interfaces.web;

import com.huatai.datafoundry.backend.requirement.application.command.RequirementCreateCommand;
import com.huatai.datafoundry.backend.requirement.application.command.RequirementUpdateCommand;
import com.huatai.datafoundry.backend.requirement.application.query.dto.RequirementReadDto;
import com.huatai.datafoundry.backend.requirement.application.query.dto.WideTableReadDto;
import com.huatai.datafoundry.backend.requirement.application.query.service.RequirementQueryService;
import com.huatai.datafoundry.backend.requirement.application.service.RequirementAppService;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * Canonical facade for Requirement application service.
 *
 * <p>Notes:
 * - This controller is additive: it does not change any existing legacy routes.
 * - Response remains "raw JSON" (no Response&lt;T&gt; wrapper) to match current frontend expectations.
 */
@RestController
@RequestMapping("/api/requirements")
public class RequirementFacadeController {
  private final RequirementAppService requirementAppService;
  private final RequirementQueryService requirementQueryService;

  public RequirementFacadeController(
      RequirementAppService requirementAppService,
      RequirementQueryService requirementQueryService) {
    this.requirementAppService = requirementAppService;
    this.requirementQueryService = requirementQueryService;
  }

  @GetMapping
  public List<RequirementReadDto> list(@RequestParam("project_id") String projectId) {
    return requirementQueryService.listByProject(projectId);
  }

  @PostMapping
  public RequirementReadDto create(
      @RequestParam("project_id") String projectId,
      @RequestBody RequirementCreateCommand request) {
    String requirementId = RequirementAppService.buildRequirementId();
    String wideTableId = buildWideTableId();
    requirementAppService.createRequirement(projectId, requirementId, wideTableId, request);

    RequirementReadDto refreshed = requirementQueryService.getByProjectAndId(projectId, requirementId);
    WideTableReadDto primary = requirementQueryService.getPrimaryWideTableByRequirement(requirementId);
    refreshed.setWideTable(primary);
    return refreshed;
  }

  @GetMapping("/{requirementId}")
  public RequirementReadDto get(
      @RequestParam("project_id") String projectId,
      @PathVariable("requirementId") String requirementId) {
    return requirementQueryService.getByProjectAndId(projectId, requirementId);
  }

  @PutMapping("/{requirementId}")
  public RequirementReadDto update(
      @RequestParam("project_id") String projectId,
      @PathVariable("requirementId") String requirementId,
      @RequestBody RequirementUpdateCommand request) {
    requirementAppService.updateByProjectAndId(projectId, requirementId, request);
    return requirementQueryService.getByProjectAndId(projectId, requirementId);
  }

  private static String buildWideTableId() {
    int year = LocalDate.now().getYear();
    String token = UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase();
    return String.format("WT-%d-%s", year, token);
  }
}
