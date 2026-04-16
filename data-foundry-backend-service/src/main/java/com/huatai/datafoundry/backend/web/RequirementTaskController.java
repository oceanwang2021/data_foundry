package com.huatai.datafoundry.backend.web;

import com.huatai.datafoundry.backend.persistence.FetchTaskMapper;
import com.huatai.datafoundry.backend.persistence.FetchTaskRecord;
import com.huatai.datafoundry.backend.persistence.RequirementMapper;
import com.huatai.datafoundry.backend.persistence.RequirementRecord;
import com.huatai.datafoundry.backend.persistence.TaskGroupMapper;
import com.huatai.datafoundry.backend.persistence.TaskGroupRecord;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/projects/{projectId}/requirements/{requirementId}")
public class RequirementTaskController {
  private final RequirementMapper requirementMapper;
  private final TaskGroupMapper taskGroupMapper;
  private final FetchTaskMapper fetchTaskMapper;

  public RequirementTaskController(
      RequirementMapper requirementMapper,
      TaskGroupMapper taskGroupMapper,
      FetchTaskMapper fetchTaskMapper) {
    this.requirementMapper = requirementMapper;
    this.taskGroupMapper = taskGroupMapper;
    this.fetchTaskMapper = fetchTaskMapper;
  }

  @GetMapping("/task-groups")
  public List<TaskGroupRecord> listTaskGroups(
      @PathVariable("projectId") String projectId,
      @PathVariable("requirementId") String requirementId) {
    assertRequirementExists(projectId, requirementId);
    return taskGroupMapper.listByRequirement(requirementId);
  }

  @GetMapping("/tasks")
  public List<FetchTaskRecord> listTasks(
      @PathVariable("projectId") String projectId,
      @PathVariable("requirementId") String requirementId) {
    assertRequirementExists(projectId, requirementId);
    return fetchTaskMapper.listByRequirement(requirementId);
  }

  private void assertRequirementExists(String projectId, String requirementId) {
    RequirementRecord record = requirementMapper.get(projectId, requirementId);
    if (record == null) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Requirement not found");
    }
  }
}

