package com.huatai.datafoundry.contract.scheduler;

public class XxlJobRuleSyncResult {
  private String ruleId;
  private String status;
  private String xxlJobId;
  private String xxlJobGroup;
  private String executorName;
  private String nextTriggerTime;
  private String syncHash;
  private String errorMessage;

  public String getRuleId() { return ruleId; }
  public void setRuleId(String ruleId) { this.ruleId = ruleId; }
  public String getStatus() { return status; }
  public void setStatus(String status) { this.status = status; }
  public String getXxlJobId() { return xxlJobId; }
  public void setXxlJobId(String xxlJobId) { this.xxlJobId = xxlJobId; }
  public String getXxlJobGroup() { return xxlJobGroup; }
  public void setXxlJobGroup(String xxlJobGroup) { this.xxlJobGroup = xxlJobGroup; }
  public String getExecutorName() { return executorName; }
  public void setExecutorName(String executorName) { this.executorName = executorName; }
  public String getNextTriggerTime() { return nextTriggerTime; }
  public void setNextTriggerTime(String nextTriggerTime) { this.nextTriggerTime = nextTriggerTime; }
  public String getSyncHash() { return syncHash; }
  public void setSyncHash(String syncHash) { this.syncHash = syncHash; }
  public String getErrorMessage() { return errorMessage; }
  public void setErrorMessage(String errorMessage) { this.errorMessage = errorMessage; }
}
