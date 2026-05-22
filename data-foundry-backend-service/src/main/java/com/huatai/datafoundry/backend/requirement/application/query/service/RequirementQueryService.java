package com.huatai.datafoundry.backend.requirement.application.query.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.huatai.datafoundry.backend.requirement.application.query.dto.CollectionResultReadDto;
import com.huatai.datafoundry.backend.requirement.application.query.dto.CollectionResultRowReadDto;
import com.huatai.datafoundry.backend.requirement.application.query.dto.FetchTaskReadDto;
import com.huatai.datafoundry.backend.requirement.application.query.dto.FetchTaskResultsReadDto;
import com.huatai.datafoundry.backend.requirement.application.query.dto.MetricFieldMappingReadDto;
import com.huatai.datafoundry.backend.requirement.application.query.dto.RequirementTaskRuntimeReadDto;
import com.huatai.datafoundry.backend.requirement.application.query.dto.RequirementReadDto;
import com.huatai.datafoundry.backend.requirement.application.query.dto.RequirementSearchItemReadDto;
import com.huatai.datafoundry.backend.requirement.application.query.dto.RequirementSearchPageReadDto;
import com.huatai.datafoundry.backend.requirement.application.query.dto.TaskGroupReadDto;
import com.huatai.datafoundry.backend.requirement.application.query.dto.WideTableReadDto;
import com.huatai.datafoundry.backend.requirement.application.query.dto.WideTableScopeImportReadDto;
import com.huatai.datafoundry.backend.requirement.domain.model.Requirement;
import com.huatai.datafoundry.backend.requirement.domain.model.WideTable;
import com.huatai.datafoundry.backend.requirement.domain.repository.RequirementRepository;
import com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.mapper.RequirementSearchMapper;
import com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.mapper.WideTableScopeImportMapper;
import com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.record.RequirementSearchRowRecord;
import com.huatai.datafoundry.backend.requirement.infrastructure.persistence.mybatis.record.WideTableScopeImportRecord;
import com.huatai.datafoundry.backend.task.application.service.CollectionResultAppService;
import com.huatai.datafoundry.backend.task.application.service.MappedResultMaterializationAppService;
import com.huatai.datafoundry.backend.task.application.service.MappedResultMaterializationAppService.MaterializationOutcome;
import com.huatai.datafoundry.backend.task.application.service.MetricFieldMappingAppService;
import com.huatai.datafoundry.backend.task.domain.model.CollectionResult;
import com.huatai.datafoundry.backend.task.domain.model.CollectionResultRow;
import com.huatai.datafoundry.backend.task.domain.model.FetchTask;
import com.huatai.datafoundry.backend.task.domain.model.MetricFieldMapping;
import com.huatai.datafoundry.backend.task.domain.model.TaskGroup;
import com.huatai.datafoundry.backend.task.domain.repository.FetchTaskRepository;
import com.huatai.datafoundry.backend.task.domain.repository.TaskGroupRepository;
import java.util.Collections;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class RequirementQueryService {
  private final RequirementRepository requirementRepository;
  private final RequirementSearchMapper requirementSearchMapper;
  private final WideTableScopeImportMapper wideTableScopeImportMapper;
  private final TaskGroupRepository taskGroupRepository;
  private final FetchTaskRepository fetchTaskRepository;
  private final CollectionResultAppService collectionResultAppService;
  private final MetricFieldMappingAppService metricFieldMappingAppService;
  private final MappedResultMaterializationAppService mappedResultMaterializationAppService;
  private final ObjectMapper objectMapper;

  public RequirementQueryService(
      RequirementRepository requirementRepository,
      RequirementSearchMapper requirementSearchMapper,
      WideTableScopeImportMapper wideTableScopeImportMapper,
      TaskGroupRepository taskGroupRepository,
      FetchTaskRepository fetchTaskRepository,
      CollectionResultAppService collectionResultAppService,
      MetricFieldMappingAppService metricFieldMappingAppService,
      MappedResultMaterializationAppService mappedResultMaterializationAppService,
      ObjectMapper objectMapper) {
    this.requirementRepository = requirementRepository;
    this.requirementSearchMapper = requirementSearchMapper;
    this.wideTableScopeImportMapper = wideTableScopeImportMapper;
    this.taskGroupRepository = taskGroupRepository;
    this.fetchTaskRepository = fetchTaskRepository;
    this.collectionResultAppService = collectionResultAppService;
    this.metricFieldMappingAppService = metricFieldMappingAppService;
    this.mappedResultMaterializationAppService = mappedResultMaterializationAppService;
    this.objectMapper = objectMapper;
  }

  public List<RequirementReadDto> listByProject(String projectId) {
    List<Requirement> requirements = requirementRepository.listByProject(projectId);
    if (requirements == null || requirements.isEmpty()) {
      return new ArrayList<RequirementReadDto>();
    }

    List<String> requirementIds = new ArrayList<String>(requirements.size());
    for (Requirement record : requirements) {
      if (record != null && record.getId() != null) {
        requirementIds.add(record.getId());
      }
    }

    Map<String, WideTable> primaryByRequirement = new HashMap<String, WideTable>();
    if (!requirementIds.isEmpty()) {
      List<WideTable> wideTables =
          requirementRepository.listPrimaryWideTablesByRequirementIds(requirementIds);
      if (wideTables != null) {
        for (WideTable wt : wideTables) {
          if (wt != null && wt.getRequirementId() != null) {
            primaryByRequirement.put(wt.getRequirementId(), wt);
          }
        }
      }
    }

    List<RequirementReadDto> out = new ArrayList<RequirementReadDto>(requirements.size());
    for (Requirement record : requirements) {
      if (record == null) continue;
      RequirementReadDto dto = mapRequirement(record);
      WideTable primary = primaryByRequirement.get(record.getId());
      if (primary != null) {
        dto.setWideTable(mapWideTable(primary));
      }
      out.add(dto);
    }
    return out;
  }

  public RequirementReadDto getByProjectAndId(String projectId, String requirementId) {
    Requirement record = requirementRepository.getByProjectAndId(projectId, requirementId);
    if (record == null) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Requirement not found");
    }
    return mapRequirement(record);
  }

  public WideTableReadDto getPrimaryWideTableByRequirement(String requirementId) {
    WideTable record = requirementRepository.getPrimaryWideTableByRequirement(requirementId);
    return record != null ? mapWideTable(record) : null;
  }

  public WideTableReadDto getWideTableByIdForRequirement(String requirementId, String wideTableId) {
    WideTable record = requirementRepository.getWideTableByIdForRequirement(requirementId, wideTableId);
    if (record == null) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Wide table not found");
    }
    return mapWideTable(record);
  }

  public List<TaskGroupReadDto> listTaskGroups(String projectId, String requirementId) {
    assertRequirementExists(projectId, requirementId);
    List<TaskGroup> records = taskGroupRepository.listByRequirement(requirementId);
    List<TaskGroupReadDto> out = new ArrayList<TaskGroupReadDto>();
    if (records == null) return out;
    Map<String, WideTablePlanContext> contextByWideTableId = buildWideTablePlanContextByTaskGroups(requirementId, records);
    for (TaskGroup record : records) {
      if (record == null) continue;
      WideTablePlanContext context = contextByWideTableId.get(record.getWideTableId());
      if (!isCurrentLegalTaskGroup(record, context)) {
        continue;
      }
      TaskGroupReadDto dto = new TaskGroupReadDto();
      dto.setId(record.getId());
      dto.setSortOrder(record.getSortOrder());
      dto.setRequirementId(record.getRequirementId());
      dto.setWideTableId(record.getWideTableId());
      dto.setBatchId(record.getBatchId());
      dto.setBusinessDate(record.getBusinessDate());
      dto.setSourceType(record.getSourceType());
      dto.setStatus(record.getStatus());
      dto.setScheduleRuleId(record.getScheduleRuleId());
      dto.setBackfillRequestId(record.getBackfillRequestId());
      dto.setPlanVersion(record.getPlanVersion());
      dto.setGroupKind(record.getGroupKind());
      dto.setPartitionType(record.getPartitionType());
      dto.setPartitionKey(record.getPartitionKey());
      dto.setPartitionLabel(record.getPartitionLabel());
      dto.setTotalTasks(record.getTotalTasks());
      dto.setPendingTasks(record.getPendingTasks());
      dto.setRunningTasks(record.getRunningTasks());
      dto.setCompletedTasks(record.getCompletedTasks());
      dto.setFailedTasks(record.getFailedTasks());
      dto.setCancelledTasks(record.getCancelledTasks());
      dto.setInvalidatedTasks(record.getInvalidatedTasks());
      dto.setTriggeredBy(record.getTriggeredBy());
      dto.setLastAggregatedAt(record.getLastAggregatedAt());
      dto.setCreatedAt(record.getCreatedAt());
      dto.setUpdatedAt(record.getUpdatedAt());
      out.add(dto);
    }
    return out;
  }

  public List<FetchTaskReadDto> listFetchTasks(String projectId, String requirementId) {
    assertRequirementExists(projectId, requirementId);
    List<TaskGroup> taskGroups = taskGroupRepository.listByRequirement(requirementId);
    Map<String, WideTablePlanContext> contextByWideTableId = buildWideTablePlanContextByTaskGroups(requirementId, taskGroups);
    Map<String, TaskGroup> legalTaskGroupById = new LinkedHashMap<String, TaskGroup>();
    if (taskGroups != null) {
      for (TaskGroup taskGroup : taskGroups) {
        if (taskGroup == null) {
          continue;
        }
        WideTablePlanContext context = contextByWideTableId.get(taskGroup.getWideTableId());
        if (isCurrentLegalTaskGroup(taskGroup, context)) {
          legalTaskGroupById.put(taskGroup.getId(), taskGroup);
        }
      }
    }
    List<FetchTask> records = fetchTaskRepository.listByRequirement(requirementId);
    List<FetchTaskReadDto> out = new ArrayList<FetchTaskReadDto>();
    if (records == null) return out;
    for (FetchTask record : records) {
      if (record == null) continue;
      TaskGroup taskGroup = legalTaskGroupById.get(record.getTaskGroupId());
      if (taskGroup == null) {
        continue;
      }
      WideTablePlanContext context = contextByWideTableId.get(record.getWideTableId());
      if (!isCurrentLegalFetchTask(record, taskGroup, context)) {
        continue;
      }
      FetchTaskReadDto dto = new FetchTaskReadDto();
      dto.setId(record.getId());
      dto.setSortOrder(record.getSortOrder());
      dto.setRequirementId(record.getRequirementId());
      dto.setWideTableId(record.getWideTableId());
      dto.setTaskGroupId(record.getTaskGroupId());
      dto.setBatchId(record.getBatchId());
      dto.setRowId(record.getRowId());
      dto.setIndicatorGroupId(record.getIndicatorGroupId());
      dto.setIndicatorGroupName(record.getIndicatorGroupName());
      dto.setName(record.getName());
      dto.setSchemaVersion(record.getSchemaVersion());
      dto.setExecutionMode(record.getExecutionMode());
      dto.setIndicatorKeysJson(record.getIndicatorKeysJson());
      dto.setDimensionValuesJson(record.getDimensionValuesJson());
      dto.setIndicatorKeys(parseJsonStringList(record.getIndicatorKeysJson()));
      dto.setDimensionValues(parseJsonStringMap(record.getDimensionValuesJson()));
      dto.setCollectionTaskId(record.getCollectionTaskId());
      dto.setBusinessDate(record.getBusinessDate());
      dto.setStatus(record.getStatus());
      dto.setCanRerun(record.getCanRerun());
      dto.setInvalidatedReason(record.getInvalidatedReason());
      dto.setOwner(record.getOwner());
      dto.setConfidence(record.getConfidence());
      dto.setPlanVersion(record.getPlanVersion());
      dto.setRowBindingKey(record.getRowBindingKey());
      dto.setCollectionRows(mapCollectionResultRows(collectionResultAppService.listRowsByTask(record.getId())));
      dto.setCreatedAt(record.getCreatedAt());
      dto.setUpdatedAt(record.getUpdatedAt());
      out.add(dto);
    }
    return out;
  }

  public RequirementTaskRuntimeReadDto getTaskRuntime(String projectId, String requirementId) {
    RequirementTaskRuntimeReadDto dto = new RequirementTaskRuntimeReadDto();
    dto.setTaskGroups(listTaskGroups(projectId, requirementId));
    dto.setFetchTasks(listFetchTasks(projectId, requirementId));
    return dto;
  }

  private Map<String, WideTablePlanContext> buildWideTablePlanContextByTaskGroups(
      String requirementId,
      List<TaskGroup> taskGroups) {
    if (taskGroups == null || taskGroups.isEmpty()) {
      return Collections.emptyMap();
    }
    Map<String, Integer> currentPlanVersionByWideTableId = new LinkedHashMap<String, Integer>();
    for (TaskGroup taskGroup : taskGroups) {
      if (taskGroup == null || taskGroup.getWideTableId() == null) {
        continue;
      }
      int planVersion = taskGroup.getPlanVersion() != null ? taskGroup.getPlanVersion().intValue() : 1;
      Integer current = currentPlanVersionByWideTableId.get(taskGroup.getWideTableId());
      if (current == null || planVersion > current.intValue()) {
        currentPlanVersionByWideTableId.put(taskGroup.getWideTableId(), Integer.valueOf(planVersion));
      }
    }
    if (currentPlanVersionByWideTableId.isEmpty()) {
      return Collections.emptyMap();
    }
    Map<String, WideTablePlanContext> out = new LinkedHashMap<String, WideTablePlanContext>();
    for (Map.Entry<String, Integer> entry : currentPlanVersionByWideTableId.entrySet()) {
      String wideTableId = entry.getKey();
      if (wideTableId == null || wideTableId.trim().isEmpty()) {
        continue;
      }
      WideTable wideTable = requirementRepository.getWideTableByIdForRequirement(requirementId, wideTableId);
      WideTablePlanContext context = new WideTablePlanContext();
      context.currentPlanVersion = entry.getValue().intValue();
      context.indicatorGroups = parseIndicatorGroups(wideTable != null ? wideTable.getIndicatorGroupsJson() : null);
      context.indicatorGroupKeys = new LinkedHashSet<String>(context.indicatorGroups.keySet());
      out.put(wideTableId, context);
    }
    return out;
  }

  private boolean isCurrentLegalTaskGroup(TaskGroup taskGroup, WideTablePlanContext context) {
    if (taskGroup == null || context == null) {
      return false;
    }
    int planVersion = taskGroup.getPlanVersion() != null ? taskGroup.getPlanVersion().intValue() : 1;
    if (planVersion != context.currentPlanVersion) {
      return false;
    }
    String status = taskGroup.getStatus();
    if (status != null && "invalidated".equalsIgnoreCase(status)) {
      return false;
    }
    if (context.indicatorGroupKeys.isEmpty()) {
      return true;
    }
    String partitionKey = taskGroup.getPartitionKey();
    if (context.indicatorGroupKeys.size() == 1 && (partitionKey == null || partitionKey.trim().isEmpty())) {
      return true;
    }
    return partitionKey != null && context.indicatorGroupKeys.contains(partitionKey);
  }

  private boolean isCurrentLegalFetchTask(
      FetchTask fetchTask,
      TaskGroup taskGroup,
      WideTablePlanContext context) {
    if (fetchTask == null || taskGroup == null || context == null) {
      return false;
    }
    int planVersion = fetchTask.getPlanVersion() != null ? fetchTask.getPlanVersion().intValue() : 1;
    if (planVersion != context.currentPlanVersion) {
      return false;
    }
    String indicatorGroupId = fetchTask.getIndicatorGroupId();
    if (indicatorGroupId == null || !context.indicatorGroups.containsKey(indicatorGroupId)) {
      return false;
    }
    String taskGroupPartitionKey = taskGroup.getPartitionKey();
    if (taskGroupPartitionKey != null && !taskGroupPartitionKey.trim().isEmpty() && !taskGroupPartitionKey.equals(indicatorGroupId)) {
      return false;
    }
    String fetchTaskBusinessDate = normalizeString(fetchTask.getBusinessDate());
    String taskGroupBusinessDate = normalizeString(taskGroup.getBusinessDate());
    if (!taskGroupBusinessDate.isEmpty() && !fetchTaskBusinessDate.isEmpty() && !taskGroupBusinessDate.equals(fetchTaskBusinessDate)) {
      return false;
    }
    Set<String> expectedIndicatorKeys = context.indicatorGroups.get(indicatorGroupId);
    Set<String> actualIndicatorKeys = parseJsonStringSet(fetchTask.getIndicatorKeysJson());
    return expectedIndicatorKeys.equals(actualIndicatorKeys);
  }

  private Map<String, Set<String>> parseIndicatorGroups(String indicatorGroupsJson) {
    if (indicatorGroupsJson == null || indicatorGroupsJson.trim().isEmpty()) {
      return Collections.emptyMap();
    }
    try {
      List<?> rawGroups = objectMapper.readValue(indicatorGroupsJson, new TypeReference<List<?>>() {});
      Map<String, Set<String>> out = new LinkedHashMap<String, Set<String>>();
      for (Object rawGroup : rawGroups) {
        if (!(rawGroup instanceof Map)) {
          continue;
        }
        Map<?, ?> raw = (Map<?, ?>) rawGroup;
        String id = normalizeString(raw.get("id"));
        if (id.isEmpty()) {
          continue;
        }
        Object indicatorColumns = raw.get("indicator_columns");
        if (!(indicatorColumns instanceof List)) {
          indicatorColumns = raw.get("indicatorColumns");
        }
        if (!(indicatorColumns instanceof List)) {
          indicatorColumns = raw.get("indicator_keys");
        }
        out.put(id, normalizeStringSet((List<?>) indicatorColumns));
      }
      return out;
    } catch (Exception ex) {
      return Collections.emptyMap();
    }
  }

  private Set<String> parseJsonStringSet(String rawJson) {
    if (rawJson == null || rawJson.trim().isEmpty()) {
      return Collections.emptySet();
    }
    try {
      List<?> raw = objectMapper.readValue(rawJson, new TypeReference<List<?>>() {});
      return normalizeStringSet(raw);
    } catch (Exception ex) {
      return Collections.emptySet();
    }
  }

  private List<String> parseJsonStringList(String rawJson) {
    if (rawJson == null || rawJson.trim().isEmpty()) {
      return Collections.emptyList();
    }
    try {
      List<?> raw = objectMapper.readValue(rawJson, new TypeReference<List<?>>() {});
      List<String> out = new ArrayList<String>(raw.size());
      for (Object item : raw) {
        if (item != null) {
          String value = String.valueOf(item).trim();
          if (!value.isEmpty()) {
            out.add(value);
          }
        }
      }
      return out;
    } catch (Exception ex) {
      return Collections.emptyList();
    }
  }

  private Map<String, String> parseJsonStringMap(String rawJson) {
    if (rawJson == null || rawJson.trim().isEmpty()) {
      return Collections.emptyMap();
    }
    try {
      Map<String, Object> raw =
          objectMapper.readValue(rawJson, new TypeReference<Map<String, Object>>() {});
      Map<String, String> out = new LinkedHashMap<String, String>();
      for (Map.Entry<String, Object> entry : raw.entrySet()) {
        if (entry.getKey() == null) {
          continue;
        }
        out.put(entry.getKey(), entry.getValue() == null ? "" : String.valueOf(entry.getValue()));
      }
      return out;
    } catch (Exception ex) {
      return Collections.emptyMap();
    }
  }

  private Set<String> normalizeStringSet(List<?> rawValues) {
    if (rawValues == null || rawValues.isEmpty()) {
      return Collections.emptySet();
    }
    Set<String> normalized = new LinkedHashSet<String>();
    for (Object rawValue : rawValues) {
      String value = normalizeString(rawValue);
      if (!value.isEmpty()) {
        normalized.add(value);
      }
    }
    return normalized;
  }

  private String normalizeString(Object rawValue) {
    if (rawValue == null) {
      return "";
    }
    return String.valueOf(rawValue).trim();
  }

  private static final class WideTablePlanContext {
    private int currentPlanVersion;
    private Map<String, Set<String>> indicatorGroups = Collections.emptyMap();
    private Set<String> indicatorGroupKeys = Collections.emptySet();
  }

  public FetchTaskResultsReadDto getTaskResults(String taskId) {
    FetchTaskResultsReadDto out = new FetchTaskResultsReadDto();
    if (taskId == null || taskId.trim().isEmpty()) {
      return out;
    }
    out.setCollectionResults(mapCollectionResults(collectionResultAppService.listResultsByTask(taskId.trim())));
    out.setCollectionResultRows(mapCollectionResultRows(collectionResultAppService.listRowsByTask(taskId.trim())));
    return out;
  }

  public FetchTaskResultsReadDto getTaskGroupResults(String taskGroupId) {
    FetchTaskResultsReadDto out = new FetchTaskResultsReadDto();
    if (taskGroupId == null || taskGroupId.trim().isEmpty()) {
      return out;
    }
    out.setCollectionResults(mapCollectionResults(collectionResultAppService.listResultsByTaskGroup(taskGroupId.trim())));
    return out;
  }

  public FetchTaskResultsReadDto getWideTableResults(String wideTableId) {
    FetchTaskResultsReadDto out = new FetchTaskResultsReadDto();
    if (wideTableId == null || wideTableId.trim().isEmpty()) {
      return out;
    }
    out.setCollectionResults(mapCollectionResults(collectionResultAppService.listResultsByWideTable(wideTableId.trim())));
    return out;
  }

  public CollectionResultReadDto normalizeTaskResultFinalReport(String taskId, String resultId) {
    return mapCollectionResult(collectionResultAppService.normalizeFinalReport(taskId, resultId));
  }

  public FetchTaskResultsReadDto normalizeWideTableFinalReports(String wideTableId) {
    FetchTaskResultsReadDto out = new FetchTaskResultsReadDto();
    if (wideTableId == null || wideTableId.trim().isEmpty()) {
      return out;
    }
    out.setCollectionResults(
        mapCollectionResults(collectionResultAppService.normalizeWideTableFinalReports(wideTableId.trim())));
    return out;
  }

  public FetchTaskResultsReadDto normalizeTaskGroupFinalReports(String taskGroupId) {
    FetchTaskResultsReadDto out = new FetchTaskResultsReadDto();
    if (taskGroupId == null || taskGroupId.trim().isEmpty()) {
      return out;
    }
    out.setCollectionResults(
        mapCollectionResults(collectionResultAppService.normalizeTaskGroupFinalReports(taskGroupId.trim())));
    return out;
  }

  public List<MetricFieldMappingReadDto> listMetricFieldMappings(String wideTableId) {
    return mapMetricFieldMappings(metricFieldMappingAppService.listByWideTable(wideTableId));
  }

  public List<MetricFieldMappingReadDto> generateMetricFieldMappings(String wideTableId) {
    return mapMetricFieldMappings(metricFieldMappingAppService.generateFromWideTableResults(wideTableId));
  }

  public MetricFieldMappingReadDto updateMetricFieldMapping(
      String wideTableId,
      String mappingId,
      String targetIndicatorKey,
      String targetIndicatorName,
      String matchType,
      String status) {
    return mapMetricFieldMapping(metricFieldMappingAppService.updateMapping(
        wideTableId, mappingId, targetIndicatorKey, targetIndicatorName, matchType, status));
  }

  public Map<String, Object> materializeMappedResults(String wideTableId) {
    MaterializationOutcome outcome = mappedResultMaterializationAppService.materializeWideTable(wideTableId);
    Map<String, Object> out = new HashMap<String, Object>();
    out.put("wide_table_id", outcome.getWideTableId());
    out.put("collection_results", outcome.getCollectionResults());
    out.put("collection_result_rows", outcome.getCollectionResultRows());
    out.put("wide_table_cells", outcome.getWideTableCells());
    out.put("skipped_missing_rows", outcome.getSkippedMissingRows());
    out.put("skipped_unmapped_metrics", outcome.getSkippedUnmappedMetrics());
    return out;
  }

  public List<Map<String, Object>> listTaskRuns(String taskId) {
    List<Map<String, Object>> out = new ArrayList<Map<String, Object>>();
    if (taskId == null || taskId.trim().isEmpty()) {
      return out;
    }
    List<CollectionResult> results = collectionResultAppService.listResultsByTask(taskId.trim());
    if (results == null) {
      return out;
    }
    int attempt = 1;
    for (CollectionResult result : results) {
      if (result == null) continue;
      Map<String, Object> run = new HashMap<String, Object>();
      run.put("id", result.getId());
      run.put("fetch_task_id", result.getFetchTaskId());
      run.put("task_id", result.getFetchTaskId());
      run.put("attempt", attempt++);
      run.put("status", mapCollectionResultStatusToRun(result.getStatus()));
      run.put("trigger_type", "trial");
      run.put("task_group_run_id", result.getScheduleJobId());
      run.put("schedule_job_id", result.getScheduleJobId());
      run.put("external_task_id", result.getExternalTaskId());
      run.put("error_message", result.getErrorMsg());
      run.put("started_at", result.getCreatedAt() != null ? result.getCreatedAt() : result.getCollectedAt());
      run.put("ended_at", result.getCollectedAt() != null ? result.getCollectedAt() : result.getUpdatedAt());
      out.add(run);
    }
    return out;
  }

  public RequirementSearchPageReadDto search(
      String keyword,
      String projectId,
      String owner,
      String assignee,
      List<String> statuses,
      String wideTableId,
      String wideTableKeyword,
      Boolean hasWideTable,
      String sortBy,
      String sortDir,
      int page,
      int pageSize) {
    int normalizedPage = Math.max(page, 1);
    int normalizedPageSize = Math.max(1, Math.min(pageSize, 100));
    int offset = (normalizedPage - 1) * normalizedPageSize;

    long total =
        requirementSearchMapper.count(
            keyword,
            projectId,
            owner,
            assignee,
            statuses,
            wideTableId,
            wideTableKeyword,
            hasWideTable);
    List<RequirementSearchRowRecord> rows =
        requirementSearchMapper.list(
            keyword,
            projectId,
            owner,
            assignee,
            statuses,
            wideTableId,
            wideTableKeyword,
            hasWideTable,
            sortBy,
            sortDir,
            offset,
            normalizedPageSize);

    List<RequirementSearchItemReadDto> items = new ArrayList<RequirementSearchItemReadDto>();
    if (rows != null) {
      for (RequirementSearchRowRecord row : rows) {
        if (row == null) continue;
        RequirementReadDto req = new RequirementReadDto();
        req.setId(row.getRequirementId());
        req.setProjectId(row.getProjectId());
        req.setTitle(row.getTitle());
        req.setPhase(row.getPhase());
        req.setStatus(row.getStatus());
        req.setSchemaLocked(row.getSchemaLocked());
        req.setOwner(row.getOwner());
        req.setAssignee(row.getAssignee());
        req.setCreatedAt(row.getCreatedAt());
        req.setUpdatedAt(row.getUpdatedAt());

        RequirementSearchItemReadDto.ProjectSummaryReadDto project =
            new RequirementSearchItemReadDto.ProjectSummaryReadDto();
        project.setId(row.getProjectId());
        project.setName(row.getProjectName());

        RequirementSearchItemReadDto.WideTableSummaryReadDto wideTable = null;
        if (row.getWideTableId() != null) {
          wideTable = new RequirementSearchItemReadDto.WideTableSummaryReadDto();
          wideTable.setId(row.getWideTableId());
          wideTable.setTableName(row.getWideTableTableName());
          wideTable.setRecordCount(row.getWideTableRecordCount());
          wideTable.setColumnCount(row.getWideTableColumnCount());
        }

        RequirementSearchItemReadDto item = new RequirementSearchItemReadDto();
        item.setRequirement(req);
        item.setProject(project);
        item.setWideTable(wideTable);
        items.add(item);
      }
    }

    RequirementSearchPageReadDto out = new RequirementSearchPageReadDto();
    out.setPage(normalizedPage);
    out.setPageSize(normalizedPageSize);
    out.setTotal(total);
    out.setItems(items);
    return out;
  }

  private void assertRequirementExists(String projectId, String requirementId) {
    Requirement record = requirementRepository.getByProjectAndId(projectId, requirementId);
    if (record == null) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Requirement not found");
    }
  }

  private RequirementReadDto mapRequirement(Requirement record) {
    RequirementReadDto dto = new RequirementReadDto();
    dto.setId(record.getId());
    dto.setProjectId(record.getProjectId());
    dto.setTitle(record.getTitle());
    dto.setPhase(record.getPhase());
    dto.setStatus(record.getStatus());
    dto.setSchemaLocked(record.getSchemaLocked());
    dto.setOwner(record.getOwner());
    dto.setAssignee(record.getAssignee());
    dto.setBusinessGoal(record.getBusinessGoal());
    dto.setBackgroundKnowledge(record.getBackgroundKnowledge());
    dto.setBusinessBoundary(record.getBusinessBoundary());
    dto.setDeliveryScope(record.getDeliveryScope());
    dto.setCollectionPolicy(parseJsonObject(record.getCollectionPolicyJson()));
    dto.setDataUpdateEnabled(record.getDataUpdateEnabled());
    dto.setDataUpdateMode(record.getDataUpdateMode());
    dto.setCreatedAt(record.getCreatedAt());
    dto.setUpdatedAt(record.getUpdatedAt());
    return dto;
  }

  private WideTableReadDto mapWideTable(WideTable record) {
    WideTableReadDto dto = new WideTableReadDto();
    dto.setId(record.getId());
    dto.setTitle(record.getTitle());
    dto.setDescription(record.getDescription());
    dto.setTableName(record.getTableName());
    dto.setSchema(parseJsonAny(record.getSchemaJson()));
    dto.setScope(parseJsonAny(record.getScopeJson()));
    dto.setScopeImport(mapScopeImport(wideTableScopeImportMapper.getByWideTableId(record.getId())));
    dto.setIndicatorGroups(parseJsonAny(record.getIndicatorGroupsJson()));
    dto.setScheduleRules(parseJsonAny(record.getScheduleRulesJson()));
    dto.setSemanticTimeAxis(record.getSemanticTimeAxis());
    dto.setCollectionCoverageMode(record.getCollectionCoverageMode());
    dto.setSchemaVersion(record.getSchemaVersion());
    dto.setRecordCount(record.getRecordCount());
    dto.setStatus(record.getStatus());
    dto.setCreatedAt(record.getCreatedAt());
    dto.setUpdatedAt(record.getUpdatedAt());
    return dto;
  }

  private WideTableScopeImportReadDto mapScopeImport(WideTableScopeImportRecord record) {
    if (record == null) {
      return null;
    }
    WideTableScopeImportReadDto dto = new WideTableScopeImportReadDto();
    dto.setFileName(record.getFileName());
    dto.setFileType(record.getFileType());
    dto.setRowCount(record.getRowCount());
    dto.setImportMode(record.getImportMode());
    dto.setContentHash(record.getContentHash());
    dto.setCreatedAt(record.getCreatedAt());
    dto.setUpdatedAt(record.getUpdatedAt());
    return dto;
  }

  private List<CollectionResultReadDto> mapCollectionResults(List<CollectionResult> records) {
    List<CollectionResultReadDto> out = new ArrayList<CollectionResultReadDto>();
    if (records == null) return out;
    for (CollectionResult record : records) {
      if (record == null) continue;
      out.add(mapCollectionResult(record));
    }
    return out;
  }

  private CollectionResultReadDto mapCollectionResult(CollectionResult record) {
    if (record == null) {
      return null;
    }
    CollectionResultReadDto dto = new CollectionResultReadDto();
    dto.setId(record.getId());
    dto.setFetchTaskId(record.getFetchTaskId());
    dto.setScheduleJobId(record.getScheduleJobId());
    dto.setExternalTaskId(record.getExternalTaskId());
    dto.setTaskGroupId(record.getTaskGroupId());
    dto.setBatchId(record.getBatchId());
    dto.setWideTableId(record.getWideTableId());
    dto.setRowId(record.getRowId());
    dto.setRawResultJson(record.getRawResultJson());
    dto.setFinalReport(record.getFinalReport());
    dto.setNormalizedRowsJson(record.getNormalizedRowsJson());
    dto.setStatus(record.getStatus());
    dto.setErrorMsg(record.getErrorMsg());
    dto.setDurationMs(record.getDurationMs());
    dto.setCollectedAt(record.getCollectedAt());
    dto.setCreatedAt(record.getCreatedAt());
    dto.setUpdatedAt(record.getUpdatedAt());
    return dto;
  }

  private String mapCollectionResultStatusToRun(String status) {
    if (status == null) {
      return "running";
    }
    String normalized = status.trim().toLowerCase();
    if ("failed".equals(normalized) || "parse_failed".equals(normalized)) {
      return "failed";
    }
    if ("success".equals(normalized)
        || "completed".equals(normalized)
        || "partial".equals(normalized)
        || "conflict".equals(normalized)
        || "not_found".equals(normalized)) {
      return "completed";
    }
    return normalized;
  }

  private List<CollectionResultRowReadDto> mapCollectionResultRows(List<CollectionResultRow> records) {
    List<CollectionResultRowReadDto> out = new ArrayList<CollectionResultRowReadDto>();
    if (records == null) return out;
    for (CollectionResultRow record : records) {
      if (record == null) continue;
      CollectionResultRowReadDto dto = new CollectionResultRowReadDto();
      dto.setId(record.getId());
      dto.setCollectionResultId(record.getCollectionResultId());
      dto.setFetchTaskId(record.getFetchTaskId());
      dto.setScheduleJobId(record.getScheduleJobId());
      dto.setWideTableId(record.getWideTableId());
      dto.setRowId(record.getRowId());
      dto.setSourceMetricName(record.getSourceMetricName());
      dto.setTargetIndicatorKey(record.getTargetIndicatorKey());
      dto.setIndicatorKey(record.getIndicatorKey());
      dto.setIndicatorName(record.getIndicatorName());
      dto.setBusinessDate(record.getBusinessDate());
      dto.setDimensionValuesJson(record.getDimensionValuesJson());
      dto.setRawValue(record.getRawValue());
      dto.setCleanedValue(record.getCleanedValue());
      dto.setUnit(record.getUnit());
      dto.setPublishedAt(record.getPublishedAt());
      dto.setSourceSite(record.getSourceSite());
      dto.setSourceUrl(record.getSourceUrl());
      dto.setQuoteText(record.getQuoteText());
      dto.setMaxValue(record.getMaxValue());
      dto.setMinValue(record.getMinValue());
      dto.setConfidence(record.getConfidence());
      dto.setStatus(record.getStatus());
      dto.setWarningMsg(record.getWarningMsg());
      dto.setReasoning(record.getReasoning());
      dto.setWhyNotFound(record.getWhyNotFound());
      dto.setCreatedAt(record.getCreatedAt());
      dto.setUpdatedAt(record.getUpdatedAt());
      out.add(dto);
    }
    return out;
  }

  private List<MetricFieldMappingReadDto> mapMetricFieldMappings(List<MetricFieldMapping> records) {
    List<MetricFieldMappingReadDto> out = new ArrayList<MetricFieldMappingReadDto>();
    if (records == null) return out;
    for (MetricFieldMapping record : records) {
      if (record == null) continue;
      out.add(mapMetricFieldMapping(record));
    }
    return out;
  }

  private MetricFieldMappingReadDto mapMetricFieldMapping(MetricFieldMapping record) {
    if (record == null) {
      return null;
    }
    MetricFieldMappingReadDto dto = new MetricFieldMappingReadDto();
    dto.setId(record.getId());
    dto.setRequirementId(record.getRequirementId());
    dto.setWideTableId(record.getWideTableId());
    dto.setSourceMetricName(record.getSourceMetricName());
    dto.setTargetIndicatorKey(record.getTargetIndicatorKey());
    dto.setTargetIndicatorName(record.getTargetIndicatorName());
    dto.setMatchType(record.getMatchType());
    dto.setConfidence(record.getConfidence());
    dto.setStatus(record.getStatus());
    dto.setCreatedAt(record.getCreatedAt());
    dto.setUpdatedAt(record.getUpdatedAt());
    return dto;
  }

  private Map<String, Object> parseJsonObject(String raw) {
    if (raw == null || raw.trim().isEmpty()) {
      return null;
    }
    try {
      return objectMapper.readValue(raw, new TypeReference<Map<String, Object>>() {});
    } catch (Exception ex) {
      return null;
    }
  }

  private Object parseJsonAny(String raw) {
    if (raw == null || raw.trim().isEmpty()) {
      return null;
    }
    try {
      return objectMapper.readValue(raw, new TypeReference<Object>() {});
    } catch (Exception ex) {
      return null;
    }
  }
}
