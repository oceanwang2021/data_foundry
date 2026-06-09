package com.huatai.datafoundry.backend.task.domain.service;

import com.huatai.datafoundry.contract.scheduler.ScheduleFrequency;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Domain rules for task planning.
 *
 * <p>This service contains deterministic planning logic (ids, date slot expansion, dimension combination
 * calculation) and should not perform any IO.</p>
 */
public class TaskPlanDomainService {
  public List<FetchTaskDraft> planFetchTasks(PlanFetchTasksInput input) {
    if (input == null) {
      return Collections.emptyList();
    }
    if (input.taskGroupId == null || input.taskGroupId.trim().isEmpty()) {
      return Collections.emptyList();
    }
    if (input.indicatorGroups == null || input.indicatorGroups.isEmpty()) {
      return Collections.emptyList();
    }

    IndicatorGroup indicatorGroup = resolveIndicatorGroupForTaskGroup(input.partitionKey, input.indicatorGroups);
    if (indicatorGroup == null || indicatorGroup.id == null || indicatorGroup.id.trim().isEmpty()) {
      return Collections.emptyList();
    }

    List<ParameterRow> parameterRows = input.parameterRows != null ? input.parameterRows : Collections.<ParameterRow>emptyList();
    boolean useParameterRows = !parameterRows.isEmpty();
    List<Map<String, String>> dimensionCombos = useParameterRows
        ? Collections.<Map<String, String>>emptyList()
        : buildDimensionCombinations(input.dimensions);
    if (!useParameterRows && dimensionCombos.isEmpty()) {
      dimensionCombos = Collections.singletonList(new HashMap<String, String>());
    }

    int planVersion = input.planVersion != null ? input.planVersion.intValue() : 1;
    int schemaVersion = input.schemaVersion != null ? input.schemaVersion.intValue() : 1;

    int expectedCount = useParameterRows ? parameterRows.size() : dimensionCombos.size();
    List<FetchTaskDraft> out = new ArrayList<FetchTaskDraft>(expectedCount);
    int sortOrder = 0;
    for (int i = 0; i < expectedCount; i++) {
      int rowId;
      Map<String, String> dim;
      String effectiveBusinessDate;
      if (useParameterRows) {
        ParameterRow row = parameterRows.get(i);
        rowId = row.rowId > 0 ? row.rowId : (i + 1);
        dim = row.values != null ? row.values : new HashMap<String, String>();
        effectiveBusinessDate = row.businessDate != null && !row.businessDate.trim().isEmpty()
            ? row.businessDate
            : input.businessDate;
      } else {
        rowId = i + 1;
        dim = dimensionCombos.get(i);
        effectiveBusinessDate = input.businessDate;
      }
      String rowBindingKey = buildRowBindingKey(effectiveBusinessDate, dim);

      FetchTaskDraft ft = new FetchTaskDraft();
      ft.id = buildFetchTaskId(input.taskGroupId, indicatorGroup.id, rowId);
      ft.sortOrder = sortOrder++;
      ft.rowId = rowId;
      ft.indicatorGroupId = indicatorGroup.id;
      ft.indicatorGroupName = indicatorGroup.name;
      ft.name = indicatorGroup.name;
      ft.schemaVersion = schemaVersion;
      ft.executionMode = "normal";
      ft.indicatorKeys = indicatorGroup.indicatorColumns;
      ft.dimensionValues = dim;
      ft.businessDate = effectiveBusinessDate;
      ft.status = "pending";
      ft.canRerun = true;
      ft.planVersion = planVersion;
      ft.rowBindingKey = rowBindingKey;
      out.add(ft);
    }
    return out;
  }

  public String buildTaskGroupId(String wideTableId, String businessDate, String indicatorGroupId, int planVersion) {
    String dateToken = businessDate != null ? businessDate.replace("-", "") : "snapshot";
    if (indicatorGroupId != null && !indicatorGroupId.isEmpty()) {
      return String.format("tg_%s_%s_%s_r%d", wideTableId, dateToken, indicatorGroupId, planVersion);
    }
    return String.format("tg_%s_%s_r%d", wideTableId, dateToken, planVersion);
  }

  public List<String> buildBusinessDates(Scope scope) {
    if (scope == null) {
      return Collections.emptyList();
    }
    String start = scope.businessDateStart;
    String end = scope.businessDateEnd;
    if (start == null || start.trim().isEmpty()) {
      return Collections.emptyList();
    }

    ScheduleFrequency frequency =
        ScheduleFrequency.parse(
            scope.frequency != null && !scope.frequency.trim().isEmpty()
                ? scope.frequency
                : "MONTHLY");
    String normalizedStart;
    try {
      normalizedStart = frequency.normalizeCompatibleBusinessDate(start);
    } catch (IllegalArgumentException ex) {
      return Collections.emptyList();
    }

    String normalizedEnd;
    if (end == null || end.trim().isEmpty() || "never".equalsIgnoreCase(end)) {
      String windowStart = defaultOpenEndedStart(frequency, LocalDate.now());
      if (frequency.periodStart(normalizedStart).isBefore(frequency.periodStart(windowStart))) {
        normalizedStart = windowStart;
      }
      normalizedEnd = defaultOpenEndedEnd(frequency, LocalDate.now());
    } else {
      try {
        normalizedEnd = frequency.normalizeCompatibleBusinessDate(end);
      } catch (IllegalArgumentException ex) {
        return Collections.emptyList();
      }
    }

    if (frequency.periodStart(normalizedEnd).isBefore(frequency.periodStart(normalizedStart))) {
      return Collections.singletonList(normalizedStart);
    }
    return iteratePeriods(
        frequency, normalizedStart, normalizedEnd, frequency.defaultMaxPeriods());
  }

  public int calculateDimensionCombinationCount(List<DimensionRange> dimensions) {
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

  public List<Map<String, String>> buildDimensionCombinations(List<DimensionRange> dimensions) {
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

  public String buildRowBindingKey(String businessDate, Map<String, String> dim) {
    if (dim == null) {
      dim = new HashMap<String, String>();
    }
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

  public String buildFetchTaskId(String taskGroupId, String indicatorGroupId, int rowId) {
    return String.format("ft_%s_%s_%d", taskGroupId, indicatorGroupId, rowId);
  }

  public IndicatorGroup resolveIndicatorGroupForTaskGroup(String partitionKey, List<IndicatorGroup> groups) {
    if (groups == null || groups.isEmpty()) {
      return null;
    }
    if (partitionKey != null && !partitionKey.trim().isEmpty()) {
      for (IndicatorGroup g : groups) {
        if (partitionKey.equals(g.id)) return g;
      }
      return null;
    }
    if (groups.size() > 1) {
      return null;
    }
    return groups.get(0);
  }

  private static List<String> iteratePeriods(
      ScheduleFrequency frequency, String start, String end, int maxPeriods) {
    List<String> out = new ArrayList<String>();
    String cursor = start;
    LocalDate until = frequency.periodStart(end);
    while (!frequency.periodStart(cursor).isAfter(until) && out.size() < maxPeriods) {
      out.add(cursor);
      cursor = frequency.nextPeriod(cursor);
    }
    return out;
  }

  private static String defaultOpenEndedEnd(
      ScheduleFrequency frequency, LocalDate today) {
    switch (frequency) {
      case DAILY:
        return frequency.currentPeriod(today.plusDays(30));
      case WEEKLY:
        return frequency.currentPeriod(today.plusWeeks(28));
      case MONTHLY:
        return frequency.currentPeriod(today.plusMonths(7));
      case QUARTERLY:
        return frequency.currentPeriod(today.plusMonths(24));
      case YEARLY:
        return frequency.currentPeriod(today.plusYears(5));
      default:
        return frequency.currentPeriod(today);
    }
  }

  private static String defaultOpenEndedStart(
      ScheduleFrequency frequency, LocalDate today) {
    switch (frequency) {
      case DAILY:
        return frequency.currentPeriod(today.minusDays(30));
      case WEEKLY:
        return frequency.currentPeriod(today.minusWeeks(16));
      case MONTHLY:
        return frequency.currentPeriod(today.minusMonths(4));
      case QUARTERLY:
        return frequency.currentPeriod(today.minusMonths(12));
      case YEARLY:
        return frequency.currentPeriod(today.minusYears(2));
      default:
        return frequency.currentPeriod(today);
    }
  }

public static class Scope {
    public String businessDateStart;
    public String businessDateEnd;
    public String businessDateColumnKey;
    public String frequency;
    public List<DimensionRange> dimensions = new ArrayList<DimensionRange>();
    public List<ParameterRow> parameterRows = new ArrayList<ParameterRow>();
    public String parameterSourceMode;
    public String parameterSourceSql;
    public int parameterSourceMaxRows = 1000;
    public int dimensionCombinationCount = 1;
  }

  public static class DimensionRange {
    public final String key;
    public final List<String> values;

    public DimensionRange(String key, List<String> values) {
      this.key = key;
      this.values = values;
    }
  }

  public static class IndicatorGroup {
    public String id;
    public String name;
    public List<String> indicatorColumns = new ArrayList<String>();
    public String promptTemplate;
  }

  public static class PlanFetchTasksInput {
    public String taskGroupId;
    public String businessDate;
    public Integer planVersion;
    public Integer schemaVersion;
    public String partitionKey;
    public List<DimensionRange> dimensions = new ArrayList<DimensionRange>();
    public List<ParameterRow> parameterRows = new ArrayList<ParameterRow>();
    public List<IndicatorGroup> indicatorGroups = new ArrayList<IndicatorGroup>();
  }

  public static class ParameterRow {
    public int rowId;
    public String businessDate;
    public Map<String, String> values = new HashMap<String, String>();
  }

  public static class FetchTaskDraft {
    public String id;
    public int sortOrder;
    public int rowId;
    public String indicatorGroupId;
    public String indicatorGroupName;
    public String name;
    public int schemaVersion;
    public String executionMode;
    public List<String> indicatorKeys = new ArrayList<String>();
    public Map<String, String> dimensionValues = new HashMap<String, String>();
    public String businessDate;
    public String status;
    public boolean canRerun;
    public int planVersion;
    public String rowBindingKey;
  }
}
