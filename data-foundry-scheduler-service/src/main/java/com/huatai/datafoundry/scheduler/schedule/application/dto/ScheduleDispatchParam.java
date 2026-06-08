package com.huatai.datafoundry.scheduler.schedule.application.dto;

import com.fasterxml.jackson.annotation.JsonAlias;

public class ScheduleDispatchParam {
  @JsonAlias({"ruleId", "rule_id"})
  private String ruleId;

  private String frequency;

  @JsonAlias({"triggerType", "trigger_type"})
  private String triggerType;

  @JsonAlias({"businessDate", "business_date"})
  private String businessDate;

  @JsonAlias({"businessDateMode", "business_date_mode"})
  private String businessDateMode;

  private String operator;

  public String getRuleId() {
    return ruleId;
  }

  public void setRuleId(String ruleId) {
    this.ruleId = ruleId;
  }

  public String getFrequency() {
    return frequency;
  }

  public void setFrequency(String frequency) {
    this.frequency = frequency;
  }

  public String getTriggerType() {
    return triggerType;
  }

  public void setTriggerType(String triggerType) {
    this.triggerType = triggerType;
  }

  public String getBusinessDate() {
    return businessDate;
  }

  public void setBusinessDate(String businessDate) {
    this.businessDate = businessDate;
  }

  public String getBusinessDateMode() {
    return businessDateMode;
  }

  public void setBusinessDateMode(String businessDateMode) {
    this.businessDateMode = businessDateMode;
  }

  public String getOperator() {
    return operator;
  }

  public void setOperator(String operator) {
    this.operator = operator;
  }
}
