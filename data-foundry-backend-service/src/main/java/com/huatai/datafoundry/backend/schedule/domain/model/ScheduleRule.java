package com.huatai.datafoundry.backend.schedule.domain.model;

import java.time.LocalDateTime;
import java.time.LocalTime;

public class ScheduleRule {
  private String id;
  private String requirementId;
  private String wideTableId;
  private String indicatorGroupId;
  private String ruleName;
  private String ruleCode;
  private String frequency;
  private String cronExpression;
  private String businessDateMode;
  private Integer businessDateOffsetDays;
  private LocalTime triggerTime;
  private Boolean enabled;
  private String xxlJobGroup;
  private String xxlExecutorName;
  private String xxlJobHandler;
  private String xxlJobId;
  private LocalDateTime lastTriggerTime;
  private LocalDateTime lastSuccessTime;
  private String lastTriggerStatus;
  private LocalDateTime nextTriggerTime;
  private String createdBy;
  private String updatedBy;
  private LocalDateTime createdAt;
  private LocalDateTime updatedAt;

  public String getId() { return id; }
  public void setId(String id) { this.id = id; }
  public String getRequirementId() { return requirementId; }
  public void setRequirementId(String requirementId) { this.requirementId = requirementId; }
  public String getWideTableId() { return wideTableId; }
  public void setWideTableId(String wideTableId) { this.wideTableId = wideTableId; }
  public String getIndicatorGroupId() { return indicatorGroupId; }
  public void setIndicatorGroupId(String indicatorGroupId) { this.indicatorGroupId = indicatorGroupId; }
  public String getRuleName() { return ruleName; }
  public void setRuleName(String ruleName) { this.ruleName = ruleName; }
  public String getRuleCode() { return ruleCode; }
  public void setRuleCode(String ruleCode) { this.ruleCode = ruleCode; }
  public String getFrequency() { return frequency; }
  public void setFrequency(String frequency) { this.frequency = frequency; }
  public String getCronExpression() { return cronExpression; }
  public void setCronExpression(String cronExpression) { this.cronExpression = cronExpression; }
  public String getBusinessDateMode() { return businessDateMode; }
  public void setBusinessDateMode(String businessDateMode) { this.businessDateMode = businessDateMode; }
  public Integer getBusinessDateOffsetDays() { return businessDateOffsetDays; }
  public void setBusinessDateOffsetDays(Integer businessDateOffsetDays) { this.businessDateOffsetDays = businessDateOffsetDays; }
  public LocalTime getTriggerTime() { return triggerTime; }
  public void setTriggerTime(LocalTime triggerTime) { this.triggerTime = triggerTime; }
  public Boolean getEnabled() { return enabled; }
  public void setEnabled(Boolean enabled) { this.enabled = enabled; }
  public String getXxlJobGroup() { return xxlJobGroup; }
  public void setXxlJobGroup(String xxlJobGroup) { this.xxlJobGroup = xxlJobGroup; }
  public String getXxlExecutorName() { return xxlExecutorName; }
  public void setXxlExecutorName(String xxlExecutorName) { this.xxlExecutorName = xxlExecutorName; }
  public String getXxlJobHandler() { return xxlJobHandler; }
  public void setXxlJobHandler(String xxlJobHandler) { this.xxlJobHandler = xxlJobHandler; }
  public String getXxlJobId() { return xxlJobId; }
  public void setXxlJobId(String xxlJobId) { this.xxlJobId = xxlJobId; }
  public LocalDateTime getLastTriggerTime() { return lastTriggerTime; }
  public void setLastTriggerTime(LocalDateTime lastTriggerTime) { this.lastTriggerTime = lastTriggerTime; }
  public LocalDateTime getLastSuccessTime() { return lastSuccessTime; }
  public void setLastSuccessTime(LocalDateTime lastSuccessTime) { this.lastSuccessTime = lastSuccessTime; }
  public String getLastTriggerStatus() { return lastTriggerStatus; }
  public void setLastTriggerStatus(String lastTriggerStatus) { this.lastTriggerStatus = lastTriggerStatus; }
  public LocalDateTime getNextTriggerTime() { return nextTriggerTime; }
  public void setNextTriggerTime(LocalDateTime nextTriggerTime) { this.nextTriggerTime = nextTriggerTime; }
  public String getCreatedBy() { return createdBy; }
  public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }
  public String getUpdatedBy() { return updatedBy; }
  public void setUpdatedBy(String updatedBy) { this.updatedBy = updatedBy; }
  public LocalDateTime getCreatedAt() { return createdAt; }
  public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
  public LocalDateTime getUpdatedAt() { return updatedAt; }
  public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
