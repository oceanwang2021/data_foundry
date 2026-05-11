package com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.record;

public class WideTableRowRecord {
  private String wideTableId;
  private Integer rowId;
  private Integer sortOrder;
  private String requirementId;
  private Integer schemaVersion;
  private Integer planVersion;
  private String rowStatus;
  /** Stored as JSON in DB. */
  private String dimensionValuesJson;
  private String businessDate;
  private String rowBindingKey;
  /** Stored as JSON in DB. */
  private String indicatorValuesJson;
  /** Stored as JSON in DB. */
  private String systemValuesJson;

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

  public Integer getSortOrder() {
    return sortOrder;
  }

  public void setSortOrder(Integer sortOrder) {
    this.sortOrder = sortOrder;
  }

  public String getRequirementId() {
    return requirementId;
  }

  public void setRequirementId(String requirementId) {
    this.requirementId = requirementId;
  }

  public Integer getSchemaVersion() {
    return schemaVersion;
  }

  public void setSchemaVersion(Integer schemaVersion) {
    this.schemaVersion = schemaVersion;
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

  public String getDimensionValuesJson() {
    return dimensionValuesJson;
  }

  public void setDimensionValuesJson(String dimensionValuesJson) {
    this.dimensionValuesJson = dimensionValuesJson;
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

  public String getIndicatorValuesJson() {
    return indicatorValuesJson;
  }

  public void setIndicatorValuesJson(String indicatorValuesJson) {
    this.indicatorValuesJson = indicatorValuesJson;
  }

  public String getSystemValuesJson() {
    return systemValuesJson;
  }

  public void setSystemValuesJson(String systemValuesJson) {
    this.systemValuesJson = systemValuesJson;
  }
}

