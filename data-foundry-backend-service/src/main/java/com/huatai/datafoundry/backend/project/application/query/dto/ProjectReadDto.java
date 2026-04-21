package com.huatai.datafoundry.backend.project.application.query.dto;

import java.util.Map;

public class ProjectReadDto {
  private String id;
  private String name;
  private String businessBackground;
  private String description;
  private String status;
  private String ownerTeam;
  private Map<String, Object> dataSource;
  private Object createdAt;
  private Object updatedAt;

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

  public Map<String, Object> getDataSource() {
    return dataSource;
  }

  public void setDataSource(Map<String, Object> dataSource) {
    this.dataSource = dataSource;
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
