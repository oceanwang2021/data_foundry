package com.huatai.datafoundry.backend.task.application.event;

public class TaskExecuteRequestedEvent {
  private final String taskId;
  private final String requestId;

  public TaskExecuteRequestedEvent(String taskId, String requestId) {
    this.taskId = taskId;
    this.requestId = requestId;
  }

  public String getTaskId() {
    return taskId;
  }

  public String getRequestId() {
    return requestId;
  }
}
