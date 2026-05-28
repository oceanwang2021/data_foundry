package com.huatai.datafoundry.backend.requirement.application.query.dto;

import java.util.ArrayList;
import java.util.List;

public class RequirementTaskRuntimeReadDto {
  private List<TaskGroupReadDto> taskGroups = new ArrayList<TaskGroupReadDto>();
  private List<FetchTaskReadDto> fetchTasks = new ArrayList<FetchTaskReadDto>();

  public List<TaskGroupReadDto> getTaskGroups() {
    return taskGroups;
  }

  public void setTaskGroups(List<TaskGroupReadDto> taskGroups) {
    this.taskGroups = taskGroups;
  }

  public List<FetchTaskReadDto> getFetchTasks() {
    return fetchTasks;
  }

  public void setFetchTasks(List<FetchTaskReadDto> fetchTasks) {
    this.fetchTasks = fetchTasks;
  }
}
