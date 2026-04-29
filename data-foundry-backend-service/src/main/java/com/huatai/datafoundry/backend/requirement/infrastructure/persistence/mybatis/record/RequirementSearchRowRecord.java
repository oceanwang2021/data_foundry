package com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.record;

import java.time.LocalDateTime;

public class RequirementSearchRowRecord {
  private String requirementId;
  private String projectId;
  private String projectName;
  private String title;
  private String phase;
  private String status;
  private Boolean schemaLocked;
  private String owner;
  private String assignee;
  private LocalDateTime createdAt;
  private LocalDateTime updatedAt;

  private String wideTableId;
  private String wideTableTableName;
  private Integer wideTableRecordCount;
  private Integer wideTableColumnCount;

  public String getRequirementId() {
    return requirementId;
  }

  public void setRequirementId(String requirementId) {
    this.requirementId = requirementId;
  }

  public String getProjectId() {
    return projectId;
  }

  public void setProjectId(String projectId) {
    this.projectId = projectId;
  }

  public String getProjectName() {
    return projectName;
  }

  public void setProjectName(String projectName) {
    this.projectName = projectName;
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

  public String getWideTableId() {
    return wideTableId;
  }

  public void setWideTableId(String wideTableId) {
    this.wideTableId = wideTableId;
  }

  public String getWideTableTableName() {
    return wideTableTableName;
  }

  public void setWideTableTableName(String wideTableTableName) {
    this.wideTableTableName = wideTableTableName;
  }

  public Integer getWideTableRecordCount() {
    return wideTableRecordCount;
  }

  public void setWideTableRecordCount(Integer wideTableRecordCount) {
    this.wideTableRecordCount = wideTableRecordCount;
  }

  public Integer getWideTableColumnCount() {
    return wideTableColumnCount;
  }

  public void setWideTableColumnCount(Integer wideTableColumnCount) {
    this.wideTableColumnCount = wideTableColumnCount;
  }
}

