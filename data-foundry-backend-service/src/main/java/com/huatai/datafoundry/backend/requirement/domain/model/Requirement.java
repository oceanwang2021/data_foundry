package com.huatai.datafoundry.backend.requirement.domain.model;

import java.time.LocalDateTime;

public class Requirement {
  private String id;
  private String projectId;
  private String title;
  private String phase;
  private String status;
  private Boolean schemaLocked;
  private String owner;
  private String assignee;
  private String businessGoal;
  private String backgroundKnowledge;
  private String businessBoundary;
  private String deliveryScope;
  private String processingRuleDraftsJson;
  private String collectionPolicyJson;
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

  public String getOwner() {
    return owner;
  }

  public void setOwner(String owner) {
    this.owner = owner;
  }

  public String getAssignee() {
    return assignee;
  }

  public void setAssignee(String assignee) {
    this.assignee = assignee;
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

  public String getProcessingRuleDraftsJson() {
    return processingRuleDraftsJson;
  }

  public void setProcessingRuleDraftsJson(String processingRuleDraftsJson) {
    this.processingRuleDraftsJson = processingRuleDraftsJson;
  }

  public String getCollectionPolicyJson() {
    return collectionPolicyJson;
  }

  public void setCollectionPolicyJson(String collectionPolicyJson) {
    this.collectionPolicyJson = collectionPolicyJson;
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

