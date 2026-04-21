package com.huatai.datafoundry.backend.requirement.application.command;

import java.util.Map;

public class RequirementCreateCommand {
  private String title;
  private String phase;
  private String owner;
  private String assignee;
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

