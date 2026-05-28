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
  private String createdBy;
  private String createdByAccount;
  private String owner;
  private String ownerAccount;
  private String assignee;
  private String assigneeAccount;
  private String acceptanceOwner;
  private String acceptanceOwnerAccount;
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
