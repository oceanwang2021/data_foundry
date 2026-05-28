package com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.record;

import java.time.LocalDateTime;

public class RequirementRecord {
  private String id;
  private String projectId;
  private String title;
  private String phase;
  private String status;
  private Boolean schemaLocked;
  private String createdBy;
  private String createdByAccount;
  private String owner;
  private String ownerAccount;
  private String assignee;
  private String assigneeAccount;
  private String acceptanceOwner;
  private String acceptanceOwnerAccount;
  private String businessGoal;
  private String backgroundKnowledge;
  private String businessBoundary;
  private String deliveryScope;
  /** Stored as JSON in DB. Kept as a string here; parsed in controller for API responses. */
  private String processingRuleDrafts;
  /** Stored as JSON in DB. Kept as a string here; parsed in controller for API responses. */
  private String collectionPolicy;
  private Boolean dataUpdateEnabled;
  private String dataUpdateMode;
  private LocalDateTime createdAt;
  private LocalDateTime updatedAt;

  public String getId() {
    return id;
  }

  public void setId(String id) {
    this.id = id;
  }

  public String getProjectId() {
    return projectId;
  }

  public void setProjectId(String projectId) {
    this.projectId = projectId;
  }

  public String getTitle() {
    return title;
  }

  public void setTitle(String title) {
    this.title = title;
  }

  public String getPhase() {
    return phase;
  }

  public void setPhase(String phase) {
    this.phase = phase;
  }

  public String getStatus() {
    return status;
  }

  public void setStatus(String status) {
    this.status = status;
  }

  public Boolean getSchemaLocked() {
    return schemaLocked;
  }

  public void setSchemaLocked(Boolean schemaLocked) {
    this.schemaLocked = schemaLocked;
  }

  public String getCreatedBy() {
    return createdBy;
  }

  public void setCreatedBy(String createdBy) {
    this.createdBy = createdBy;
  }

  public String getCreatedByAccount() {
    return createdByAccount;
  }

  public void setCreatedByAccount(String createdByAccount) {
    this.createdByAccount = createdByAccount;
  }

  public String getOwner() {
    return owner;
  }

  public void setOwner(String owner) {
    this.owner = owner;
  }

  public String getOwnerAccount() {
    return ownerAccount;
  }

  public void setOwnerAccount(String ownerAccount) {
    this.ownerAccount = ownerAccount;
  }

  public String getAssignee() {
    return assignee;
  }

  public void setAssignee(String assignee) {
    this.assignee = assignee;
  }

  public String getAssigneeAccount() {
    return assigneeAccount;
  }

  public void setAssigneeAccount(String assigneeAccount) {
    this.assigneeAccount = assigneeAccount;
  }

  public String getAcceptanceOwner() {
    return acceptanceOwner;
  }

  public void setAcceptanceOwner(String acceptanceOwner) {
    this.acceptanceOwner = acceptanceOwner;
  }

  public String getAcceptanceOwnerAccount() {
    return acceptanceOwnerAccount;
  }

  public void setAcceptanceOwnerAccount(String acceptanceOwnerAccount) {
    this.acceptanceOwnerAccount = acceptanceOwnerAccount;
  }

  public String getBusinessGoal() {
    return businessGoal;
  }

  public void setBusinessGoal(String businessGoal) {
    this.businessGoal = businessGoal;
  }

  public String getBackgroundKnowledge() {
    return backgroundKnowledge;
  }

  public void setBackgroundKnowledge(String backgroundKnowledge) {
    this.backgroundKnowledge = backgroundKnowledge;
  }

  public String getBusinessBoundary() {
    return businessBoundary;
  }

  public void setBusinessBoundary(String businessBoundary) {
    this.businessBoundary = businessBoundary;
  }

  public String getDeliveryScope() {
    return deliveryScope;
  }

  public void setDeliveryScope(String deliveryScope) {
    this.deliveryScope = deliveryScope;
  }

  public String getProcessingRuleDrafts() {
    return processingRuleDrafts;
  }

  public void setProcessingRuleDrafts(String processingRuleDrafts) {
    this.processingRuleDrafts = processingRuleDrafts;
  }

  public String getCollectionPolicy() {
    return collectionPolicy;
  }

  public void setCollectionPolicy(String collectionPolicy) {
    this.collectionPolicy = collectionPolicy;
  }

  public Boolean getDataUpdateEnabled() {
    return dataUpdateEnabled;
  }

  public void setDataUpdateEnabled(Boolean dataUpdateEnabled) {
    this.dataUpdateEnabled = dataUpdateEnabled;
  }

  public String getDataUpdateMode() {
    return dataUpdateMode;
  }

  public void setDataUpdateMode(String dataUpdateMode) {
    this.dataUpdateMode = dataUpdateMode;
  }

  public LocalDateTime getCreatedAt() {
    return createdAt;
  }

  public void setCreatedAt(LocalDateTime createdAt) {
    this.createdAt = createdAt;
  }

  public LocalDateTime getUpdatedAt() {
    return updatedAt;
  }

  public void setUpdatedAt(LocalDateTime updatedAt) {
    this.updatedAt = updatedAt;
  }
}
