package com.huatai.datafoundry.backend.requirement.interfaces.web.legacy;

import com.huatai.datafoundry.backend.requirement.application.query.dto.FetchTaskReadDto;
import com.huatai.datafoundry.backend.requirement.application.query.dto.TaskGroupReadDto;
import com.huatai.datafoundry.backend.requirement.application.query.service.RequirementQueryService;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Legacy read endpoints for task groups/tasks under a requirement. */
@RestController
@RequestMapping("/api/projects/{projectId}/requirements/{requirementId}")
public class RequirementTaskLegacyController {
  private final RequirementQueryService requirementQueryService;

  public RequirementTaskLegacyController(RequirementQueryService requirementQueryService) {
    this.requirementQueryService = requirementQueryService;
  }

  @GetMapping("/task-groups")
  public List<TaskGroupReadDto> listTaskGroups(
      @PathVariable("projectId") String projectId,
      @PathVariable("requirementId") String requirementId) {
    return requirementQueryService.listTaskGroups(projectId, requirementId);
  }

  @GetMapping("/tasks")
  public List<FetchTaskReadDto> listTasks(
      @PathVariable("projectId") String projectId,
      @PathVariable("requirementId") String requirementId) {
    return requirementQueryService.listFetchTasks(projectId, requirementId);
  }
}

