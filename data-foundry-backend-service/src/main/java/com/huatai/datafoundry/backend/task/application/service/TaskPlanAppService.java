package com.huatai.datafoundry.backend.task.application.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.huatai.datafoundry.backend.requirement.application.query.dto.WideTableRowReadDto;
import com.huatai.datafoundry.backend.requirement.application.query.service.WideTableRowQueryService;
import com.huatai.datafoundry.backend.task.domain.model.FetchTask;
import com.huatai.datafoundry.backend.task.domain.model.TaskGroup;
import com.huatai.datafoundry.backend.task.domain.model.WideTablePlanSource;
import com.huatai.datafoundry.backend.task.domain.repository.FetchTaskRepository;
import com.huatai.datafoundry.backend.task.domain.repository.TaskGroupRepository;
import com.huatai.datafoundry.backend.task.domain.repository.WideTableReadRepository;
import com.huatai.datafoundry.backend.task.domain.service.TaskPlanDomainService;
import com.huatai.datafoundry.backend.task.domain.service.TaskPlanDomainService.DimensionRange;
import com.huatai.datafoundry.backend.task.domain.service.TaskPlanDomainService.FetchTaskDraft;
import com.huatai.datafoundry.backend.task.domain.service.TaskPlanDomainService.IndicatorGroup;
import com.huatai.datafoundry.backend.task.domain.service.TaskPlanDomainService.ParameterRow;
import com.huatai.datafoundry.backend.task.domain.service.TaskPlanDomainService.PlanFetchTasksInput;
import com.huatai.datafoundry.backend.task.domain.service.TaskPlanDomainService.Scope;
import com.huatai.datafoundry.backend.targettable.application.query.service.TargetTableQueryService;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.time.LocalDateTime;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

@Service
public class TaskPlanAppService {
  private final WideTableReadRepository wideTableReadRepository;
  private final TaskGroupRepository taskGroupRepository;
  private final FetchTaskRepository fetchTaskRepository;
  private final TaskPlanDomainService taskPlanDomainService;
  private final TargetTableQueryService targetTableQueryService;
  private final WideTableRowQueryService wideTableRowQueryService;
  private final ObjectMapper objectMapper;

  private static final Pattern PLACEHOLDER_PATTERN = Pattern.compile("\\{([^{}]+)\\}");

  TaskPlanAppService(
      WideTableReadRepository wideTableReadRepository,
      TaskGroupRepository taskGroupRepository,
      FetchTaskRepository fetchTaskRepository,
      TaskPlanDomainService taskPlanDomainService,
      ObjectMapper objectMapper) {
    this(
        wideTableReadRepository,
        taskGroupRepository,
        fetchTaskRepository,
        taskPlanDomainService,
        null,
        null,
        objectMapper);
  }

  @Autowired
  public TaskPlanAppService(
      WideTableReadRepository wideTableReadRepository,
      TaskGroupRepository taskGroupRepository,
      FetchTaskRepository fetchTaskRepository,
      TaskPlanDomainService taskPlanDomainService,
      TargetTableQueryService targetTableQueryService,
      WideTableRowQueryService wideTableRowQueryService,
      ObjectMapper objectMapper) {
    this.wideTableReadRepository = wideTableReadRepository;
    this.taskGroupRepository = taskGroupRepository;
    this.fetchTaskRepository = fetchTaskRepository;
    this.taskPlanDomainService = taskPlanDomainService;
    this.targetTableQueryService = targetTableQueryService;
    this.wideTableRowQueryService = wideTableRowQueryService;
    this.objectMapper = objectMapper;
  }

  public TrialRunResult createTrialRun(
      String requirementId,
      String wideTableId,
      List<String> businessDates,
      List<String> rowBindingKeys,
      Integer maxRows,
      String operator) {
    if (wideTableId == null || wideTableId.trim().isEmpty()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "wideTableId is required");
    }

    WideTablePlanSource wideTable =
        wideTableReadRepository.getByIdForRequirement(requirementId, wideTableId);
    if (wideTable == null) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Wide table not found");
    }
    if (wideTableRowQueryService == null) {
      throw new ResponseStatusException(HttpStatus.NOT_IMPLEMENTED, "Wide table rows are unavailable");
    }

    List<WideTableRowReadDto> allRows = wideTableRowQueryService.listByWideTableId(wideTableId);
    if (allRows == null || allRows.isEmpty()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No preview rows available for trial run");
    }

    int currentPlanVersion = 0;
    for (WideTableRowReadDto row : allRows) {
      if (row != null && row.getPlanVersion() != null) {
        currentPlanVersion = Math.max(currentPlanVersion, row.getPlanVersion().intValue());
      }
    }

    List<WideTableRowReadDto> scopedRows = new ArrayList<WideTableRowReadDto>();
    for (WideTableRowReadDto row : allRows) {
      if (row == null) {
        continue;
      }
      if (currentPlanVersion > 0 && row.getPlanVersion() != null && row.getPlanVersion().intValue() != currentPlanVersion) {
        continue;
      }
      scopedRows.add(row);
    }

    Set<String> selectedBusinessDates = normalizeNonEmptySet(businessDates);
    Set<String> selectedRowBindingKeys = normalizeNonEmptySet(rowBindingKeys);
    List<WideTableRowReadDto> matchedRows = new ArrayList<WideTableRowReadDto>();
    for (WideTableRowReadDto row : scopedRows) {
      if (!selectedRowBindingKeys.isEmpty()) {
        String rowBindingKey = row.getRowBindingKey() != null ? row.getRowBindingKey().trim() : "";
        if (rowBindingKey.isEmpty() || !selectedRowBindingKeys.contains(rowBindingKey)) {
          continue;
        }
      }
      if (!selectedBusinessDates.isEmpty()) {
        String businessDate = row.getBusinessDate() != null ? row.getBusinessDate().trim() : "";
        if (businessDate.isEmpty() || !selectedBusinessDates.contains(businessDate)) {
          continue;
        }
      }
      matchedRows.add(row);
    }

    if (matchedRows.isEmpty()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No rows matched the selected trial scope");
    }

    int effectiveMaxRows = maxRows != null && maxRows.intValue() > 0 ? maxRows.intValue() : 20;
    if (matchedRows.size() > effectiveMaxRows) {
      matchedRows = new ArrayList<WideTableRowReadDto>(matchedRows.subList(0, effectiveMaxRows));
    }

    List<IndicatorGroup> indicatorGroups = parseIndicatorGroups(wideTable.getIndicatorGroupsJson(), wideTable.getId());
    if (indicatorGroups == null || indicatorGroups.isEmpty()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No indicator groups available for trial run");
    }
    Map<String, IndicatorGroup> indicatorGroupById = new HashMap<String, IndicatorGroup>();
    for (IndicatorGroup group : indicatorGroups) {
      if (group != null && group.id != null && !group.id.trim().isEmpty()) {
        indicatorGroupById.put(group.id, group);
      }
    }

    int planVersion = currentPlanVersion > 0 ? currentPlanVersion : 1;
    int schemaVersion = wideTable.getSchemaVersion() != null ? wideTable.getSchemaVersion().intValue() : 1;
    LocalDateTime now = LocalDateTime.now();
    String batchId = buildTrialBatchId(wideTableId, now);
    String effectiveOperator = operator != null && !operator.trim().isEmpty() ? operator.trim() : "system";

    LinkedHashMap<String, List<WideTableRowReadDto>> rowsByBusinessDate = new LinkedHashMap<String, List<WideTableRowReadDto>>();
    for (WideTableRowReadDto row : matchedRows) {
      String businessDate = row.getBusinessDate() != null ? row.getBusinessDate().trim() : "";
      if (!rowsByBusinessDate.containsKey(businessDate)) {
        rowsByBusinessDate.put(businessDate, new ArrayList<WideTableRowReadDto>());
      }
      rowsByBusinessDate.get(businessDate).add(row);
    }

    List<TaskGroup> taskGroups = new ArrayList<TaskGroup>();
    List<FetchTask> fetchTasks = new ArrayList<FetchTask>();
    int sortOrder = 0;
    for (Map.Entry<String, List<WideTableRowReadDto>> entry : rowsByBusinessDate.entrySet()) {
      String businessDate = entry.getKey();
      List<ParameterRow> parameterRows = buildTrialParameterRows(entry.getValue());
      if (parameterRows.isEmpty()) {
        continue;
      }
      for (IndicatorGroup indicatorGroup : indicatorGroups) {
        TaskGroup taskGroup = new TaskGroup();
        taskGroup.setId(buildTrialTaskGroupId(wideTableId, businessDate, indicatorGroup.id, now, sortOrder));
        taskGroup.setSortOrder(sortOrder++);
        taskGroup.setRequirementId(requirementId);
        taskGroup.setWideTableId(wideTableId);
        taskGroup.setBatchId(batchId);
        taskGroup.setBusinessDate(businessDate);
        taskGroup.setSourceType("manual");
        taskGroup.setStatus("pending");
        taskGroup.setPlanVersion(planVersion);
        taskGroup.setGroupKind("baseline");
        taskGroup.setPartitionType(indicatorGroups.size() > 1 ? "indicator_group" : "trial");
        taskGroup.setPartitionKey(indicatorGroups.size() > 1 ? indicatorGroup.id : null);
        taskGroup.setPartitionLabel(indicatorGroups.size() > 1 ? indicatorGroup.name : null);
        taskGroup.setCompletedTasks(0);
        taskGroup.setFailedTasks(0);
        taskGroup.setTriggeredBy("trial");
        taskGroup.setCreatedAt(now);
        taskGroup.setUpdatedAt(now);

        PlanFetchTasksInput input = new PlanFetchTasksInput();
        input.taskGroupId = taskGroup.getId();
        input.businessDate = businessDate;
        input.planVersion = planVersion;
        input.schemaVersion = schemaVersion;
        input.partitionKey = taskGroup.getPartitionKey();
        input.parameterRows = parameterRows;
        input.indicatorGroups = indicatorGroups;

        List<FetchTaskDraft> drafts = taskPlanDomainService.planFetchTasks(input);
        taskGroup.setTotalTasks(drafts.size());
        taskGroups.add(taskGroup);

        for (FetchTaskDraft draft : drafts) {
          FetchTask ft = new FetchTask();
          ft.setId(draft.id);
          ft.setSortOrder(draft.sortOrder);
          ft.setRequirementId(requirementId);
          ft.setWideTableId(wideTableId);
          ft.setTaskGroupId(taskGroup.getId());
          ft.setBatchId(batchId);
          ft.setRowId(draft.rowId);
          ft.setIndicatorGroupId(draft.indicatorGroupId);
          ft.setIndicatorGroupName(draft.indicatorGroupName);
          ft.setName(draft.name);
          ft.setSchemaVersion(draft.schemaVersion);
          ft.setExecutionMode(draft.executionMode);
          ft.setIndicatorKeysJson(writeJson(draft.indicatorKeys));
          ft.setDimensionValuesJson(writeJson(draft.dimensionValues));
          IndicatorGroup promptGroup = indicatorGroupById.get(draft.indicatorGroupId);
          String templateSnapshot = promptGroup != null ? promptGroup.promptTemplate : null;
          ft.setPromptTemplateSnapshot(templateSnapshot);
          ft.setRenderedPromptText(renderPromptTemplate(templateSnapshot, draft.dimensionValues));
          ft.setBusinessDate(draft.businessDate);
          ft.setStatus("pending");
          ft.setCanRerun(Boolean.TRUE);
          ft.setOwner(effectiveOperator);
          ft.setPlanVersion(draft.planVersion);
          ft.setRowBindingKey(draft.rowBindingKey);
          ft.setCreatedAt(now);
          ft.setUpdatedAt(now);
          fetchTasks.add(ft);
        }
      }
    }

    if (taskGroups.isEmpty() || fetchTasks.isEmpty()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No trial tasks generated");
    }

    taskGroupRepository.upsertBatch(taskGroups);
    fetchTaskRepository.upsertBatch(fetchTasks);

    TrialRunResult result = new TrialRunResult();
    result.batchId = batchId;
    result.wideTableId = wideTableId;
    result.planVersion = planVersion;
    result.semanticTimeAxis = wideTable.getSemanticTimeAxis();
    result.coverageMode = wideTable.getCollectionCoverageMode();
    result.triggeredBy = "trial";
    result.operator = effectiveOperator;
    result.createdAt = now;
    result.startBusinessDate = taskGroups.get(0).getBusinessDate();
    result.endBusinessDate = taskGroups.get(taskGroups.size() - 1).getBusinessDate();
    result.rowCount = matchedRows.size();
    result.taskCount = fetchTasks.size();
    result.taskGroups = taskGroups;
    result.fetchTasks = fetchTasks;
    return result;
  }

  public void ensureDefaultTaskGroupsOnSubmit(String requirementId) {
    if (taskGroupRepository.countByRequirement(requirementId) > 0) {
      return;
    }

    WideTablePlanSource wideTable = wideTableReadRepository.getPrimaryByRequirement(requirementId);
    if (wideTable == null) {
      return;
    }

    Scope scope = parseScope(wideTable.getScopeJson());
    if (scope.businessDateStart == null || scope.businessDateStart.isEmpty()) {
      return;
    }

    List<ParameterRow> parameterRows = resolveScopeParameterRows(scope);
    int dimensionCombinationCount = Math.max(1, parameterRows.isEmpty() ? scope.dimensionCombinationCount : parameterRows.size());
    int planVersion = 1;
    List<String> businessDates = taskPlanDomainService.buildBusinessDates(scope);
    int sortOrder = 0;
    String wideTableId = wideTable.getId();

    List<TaskGroup> taskGroups = new ArrayList<TaskGroup>(businessDates.size());
    for (String businessDate : businessDates) {
      TaskGroup tg = new TaskGroup();
      tg.setId(taskPlanDomainService.buildTaskGroupId(wideTableId, businessDate, null, planVersion));
      tg.setSortOrder(sortOrder++);
      tg.setRequirementId(requirementId);
      tg.setWideTableId(wideTableId);
      tg.setBusinessDate(businessDate);
      tg.setSourceType(businessDate.compareTo(todayMonth()) <= 0 ? "backfill" : "scheduled");
      tg.setStatus("pending");
      tg.setPlanVersion(planVersion);
      tg.setGroupKind("baseline");
      tg.setPartitionType("business_date");
      tg.setPartitionKey(null);
      tg.setPartitionLabel(null);
      tg.setTotalTasks(dimensionCombinationCount);
      tg.setCompletedTasks(0);
      tg.setFailedTasks(0);
      tg.setTriggeredBy(businessDate.compareTo(todayMonth()) <= 0 ? "backfill" : "schedule");
      taskGroups.add(tg);
    }
    if (!taskGroups.isEmpty()) {
      taskGroupRepository.upsertBatch(taskGroups);
    }
  }

  public void persistPlanTaskGroups(String requirementId, String wideTableId, List<Map<String, Object>> rawTaskGroups) {
    persistPlanTaskGroups(requirementId, wideTableId, rawTaskGroups, false);
  }

  public void persistPlanTaskGroups(
      String requirementId,
      String wideTableId,
      List<Map<String, Object>> rawTaskGroups,
      boolean invalidateMissing) {
    if (rawTaskGroups == null || rawTaskGroups.isEmpty()) return;
    List<TaskGroup> records = new ArrayList<TaskGroup>(rawTaskGroups.size());
    int idx = 0;
    for (Map<String, Object> raw : rawTaskGroups) {
      TaskGroup tg = new TaskGroup();
      tg.setId(String.valueOf(raw.get("id")));
      tg.setSortOrder(idx++);
      tg.setRequirementId(requirementId);
      tg.setWideTableId(wideTableId);
      tg.setBatchId(asString(raw.get("batch_id")));
      tg.setBusinessDate(asString(raw.get("business_date")));
      tg.setSourceType(asString(raw.get("source_type")));
      tg.setStatus(asStringOr(raw.get("status"), "pending"));
      tg.setScheduleRuleId(asString(raw.get("schedule_rule_id")));
      tg.setBackfillRequestId(asString(raw.get("backfill_request_id")));
      tg.setPlanVersion(asIntOr(raw.get("plan_version"), 1));
      tg.setGroupKind(asString(raw.get("group_kind")));
      tg.setPartitionType(asString(raw.get("partition_type")));
      tg.setPartitionKey(asString(raw.get("partition_key")));
      tg.setPartitionLabel(asString(raw.get("partition_label")));
      tg.setTotalTasks(asIntOr(raw.get("total_tasks"), 0));
      tg.setCompletedTasks(asIntOr(raw.get("completed_tasks"), 0));
      tg.setFailedTasks(asIntOr(raw.get("failed_tasks"), 0));
      tg.setTriggeredBy(asString(raw.get("triggered_by")));
      if (tg.getId() == null || tg.getId().trim().isEmpty()) {
        continue;
      }
      records.add(tg);
    }
    if (records.isEmpty()) return;

    List<String> ids = new ArrayList<String>(records.size());
    Set<String> idSet = new LinkedHashSet<String>();
    for (TaskGroup r : records) {
      ids.add(r.getId());
      idSet.add(r.getId());
    }
    Map<String, TaskGroup> existingById = new LinkedHashMap<String, TaskGroup>();
    List<TaskGroup> existing = taskGroupRepository.listByIds(ids);
    if (existing != null) {
      for (TaskGroup e : existing) {
        if (e != null && e.getId() != null) {
          existingById.put(e.getId(), e);
        }
      }
    }

    for (TaskGroup r : records) {
      TaskGroup e = existingById.get(r.getId());
      if (e == null) {
        continue;
      }
      // Defensive: prevent accidental cross-aggregate overwrite when ids collide.
      if (e.getRequirementId() != null && !e.getRequirementId().equals(requirementId)) {
        throw new ResponseStatusException(HttpStatus.CONFLICT, "TaskGroup belongs to another requirement");
      }
      if (e.getWideTableId() != null && !e.getWideTableId().equals(wideTableId)) {
        throw new ResponseStatusException(HttpStatus.CONFLICT, "TaskGroup belongs to another wide table");
      }

      // Idempotency/safety: do not regress status/counters when plan is re-applied.
      String mergedStatus = preferMoreAdvancedStatus(e.getStatus(), r.getStatus());
      r.setStatus(mergedStatus);
      r.setPlanVersion(maxInt(e.getPlanVersion(), r.getPlanVersion()));
      r.setTotalTasks(maxInt(e.getTotalTasks(), r.getTotalTasks()));
      r.setCompletedTasks(maxInt(e.getCompletedTasks(), r.getCompletedTasks()));
      r.setFailedTasks(maxInt(e.getFailedTasks(), r.getFailedTasks()));
    }

    taskGroupRepository.upsertBatch(records);

    if (invalidateMissing) {
      invalidateMissingPendingTaskGroups(requirementId, wideTableId, idSet);
    }
  }

  private void invalidateMissingPendingTaskGroups(String requirementId, String wideTableId, Set<String> keepIds) {
    List<TaskGroup> all = taskGroupRepository.listByRequirementAndWideTable(requirementId, wideTableId);
    if (all == null || all.isEmpty()) {
      return;
    }
    List<String> toInvalidate = new ArrayList<String>();
    for (TaskGroup tg : all) {
      if (tg == null || tg.getId() == null) {
        continue;
      }
      if (keepIds.contains(tg.getId())) {
        continue;
      }
      if (!"pending".equalsIgnoreCase(asString(tg.getStatus()))) {
        continue;
      }
      toInvalidate.add(tg.getId());
    }
    if (toInvalidate.isEmpty()) {
      return;
    }
    // Batch defensively to avoid huge IN lists.
    int batchSize = 200;
    for (int i = 0; i < toInvalidate.size(); i += batchSize) {
      int end = Math.min(toInvalidate.size(), i + batchSize);
      taskGroupRepository.updateStatusByIds(toInvalidate.subList(i, end), "invalidated");
    }
  }

  private static String preferMoreAdvancedStatus(String existing, String incoming) {
    if (statusRank(existing) >= statusRank(incoming)) {
      return existing;
    }
    return incoming;
  }

  private static int statusRank(String status) {
    if (status == null) return 0;
    String s = status.trim().toLowerCase();
    if ("pending".equals(s)) return 1;
    if ("running".equals(s)) return 2;
    if ("failed".equals(s)) return 3;
    if ("completed".equals(s)) return 4;
    if ("invalidated".equals(s)) return 5;
    return 1;
  }

  private static Integer maxInt(Integer a, Integer b) {
    if (a == null) return b;
    if (b == null) return a;
    return a.intValue() >= b.intValue() ? a : b;
  }

  public void ensureFetchTasksForTaskGroup(TaskGroup taskGroup) {
    if (taskGroup == null) return;
    if (fetchTaskRepository.countByTaskGroup(taskGroup.getId()) > 0) {
      return;
    }

    WideTablePlanSource wideTable =
        wideTableReadRepository.getByIdForRequirement(taskGroup.getRequirementId(), taskGroup.getWideTableId());
    if (wideTable == null) {
      return;
    }

    Scope scope = parseScope(wideTable.getScopeJson());
    List<IndicatorGroup> indicatorGroups = parseIndicatorGroups(wideTable.getIndicatorGroupsJson(), wideTable.getId());
    IndicatorGroup indicatorGroup = resolveIndicatorGroupForTaskGroup(taskGroup, indicatorGroups);
    if (indicatorGroup == null) {
      return;
    }
    Map<String, IndicatorGroup> indicatorGroupById = new HashMap<String, IndicatorGroup>();
    for (IndicatorGroup group : indicatorGroups) {
      if (group != null && group.id != null && !group.id.trim().isEmpty()) {
        indicatorGroupById.put(group.id, group);
      }
    }

    PlanFetchTasksInput input = new PlanFetchTasksInput();
    input.taskGroupId = taskGroup.getId();
    input.businessDate = taskGroup.getBusinessDate();
    input.planVersion = taskGroup.getPlanVersion() != null ? taskGroup.getPlanVersion() : 1;
    input.schemaVersion = wideTable.getSchemaVersion() != null ? wideTable.getSchemaVersion() : 1;
    input.partitionKey = taskGroup.getPartitionKey();
    input.dimensions = scope.dimensions;
    input.parameterRows = resolveParameterRowsForTaskGroup(resolveScopeParameterRows(scope), taskGroup.getBusinessDate());
    input.indicatorGroups = indicatorGroups;

    List<FetchTaskDraft> drafts = taskPlanDomainService.planFetchTasks(input);
    if (drafts.isEmpty()) {
      return;
    }

    List<FetchTask> tasks = new ArrayList<FetchTask>(drafts.size());
    for (FetchTaskDraft draft : drafts) {
      FetchTask ft = new FetchTask();
      ft.setId(draft.id);
      ft.setSortOrder(draft.sortOrder);
      ft.setRequirementId(taskGroup.getRequirementId());
      ft.setWideTableId(taskGroup.getWideTableId());
      ft.setTaskGroupId(taskGroup.getId());
      ft.setBatchId(taskGroup.getBatchId());
      ft.setRowId(draft.rowId);
      ft.setIndicatorGroupId(draft.indicatorGroupId);
      ft.setIndicatorGroupName(draft.indicatorGroupName);
      ft.setName(draft.name);
      ft.setSchemaVersion(draft.schemaVersion);
      ft.setExecutionMode(draft.executionMode);
      ft.setIndicatorKeysJson(writeJson(draft.indicatorKeys));
      ft.setDimensionValuesJson(writeJson(draft.dimensionValues));
      IndicatorGroup promptGroup = indicatorGroupById.get(draft.indicatorGroupId);
      String templateSnapshot = promptGroup != null ? promptGroup.promptTemplate : null;
      ft.setPromptTemplateSnapshot(templateSnapshot);
      ft.setRenderedPromptText(renderPromptTemplate(templateSnapshot, draft.dimensionValues));
      ft.setBusinessDate(draft.businessDate);
      ft.setStatus(draft.status);
      ft.setCanRerun(draft.canRerun);
      ft.setPlanVersion(draft.planVersion);
      ft.setRowBindingKey(draft.rowBindingKey);
      tasks.add(ft);
    }

    fetchTaskRepository.upsertBatch(tasks);
    taskGroupRepository.upsert(withTotals(taskGroup, tasks.size()));
  }

  private TaskGroup withTotals(TaskGroup taskGroup, int total) {
    TaskGroup tg = new TaskGroup();
    tg.setId(taskGroup.getId());
    tg.setSortOrder(taskGroup.getSortOrder());
    tg.setRequirementId(taskGroup.getRequirementId());
    tg.setWideTableId(taskGroup.getWideTableId());
    tg.setBatchId(taskGroup.getBatchId());
    tg.setBusinessDate(taskGroup.getBusinessDate());
    tg.setSourceType(taskGroup.getSourceType());
    tg.setStatus(taskGroup.getStatus());
    tg.setScheduleRuleId(taskGroup.getScheduleRuleId());
    tg.setBackfillRequestId(taskGroup.getBackfillRequestId());
    tg.setPlanVersion(taskGroup.getPlanVersion());
    tg.setGroupKind(taskGroup.getGroupKind());
    tg.setPartitionType(taskGroup.getPartitionType());
    tg.setPartitionKey(taskGroup.getPartitionKey());
    tg.setPartitionLabel(taskGroup.getPartitionLabel());
    tg.setTotalTasks(total);
    tg.setCompletedTasks(taskGroup.getCompletedTasks());
    tg.setFailedTasks(taskGroup.getFailedTasks());
    tg.setTriggeredBy(taskGroup.getTriggeredBy());
    return tg;
  }

  private List<ParameterRow> buildTrialParameterRows(List<WideTableRowReadDto> rows) {
    List<ParameterRow> parameterRows = new ArrayList<ParameterRow>();
    if (rows == null) {
      return parameterRows;
    }
    for (WideTableRowReadDto row : rows) {
      if (row == null || row.getDimensionValues() == null || row.getDimensionValues().isEmpty()) {
        continue;
      }
      ParameterRow parameterRow = new ParameterRow();
      parameterRow.rowId = row.getRowId() != null ? row.getRowId().intValue() : (parameterRows.size() + 1);
      parameterRow.businessDate = row.getBusinessDate();
      for (Map.Entry<String, Object> entry : row.getDimensionValues().entrySet()) {
        if (entry.getKey() == null) {
          continue;
        }
        String key = entry.getKey().trim();
        if (key.isEmpty()) {
          continue;
        }
        parameterRow.values.put(key, entry.getValue() == null ? "" : String.valueOf(entry.getValue()));
      }
      if (!parameterRow.values.isEmpty()) {
        parameterRows.add(parameterRow);
      }
    }
    return parameterRows;
  }

  private Set<String> normalizeNonEmptySet(List<String> rawValues) {
    if (rawValues == null || rawValues.isEmpty()) {
      return Collections.emptySet();
    }
    Set<String> normalized = new LinkedHashSet<String>();
    for (String rawValue : rawValues) {
      if (rawValue == null) {
        continue;
      }
      String value = rawValue.trim();
      if (!value.isEmpty()) {
        normalized.add(value);
      }
    }
    return normalized;
  }

  private String buildTrialBatchId(String wideTableId, LocalDateTime now) {
    String timeToken = now.toString().replace("-", "").replace(":", "").replace("T", "").replace(".", "");
    return String.format("CB-TRIAL-%s-%s", wideTableId, timeToken);
  }

  private String buildTrialTaskGroupId(
      String wideTableId,
      String businessDate,
      String indicatorGroupId,
      LocalDateTime now,
      int index) {
    String dateToken = (businessDate != null && !businessDate.trim().isEmpty())
        ? businessDate.replace("-", "")
        : "snapshot";
    String groupToken = indicatorGroupId != null && !indicatorGroupId.trim().isEmpty()
        ? indicatorGroupId.trim()
        : "default";
    String timeToken = now.toString().replace("-", "").replace(":", "").replace("T", "").replace(".", "");
    return String.format("TG-TRIAL-%s-%s-%s-%d", wideTableId, dateToken, groupToken, index + 1)
        + "-" + timeToken;
  }

  private Scope parseScope(String scopeJson) {
    Scope scope = new Scope();
    if (scopeJson == null || scopeJson.trim().isEmpty()) return scope;
    try {
      Map<?, ?> raw = objectMapper.readValue(scopeJson, Map.class);
      Object businessDate = raw.get("business_date");
      if (businessDate instanceof Map) {
        Map<?, ?> biz = (Map<?, ?>) businessDate;
        scope.businessDateColumnKey = asString(biz.get("column_key"));
        scope.businessDateStart = asString(biz.get("start"));
        scope.businessDateEnd = asString(biz.get("end"));
        scope.frequency = asString(biz.get("frequency"));
      }
      Object parameterSourceObj = raw.get("parameter_source");
      if (parameterSourceObj instanceof Map) {
        Map<?, ?> parameterSource = (Map<?, ?>) parameterSourceObj;
        scope.parameterSourceMode = asString(parameterSource.get("mode"));
        scope.parameterSourceSql = asString(parameterSource.get("sql"));
        scope.parameterSourceMaxRows = asIntOr(parameterSource.get("max_rows"), 1000);
      }
      Object dims = raw.get("dimensions");
      if (dims instanceof List) {
        List<?> list = (List<?>) dims;
        for (Object item : list) {
          if (!(item instanceof Map)) continue;
          Map<?, ?> d = (Map<?, ?>) item;
          String key = asString(d.get("column_key"));
          Object valuesObj = d.get("values");
          List<String> values = new ArrayList<String>();
          if (valuesObj instanceof List) {
            for (Object v : (List<?>) valuesObj) {
              if (v != null) values.add(String.valueOf(v));
            }
          }
          if (key != null && !key.isEmpty()) {
            scope.dimensions.add(new DimensionRange(key, values));
          }
        }
      }
      Object parameterRowsObj = raw.get("parameter_rows");
      if (parameterRowsObj instanceof List) {
        List<?> list = (List<?>) parameterRowsObj;
        int autoRowId = 1;
        for (Object item : list) {
          if (!(item instanceof Map)) continue;
          Map<?, ?> row = (Map<?, ?>) item;
          ParameterRow parameterRow = new ParameterRow();
          parameterRow.rowId = asIntOr(row.get("row_id"), autoRowId++);
          parameterRow.businessDate = asString(row.get("business_date"));
          Object valuesObj = row.get("values");
          if (!(valuesObj instanceof Map)) {
            valuesObj = row.get("parameter_values");
          }
          if (valuesObj instanceof Map) {
            Map<?, ?> valuesMap = (Map<?, ?>) valuesObj;
            for (Map.Entry<?, ?> entry : valuesMap.entrySet()) {
              if (entry.getKey() == null) continue;
              String k = String.valueOf(entry.getKey()).trim();
              if (k.isEmpty()) continue;
              String v = entry.getValue() == null ? "" : String.valueOf(entry.getValue());
              parameterRow.values.put(k, v);
            }
          }
          scope.parameterRows.add(parameterRow);
        }
      }
      scope.dimensionCombinationCount = taskPlanDomainService.calculateDimensionCombinationCount(scope.dimensions);
      return scope;
    } catch (Exception ex) {
      return scope;
    }
  }

  private List<ParameterRow> resolveScopeParameterRows(Scope scope) {
    if (scope == null) {
      return Collections.emptyList();
    }
    if (!"sql".equalsIgnoreCase(asString(scope.parameterSourceMode))) {
      return scope.parameterRows != null ? scope.parameterRows : Collections.<ParameterRow>emptyList();
    }
    if (scope.parameterSourceSql == null || scope.parameterSourceSql.trim().isEmpty()) {
      return Collections.emptyList();
    }
    if (targetTableQueryService == null) {
      return Collections.emptyList();
    }
    Map<String, Object> preview =
        targetTableQueryService.previewSelectSql(scope.parameterSourceSql, Integer.valueOf(scope.parameterSourceMaxRows));
    Object rowsObj = preview.get("rows");
    if (!(rowsObj instanceof List)) {
      return Collections.emptyList();
    }
    List<ParameterRow> out = new ArrayList<ParameterRow>();
    int rowId = 1;
    String businessDateKey = scope.businessDateColumnKey != null && !scope.businessDateColumnKey.trim().isEmpty()
        ? scope.businessDateColumnKey.trim()
        : "business_date";
    for (Object item : (List<?>) rowsObj) {
      if (!(item instanceof Map)) {
        continue;
      }
      Map<?, ?> raw = (Map<?, ?>) item;
      ParameterRow row = new ParameterRow();
      row.rowId = rowId++;
      for (Map.Entry<?, ?> entry : raw.entrySet()) {
        if (entry.getKey() == null) {
          continue;
        }
        String key = String.valueOf(entry.getKey()).trim();
        if (key.isEmpty()) {
          continue;
        }
        String value = entry.getValue() == null ? "" : String.valueOf(entry.getValue());
        if (key.equalsIgnoreCase(businessDateKey) || "business_date".equalsIgnoreCase(key)) {
          row.businessDate = value;
        } else {
          row.values.put(key, value);
        }
      }
      out.add(row);
    }
    return out;
  }

  private List<ParameterRow> resolveParameterRowsForTaskGroup(List<ParameterRow> rows, String taskGroupBusinessDate) {
    if (rows == null || rows.isEmpty()) {
      return Collections.emptyList();
    }
    List<ParameterRow> matched = new ArrayList<ParameterRow>();
    for (ParameterRow row : rows) {
      if (row == null) continue;
      String rowBizDate = row.businessDate != null ? row.businessDate.trim() : "";
      String groupBizDate = taskGroupBusinessDate != null ? taskGroupBusinessDate.trim() : "";
      if (rowBizDate.isEmpty() || groupBizDate.isEmpty() || rowBizDate.equals(groupBizDate)) {
        matched.add(row);
      }
    }
    return matched;
  }

  private List<IndicatorGroup> parseIndicatorGroups(String indicatorGroupsJson, String wideTableId) {
    if (indicatorGroupsJson == null || indicatorGroupsJson.trim().isEmpty()) {
      IndicatorGroup fallback = new IndicatorGroup();
      fallback.id = "ig_default_" + (wideTableId != null ? wideTableId : "wide_table");
      fallback.name = "default";
      return Collections.singletonList(fallback);
    }
    try {
      List<?> list = objectMapper.readValue(indicatorGroupsJson, List.class);
      List<IndicatorGroup> out = new ArrayList<IndicatorGroup>();
      for (Object item : list) {
        if (!(item instanceof Map)) continue;
        Map<?, ?> raw = (Map<?, ?>) item;
        IndicatorGroup group = new IndicatorGroup();
        group.id = asString(raw.get("id"));
        group.name = asString(raw.get("name"));
        group.promptTemplate = asString(raw.get("prompt_template"));
        if (group.promptTemplate == null) {
          group.promptTemplate = asString(raw.get("promptTemplate"));
        }

        Object cols = raw.get("indicator_keys");
        if (!(cols instanceof List)) {
          cols = raw.get("indicator_columns");
        }
        if (!(cols instanceof List)) {
          cols = raw.get("indicatorColumns");
        }
        if (cols instanceof List) {
          for (Object c : (List<?>) cols) {
            if (c != null) group.indicatorColumns.add(String.valueOf(c));
          }
        }
        if (group.id != null && !group.id.isEmpty()) {
          out.add(group);
        }
      }
      if (out.isEmpty()) {
        IndicatorGroup fallback = new IndicatorGroup();
        fallback.id = "ig_default_" + (wideTableId != null ? wideTableId : "wide_table");
        fallback.name = "default";
        return Collections.singletonList(fallback);
      }
      return out;
    } catch (Exception ex) {
      IndicatorGroup fallback = new IndicatorGroup();
      fallback.id = "ig_default_" + (wideTableId != null ? wideTableId : "wide_table");
      fallback.name = "default";
      return Collections.singletonList(fallback);
    }
  }

  private IndicatorGroup resolveIndicatorGroupForTaskGroup(TaskGroup taskGroup, List<IndicatorGroup> groups) {
    if (groups == null || groups.isEmpty()) {
      return null;
    }
    if (groups.size() > 1 && taskGroup.getPartitionKey() != null) {
      for (IndicatorGroup g : groups) {
        if (taskGroup.getPartitionKey().equals(g.id)) return g;
      }
    }
    return groups.get(0);
  }

  private String renderPromptTemplate(String promptTemplate, Map<String, String> parameterValues) {
    if (promptTemplate == null) {
      return null;
    }
    if (parameterValues == null || parameterValues.isEmpty()) {
      return promptTemplate;
    }

    Matcher matcher = PLACEHOLDER_PATTERN.matcher(promptTemplate);
    if (!matcher.find()) {
      return promptTemplate;
    }

    Map<String, String> normalized = new HashMap<String, String>();
    for (Map.Entry<String, String> entry : parameterValues.entrySet()) {
      if (entry == null || entry.getKey() == null) {
        continue;
      }
      String key = entry.getKey().trim();
      if (key.isEmpty()) {
        continue;
      }
      normalized.put(key.toLowerCase(Locale.ROOT), entry.getValue() == null ? "" : entry.getValue());
    }

    StringBuffer sb = new StringBuffer();
    do {
      String rawKey = matcher.group(1);
      String lookupKey = rawKey != null ? rawKey.trim().toLowerCase(Locale.ROOT) : "";
      String value = normalized.get(lookupKey);
      if (value == null) {
        matcher.appendReplacement(sb, Matcher.quoteReplacement(matcher.group(0)));
      } else {
        matcher.appendReplacement(sb, Matcher.quoteReplacement(value));
      }
    } while (matcher.find());
    matcher.appendTail(sb);
    return sb.toString();
  }

  private String writeJson(Object value) {
    if (value == null) return null;
    try {
      return objectMapper.writeValueAsString(value);
    } catch (Exception ex) {
      return null;
    }
  }

  private static String todayMonth() {
    return TaskPlanServiceTime.todayMonth();
  }

  private static String asString(Object value) {
    return value == null ? null : String.valueOf(value);
  }

  private static String asStringOr(Object value, String fallback) {
    String s = asString(value);
    return (s == null || s.trim().isEmpty()) ? fallback : s;
  }

  private static int asIntOr(Object value, int fallback) {
    if (value instanceof Number) return ((Number) value).intValue();
    try {
      return value == null ? fallback : Integer.parseInt(String.valueOf(value));
    } catch (Exception ex) {
      return fallback;
    }
  }

  /** Isolated time helper for deterministic tests later. */
  static class TaskPlanServiceTime {
    static String todayMonth() {
      java.time.format.DateTimeFormatter fmt = java.time.format.DateTimeFormatter.ofPattern("yyyy-MM");
      return fmt.format(java.time.LocalDate.now());
    }
  }

  public static class TrialRunResult {
    public String batchId;
    public String wideTableId;
    public Integer planVersion;
    public String semanticTimeAxis;
    public String coverageMode;
    public String triggeredBy;
    public String operator;
    public String startBusinessDate;
    public String endBusinessDate;
    public Integer rowCount;
    public Integer taskCount;
    public LocalDateTime createdAt;
    public List<TaskGroup> taskGroups = new ArrayList<TaskGroup>();
    public List<FetchTask> fetchTasks = new ArrayList<FetchTask>();
  }
}
