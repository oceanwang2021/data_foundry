package com.huatai.datafoundry.backend.schedule.application.command;

import com.fasterxml.jackson.annotation.JsonAlias;

public class ScheduleRuleDispatchCommand {
  @JsonAlias({"triggerType", "trigger_type"})
  private String triggerType;
  @JsonAlias({"triggerSource", "trigger_source"})
  private String triggerSource;
  private String frequency;
  @JsonAlias({"businessDate", "business_date"})
  private String businessDate;
  @JsonAlias({"businessDateMode", "business_date_mode"})
  private String businessDateMode;
  @JsonAlias({"scheduleJobId", "schedule_job_id"})
  private String scheduleJobId;
  @JsonAlias({"xxlJobParam", "xxl_job_param"})
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
