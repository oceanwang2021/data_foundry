package com.huatai.datafoundry.backend.requirement.application.command;

import java.util.Map;

public class WideTableUpdateCommand {
  private String title;
  private String description;
  private Object schema;
  private Object scope;
  private Object indicatorGroups;
  private Object scheduleRules;
  private String semanticTimeAxis;
  private String collectionCoverageMode;

  public String getTitle() {
    return title;
  }

  public void setTitle(String title) {
    this.title = title;
  }

  public String getDescription() {
    return description;
  }

  public void setDescription(String description) {
    this.description = description;
  }

  public Object getSchema() {
    return schema;
  }

  public void setSchema(Object schema) {
    this.schema = schema;
  }

  public Object getScope() {
    return scope;
  }

  public void setScope(Object scope) {
    this.scope = scope;
  }

  public Object getIndicatorGroups() {
    return indicatorGroups;
  }

  public void setIndicatorGroups(Object indicatorGroups) {
    this.indicatorGroups = indicatorGroups;
  }

  public Object getScheduleRules() {
    return scheduleRules;
  }

  public void setScheduleRules(Object scheduleRules) {
    this.scheduleRules = scheduleRules;
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

  public Integer inferSchemaVersion() {
    if (!(schema instanceof Map)) {
      return null;
    }
    Object version = ((Map<?, ?>) schema).get("version");
    if (version instanceof Number) {
      return ((Number) version).intValue();
    }
    return null;
  }
}

