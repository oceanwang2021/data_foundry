package com.huatai.datafoundry.backend.requirement.application.command;

import java.util.List;

public class RequirementTrialRunCommand {
  private String wideTableId;
  private List<String> businessDates;
  private List<String> rowBindingKeys;
  private Integer maxRows;
  private String operator;

  public String getWideTableId() {
    return wideTableId;
  }

  public void setWideTableId(String wideTableId) {
    this.wideTableId = wideTableId;
  }

  public List<String> getBusinessDates() {
    return businessDates;
  }

  public void setBusinessDates(List<String> businessDates) {
    this.businessDates = businessDates;
  }

  public List<String> getRowBindingKeys() {
    return rowBindingKeys;
  }

  public void setRowBindingKeys(List<String> rowBindingKeys) {
    this.rowBindingKeys = rowBindingKeys;
  }

  public Integer getMaxRows() {
    return maxRows;
  }

  public void setMaxRows(Integer maxRows) {
    this.maxRows = maxRows;
  }

  public String getOperator() {
    return operator;
  }

  public void setOperator(String operator) {
    this.operator = operator;
  }
}
