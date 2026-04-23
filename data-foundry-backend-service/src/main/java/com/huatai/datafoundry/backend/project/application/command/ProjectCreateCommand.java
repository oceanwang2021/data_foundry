package com.huatai.datafoundry.backend.project.application.command;

public class ProjectCreateCommand {
  private String name;
  private String description;
  private String ownerTeam;
  private String businessBackground;
  private String createdBy;

  public String getName() {
    return name;
  }

  public void setName(String name) {
    this.name = name;
  }

  public String getDescription() {
    return description;
  }

  public void setDescription(String description) {
    this.description = description;
  }

  public String getOwnerTeam() {
    return ownerTeam;
  }

  public void setOwnerTeam(String ownerTeam) {
    this.ownerTeam = ownerTeam;
  }

  public String getBusinessBackground() {
    return businessBackground;
  }

  public void setBusinessBackground(String businessBackground) {
    this.businessBackground = businessBackground;
  }

  public String getCreatedBy() {
    return createdBy;
  }

  public void setCreatedBy(String createdBy) {
    this.createdBy = createdBy;
  }
}

