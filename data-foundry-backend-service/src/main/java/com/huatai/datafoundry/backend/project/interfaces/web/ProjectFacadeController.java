package com.huatai.datafoundry.backend.project.interfaces.web;

import com.huatai.datafoundry.backend.account.infrastructure.persistence.mybatis.record.AccountRecord;
import com.huatai.datafoundry.backend.account.interfaces.web.AccountAuthSupport;
import com.huatai.datafoundry.backend.project.application.command.ProjectCreateCommand;
import com.huatai.datafoundry.backend.project.application.query.dto.ProjectReadDto;
import com.huatai.datafoundry.backend.project.application.query.service.ProjectQueryService;
import com.huatai.datafoundry.backend.project.application.service.ProjectAppService;
import java.util.List;
import javax.servlet.http.HttpServletRequest;
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
  private final AccountAuthSupport accountAuthSupport;

  public ProjectFacadeController(
      ProjectQueryService projectQueryService,
      ProjectAppService projectAppService,
      AccountAuthSupport accountAuthSupport) {
    this.projectQueryService = projectQueryService;
    this.projectAppService = projectAppService;
    this.accountAuthSupport = accountAuthSupport;
  }

  @GetMapping
  public List<ProjectReadDto> listProjects() {
    return projectQueryService.list();
  }

  @PostMapping
  public ProjectReadDto createProject(@RequestBody ProjectCreateCommand request, HttpServletRequest httpRequest) {
    AccountRecord currentUser = accountAuthSupport.requireCurrentUser(httpRequest);
    request.setCreatedBy(currentUser.getDisplayName());
    request.setCreatedByAccount(currentUser.getAccount());
    String projectId = projectAppService.create(request);
    return projectQueryService.getById(projectId);
  }

  @GetMapping("/{projectId}")
  public ProjectReadDto getProject(@PathVariable("projectId") String projectId) {
    return projectQueryService.getById(projectId);
  }
}
