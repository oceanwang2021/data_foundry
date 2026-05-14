package com.huatai.datafoundry.backend.task.application.command;

import com.huatai.datafoundry.contract.agent.AgentExecutionResponse;

public class SchedulerExecutionCallbackCommand {
  private String scheduleJobId;
  private String taskGroupId;
  private String taskId;
  private String status;
  private String endedAt;
  private AgentExecutionResponse agentResult;

  public String getScheduleJobId() {
    return scheduleJobId;
  }

  public void setScheduleJobId(String scheduleJobId) {
    this.scheduleJobId = scheduleJobId;
  }

  public String getTaskGroupId() {
    return taskGroupId;
  }

  public void setTaskGroupId(String taskGroupId) {
    this.taskGroupId = taskGroupId;
  }

  public String getTaskId() {
    return taskId;
  }

  public void setTaskId(String taskId) {
    this.taskId = taskId;
  }

  public String getStatus() {
    return status;
  }

  public void setStatus(String status) {
    this.status = status;
  }

  public String getEndedAt() {
    return endedAt;
  }

  public void setEndedAt(String endedAt) {
    this.endedAt = endedAt;
  }

  public AgentExecutionResponse getAgentResult() {
    return agentResult;
  }

  public void setAgentResult(AgentExecutionResponse agentResult) {
    this.agentResult = agentResult;
  }
}

