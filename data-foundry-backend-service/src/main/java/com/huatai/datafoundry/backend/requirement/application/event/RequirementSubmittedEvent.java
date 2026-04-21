package com.huatai.datafoundry.backend.requirement.application.event;

public class RequirementSubmittedEvent {
  private final String requirementId;

  public RequirementSubmittedEvent(String requirementId) {
    this.requirementId = requirementId;
  }

  public String getRequirementId() {
    return requirementId;
  }
}

