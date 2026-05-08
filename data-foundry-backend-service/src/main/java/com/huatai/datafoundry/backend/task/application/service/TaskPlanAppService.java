package com.huatai.datafoundry.backend.task.application.service;

import com.fasterxml.jackson.databind.ObjectMapper;
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
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

@Service
public class TaskPlanAppService {
  private final WideTableReadRepository wideTableReadRepository;
  private final TaskGroupRepository taskGroupRepository;
  private final FetchTaskRepository fetchTaskRepository;
  private final TaskPlanDomainService taskPlanDomainService;
  private final ObjectMapper objectMapper;

  public TaskPlanAppService(
      WideTableReadRepository wideTableReadRepository,
      TaskGroupRepository taskGroupRepository,
      FetchTaskRepository fetchTaskRepository,
      TaskPlanDomainService taskPlanDomainService,
      ObjectMapper objectMapper) {
    this.wideTableReadRepository = wideTableReadRepository;
    this.taskGroupRepository = taskGroupRepository;
    this.fetchTaskRepository = fetchTaskRepository;
    this.taskPlanDomainService = taskPlanDomainService;
    this.objectMapper = objectMapper;
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

    int dimensionCombinationCount = Math.max(1, scope.parameterRows.isEmpty() ? scope.dimensionCombinationCount : scope.parameterRows.size());
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

    PlanFetchTasksInput input = new PlanFetchTasksInput();
    input.taskGroupId = taskGroup.getId();
    input.businessDate = taskGroup.getBusinessDate();
    input.planVersion = taskGroup.getPlanVersion() != null ? taskGroup.getPlanVersion() : 1;
    input.schemaVersion = wideTable.getSchemaVersion() != null ? wideTable.getSchemaVersion() : 1;
    input.partitionKey = taskGroup.getPartitionKey();
    input.dimensions = scope.dimensions;
    input.parameterRows = resolveParameterRowsForTaskGroup(scope.parameterRows, taskGroup.getBusinessDate());
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

  private Scope parseScope(String scopeJson) {
    Scope scope = new Scope();
    if (scopeJson == null || scopeJson.trim().isEmpty()) return scope;
    try {
      Map<?, ?> raw = objectMapper.readValue(scopeJson, Map.class);
      Object businessDate = raw.get("business_date");
      if (businessDate instanceof Map) {
        Map<?, ?> biz = (Map<?, ?>) businessDate;
        scope.businessDateStart = asString(biz.get("start"));
        scope.businessDateEnd = asString(biz.get("end"));
        scope.frequency = asString(biz.get("frequency"));
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
        Object cols = raw.get("indicator_columns");
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
}
