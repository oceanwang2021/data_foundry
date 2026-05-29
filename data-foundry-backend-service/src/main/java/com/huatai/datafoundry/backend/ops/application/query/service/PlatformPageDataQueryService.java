package com.huatai.datafoundry.backend.ops.application.query.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.huatai.datafoundry.backend.project.application.query.dto.ProjectReadDto;
import com.huatai.datafoundry.backend.project.application.query.service.ProjectQueryService;
import com.huatai.datafoundry.backend.requirement.application.query.dto.FetchTaskReadDto;
import com.huatai.datafoundry.backend.requirement.application.query.dto.RequirementReadDto;
import com.huatai.datafoundry.backend.requirement.application.query.dto.TaskGroupReadDto;
import com.huatai.datafoundry.backend.requirement.application.query.dto.WideTableReadDto;
import com.huatai.datafoundry.backend.requirement.application.query.service.RequirementQueryService;
import com.huatai.datafoundry.backend.requirement.application.service.AcceptanceTicketAppService;
import com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.record.AcceptanceTicketRecord;
import com.huatai.datafoundry.backend.task.domain.model.FetchTask;
import com.huatai.datafoundry.backend.task.domain.model.TaskGroup;
import com.huatai.datafoundry.backend.task.domain.repository.FetchTaskRepository;
import com.huatai.datafoundry.backend.task.domain.repository.TaskGroupRepository;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Service;

@Service
public class PlatformPageDataQueryService {
  private final ProjectQueryService projectQueryService;
  private final RequirementQueryService requirementQueryService;
  private final AcceptanceTicketAppService acceptanceTicketAppService;
  private final TaskGroupRepository taskGroupRepository;
  private final FetchTaskRepository fetchTaskRepository;
  private final ObjectMapper objectMapper;

  public PlatformPageDataQueryService(
      ProjectQueryService projectQueryService,
      RequirementQueryService requirementQueryService,
      AcceptanceTicketAppService acceptanceTicketAppService,
      TaskGroupRepository taskGroupRepository,
      FetchTaskRepository fetchTaskRepository,
      ObjectMapper objectMapper) {
    this.projectQueryService = projectQueryService;
    this.requirementQueryService = requirementQueryService;
    this.acceptanceTicketAppService = acceptanceTicketAppService;
    this.taskGroupRepository = taskGroupRepository;
    this.fetchTaskRepository = fetchTaskRepository;
    this.objectMapper = objectMapper;
  }

  public List<Map<String, Object>> getProjectOverview() {
    PlatformContext context = loadPlatformContext();
    Map<String, Integer> requirementCountByProjectId = new LinkedHashMap<String, Integer>();
    for (RequirementReadDto requirement : context.requirements) {
      if (isBlank(requirement.getProjectId())) {
        continue;
      }
      requirementCountByProjectId.put(
          requirement.getProjectId(),
          Integer.valueOf(requirementCountByProjectId.getOrDefault(requirement.getProjectId(), Integer.valueOf(0)).intValue() + 1));
    }
    List<Map<String, Object>> out = new ArrayList<Map<String, Object>>();
    for (ProjectReadDto project : context.projects) {
      int requirementCount =
          requirementCountByProjectId.getOrDefault(project.getId(), Integer.valueOf(0)).intValue();
      Map<String, Object> item = new LinkedHashMap<String, Object>();
      item.put("project", project);
      item.put("requirement_count", Integer.valueOf(requirementCount));
      item.put("requirementCount", Integer.valueOf(requirementCount));
      out.add(item);
    }
    return out;
  }

  public Map<String, Object> getCollectionTasksOverview() {
    PlatformContext context = loadPlatformContext();
    List<TaskGroupReadDto> taskGroups = mapTaskGroups(filterTaskGroups(context.requirementIds));
    List<FetchTaskReadDto> fetchTasks = mapFetchTasks(filterFetchTasks(context.requirementIds, taskGroups));

    Map<String, Object> out = new LinkedHashMap<String, Object>();
    out.put("projects", context.projects);
    out.put("requirements", context.requirements);
    out.put("wide_tables", context.wideTables);
    out.put("wideTables", context.wideTables);
    out.put("task_groups", taskGroups);
    out.put("taskGroups", taskGroups);
    out.put("fetch_tasks", fetchTasks);
    out.put("fetchTasks", fetchTasks);
    return out;
  }

  public Map<String, Object> getAcceptanceOverview() {
    PlatformContext context = loadPlatformContext();
    List<TaskGroupReadDto> taskGroups = mapTaskGroups(filterTaskGroups(context.requirementIds));

    List<Map<String, Object>> tickets = new ArrayList<Map<String, Object>>();
    for (AcceptanceTicketRecord record : acceptanceTicketAppService.list(null)) {
      tickets.add(mapTicket(record));
    }

    Map<String, Object> out = new LinkedHashMap<String, Object>();
    out.put("projects", context.projects);
    out.put("requirements", context.requirements);
    out.put("task_groups", taskGroups);
    out.put("taskGroups", taskGroups);
    out.put("acceptance_tickets", tickets);
    out.put("acceptanceTickets", tickets);
    return out;
  }

  public Map<String, Object> getSchedulingContext() {
    PlatformContext context = loadPlatformContext();
    List<TaskGroupReadDto> taskGroups = mapTaskGroups(filterTaskGroups(context.requirementIds));

    Map<String, Object> out = new LinkedHashMap<String, Object>();
    out.put("projects", context.projects);
    out.put("requirements", context.requirements);
    out.put("task_groups", taskGroups);
    out.put("taskGroups", taskGroups);
    return out;
  }

  private PlatformContext loadPlatformContext() {
    List<ProjectReadDto> projects = projectQueryService.list();
    List<RequirementReadDto> requirements = new ArrayList<RequirementReadDto>();
    List<WideTableReadDto> wideTables = new ArrayList<WideTableReadDto>();
    Set<String> requirementIds = new LinkedHashSet<String>();

    for (ProjectReadDto project : projects) {
      List<RequirementReadDto> projectRequirements = requirementQueryService.listByProject(project.getId());
      requirements.addAll(projectRequirements);
      for (RequirementReadDto requirement : projectRequirements) {
        if (!isBlank(requirement.getId())) {
          requirementIds.add(requirement.getId());
        }
        if (requirement.getWideTable() != null) {
          wideTables.add(requirement.getWideTable());
        }
      }
    }

    PlatformContext context = new PlatformContext();
    context.projects = projects;
    context.requirements = requirements;
    context.wideTables = wideTables;
    context.requirementIds = requirementIds;
    return context;
  }

  private List<TaskGroup> filterTaskGroups(Set<String> requirementIds) {
    if (requirementIds.isEmpty()) {
      return Collections.emptyList();
    }
    List<TaskGroup> out = new ArrayList<TaskGroup>();
    for (TaskGroup taskGroup : taskGroupRepository.listAll()) {
      if (taskGroup == null || isBlank(taskGroup.getRequirementId())) {
        continue;
      }
      if (requirementIds.contains(taskGroup.getRequirementId())) {
        out.add(taskGroup);
      }
    }
    return out;
  }

  private List<FetchTask> filterFetchTasks(Set<String> requirementIds, List<TaskGroupReadDto> taskGroups) {
    if (requirementIds.isEmpty()) {
      return Collections.emptyList();
    }
    Set<String> taskGroupIds = new LinkedHashSet<String>();
    for (TaskGroupReadDto taskGroup : taskGroups) {
      if (taskGroup != null && !isBlank(taskGroup.getId())) {
        taskGroupIds.add(taskGroup.getId());
      }
    }
    List<FetchTask> out = new ArrayList<FetchTask>();
    for (FetchTask fetchTask : fetchTaskRepository.listAll()) {
      if (fetchTask == null) {
        continue;
      }
      if (!isBlank(fetchTask.getRequirementId()) && requirementIds.contains(fetchTask.getRequirementId())) {
        out.add(fetchTask);
        continue;
      }
      if (!isBlank(fetchTask.getTaskGroupId()) && taskGroupIds.contains(fetchTask.getTaskGroupId())) {
        out.add(fetchTask);
      }
    }
    return out;
  }

  private List<TaskGroupReadDto> mapTaskGroups(List<TaskGroup> taskGroups) {
    List<TaskGroupReadDto> out = new ArrayList<TaskGroupReadDto>();
    for (TaskGroup taskGroup : taskGroups) {
      if (taskGroup == null) {
        continue;
      }
      TaskGroupReadDto dto = new TaskGroupReadDto();
      dto.setId(taskGroup.getId());
      dto.setSortOrder(taskGroup.getSortOrder());
      dto.setRequirementId(taskGroup.getRequirementId());
      dto.setWideTableId(taskGroup.getWideTableId());
      dto.setBatchId(taskGroup.getBatchId());
      dto.setBusinessDate(taskGroup.getBusinessDate());
      dto.setSourceType(taskGroup.getSourceType());
      dto.setStatus(taskGroup.getStatus());
      dto.setScheduleRuleId(taskGroup.getScheduleRuleId());
      dto.setBackfillRequestId(taskGroup.getBackfillRequestId());
      dto.setPlanVersion(taskGroup.getPlanVersion());
      dto.setGroupKind(taskGroup.getGroupKind());
      dto.setPartitionType(taskGroup.getPartitionType());
      dto.setPartitionKey(taskGroup.getPartitionKey());
      dto.setPartitionLabel(taskGroup.getPartitionLabel());
      dto.setTotalTasks(taskGroup.getTotalTasks());
      dto.setPendingTasks(taskGroup.getPendingTasks());
      dto.setRunningTasks(taskGroup.getRunningTasks());
      dto.setCompletedTasks(taskGroup.getCompletedTasks());
      dto.setFailedTasks(taskGroup.getFailedTasks());
      dto.setCancelledTasks(taskGroup.getCancelledTasks());
      dto.setInvalidatedTasks(taskGroup.getInvalidatedTasks());
      dto.setTriggeredBy(taskGroup.getTriggeredBy());
      dto.setLastAggregatedAt(taskGroup.getLastAggregatedAt());
      dto.setCreatedAt(taskGroup.getCreatedAt());
      dto.setUpdatedAt(taskGroup.getUpdatedAt());
      out.add(dto);
    }
    return out;
  }

  private List<FetchTaskReadDto> mapFetchTasks(List<FetchTask> fetchTasks) {
    List<FetchTaskReadDto> out = new ArrayList<FetchTaskReadDto>();
    for (FetchTask fetchTask : fetchTasks) {
      if (fetchTask == null) {
        continue;
      }
      FetchTaskReadDto dto = new FetchTaskReadDto();
      dto.setId(fetchTask.getId());
      dto.setSortOrder(fetchTask.getSortOrder());
      dto.setRequirementId(fetchTask.getRequirementId());
      dto.setWideTableId(fetchTask.getWideTableId());
      dto.setTaskGroupId(fetchTask.getTaskGroupId());
      dto.setBatchId(fetchTask.getBatchId());
      dto.setRowId(fetchTask.getRowId());
      dto.setIndicatorGroupId(fetchTask.getIndicatorGroupId());
      dto.setIndicatorGroupName(fetchTask.getIndicatorGroupName());
      dto.setName(fetchTask.getName());
      dto.setSchemaVersion(fetchTask.getSchemaVersion());
      dto.setExecutionMode(fetchTask.getExecutionMode());
      dto.setIndicatorKeysJson(fetchTask.getIndicatorKeysJson());
      dto.setDimensionValuesJson(fetchTask.getDimensionValuesJson());
      dto.setIndicatorKeys(parseStringList(fetchTask.getIndicatorKeysJson()));
      dto.setDimensionValues(parseStringMap(fetchTask.getDimensionValuesJson()));
      dto.setCollectionTaskId(fetchTask.getCollectionTaskId());
      dto.setBusinessDate(fetchTask.getBusinessDate());
      dto.setStatus(fetchTask.getStatus());
      dto.setCanRerun(fetchTask.getCanRerun());
      dto.setInvalidatedReason(fetchTask.getInvalidatedReason());
      dto.setOwner(fetchTask.getOwner());
      dto.setConfidence(fetchTask.getConfidence());
      dto.setPlanVersion(fetchTask.getPlanVersion());
      dto.setRowBindingKey(fetchTask.getRowBindingKey());
      dto.setCreatedAt(fetchTask.getCreatedAt());
      dto.setUpdatedAt(fetchTask.getUpdatedAt());
      out.add(dto);
    }
    return out;
  }

  private Map<String, Object> mapTicket(AcceptanceTicketRecord record) {
    Map<String, Object> out = new LinkedHashMap<String, Object>();
    out.put("id", record.getId());
    out.put("requirement_id", record.getRequirementId());
    out.put("requirementId", record.getRequirementId());
    out.put("wide_table_id", record.getWideTableId());
    out.put("wideTableId", record.getWideTableId());
    out.put("task_group_id", record.getTaskGroupId());
    out.put("taskGroupId", record.getTaskGroupId());
    out.put("scope_type", record.getScopeType());
    out.put("scopeType", record.getScopeType());
    out.put("scope_key", record.getScopeKey());
    out.put("scopeKey", record.getScopeKey());
    out.put("dataset", record.getDataset());
    out.put("owner", record.getOwner());
    out.put("owner_account", record.getOwnerAccount());
    out.put("ownerAccount", record.getOwnerAccount());
    out.put("reviewer", record.getReviewer());
    out.put("reviewer_account", record.getReviewerAccount());
    out.put("reviewerAccount", record.getReviewerAccount());
    out.put("status", record.getStatus());
    out.put("feedback", record.getFeedback());
    out.put("row_ids_json", record.getRowIdsJson());
    out.put("rowIdsJson", record.getRowIdsJson());
    out.put("publish_job_id", record.getPublishJobId());
    out.put("publishJobId", record.getPublishJobId());
    out.put("publish_error_msg", record.getPublishErrorMsg());
    out.put("publishErrorMsg", record.getPublishErrorMsg());
    out.put("approved_at", formatTime(record.getApprovedAt()));
    out.put("approvedAt", formatTime(record.getApprovedAt()));
    out.put("published_at", formatTime(record.getPublishedAt()));
    out.put("publishedAt", formatTime(record.getPublishedAt()));
    out.put("latest_action_at", formatTime(record.getLatestActionAt()));
    out.put("latestActionAt", formatTime(record.getLatestActionAt()));
    out.put("created_at", formatTime(record.getCreatedAt()));
    out.put("createdAt", formatTime(record.getCreatedAt()));
    out.put("updated_at", formatTime(record.getUpdatedAt()));
    out.put("updatedAt", formatTime(record.getUpdatedAt()));
    return out;
  }

  private String formatTime(LocalDateTime value) {
    return value != null ? value.toString() : null;
  }

  private List<String> parseStringList(String raw) {
    if (isBlank(raw)) {
      return new ArrayList<String>();
    }
    try {
      return objectMapper.readValue(raw, new TypeReference<List<String>>() {});
    } catch (Exception ex) {
      return new ArrayList<String>();
    }
  }

  private Map<String, String> parseStringMap(String raw) {
    if (isBlank(raw)) {
      return new LinkedHashMap<String, String>();
    }
    try {
      return objectMapper.readValue(raw, new TypeReference<Map<String, String>>() {});
    } catch (Exception ex) {
      return new LinkedHashMap<String, String>();
    }
  }

  private boolean isBlank(String value) {
    return value == null || value.trim().isEmpty();
  }

  private static final class PlatformContext {
    private List<ProjectReadDto> projects = Collections.emptyList();
    private List<RequirementReadDto> requirements = Collections.emptyList();
    private List<WideTableReadDto> wideTables = Collections.emptyList();
    private Set<String> requirementIds = Collections.emptySet();
  }
}
