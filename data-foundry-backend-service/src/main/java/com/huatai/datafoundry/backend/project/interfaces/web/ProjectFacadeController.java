package com.huatai.datafoundry.backend.project.interfaces.web;

import com.huatai.datafoundry.backend.project.application.command.ProjectCreateCommand;
import com.huatai.datafoundry.backend.project.application.query.dto.ProjectReadDto;
import com.huatai.datafoundry.backend.project.application.query.service.ProjectQueryService;
import com.huatai.datafoundry.backend.project.application.service.ProjectAppService;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/projects")
public class ProjectFacadeController {
  private final ProjectQueryService projectQueryService;
  private final ProjectAppService projectAppService;

  public ProjectFacadeController(ProjectQueryService projectQueryService, ProjectAppService projectAppService) {
    this.projectQueryService = projectQueryService;
    this.projectAppService = projectAppService;
  }

  @GetMapping
  public List<ProjectReadDto> listProjects() {
    return projectQueryService.list();
  }

  @PostMapping
  public ProjectReadDto createProject(@RequestBody ProjectCreateCommand request) {
    String projectId = projectAppService.create(request);
    return projectQueryService.getById(projectId);
  }

  @GetMapping("/{projectId}")
  public ProjectReadDto getProject(@PathVariable("projectId") String projectId) {
    return projectQueryService.getById(projectId);
  }
}
