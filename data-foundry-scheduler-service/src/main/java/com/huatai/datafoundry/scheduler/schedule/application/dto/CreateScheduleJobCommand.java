package com.huatai.datafoundry.scheduler.schedule.application.dto;

public class CreateScheduleJobCommand {
  private String taskGroupId;
  private String taskId;
  private String triggerType;
  private String operator;
  private String backfillRequestId;

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

  public String getTriggerType() {
    return triggerType;
  }

  public void setTriggerType(String triggerType) {
    this.triggerType = triggerType;
  }

  public String getOperator() {
    return operator;
  }

  public void setOperator(String operator) {
    this.operator = operator;
  }

  public String getBackfillRequestId() {
    return backfillRequestId;
  }

  public void setBackfillRequestId(String backfillRequestId) {
    this.backfillRequestId = backfillRequestId;
  }
}

