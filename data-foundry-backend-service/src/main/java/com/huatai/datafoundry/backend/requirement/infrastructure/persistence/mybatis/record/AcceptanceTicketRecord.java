package com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.record;

import java.time.LocalDateTime;

public class AcceptanceTicketRecord {
  private String id;
  private String requirementId;
  private String wideTableId;
  private String taskGroupId;
  private String scopeType;
  private String scopeKey;
  private String dataset;
  private String owner;
  private String ownerAccount;
  private String reviewer;
  private String reviewerAccount;
  private String status;
  private String feedback;
  private String rowIdsJson;
  private String publishJobId;
  private String publishErrorMsg;
  private LocalDateTime approvedAt;
  private LocalDateTime publishedAt;
  private LocalDateTime latestActionAt;
  private LocalDateTime createdAt;
  private LocalDateTime updatedAt;

  public String getId() { return id; }
  public void setId(String id) { this.id = id; }
  public String getRequirementId() { return requirementId; }
  public void setRequirementId(String requirementId) { this.requirementId = requirementId; }
  public String getWideTableId() { return wideTableId; }
  public void setWideTableId(String wideTableId) { this.wideTableId = wideTableId; }
  public String getTaskGroupId() { return taskGroupId; }
  public void setTaskGroupId(String taskGroupId) { this.taskGroupId = taskGroupId; }
  public String getScopeType() { return scopeType; }
  public void setScopeType(String scopeType) { this.scopeType = scopeType; }
  public String getScopeKey() { return scopeKey; }
  public void setScopeKey(String scopeKey) { this.scopeKey = scopeKey; }
  public String getDataset() { return dataset; }
  public void setDataset(String dataset) { this.dataset = dataset; }
  public String getOwner() { return owner; }
  public void setOwner(String owner) { this.owner = owner; }
  public String getOwnerAccount() { return ownerAccount; }
  public void setOwnerAccount(String ownerAccount) { this.ownerAccount = ownerAccount; }
  public String getReviewer() { return reviewer; }
  public void setReviewer(String reviewer) { this.reviewer = reviewer; }
  public String getReviewerAccount() { return reviewerAccount; }
  public void setReviewerAccount(String reviewerAccount) { this.reviewerAccount = reviewerAccount; }
  public String getStatus() { return status; }
  public void setStatus(String status) { this.status = status; }
  public String getFeedback() { return feedback; }
  public void setFeedback(String feedback) { this.feedback = feedback; }
  public String getRowIdsJson() { return rowIdsJson; }
  public void setRowIdsJson(String rowIdsJson) { this.rowIdsJson = rowIdsJson; }
  public String getPublishJobId() { return publishJobId; }
  public void setPublishJobId(String publishJobId) { this.publishJobId = publishJobId; }
  public String getPublishErrorMsg() { return publishErrorMsg; }
  public void setPublishErrorMsg(String publishErrorMsg) { this.publishErrorMsg = publishErrorMsg; }
  public LocalDateTime getApprovedAt() { return approvedAt; }
  public void setApprovedAt(LocalDateTime approvedAt) { this.approvedAt = approvedAt; }
  public LocalDateTime getPublishedAt() { return publishedAt; }
  public void setPublishedAt(LocalDateTime publishedAt) { this.publishedAt = publishedAt; }
  public LocalDateTime getLatestActionAt() { return latestActionAt; }
  public void setLatestActionAt(LocalDateTime latestActionAt) { this.latestActionAt = latestActionAt; }
  public LocalDateTime getCreatedAt() { return createdAt; }
  public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
  public LocalDateTime getUpdatedAt() { return updatedAt; }
  public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
