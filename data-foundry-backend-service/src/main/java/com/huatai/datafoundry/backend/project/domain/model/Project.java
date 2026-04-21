package com.huatai.datafoundry.backend.project.domain.model;

import java.time.LocalDateTime;

public class Project {
  private String id;
  private String name;
  private String businessBackground;
  private String description;
  private String status;
  private String ownerTeam;
  private String dataSourceJson;
  private LocalDateTime createdAt;
  private LocalDateTime updatedAt;

  public String getId() {
    return id;
  }

  public void setId(String id) {
    this.id = id;
  }

  public String getName() {
    return name;
  }

  public void setName(String name) {
    this.name = name;
  }

  public String getBusinessBackground() {
    return businessBackground;
  }

  public void setBusinessBackground(String businessBackground) {
    this.businessBackground = businessBackground;
  }

  public String getDescription() {
    return description;
  }

  public void setDescription(String description) {
    this.description = description;
  }

  public String getStatus() {
    return status;
  }

  public void setStatus(String status) {
    this.status = status;
  }

  public String getOwnerTeam() {
    return ownerTeam;
  }

  public void setOwnerTeam(String ownerTeam) {
    this.ownerTeam = ownerTeam;
  }

  public String getDataSourceJson() {
    return dataSourceJson;
  }

  public void setDataSourceJson(String dataSourceJson) {
    this.dataSourceJson = dataSourceJson;
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

