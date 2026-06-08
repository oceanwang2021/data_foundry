package com.huatai.datafoundry.scheduler.schedule.domain.model;

public class ScheduleJob {
  private String id;
  private String taskGroupId;
  private String taskId;
  private String jobSource;
  private String scheduleRuleId;
  private String businessDate;
  private String requestPayload;
  private String errorMessage;
  private String triggerType;
  private String status;
  private String startedAt;
  private String endedAt;
  private String operator;
  private String logRef;

  public String getId() {
    return id;
  }

  public void setId(String id) {
    this.id = id;
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

  public String getJobSource() { return jobSource; }
  public void setJobSource(String jobSource) { this.jobSource = jobSource; }
  public String getScheduleRuleId() { return scheduleRuleId; }
  public void setScheduleRuleId(String scheduleRuleId) { this.scheduleRuleId = scheduleRuleId; }
  public String getBusinessDate() { return businessDate; }
  public void setBusinessDate(String businessDate) { this.businessDate = businessDate; }
  public String getRequestPayload() { return requestPayload; }
  public void setRequestPayload(String requestPayload) { this.requestPayload = requestPayload; }
  public String getErrorMessage() { return errorMessage; }
  public void setErrorMessage(String errorMessage) { this.errorMessage = errorMessage; }

  public String getTriggerType() {
    return triggerType;
  }

  public void setTriggerType(String triggerType) {
    this.triggerType = triggerType;
  }

  public String getStatus() {
    return status;
  }

  public void setStatus(String status) {
    this.status = status;
  }

  public String getStartedAt() {
    return startedAt;
  }

  public void setStartedAt(String startedAt) {
    this.startedAt = startedAt;
  }

  public String getEndedAt() {
    return endedAt;
  }

  public void setEndedAt(String endedAt) {
    this.endedAt = endedAt;
  }

  public String getOperator() {
    return operator;
  }

  public void setOperator(String operator) {
    this.operator = operator;
  }

  public String getLogRef() {
    return logRef;
  }

  public void setLogRef(String logRef) {
    this.logRef = logRef;
  }
}
