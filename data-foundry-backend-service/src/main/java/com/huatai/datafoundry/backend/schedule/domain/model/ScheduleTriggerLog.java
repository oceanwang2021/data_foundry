package com.huatai.datafoundry.backend.schedule.domain.model;

import java.time.LocalDateTime;

public class ScheduleTriggerLog {
  private String id;
  private String scheduleRuleId;
  private String scheduleJobId;
  private String taskGroupId;
  private String triggerType;
  private String triggerSource;
  private String businessDate;
  private String triggerParamJson;
  private String triggerStatus;
  private String skipReason;
  private String errorMessage;
  private LocalDateTime startedAt;
  private LocalDateTime endedAt;
  private LocalDateTime createdAt;

  public String getId() { return id; }
  public void setId(String id) { this.id = id; }
  public String getScheduleRuleId() { return scheduleRuleId; }
  public void setScheduleRuleId(String scheduleRuleId) { this.scheduleRuleId = scheduleRuleId; }
  public String getScheduleJobId() { return scheduleJobId; }
  public void setScheduleJobId(String scheduleJobId) { this.scheduleJobId = scheduleJobId; }
  public String getTaskGroupId() { return taskGroupId; }
  public void setTaskGroupId(String taskGroupId) { this.taskGroupId = taskGroupId; }
  public String getTriggerType() { return triggerType; }
  public void setTriggerType(String triggerType) { this.triggerType = triggerType; }
  public String getTriggerSource() { return triggerSource; }
  public void setTriggerSource(String triggerSource) { this.triggerSource = triggerSource; }
  public String getBusinessDate() { return businessDate; }
  public void setBusinessDate(String businessDate) { this.businessDate = businessDate; }
  public String getTriggerParamJson() { return triggerParamJson; }
  public void setTriggerParamJson(String triggerParamJson) { this.triggerParamJson = triggerParamJson; }
  public String getTriggerStatus() { return triggerStatus; }
  public void setTriggerStatus(String triggerStatus) { this.triggerStatus = triggerStatus; }
  public String getSkipReason() { return skipReason; }
  public void setSkipReason(String skipReason) { this.skipReason = skipReason; }
  public String getErrorMessage() { return errorMessage; }
  public void setErrorMessage(String errorMessage) { this.errorMessage = errorMessage; }
  public LocalDateTime getStartedAt() { return startedAt; }
  public void setStartedAt(LocalDateTime startedAt) { this.startedAt = startedAt; }
  public LocalDateTime getEndedAt() { return endedAt; }
  public void setEndedAt(LocalDateTime endedAt) { this.endedAt = endedAt; }
  public LocalDateTime getCreatedAt() { return createdAt; }
  public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
