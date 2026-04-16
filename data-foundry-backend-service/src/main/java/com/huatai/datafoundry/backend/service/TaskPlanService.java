package com.huatai.datafoundry.backend.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.huatai.datafoundry.backend.persistence.FetchTaskMapper;
import com.huatai.datafoundry.backend.persistence.FetchTaskRecord;
import com.huatai.datafoundry.backend.persistence.TaskGroupMapper;
import com.huatai.datafoundry.backend.persistence.TaskGroupRecord;
import com.huatai.datafoundry.backend.persistence.WideTableMapper;
import com.huatai.datafoundry.backend.persistence.WideTableRecord;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

/**
 * Task plan service:
 * - Generate TaskGroup (task instances) on requirement submit / plan rebuild.
 * - Generate FetchTask (sub-task instances) lazily for a given TaskGroup.
 */
@Service
public class TaskPlanService {
  private static final DateTimeFormatter MONTH_FMT = DateTimeFormatter.ofPattern("yyyy-MM");

  private final WideTableMapper wideTableMapper;
  private final TaskGroupMapper taskGroupMapper;
  private final FetchTaskMapper fetchTaskMapper;
  private final ObjectMapper objectMapper;

  public TaskPlanService(
      WideTableMapper wideTableMapper,
      TaskGroupMapper taskGroupMapper,
      FetchTaskMapper fetchTaskMapper,
      ObjectMapper objectMapper) {
    this.wideTableMapper = wideTableMapper;
    this.taskGroupMapper = taskGroupMapper;
    this.fetchTaskMapper = fetchTaskMapper;
    this.objectMapper = objectMapper;
  }

  public void ensureDefaultTaskGroupsOnSubmit(String requirementId) {
    if (taskGroupMapper.countByRequirement(requirementId) > 0) {
      return;
    }

    WideTableRecord wideTable = wideTableMapper.getPrimaryByRequirement(requirementId);
    if (wideTable == null) {
      return;
    }

    Scope scope = parseScope(wideTable.getScopeJson());
    if (scope.businessDateStart == null || scope.businessDateStart.isEmpty()) {
      return;
    }

    int dimensionCombinationCount = Math.max(1, scope.dimensionCombinationCount);
    int planVersion = 1;
    List<String> businessDates = buildBusinessDates(scope);
    int sortOrder = 0;
    String wideTableId = wideTable.getId();

    for (String businessDate : businessDates) {
      TaskGroupRecord tg = new TaskGroupRecord();
      tg.setId(buildTaskGroupId(wideTableId, businessDate, null, planVersion));
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
      taskGroupMapper.upsert(tg);
    }
  }

  public void upsertPlanTaskGroups(String requirementId, String wideTableId, List<Map<String, Object>> rawTaskGroups) {
    if (rawTaskGroups == null) return;
    int idx = 0;
    for (Map<String, Object> raw : rawTaskGroups) {
      TaskGroupRecord tg = new TaskGroupRecord();
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
      taskGroupMapper.upsert(tg);
    }
  }

  public void ensureFetchTasksForTaskGroup(TaskGroupRecord taskGroup) {
    if (taskGroup == null) return;
    if (fetchTaskMapper.countByTaskGroup(taskGroup.getId()) > 0) {
      return;
    }

    WideTableRecord wideTable = wideTableMapper.getByIdForRequirement(taskGroup.getRequirementId(), taskGroup.getWideTableId());
    if (wideTable == null) {
      return;
    }
    Scope scope = parseScope(wideTable.getScopeJson());
    List<IndicatorGroup> indicatorGroups = parseIndicatorGroups(wideTable.getIndicatorGroupsJson(), wideTable.getId());
    IndicatorGroup indicatorGroup = resolveIndicatorGroupForTaskGroup(taskGroup, indicatorGroups);
    if (indicatorGroup == null) {
      // No indicator groups configured, nothing to build.
      return;
    }

    List<Map<String, String>> dimensionCombos = buildDimensionCombinations(scope.dimensions);
    if (dimensionCombos.isEmpty()) {
      dimensionCombos = Collections.singletonList(new HashMap<String, String>());
    }

    List<FetchTaskRecord> records = new ArrayList<FetchTaskRecord>();
    int sortOrder = 0;
    int planVersion = taskGroup.getPlanVersion() != null ? taskGroup.getPlanVersion() : 1;
    for (int i = 0; i < dimensionCombos.size(); i++) {
      int rowId = i + 1;
      Map<String, String> dim = dimensionCombos.get(i);
      String rowBindingKey = buildRowBindingKey(taskGroup.getBusinessDate(), dim);
      FetchTaskRecord ft = new FetchTaskRecord();
      ft.setId(String.format("ft_%s_%s_%d", taskGroup.getId(), indicatorGroup.id, rowId));
      ft.setSortOrder(sortOrder++);
      ft.setRequirementId(taskGroup.getRequirementId());
      ft.setWideTableId(taskGroup.getWideTableId());
      ft.setTaskGroupId(taskGroup.getId());
      ft.setBatchId(taskGroup.getBatchId());
      ft.setRowId(rowId);
      ft.setIndicatorGroupId(indicatorGroup.id);
      ft.setIndicatorGroupName(indicatorGroup.name);
      ft.setName(indicatorGroup.name);
      ft.setSchemaVersion(wideTable.getSchemaVersion() != null ? wideTable.getSchemaVersion() : 1);
      ft.setExecutionMode("normal");
      ft.setIndicatorKeysJson(writeJson(indicatorGroup.indicatorColumns));
      ft.setDimensionValuesJson(writeJson(dim));
      ft.setBusinessDate(taskGroup.getBusinessDate());
      ft.setStatus("pending");
      ft.setCanRerun(true);
      ft.setPlanVersion(planVersion);
      ft.setRowBindingKey(rowBindingKey);
      records.add(ft);
    }

    fetchTaskMapper.upsertBatch(records);
    // Update task group totals based on actual generated count (safe if different).
    taskGroupMapper.upsert(withTotals(taskGroup, records.size()));
  }

  private TaskGroupRecord withTotals(TaskGroupRecord taskGroup, int total) {
    TaskGroupRecord tg = new TaskGroupRecord();
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

  private String buildTaskGroupId(String wideTableId, String businessDate, String indicatorGroupId, int planVersion) {
    String dateToken = businessDate != null ? businessDate.replace("-", "") : "snapshot";
    if (indicatorGroupId != null && !indicatorGroupId.isEmpty()) {
      return String.format("tg_%s_%s_%s_r%d", wideTableId, dateToken, indicatorGroupId, planVersion);
    }
    return String.format("tg_%s_%s_r%d", wideTableId, dateToken, planVersion);
  }

  private List<String> buildBusinessDates(Scope scope) {
    // Only implement monthly slots for now (matches current seed & UI default).
    String start = scope.businessDateStart;
    String end = scope.businessDateEnd;
    if (end == null || end.isEmpty() || "never".equalsIgnoreCase(end)) {
      // Open-ended: show a reasonable window (history 4 + future 7) around current month.
      LocalDate now = LocalDate.now();
      LocalDate from = now.minusMonths(4);
      LocalDate to = now.plusMonths(7);
      LocalDate startDate = parseMonth(start);
      if (startDate != null && startDate.isAfter(from)) {
        from = startDate;
      }
      return iterateMonths(from, to);
    }

    LocalDate startDate = parseMonth(start);
    LocalDate endDate = parseMonth(end);
    if (startDate == null || endDate == null) {
      return Collections.emptyList();
    }
    if (endDate.isBefore(startDate)) {
      return Collections.singletonList(formatMonth(startDate));
    }
    // Hard cap to prevent accidental huge ranges.
    List<String> out = iterateMonths(startDate, endDate);
    return out.size() > 120 ? out.subList(0, 120) : out;
  }

  private static List<String> iterateMonths(LocalDate start, LocalDate end) {
    List<String> out = new ArrayList<String>();
    LocalDate cursor = start.withDayOfMonth(1);
    LocalDate until = end.withDayOfMonth(1);
    while (!cursor.isAfter(until)) {
      out.add(formatMonth(cursor));
      cursor = cursor.plusMonths(1);
    }
    return out;
  }

  private static String todayMonth() {
    return formatMonth(LocalDate.now());
  }

  private static LocalDate parseMonth(String value) {
    try {
      return LocalDate.parse(value + "-01", DateTimeFormatter.ofPattern("yyyy-MM-dd"));
    } catch (Exception ex) {
      return null;
    }
  }

  private static String formatMonth(LocalDate date) {
    return MONTH_FMT.format(date);
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
      scope.dimensionCombinationCount = calculateDimensionCombinationCount(scope.dimensions);
      return scope;
    } catch (Exception ex) {
      return scope;
    }
  }

  private static int calculateDimensionCombinationCount(List<DimensionRange> dimensions) {
    if (dimensions == null || dimensions.isEmpty()) return 1;
    long product = 1;
    for (DimensionRange dim : dimensions) {
      int count = dim.values != null ? dim.values.size() : 0;
      if (count <= 0) return 0;
      product *= count;
      if (product > Integer.MAX_VALUE) return Integer.MAX_VALUE;
    }
    return (int) product;
  }

  private List<IndicatorGroup> parseIndicatorGroups(String indicatorGroupsJson, String wideTableId) {
    if (indicatorGroupsJson == null || indicatorGroupsJson.trim().isEmpty()) {
      // Default: "no grouping" still has one implicit indicator group so lazy task generation can proceed.
      IndicatorGroup fallback = new IndicatorGroup();
      fallback.id = "ig_default_" + (wideTableId != null ? wideTableId : "wide_table");
      fallback.name = "统一提示词";
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
      return out;
    } catch (Exception ex) {
      IndicatorGroup fallback = new IndicatorGroup();
      fallback.id = "ig_default_" + (wideTableId != null ? wideTableId : "wide_table");
      fallback.name = "统一提示词";
      return Collections.singletonList(fallback);
    }
  }

  private IndicatorGroup resolveIndicatorGroupForTaskGroup(TaskGroupRecord taskGroup, List<IndicatorGroup> groups) {
    if (groups == null || groups.isEmpty()) {
      return null;
    }
    // When indicator grouping is enabled, taskGroup.partitionKey is the indicatorGroupId.
    if (groups.size() > 1 && taskGroup.getPartitionKey() != null) {
      for (IndicatorGroup g : groups) {
        if (taskGroup.getPartitionKey().equals(g.id)) return g;
      }
    }
    return groups.get(0);
  }

  private static List<Map<String, String>> buildDimensionCombinations(List<DimensionRange> dimensions) {
    if (dimensions == null || dimensions.isEmpty()) {
      return new ArrayList<Map<String, String>>();
    }
    List<Map<String, String>> acc = new ArrayList<Map<String, String>>();
    acc.add(new HashMap<String, String>());
    for (DimensionRange dim : dimensions) {
      List<Map<String, String>> next = new ArrayList<Map<String, String>>();
      List<String> values = dim.values != null ? dim.values : Collections.<String>emptyList();
      for (Map<String, String> base : acc) {
        for (String value : values) {
          Map<String, String> copy = new HashMap<String, String>(base);
          copy.put(dim.key, value);
          next.add(copy);
        }
      }
      acc = next;
    }
    return acc;
  }

  private static String buildRowBindingKey(String businessDate, Map<String, String> dim) {
    List<String> keys = new ArrayList<String>(dim.keySet());
    Collections.sort(keys);
    StringBuilder sb = new StringBuilder();
    if (businessDate != null && !businessDate.isEmpty()) {
      sb.append(businessDate).append("::");
    }
    for (int i = 0; i < keys.size(); i++) {
      String k = keys.get(i);
      if (i > 0) sb.append("|");
      sb.append(k).append("=").append(dim.get(k));
    }
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

  private static class Scope {
    String businessDateStart;
    String businessDateEnd;
    String frequency;
    List<DimensionRange> dimensions = new ArrayList<DimensionRange>();
    int dimensionCombinationCount = 1;
  }

  private static class DimensionRange {
    final String key;
    final List<String> values;
    DimensionRange(String key, List<String> values) {
      this.key = key;
      this.values = values;
    }
  }

  private static class IndicatorGroup {
    String id;
    String name;
    List<String> indicatorColumns = new ArrayList<String>();
  }
}
