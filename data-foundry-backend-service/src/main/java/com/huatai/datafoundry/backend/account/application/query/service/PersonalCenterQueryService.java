package com.huatai.datafoundry.backend.account.application.query.service;

import com.huatai.datafoundry.backend.account.application.query.dto.PersonalCenterOverviewDto;
import com.huatai.datafoundry.backend.project.application.query.dto.ProjectReadDto;
import com.huatai.datafoundry.backend.project.application.query.service.ProjectQueryService;
import com.huatai.datafoundry.backend.requirement.application.query.dto.RequirementReadDto;
import com.huatai.datafoundry.backend.requirement.application.query.dto.TaskGroupReadDto;
import com.huatai.datafoundry.backend.requirement.application.query.service.RequirementQueryService;
import com.huatai.datafoundry.backend.requirement.application.service.AcceptanceTicketAppService;
import com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.mapper.RequirementSearchMapper;
import com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.record.AcceptanceTicketRecord;
import com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.record.RequirementSearchRowRecord;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

@Service
public class PersonalCenterQueryService {
  private final ProjectQueryService projectQueryService;
  private final RequirementQueryService requirementQueryService;
  private final RequirementSearchMapper requirementSearchMapper;
  private final AcceptanceTicketAppService acceptanceTicketAppService;

  public PersonalCenterQueryService(
      ProjectQueryService projectQueryService,
      RequirementQueryService requirementQueryService,
      RequirementSearchMapper requirementSearchMapper,
      AcceptanceTicketAppService acceptanceTicketAppService) {
    this.projectQueryService = projectQueryService;
    this.requirementQueryService = requirementQueryService;
    this.requirementSearchMapper = requirementSearchMapper;
    this.acceptanceTicketAppService = acceptanceTicketAppService;
  }

  public PersonalCenterOverviewDto getOverview(String account) {
    String normalizedAccount = account != null ? account.trim() : "";
    PersonalCenterOverviewDto dto = new PersonalCenterOverviewDto();
    if (normalizedAccount.isEmpty()) {
      dto.setProjects(Collections.<ProjectReadDto>emptyList());
      dto.setRequirements(Collections.<RequirementReadDto>emptyList());
      dto.setCollectionTasks(Collections.<PersonalCenterOverviewDto.TaskItemDto>emptyList());
      dto.setAcceptanceTasks(Collections.<PersonalCenterOverviewDto.AcceptanceTaskItemDto>emptyList());
      return dto;
    }

    List<ProjectReadDto> allProjects = projectQueryService.list();
    Map<String, ProjectReadDto> projectById = new LinkedHashMap<String, ProjectReadDto>();
    List<ProjectReadDto> ownedProjects = new ArrayList<ProjectReadDto>();
    for (ProjectReadDto project : allProjects) {
      if (project == null || project.getId() == null) {
        continue;
      }
      projectById.put(project.getId(), project);
      if (normalizedAccount.equals(project.getCreatedByAccount())) {
        ownedProjects.add(project);
      }
    }

    List<RequirementSearchRowRecord> createdRows =
        requirementSearchMapper.listByCreatedByAccount(normalizedAccount);
    List<RequirementSearchRowRecord> assigneeRows =
        requirementSearchMapper.listByAssigneeAccount(normalizedAccount);
    List<RequirementSearchRowRecord> acceptanceRows =
        requirementSearchMapper.listByAcceptanceOwnerAccount(normalizedAccount);

    dto.setProjects(sortProjects(ownedProjects));
    dto.setRequirements(mapRequirements(createdRows));
    dto.setCollectionTasks(buildCollectionTasks(assigneeRows, projectById));
    dto.setAcceptanceTasks(buildAcceptanceTasks(acceptanceRows, projectById));
    return dto;
  }

  private List<ProjectReadDto> sortProjects(List<ProjectReadDto> rows) {
    List<ProjectReadDto> out = new ArrayList<ProjectReadDto>(rows);
    Collections.sort(out, new Comparator<ProjectReadDto>() {
      @Override
      public int compare(ProjectReadDto left, ProjectReadDto right) {
        return compareDateValues(right != null ? right.getCreatedAt() : null, left != null ? left.getCreatedAt() : null);
      }
    });
    return out;
  }

  private List<RequirementReadDto> mapRequirements(List<RequirementSearchRowRecord> rows) {
    List<RequirementReadDto> out = new ArrayList<RequirementReadDto>();
    if (rows == null) {
      return out;
    }
    for (RequirementSearchRowRecord row : rows) {
      if (row == null) {
        continue;
      }
      out.add(mapRequirement(row));
    }
    return out;
  }

  private List<PersonalCenterOverviewDto.TaskItemDto> buildCollectionTasks(
      List<RequirementSearchRowRecord> rows,
      Map<String, ProjectReadDto> projectById) {
    List<PersonalCenterOverviewDto.TaskItemDto> out =
        new ArrayList<PersonalCenterOverviewDto.TaskItemDto>();
    if (rows == null) {
      return out;
    }
    for (RequirementSearchRowRecord row : dedupeRequirements(rows)) {
      RequirementReadDto requirement = mapRequirement(row);
      ProjectReadDto project = resolveProject(projectById, requirement);
      List<TaskGroupReadDto> taskGroups =
          requirementQueryService.listTaskGroups(requirement.getProjectId(), requirement.getId());
      for (TaskGroupReadDto taskGroup : taskGroups) {
        PersonalCenterOverviewDto.TaskItemDto item = new PersonalCenterOverviewDto.TaskItemDto();
        item.setProject(project);
        item.setRequirement(requirement);
        item.setTaskGroup(taskGroup);
        out.add(item);
      }
    }
    Collections.sort(out, new Comparator<PersonalCenterOverviewDto.TaskItemDto>() {
      @Override
      public int compare(
          PersonalCenterOverviewDto.TaskItemDto left,
          PersonalCenterOverviewDto.TaskItemDto right) {
        return compareDateValues(
            right != null && right.getTaskGroup() != null ? right.getTaskGroup().getUpdatedAt() : null,
            left != null && left.getTaskGroup() != null ? left.getTaskGroup().getUpdatedAt() : null);
      }
    });
    return out;
  }

  private List<PersonalCenterOverviewDto.AcceptanceTaskItemDto> buildAcceptanceTasks(
      List<RequirementSearchRowRecord> rows,
      Map<String, ProjectReadDto> projectById) {
    List<PersonalCenterOverviewDto.AcceptanceTaskItemDto> out =
        new ArrayList<PersonalCenterOverviewDto.AcceptanceTaskItemDto>();
    if (rows == null) {
      return out;
    }
    for (RequirementSearchRowRecord row : dedupeRequirements(rows)) {
      RequirementReadDto requirement = mapRequirement(row);
      ProjectReadDto project = resolveProject(projectById, requirement);
      Map<String, AcceptanceTicketRecord> ticketByTaskGroupId =
          indexTicketsByTaskGroupId(acceptanceTicketAppService.list(requirement.getId()));
      List<TaskGroupReadDto> taskGroups =
          requirementQueryService.listTaskGroups(requirement.getProjectId(), requirement.getId());
      for (TaskGroupReadDto taskGroup : taskGroups) {
        PersonalCenterOverviewDto.AcceptanceTaskItemDto item =
            new PersonalCenterOverviewDto.AcceptanceTaskItemDto();
        item.setProject(project);
        item.setRequirement(requirement);
        item.setTaskGroup(taskGroup);
        AcceptanceTicketRecord ticket = ticketByTaskGroupId.get(taskGroup.getId());
        item.setTicket(mapTicket(ticket));
        item.setReviewStatus(normalizeReviewStatus(ticket));
        out.add(item);
      }
    }
    Collections.sort(out, new Comparator<PersonalCenterOverviewDto.AcceptanceTaskItemDto>() {
      @Override
      public int compare(
          PersonalCenterOverviewDto.AcceptanceTaskItemDto left,
          PersonalCenterOverviewDto.AcceptanceTaskItemDto right) {
        Object rightDate =
            right != null && right.getTicket() != null
                ? right.getTicket().getLatestActionAt()
                : right != null && right.getTaskGroup() != null ? right.getTaskGroup().getUpdatedAt() : null;
        Object leftDate =
            left != null && left.getTicket() != null
                ? left.getTicket().getLatestActionAt()
                : left != null && left.getTaskGroup() != null ? left.getTaskGroup().getUpdatedAt() : null;
        return compareDateValues(rightDate, leftDate);
      }
    });
    return out;
  }

  private List<RequirementSearchRowRecord> dedupeRequirements(List<RequirementSearchRowRecord> rows) {
    Map<String, RequirementSearchRowRecord> deduped = new LinkedHashMap<String, RequirementSearchRowRecord>();
    for (RequirementSearchRowRecord row : rows) {
      if (row == null || row.getRequirementId() == null) {
        continue;
      }
      if (!deduped.containsKey(row.getRequirementId())) {
        deduped.put(row.getRequirementId(), row);
      }
    }
    return new ArrayList<RequirementSearchRowRecord>(deduped.values());
  }

  private RequirementReadDto mapRequirement(RequirementSearchRowRecord row) {
    RequirementReadDto dto = new RequirementReadDto();
    dto.setId(row.getRequirementId());
    dto.setProjectId(row.getProjectId());
    dto.setTitle(row.getTitle());
    dto.setPhase(row.getPhase());
    dto.setStatus(row.getStatus());
    dto.setSchemaLocked(row.getSchemaLocked());
    dto.setCreatedBy(row.getCreatedBy());
    dto.setCreatedByAccount(row.getCreatedByAccount());
    dto.setOwner(row.getOwner());
    dto.setOwnerAccount(row.getOwnerAccount());
    dto.setAssignee(row.getAssignee());
    dto.setAssigneeAccount(row.getAssigneeAccount());
    dto.setAcceptanceOwner(row.getAcceptanceOwner());
    dto.setAcceptanceOwnerAccount(row.getAcceptanceOwnerAccount());
    dto.setCreatedAt(row.getCreatedAt());
    dto.setUpdatedAt(row.getUpdatedAt());
    return dto;
  }

  private ProjectReadDto resolveProject(
      Map<String, ProjectReadDto> projectById,
      RequirementReadDto requirement) {
    if (requirement == null) {
      return null;
    }
    ProjectReadDto project =
        projectById != null ? projectById.get(requirement.getProjectId()) : null;
    if (project != null) {
      return project;
    }
    ProjectReadDto fallback = new ProjectReadDto();
    fallback.setId(requirement.getProjectId());
    fallback.setName(requirement.getProjectId());
    fallback.setStatus("active");
    return fallback;
  }

  private Map<String, AcceptanceTicketRecord> indexTicketsByTaskGroupId(
      List<AcceptanceTicketRecord> tickets) {
    Map<String, AcceptanceTicketRecord> out = new LinkedHashMap<String, AcceptanceTicketRecord>();
    if (tickets == null) {
      return out;
    }
    for (AcceptanceTicketRecord ticket : tickets) {
      if (ticket == null || ticket.getTaskGroupId() == null) {
        continue;
      }
      out.put(ticket.getTaskGroupId(), ticket);
    }
    return out;
  }

  private PersonalCenterOverviewDto.AcceptanceTicketSummaryDto mapTicket(AcceptanceTicketRecord ticket) {
    if (ticket == null) {
      return null;
    }
    PersonalCenterOverviewDto.AcceptanceTicketSummaryDto dto =
        new PersonalCenterOverviewDto.AcceptanceTicketSummaryDto();
    dto.setId(ticket.getId());
    dto.setRequirementId(ticket.getRequirementId());
    dto.setTaskGroupId(ticket.getTaskGroupId());
    dto.setStatus(ticket.getStatus());
    dto.setOwner(ticket.getOwner());
    dto.setOwnerAccount(ticket.getOwnerAccount());
    dto.setReviewer(ticket.getReviewer());
    dto.setReviewerAccount(ticket.getReviewerAccount());
    dto.setLatestActionAt(ticket.getLatestActionAt());
    return dto;
  }

  private String normalizeReviewStatus(AcceptanceTicketRecord ticket) {
    if (ticket == null || ticket.getStatus() == null || ticket.getStatus().trim().isEmpty()) {
      return "pending";
    }
    String status = ticket.getStatus().trim().toLowerCase();
    if ("approved".equals(status)) {
      return "approved";
    }
    if ("partial_approved".equals(status)) {
      return "partial_approved";
    }
    if ("rejected".equals(status) || "fixing".equals(status) || "publish_failed".equals(status)) {
      return "rejected";
    }
    return "pending";
  }

  private int compareDateValues(Object left, Object right) {
    String leftValue = toSortableDate(left);
    String rightValue = toSortableDate(right);
    return leftValue.compareTo(rightValue);
  }

  private String toSortableDate(Object value) {
    if (value == null) {
      return "";
    }
    if (value instanceof LocalDateTime) {
      return ((LocalDateTime) value).toString();
    }
    return String.valueOf(value);
  }
}
