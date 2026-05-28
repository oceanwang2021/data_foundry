package com.huatai.datafoundry.backend.account.application.query.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.huatai.datafoundry.backend.project.application.query.dto.ProjectReadDto;
import com.huatai.datafoundry.backend.requirement.application.query.dto.RequirementReadDto;
import com.huatai.datafoundry.backend.requirement.application.query.dto.TaskGroupReadDto;
import java.util.List;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class PersonalCenterOverviewDto {
  private List<ProjectReadDto> projects;
  private List<RequirementReadDto> requirements;
  private List<TaskItemDto> collectionTasks;
  private List<AcceptanceTaskItemDto> acceptanceTasks;

  public List<ProjectReadDto> getProjects() {
    return projects;
  }

  public void setProjects(List<ProjectReadDto> projects) {
    this.projects = projects;
  }

  public List<RequirementReadDto> getRequirements() {
    return requirements;
  }

  public void setRequirements(List<RequirementReadDto> requirements) {
    this.requirements = requirements;
  }

  public List<TaskItemDto> getCollectionTasks() {
    return collectionTasks;
  }

  public void setCollectionTasks(List<TaskItemDto> collectionTasks) {
    this.collectionTasks = collectionTasks;
  }

  public List<AcceptanceTaskItemDto> getAcceptanceTasks() {
    return acceptanceTasks;
  }

  public void setAcceptanceTasks(List<AcceptanceTaskItemDto> acceptanceTasks) {
    this.acceptanceTasks = acceptanceTasks;
  }

  @JsonInclude(JsonInclude.Include.NON_NULL)
  public static class TaskItemDto {
    private ProjectReadDto project;
    private RequirementReadDto requirement;
    private TaskGroupReadDto taskGroup;

    public ProjectReadDto getProject() {
      return project;
    }

    public void setProject(ProjectReadDto project) {
      this.project = project;
    }

    public RequirementReadDto getRequirement() {
      return requirement;
    }

    public void setRequirement(RequirementReadDto requirement) {
      this.requirement = requirement;
    }

    public TaskGroupReadDto getTaskGroup() {
      return taskGroup;
    }

    public void setTaskGroup(TaskGroupReadDto taskGroup) {
      this.taskGroup = taskGroup;
    }
  }

  @JsonInclude(JsonInclude.Include.NON_NULL)
  public static class AcceptanceTaskItemDto extends TaskItemDto {
    private AcceptanceTicketSummaryDto ticket;
    private String reviewStatus;

    public AcceptanceTicketSummaryDto getTicket() {
      return ticket;
    }

    public void setTicket(AcceptanceTicketSummaryDto ticket) {
      this.ticket = ticket;
    }

    public String getReviewStatus() {
      return reviewStatus;
    }

    public void setReviewStatus(String reviewStatus) {
      this.reviewStatus = reviewStatus;
    }
  }

  @JsonInclude(JsonInclude.Include.NON_NULL)
  public static class AcceptanceTicketSummaryDto {
    private String id;
    private String requirementId;
    private String taskGroupId;
    private String status;
    private String owner;
    private String ownerAccount;
    private String reviewer;
    private String reviewerAccount;
    private Object latestActionAt;

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

    public String getTaskGroupId() {
      return taskGroupId;
    }

    public void setTaskGroupId(String taskGroupId) {
      this.taskGroupId = taskGroupId;
    }

    public String getStatus() {
      return status;
    }

    public void setStatus(String status) {
      this.status = status;
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

    public String getReviewer() {
      return reviewer;
    }

    public void setReviewer(String reviewer) {
      this.reviewer = reviewer;
    }

    public String getReviewerAccount() {
      return reviewerAccount;
    }

    public void setReviewerAccount(String reviewerAccount) {
      this.reviewerAccount = reviewerAccount;
    }

    public Object getLatestActionAt() {
      return latestActionAt;
    }

    public void setLatestActionAt(Object latestActionAt) {
      this.latestActionAt = latestActionAt;
    }
  }
}
