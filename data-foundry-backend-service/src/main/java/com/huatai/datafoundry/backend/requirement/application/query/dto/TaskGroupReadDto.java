package com.huatai.datafoundry.backend.requirement.application.query.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class TaskGroupReadDto {
  private String id;
  private Integer sortOrder;
  private String requirementId;
  private String wideTableId;
  private String batchId;
  private String businessDate;
  private String sourceType;
  private String status;
  private String scheduleRuleId;
  private String frequency;
  private Object scheduledAt;
  private String indicatorGroupId;
  private String backfillRequestId;
  private Integer planVersion;
  private String groupKind;
  private String partitionType;
  private String partitionKey;
  private String partitionLabel;
  private Integer totalTasks;
  private Integer pendingTasks;
  private Integer runningTasks;
  private Integer completedTasks;
  private Integer failedTasks;
  private Integer cancelledTasks;
  private Integer invalidatedTasks;
  private String triggeredBy;
  private Object lastAggregatedAt;
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

  public String getBatchId() {
    return batchId;
  }

  public void setBatchId(String batchId) {
    this.batchId = batchId;
  }

  public String getBusinessDate() {
    return businessDate;
  }

  public void setBusinessDate(String businessDate) {
    this.businessDate = businessDate;
  }

  public String getSourceType() {
    return sourceType;
  }

  public void setSourceType(String sourceType) {
    this.sourceType = sourceType;
  }

  public String getStatus() {
    return status;
  }

  public void setStatus(String status) {
    this.status = status;
  }

  public String getScheduleRuleId() {
    return scheduleRuleId;
  }

  public void setScheduleRuleId(String scheduleRuleId) {
    this.scheduleRuleId = scheduleRuleId;
  }

  public String getFrequency() {
    return frequency;
  }

  public void setFrequency(String frequency) {
    this.frequency = frequency;
  }

  public Object getScheduledAt() {
    return scheduledAt;
  }

  public void setScheduledAt(Object scheduledAt) {
    this.scheduledAt = scheduledAt;
  }

  public String getIndicatorGroupId() {
    return indicatorGroupId;
  }

  public void setIndicatorGroupId(String indicatorGroupId) {
    this.indicatorGroupId = indicatorGroupId;
  }

  public String getBackfillRequestId() {
    return backfillRequestId;
  }

  public void setBackfillRequestId(String backfillRequestId) {
    this.backfillRequestId = backfillRequestId;
  }

  public Integer getPlanVersion() {
    return planVersion;
  }

  public void setPlanVersion(Integer planVersion) {
    this.planVersion = planVersion;
  }

  public String getGroupKind() {
    return groupKind;
  }

  public void setGroupKind(String groupKind) {
    this.groupKind = groupKind;
  }

  public String getPartitionType() {
    return partitionType;
  }

  public void setPartitionType(String partitionType) {
    this.partitionType = partitionType;
  }

  public String getPartitionKey() {
    return partitionKey;
  }

  public void setPartitionKey(String partitionKey) {
    this.partitionKey = partitionKey;
  }

  public String getPartitionLabel() {
    return partitionLabel;
  }

  public void setPartitionLabel(String partitionLabel) {
    this.partitionLabel = partitionLabel;
  }

  public Integer getTotalTasks() {
    return totalTasks;
  }

  public void setTotalTasks(Integer totalTasks) {
    this.totalTasks = totalTasks;
  }

  public Integer getPendingTasks() {
    return pendingTasks;
  }

  public void setPendingTasks(Integer pendingTasks) {
    this.pendingTasks = pendingTasks;
  }

  public Integer getRunningTasks() {
    return runningTasks;
  }

  public void setRunningTasks(Integer runningTasks) {
    this.runningTasks = runningTasks;
  }

  public Integer getCompletedTasks() {
    return completedTasks;
  }

  public void setCompletedTasks(Integer completedTasks) {
    this.completedTasks = completedTasks;
  }

  public Integer getFailedTasks() {
    return failedTasks;
  }

  public void setFailedTasks(Integer failedTasks) {
    this.failedTasks = failedTasks;
  }

  public Integer getCancelledTasks() {
    return cancelledTasks;
  }

  public void setCancelledTasks(Integer cancelledTasks) {
    this.cancelledTasks = cancelledTasks;
  }

  public Integer getInvalidatedTasks() {
    return invalidatedTasks;
  }

  public void setInvalidatedTasks(Integer invalidatedTasks) {
    this.invalidatedTasks = invalidatedTasks;
  }

  public String getTriggeredBy() {
    return triggeredBy;
  }

  public void setTriggeredBy(String triggeredBy) {
    this.triggeredBy = triggeredBy;
  }

  public Object getLastAggregatedAt() {
    return lastAggregatedAt;
  }

  public void setLastAggregatedAt(Object lastAggregatedAt) {
    this.lastAggregatedAt = lastAggregatedAt;
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
