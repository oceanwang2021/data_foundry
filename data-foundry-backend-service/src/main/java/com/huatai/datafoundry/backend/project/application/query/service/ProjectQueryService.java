package com.huatai.datafoundry.backend.project.application.query.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.huatai.datafoundry.backend.project.application.query.dto.ProjectReadDto;
import com.huatai.datafoundry.backend.project.domain.model.Project;
import com.huatai.datafoundry.backend.project.domain.repository.ProjectRepository;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ProjectQueryService {
  private final ProjectRepository projectRepository;
  private final ObjectMapper objectMapper;

  public ProjectQueryService(ProjectRepository projectRepository, ObjectMapper objectMapper) {
    this.projectRepository = projectRepository;
    this.objectMapper = objectMapper;
  }

  public List<ProjectReadDto> list() {
    List<Project> records = projectRepository.listProjects();
    List<ProjectReadDto> out = new ArrayList<ProjectReadDto>();
    for (Project record : records) {
      out.add(toReadDto(record));
    }
    return out;
  }

  public ProjectReadDto getById(String projectId) {
    Project record = projectRepository.getProject(projectId);
    if (record == null) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Project not found");
    }
    return toReadDto(record);
  }

  private ProjectReadDto toReadDto(Project record) {
    ProjectReadDto out = new ProjectReadDto();
    out.setId(record.getId());
    out.setName(record.getName());
    out.setCreatedBy(record.getCreatedBy());
    out.setBusinessBackground(record.getBusinessBackground());
    out.setDescription(record.getDescription());
    out.setStatus(record.getStatus());
    out.setOwnerTeam(record.getOwnerTeam());
    out.setDataSource(parseJsonObject(record.getDataSourceJson()));
    out.setCreatedAt(record.getCreatedAt());
    out.setUpdatedAt(record.getUpdatedAt());
    return out;
  }

  private Map<String, Object> parseJsonObject(String raw) {
    if (raw == null || raw.trim().isEmpty()) {
      return null;
    }
    try {
      return objectMapper.readValue(raw, new TypeReference<Map<String, Object>>() {});
    } catch (Exception ex) {
      return null;
    }
  }
}
