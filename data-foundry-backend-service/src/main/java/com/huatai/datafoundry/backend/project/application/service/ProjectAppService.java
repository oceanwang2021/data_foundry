package com.huatai.datafoundry.backend.project.application.service;

import com.huatai.datafoundry.backend.account.application.service.AccountAppService;
import com.huatai.datafoundry.backend.account.infrastructure.persistence.mybatis.record.AccountRecord;
import com.huatai.datafoundry.backend.project.application.command.ProjectCreateCommand;
import com.huatai.datafoundry.backend.project.domain.model.Project;
import com.huatai.datafoundry.backend.project.domain.repository.ProjectRepository;
import java.time.LocalDate;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ProjectAppService {
  private final AccountAppService accountAppService;
  private final ProjectRepository projectRepository;

  public ProjectAppService(AccountAppService accountAppService, ProjectRepository projectRepository) {
    this.accountAppService = accountAppService;
    this.projectRepository = projectRepository;
  }

  @Transactional
  public String create(ProjectCreateCommand command) {
    if (command == null || command.getName() == null || command.getName().trim().isEmpty()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Project name is required");
    }
    String projectId = buildProjectId();
    AccountRecord creator = resolveCreator(command);

    Project record = new Project();
    record.setId(projectId);
    record.setName(command.getName().trim());
    record.setDescription(trimToNull(command.getDescription()));
    record.setOwnerTeam(trimToEmpty(command.getOwnerTeam()));
    record.setBusinessBackground(trimToNull(command.getBusinessBackground()));
    record.setCreatedBy(creator.getDisplayName());
    record.setCreatedByAccount(creator.getAccount());
    record.setStatus("active");
    record.setDataSourceJson(null);

    projectRepository.insertProject(record);
    return projectId;
  }

  public static String buildProjectId() {
    int year = LocalDate.now().getYear();
    String token = UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase();
    return String.format("PROJ-%d-%s", year, token);
  }

  private static String trimToNull(String value) {
    if (value == null) return null;
    String trimmed = value.trim();
    return trimmed.isEmpty() ? null : trimmed;
  }

  private static String trimToEmpty(String value) {
    if (value == null) return "";
    return value.trim();
  }

  private AccountRecord resolveCreator(ProjectCreateCommand command) {
    if (command != null && command.getCreatedByAccount() != null && !command.getCreatedByAccount().trim().isEmpty()) {
      return accountAppService.requireActiveAccount(command.getCreatedByAccount(), "created_by_account");
    }
    if (command != null && command.getCreatedBy() != null && !command.getCreatedBy().trim().isEmpty()) {
      AccountRecord record = new AccountRecord();
      record.setAccount("");
      record.setDisplayName(command.getCreatedBy().trim());
      return record;
    }
    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Project creator is required");
  }
}
