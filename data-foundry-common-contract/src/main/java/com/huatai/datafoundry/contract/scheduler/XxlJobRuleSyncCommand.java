package com.huatai.datafoundry.contract.scheduler;

public class XxlJobRuleSyncCommand {
  private String ruleId;
  private String ruleName;
  private String ruleCode;
  private String frequency;
  private String cronExpression;
  private String businessDateMode;
  private Integer businessDateOffsetDays;
  private String triggerTime;
  private String jobHandler;
  private Boolean enabled;
  private String existingJobId;
  private String existingJobGroup;
  private String existingExecutorName;
  private String syncHash;

  public String getRuleId() { return ruleId; }
  public void setRuleId(String ruleId) { this.ruleId = ruleId; }
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
  public String getTriggerTime() { return triggerTime; }
  public void setTriggerTime(String triggerTime) { this.triggerTime = triggerTime; }
  public String getJobHandler() { return jobHandler; }
  public void setJobHandler(String jobHandler) { this.jobHandler = jobHandler; }
  public Boolean getEnabled() { return enabled; }
  public void setEnabled(Boolean enabled) { this.enabled = enabled; }
  public String getExistingJobId() { return existingJobId; }
  public void setExistingJobId(String existingJobId) { this.existingJobId = existingJobId; }
  public String getExistingJobGroup() { return existingJobGroup; }
  public void setExistingJobGroup(String existingJobGroup) { this.existingJobGroup = existingJobGroup; }
  public String getExistingExecutorName() { return existingExecutorName; }
  public void setExistingExecutorName(String existingExecutorName) { this.existingExecutorName = existingExecutorName; }
  public String getSyncHash() { return syncHash; }
  public void setSyncHash(String syncHash) { this.syncHash = syncHash; }
}
