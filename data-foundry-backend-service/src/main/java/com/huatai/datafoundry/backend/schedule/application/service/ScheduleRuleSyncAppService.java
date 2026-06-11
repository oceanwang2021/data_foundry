package com.huatai.datafoundry.backend.schedule.application.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.huatai.datafoundry.backend.schedule.domain.model.ScheduleRule;
import com.huatai.datafoundry.backend.schedule.domain.repository.ScheduleRuleRepository;
import com.huatai.datafoundry.backend.task.domain.model.WideTablePlanSource;
import com.huatai.datafoundry.contract.scheduler.ScheduleFrequency;
import java.nio.charset.StandardCharsets;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class ScheduleRuleSyncAppService {
  private final ScheduleRuleRepository repository;
  private final ObjectMapper objectMapper;

  public ScheduleRuleSyncAppService(
      ScheduleRuleRepository repository, ObjectMapper objectMapper) {
    this.repository = repository;
    this.objectMapper = objectMapper;
  }

  public Map<String, ScheduleRule> sync(WideTablePlanSource wideTable) {
    if (wideTable == null) {
      return Collections.emptyMap();
    }
    List<Map<String, Object>> groups = readList(wideTable.getIndicatorGroupsJson());
    List<Map<String, Object>> configuredRules = readList(wideTable.getScheduleRulesJson());
    if (groups.isEmpty() || configuredRules.isEmpty()) {
      repository.disableByWideTable(wideTable.getRequirementId(), wideTable.getId());
      return Collections.emptyMap();
    }

    Map<String, Object> template = configuredRules.get(0);
    String frequency =
        ScheduleFrequency.parse(text(template.get("frequency"))).name();
    LocalTime triggerTime = parseTime(firstNonBlank(
        text(template.get("trigger_time")),
        text(template.get("triggerTime")),
        "09:00"));
    int offsetDays = nonNegativeInt(firstNonNull(
        template.get("business_date_offset_days"),
        template.get("businessDateOffsetDays")), 1);
    boolean enabled = booleanValue(template.get("enabled"), true);

    List<ScheduleRule> records = new ArrayList<ScheduleRule>();
    Map<String, ScheduleRule> byIndicatorGroup = new LinkedHashMap<String, ScheduleRule>();
    for (Map<String, Object> group : groups) {
      String indicatorGroupId = firstNonBlank(text(group.get("id")));
      if (indicatorGroupId == null) {
        continue;
      }
      ScheduleRule rule = new ScheduleRule();
      rule.setId(stableRuleId(
          wideTable.getRequirementId(), wideTable.getId(), indicatorGroupId));
      rule.setRequirementId(wideTable.getRequirementId());
      rule.setWideTableId(wideTable.getId());
      rule.setIndicatorGroupId(indicatorGroupId);
      rule.setRuleName(firstNonBlank(text(group.get("name")), indicatorGroupId) + " scheduled collection");
      rule.setRuleCode("schedule:" + rule.getId());
      rule.setFrequency(frequency);
      rule.setCronExpression(buildCron(frequency, triggerTime));
      rule.setBusinessDateMode("PREVIOUS_PERIOD");
      rule.setBusinessDateOffsetDays(Integer.valueOf(offsetDays));
      rule.setTriggerTime(triggerTime);
      rule.setXxlJobHandler("dataCollectJobHandler");
      rule.setEnabled(Boolean.valueOf(enabled));
      records.add(rule);
      byIndicatorGroup.put(indicatorGroupId, rule);
    }

    if (records.isEmpty()) {
      repository.disableByWideTable(wideTable.getRequirementId(), wideTable.getId());
      return Collections.emptyMap();
    }
    repository.upsertBatch(records);
    repository.disableMissingIndicatorGroups(
        wideTable.getRequirementId(), wideTable.getId(), byIndicatorGroup.keySet());
    return byIndicatorGroup;
  }

  private List<Map<String, Object>> readList(String json) {
    if (json == null || json.trim().isEmpty()) {
      return Collections.emptyList();
    }
    try {
      Object parsed = objectMapper.readValue(json, Object.class);
      if (!(parsed instanceof List)) {
        return Collections.emptyList();
      }
      List<Map<String, Object>> out = new ArrayList<Map<String, Object>>();
      for (Object item : (List<?>) parsed) {
        if (item instanceof Map) {
          @SuppressWarnings("unchecked")
          Map<String, Object> map = (Map<String, Object>) item;
          out.add(map);
        }
      }
      return out;
    } catch (Exception ex) {
      throw new IllegalArgumentException("Invalid schedule rule configuration", ex);
    }
  }

  private static String stableRuleId(
      String requirementId, String wideTableId, String indicatorGroupId) {
    UUID uuid = UUID.nameUUIDFromBytes(
        (requirementId + ":" + wideTableId + ":" + indicatorGroupId)
            .getBytes(StandardCharsets.UTF_8));
    return "sr_" + uuid.toString().replace("-", "");
  }

  private static String buildCron(String frequency, LocalTime time) {
    int second = time.getSecond();
    int minute = time.getMinute();
    int hour = time.getHour();
    // Wake the rule daily; task_groups.scheduled_at is the exact due-time gate.
    return second + " " + minute + " " + hour + " * * ?";
  }

  private static LocalTime parseTime(String value) {
    String normalized = value != null ? value.trim() : "09:00";
    return normalized.length() == 5
        ? LocalTime.parse(normalized + ":00")
        : LocalTime.parse(normalized);
  }

  private static int nonNegativeInt(Object value, int fallback) {
    if (value == null) return fallback;
    try {
      return Math.max(0, Integer.parseInt(String.valueOf(value)));
    } catch (Exception ignored) {
      return fallback;
    }
  }

  private static boolean booleanValue(Object value, boolean fallback) {
    if (value == null) return fallback;
    if (value instanceof Boolean) return ((Boolean) value).booleanValue();
    return Boolean.parseBoolean(String.valueOf(value));
  }

  private static Object firstNonNull(Object first, Object second) {
    return first != null ? first : second;
  }

  private static String text(Object value) {
    return value != null ? String.valueOf(value).trim() : null;
  }

  private static String firstNonBlank(String... values) {
    for (String value : values) {
      if (value != null && !value.trim().isEmpty()) return value.trim();
    }
    return null;
  }
}
