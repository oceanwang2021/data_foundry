package com.huatai.datafoundry.backend.requirement.application.query.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.math.BigDecimal;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class FetchTaskReadDto {
  private String id;
  private Integer sortOrder;
  private String requirementId;
  private String wideTableId;
  private String taskGroupId;
  private String batchId;
  private Integer rowId;
  private String indicatorGroupId;
  private String indicatorGroupName;
  private String name;
  private Integer schemaVersion;
  private String executionMode;
  private String indicatorKeysJson;
  private String dimensionValuesJson;
  private String businessDate;
  private String status;
  private Boolean canRerun;
  private String invalidatedReason;
  private String owner;
  private BigDecimal confidence;
  private Integer planVersion;
  private String rowBindingKey;
  private Object createdAt;
  private Object updatedAt;

  public String getId() {
    return id;
  }

  public void setId(String id) {
    this.id = id;
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

  public String getWideTableId() {
    return wideTableId;
  }

  public void setWideTableId(String wideTableId) {
    this.wideTableId = wideTableId;
  }

  public String getTaskGroupId() {
    return taskGroupId;
  }

  public void setTaskGroupId(String taskGroupId) {
    this.taskGroupId = taskGroupId;
  }

  public String getBatchId() {
    return batchId;
  }

  public void setBatchId(String batchId) {
    this.batchId = batchId;
  }

  public Integer getRowId() {
    return rowId;
  }

  public void setRowId(Integer rowId) {
    this.rowId = rowId;
  }

  public String getIndicatorGroupId() {
    return indicatorGroupId;
  }

  public void setIndicatorGroupId(String indicatorGroupId) {
    this.indicatorGroupId = indicatorGroupId;
  }

  public String getIndicatorGroupName() {
    return indicatorGroupName;
  }

  public void setIndicatorGroupName(String indicatorGroupName) {
    this.indicatorGroupName = indicatorGroupName;
  }

  public String getName() {
    return name;
  }

  public void setName(String name) {
    this.name = name;
  }

  public Integer getSchemaVersion() {
    return schemaVersion;
  }

  public void setSchemaVersion(Integer schemaVersion) {
    this.schemaVersion = schemaVersion;
  }

  public String getExecutionMode() {
    return executionMode;
  }

  public void setExecutionMode(String executionMode) {
    this.executionMode = executionMode;
  }

  public String getIndicatorKeysJson() {
    return indicatorKeysJson;
  }

  public void setIndicatorKeysJson(String indicatorKeysJson) {
    this.indicatorKeysJson = indicatorKeysJson;
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

  public String getStatus() {
    return status;
  }

  public void setStatus(String status) {
    this.status = status;
  }

  public Boolean getCanRerun() {
    return canRerun;
  }

  public void setCanRerun(Boolean canRerun) {
    this.canRerun = canRerun;
  }

  public String getInvalidatedReason() {
    return invalidatedReason;
  }

  public void setInvalidatedReason(String invalidatedReason) {
    this.invalidatedReason = invalidatedReason;
  }

  public String getOwner() {
    return owner;
  }

  public void setOwner(String owner) {
    this.owner = owner;
  }

  public BigDecimal getConfidence() {
    return confidence;
  }

  public void setConfidence(BigDecimal confidence) {
    this.confidence = confidence;
  }

  public Integer getPlanVersion() {
    return planVersion;
  }

  public void setPlanVersion(Integer planVersion) {
    this.planVersion = planVersion;
  }

  public String getRowBindingKey() {
    return rowBindingKey;
  }

  public void setRowBindingKey(String rowBindingKey) {
    this.rowBindingKey = rowBindingKey;
  }

  public Object getCreatedAt() {
    return createdAt;
  }

  public void setCreatedAt(Object createdAt) {
    this.createdAt = createdAt;
  }

  public Object getUpdatedAt() {
    return updatedAt;
  }

  public void setUpdatedAt(Object updatedAt) {
    this.updatedAt = updatedAt;
  }
}

