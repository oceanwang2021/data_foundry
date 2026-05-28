package com.huatai.datafoundry.backend.requirement.application.command;

import java.util.Map;

public class RequirementCreateCommand {
  private String title;
  private String phase;
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
  private String deliveryScope;
  private Map<String, Object> collectionPolicy;
  private Boolean dataUpdateEnabled;
  private String dataUpdateMode;
  private WideTableCreateCommand wideTable;

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

  public WideTableCreateCommand getWideTable() {
    return wideTable;
  }

  public void setWideTable(WideTableCreateCommand wideTable) {
    this.wideTable = wideTable;
  }
}
