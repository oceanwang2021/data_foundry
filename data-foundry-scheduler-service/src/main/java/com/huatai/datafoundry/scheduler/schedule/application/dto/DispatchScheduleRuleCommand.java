package com.huatai.datafoundry.scheduler.schedule.application.dto;

public class DispatchScheduleRuleCommand {
  private String triggerType;
  private String triggerSource;
  private String frequency;
  private String businessDate;
  private String businessDateMode;
  private String scheduleJobId;
  private String xxlJobParam;
  private String operator;

  public String getTriggerType() { return triggerType; }
  public void setTriggerType(String triggerType) { this.triggerType = triggerType; }
  public String getTriggerSource() { return triggerSource; }
  public void setTriggerSource(String triggerSource) { this.triggerSource = triggerSource; }
  public String getFrequency() { return frequency; }
  public void setFrequency(String frequency) { this.frequency = frequency; }
  public String getBusinessDate() { return businessDate; }
  public void setBusinessDate(String businessDate) { this.businessDate = businessDate; }
  public String getBusinessDateMode() { return businessDateMode; }
  public void setBusinessDateMode(String businessDateMode) { this.businessDateMode = businessDateMode; }
  public String getScheduleJobId() { return scheduleJobId; }
  public void setScheduleJobId(String scheduleJobId) { this.scheduleJobId = scheduleJobId; }
  public String getXxlJobParam() { return xxlJobParam; }
  public void setXxlJobParam(String xxlJobParam) { this.xxlJobParam = xxlJobParam; }
  public String getOperator() { return operator; }
  public void setOperator(String operator) { this.operator = operator; }
}
