package com.huatai.datafoundry.backend.requirement.application.command;

public class RequirementUpdateCommand {
  private String title;
  private String status;
  private String owner;
  private String ownerAccount;
  private String assignee;
  private String assigneeAccount;
  private String acceptanceOwner;
  private String acceptanceOwnerAccount;
  private String businessGoal;
  private String backgroundKnowledge;
  private String deliveryScope;
  private Boolean dataUpdateEnabled;
  private String dataUpdateMode;
  private Object processingRuleDrafts;
  private Object collectionPolicy;

  public boolean hasDefinitionEdits() {
    return title != null
        || owner != null
        || ownerAccount != null
        || assignee != null
        || assigneeAccount != null
        || acceptanceOwner != null
        || acceptanceOwnerAccount != null
        || businessGoal != null
        || backgroundKnowledge != null
        || deliveryScope != null
        || dataUpdateEnabled != null
        || dataUpdateMode != null
        || processingRuleDrafts != null
        || collectionPolicy != null;
  }

  public String getTitle() {
    return title;
  }

  public void setTitle(String title) {
    this.title = title;
  }

  public String getStatus() {
    return status;
  }

  public void setStatus(String status) {
    this.status = status;
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

  public Object getProcessingRuleDrafts() {
    return processingRuleDrafts;
  }

  public void setProcessingRuleDrafts(Object processingRuleDrafts) {
    this.processingRuleDrafts = processingRuleDrafts;
  }

  public Object getCollectionPolicy() {
    return collectionPolicy;
  }

  public void setCollectionPolicy(Object collectionPolicy) {
    this.collectionPolicy = collectionPolicy;
  }
}
