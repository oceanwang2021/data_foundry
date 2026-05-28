package com.huatai.datafoundry.backend.requirement.application.query.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.Map;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class RequirementReadDto {
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
  private Map<String, Object> collectionPolicy;
  private Boolean dataUpdateEnabled;
  private String dataUpdateMode;
  private Object createdAt;
  private Object updatedAt;
  private WideTableReadDto wideTable;

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

  public Map<String, Object> getCollectionPolicy() {
    return collectionPolicy;
  }

  public void setCollectionPolicy(Map<String, Object> collectionPolicy) {
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

  public WideTableReadDto getWideTable() {
    return wideTable;
  }

  public void setWideTable(WideTableReadDto wideTable) {
    this.wideTable = wideTable;
  }
}
