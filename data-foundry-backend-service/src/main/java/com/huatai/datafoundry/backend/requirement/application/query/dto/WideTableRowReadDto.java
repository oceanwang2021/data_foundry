package com.huatai.datafoundry.backend.requirement.application.query.dto;

import java.util.Map;

public class WideTableRowReadDto {
  private String wideTableId;
  private Integer rowId;
  private Integer planVersion;
  private String rowStatus;
  private Map<String, Object> dimensionValues;
  private String businessDate;
  private String rowBindingKey;
  private Map<String, Object> indicatorValues;
  private Map<String, Object> systemValues;

  public String getWideTableId() {
    return wideTableId;
  }

  public void setWideTableId(String wideTableId) {
    this.wideTableId = wideTableId;
  }

  public Integer getRowId() {
    return rowId;
  }

  public void setRowId(Integer rowId) {
    this.rowId = rowId;
  }

  public Integer getPlanVersion() {
    return planVersion;
  }

  public void setPlanVersion(Integer planVersion) {
    this.planVersion = planVersion;
  }

  public String getRowStatus() {
    return rowStatus;
  }

  public void setRowStatus(String rowStatus) {
    this.rowStatus = rowStatus;
  }

  public Map<String, Object> getDimensionValues() {
    return dimensionValues;
  }

  public void setDimensionValues(Map<String, Object> dimensionValues) {
    this.dimensionValues = dimensionValues;
  }

  public String getBusinessDate() {
    return businessDate;
  }

  public void setBusinessDate(String businessDate) {
    this.businessDate = businessDate;
  }

  public String getRowBindingKey() {
    return rowBindingKey;
  }

  public void setRowBindingKey(String rowBindingKey) {
    this.rowBindingKey = rowBindingKey;
  }

  public Map<String, Object> getIndicatorValues() {
    return indicatorValues;
  }

  public void setIndicatorValues(Map<String, Object> indicatorValues) {
    this.indicatorValues = indicatorValues;
  }

  public Map<String, Object> getSystemValues() {
    return systemValues;
  }

  public void setSystemValues(Map<String, Object> systemValues) {
    this.systemValues = systemValues;
  }
}

