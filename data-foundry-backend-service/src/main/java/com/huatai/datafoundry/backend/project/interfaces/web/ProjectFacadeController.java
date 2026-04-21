package com.huatai.datafoundry.backend.project.interfaces.web;

import com.huatai.datafoundry.backend.project.application.query.dto.ProjectReadDto;
import com.huatai.datafoundry.backend.project.application.query.service.ProjectQueryService;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/projects")
public class ProjectFacadeController {
  private final ProjectQueryService projectQueryService;

  public ProjectFacadeController(ProjectQueryService projectQueryService) {
    this.projectQueryService = projectQueryService;
  }

  @GetMapping
  public List<ProjectReadDto> listProjects() {
    return projectQueryService.list();
  }

  @GetMapping("/{projectId}")
  public ProjectReadDto getProject(@PathVariable("projectId") String projectId) {
    return projectQueryService.getById(projectId);
  }
}
