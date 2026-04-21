package com.huatai.datafoundry.backend.task.domain.model;

public class WideTablePlanSource {
  private String id;
  private String requirementId;
  private Integer schemaVersion;
  private String schemaJson;
  private String scopeJson;
  private String indicatorGroupsJson;
  private String scheduleRulesJson;
  private String semanticTimeAxis;
  private String collectionCoverageMode;

  public String getId() {
    return id;
  }

  public void setId(String id) {
    this.id = id;
  }

  public String getRequirementId() {
    return requirementId;
  }

  public void setRequirementId(String requirementId) {
    this.requirementId = requirementId;
  }

  public Integer getSchemaVersion() {
    return schemaVersion;
  }

  public void setSchemaVersion(Integer schemaVersion) {
    this.schemaVersion = schemaVersion;
  }

  public String getSchemaJson() {
    return schemaJson;
  }

  public void setSchemaJson(String schemaJson) {
    this.schemaJson = schemaJson;
  }

  public String getScopeJson() {
    return scopeJson;
  }

  public void setScopeJson(String scopeJson) {
    this.scopeJson = scopeJson;
  }

  public String getIndicatorGroupsJson() {
    return indicatorGroupsJson;
  }

  public void setIndicatorGroupsJson(String indicatorGroupsJson) {
    this.indicatorGroupsJson = indicatorGroupsJson;
  }

  public String getScheduleRulesJson() {
    return scheduleRulesJson;
  }

  public void setScheduleRulesJson(String scheduleRulesJson) {
    this.scheduleRulesJson = scheduleRulesJson;
  }

  public String getSemanticTimeAxis() {
    return semanticTimeAxis;
  }

  public void setSemanticTimeAxis(String semanticTimeAxis) {
    this.semanticTimeAxis = semanticTimeAxis;
  }

  public String getCollectionCoverageMode() {
    return collectionCoverageMode;
  }

  public void setCollectionCoverageMode(String collectionCoverageMode) {
    this.collectionCoverageMode = collectionCoverageMode;
  }
}

