package com.huatai.datafoundry.backend.requirement.interfaces.web.legacy;

import com.huatai.datafoundry.backend.requirement.application.command.WideTableUpdateCommand;
import com.huatai.datafoundry.backend.requirement.application.query.dto.WideTableReadDto;
import com.huatai.datafoundry.backend.requirement.application.query.service.RequirementQueryService;
import com.huatai.datafoundry.backend.requirement.application.service.RequirementAppService;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Legacy wide table update endpoint (frontend depends on this path). */
@RestController
@RequestMapping("/api/requirements/{requirementId}/wide-tables")
public class RequirementWideTableLegacyController {
  private final RequirementAppService requirementAppService;
  private final RequirementQueryService requirementQueryService;

  public RequirementWideTableLegacyController(
      RequirementAppService requirementAppService, RequirementQueryService requirementQueryService) {
    this.requirementAppService = requirementAppService;
    this.requirementQueryService = requirementQueryService;
  }

  @PutMapping("/{wideTableId}")
  public WideTableReadDto update(
      @PathVariable("requirementId") String requirementId,
      @PathVariable("wideTableId") String wideTableId,
      @RequestBody WideTableUpdateCommand request) {
    requirementAppService.updateWideTableForRequirement(requirementId, wideTableId, request);
    return requirementQueryService.getWideTableByIdForRequirement(requirementId, wideTableId);
  }
}

