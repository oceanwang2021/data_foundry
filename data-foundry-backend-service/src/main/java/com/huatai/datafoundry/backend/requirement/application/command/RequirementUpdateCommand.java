package com.huatai.datafoundry.backend.requirement.application.command;

public class RequirementUpdateCommand {
  private String title;
  private String status;
  private String owner;
  private String assignee;
  private String businessGoal;
  private String backgroundKnowledge;
  private String deliveryScope;
  private Boolean dataUpdateEnabled;
  private String dataUpdateMode;
  private Object processingRuleDrafts;

  public boolean hasDefinitionEdits() {
    return title != null
        || owner != null
        || assignee != null
        || businessGoal != null
        || backgroundKnowledge != null
        || deliveryScope != null
        || dataUpdateEnabled != null
        || dataUpdateMode != null
        || processingRuleDrafts != null;
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
}

