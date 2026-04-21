package com.huatai.datafoundry.backend.task.application.event;

public class TaskGroupExecuteRequestedEvent {
  private final String taskGroupId;
  private final String requestId;

  public TaskGroupExecuteRequestedEvent(String taskGroupId, String requestId) {
    this.taskGroupId = taskGroupId;
    this.requestId = requestId;
  }

  public String getTaskGroupId() {
    return taskGroupId;
  }

  public String getRequestId() {
    return requestId;
  }
}
