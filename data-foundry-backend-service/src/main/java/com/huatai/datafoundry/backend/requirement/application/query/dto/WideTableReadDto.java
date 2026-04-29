package com.huatai.datafoundry.backend.requirement.application.query.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class WideTableReadDto {
  private String id;
  private String title;
  private String description;
  private String tableName;
  private Object schema;
  private Object scope;
  private WideTableScopeImportReadDto scopeImport;
  private Object indicatorGroups;
  private Object scheduleRules;
  private String semanticTimeAxis;
  private String collectionCoverageMode;
  private Integer schemaVersion;
  private Integer recordCount;
  private String status;
  private Object createdAt;
  private Object updatedAt;

  public String getId() {
    return id;
  }

  public void setId(String id) {
    this.id = id;
  }

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

  public String getTableName() {
    return tableName;
  }

  public void setTableName(String tableName) {
    this.tableName = tableName;
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

  public WideTableScopeImportReadDto getScopeImport() {
    return scopeImport;
  }

  public void setScopeImport(WideTableScopeImportReadDto scopeImport) {
    this.scopeImport = scopeImport;
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

  public Integer getSchemaVersion() {
    return schemaVersion;
  }

  public void setSchemaVersion(Integer schemaVersion) {
    this.schemaVersion = schemaVersion;
  }

  public Integer getRecordCount() {
    return recordCount;
  }

  public void setRecordCount(Integer recordCount) {
    this.recordCount = recordCount;
  }

  public String getStatus() {
    return status;
  }

  public void setStatus(String status) {
    this.status = status;
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
}
