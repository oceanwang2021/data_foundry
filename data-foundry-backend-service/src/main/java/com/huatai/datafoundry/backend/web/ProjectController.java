package com.huatai.datafoundry.backend.web;

import com.huatai.datafoundry.backend.persistence.ProjectMapper;
import com.huatai.datafoundry.backend.persistence.ProjectRecord;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/projects")
public class ProjectController {
  private final ProjectMapper projectMapper;
  private final ObjectMapper objectMapper;

  public ProjectController(ProjectMapper projectMapper, ObjectMapper objectMapper) {
    this.projectMapper = projectMapper;
    this.objectMapper = objectMapper;
  }

  @GetMapping
  public List<ProjectResponse> listProjects() {
    List<ProjectRecord> records = projectMapper.listProjects();
    return ProjectResponse.from(records, objectMapper);
  }

  @GetMapping("/{projectId}")
  public ProjectResponse getProject(@PathVariable("projectId") String projectId) {
    ProjectRecord record = projectMapper.getProject(projectId);
    if (record == null) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Project not found");
    }
    return ProjectResponse.from(record, objectMapper);
  }

  public static class ProjectResponse {
    private String id;
    private String name;
    private String businessBackground;
    private String description;
    private String status;
    private String ownerTeam;
    private Map<String, Object> dataSource;
    private Object createdAt;
    private Object updatedAt;

    public static ProjectResponse from(ProjectRecord record, ObjectMapper objectMapper) {
      ProjectResponse out = new ProjectResponse();
      out.id = record.getId();
      out.name = record.getName();
      out.businessBackground = record.getBusinessBackground();
      out.description = record.getDescription();
      out.status = record.getStatus();
      out.ownerTeam = record.getOwnerTeam();
      out.dataSource = parseJsonObject(record.getDataSource(), objectMapper);
      out.createdAt = record.getCreatedAt();
      out.updatedAt = record.getUpdatedAt();
      return out;
    }

    public static List<ProjectResponse> from(List<ProjectRecord> records, ObjectMapper objectMapper) {
      java.util.ArrayList<ProjectResponse> out = new java.util.ArrayList<ProjectResponse>();
      for (ProjectRecord record : records) {
        out.add(from(record, objectMapper));
      }
      return out;
    }

    private static Map<String, Object> parseJsonObject(String raw, ObjectMapper objectMapper) {
      if (raw == null || raw.trim().isEmpty()) {
        return null;
      }
      try {
        return objectMapper.readValue(raw, new TypeReference<Map<String, Object>>() {});
      } catch (Exception ex) {
        return null;
      }
    }

    public String getId() {
      return id;
    }

    public String getName() {
      return name;
    }

    public String getBusinessBackground() {
      return businessBackground;
    }

    public String getDescription() {
      return description;
    }

    public String getStatus() {
      return status;
    }

    public String getOwnerTeam() {
      return ownerTeam;
    }

    public Map<String, Object> getDataSource() {
      return dataSource;
    }

    public Object getCreatedAt() {
      return createdAt;
    }

    public Object getUpdatedAt() {
      return updatedAt;
    }
  }
}
