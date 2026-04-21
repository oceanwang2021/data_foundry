package com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.record;

import java.time.LocalDateTime;

public class WideTableRecord {
  private String id;
  private Integer sortOrder;
  private String requirementId;
  private String title;
  private String description;
  private String tableName;
  private Integer schemaVersion;
  /** Stored as JSON in DB. */
  private String schemaJson;
  /** Stored as JSON in DB. */
  private String scopeJson;
  /** Stored as JSON in DB. */
  private String indicatorGroupsJson;
  /** Stored as JSON in DB. */
  private String scheduleRulesJson;
  private String semanticTimeAxis;
  private String collectionCoverageMode;
  private String status;
  private Integer recordCount;
  private LocalDateTime createdAt;
  private LocalDateTime updatedAt;

  public String getId() {
    return id;
  }

  public void setId(String id) {
    this.id = id;
  }

  public Integer getSortOrder() {
    return sortOrder;
  }

  public void setSortOrder(Integer sortOrder) {
    this.sortOrder = sortOrder;
  }

  public String getRequirementId() {
    return requirementId;
  }

  public void setRequirementId(String requirementId) {
    this.requirementId = requirementId;
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

  public String getStatus() {
    return status;
  }

  public void setStatus(String status) {
    this.status = status;
  }

  public Integer getRecordCount() {
    return recordCount;
  }

  public void setRecordCount(Integer recordCount) {
    this.recordCount = recordCount;
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
