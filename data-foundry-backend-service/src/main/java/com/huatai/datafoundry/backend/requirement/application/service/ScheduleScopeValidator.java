package com.huatai.datafoundry.backend.requirement.application.service;

import com.huatai.datafoundry.contract.scheduler.ScheduleFrequency;
import java.time.DateTimeException;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;

final class ScheduleScopeValidator {

  private ScheduleScopeValidator() {
  }

  static void validate(Object scopeValue, Object scheduleRulesValue) {
    if (!(scopeValue instanceof Map)) {
      return;
    }

    Object businessDateValue = ((Map<?, ?>) scopeValue).get("business_date");
    if (!(businessDateValue instanceof Map)) {
      return;
    }

    Map<?, ?> businessDate = (Map<?, ?>) businessDateValue;
    String frequencyValue = text(businessDate.get("frequency"));
    if (frequencyValue == null) {
      return;
    }

    ScheduleFrequency frequency = ScheduleFrequency.parse(frequencyValue);
    String start = text(businessDate.get("start"));
    validateDate(frequency, start);
    String end = text(businessDate.get("end"));
    if (end != null && !"never".equalsIgnoreCase(end)) {
      validateDate(frequency, end);
      if (start != null
          && frequency.periodStart(start).isAfter(frequency.periodStart(end))) {
        throw new IllegalArgumentException("Business date start must not be after end");
      }
    }

    if (!(scheduleRulesValue instanceof List)) {
      return;
    }
    for (Object item : (List<?>) scheduleRulesValue) {
      if (!(item instanceof Map)) {
        continue;
      }
      String ruleFrequencyValue = text(((Map<?, ?>) item).get("frequency"));
      if (ruleFrequencyValue == null) {
        continue;
      }
      ScheduleFrequency ruleFrequency = ScheduleFrequency.parse(ruleFrequencyValue);
      if (ruleFrequency != frequency) {
        throw new IllegalArgumentException(
            "Schedule rule frequency does not match business date frequency: "
                + ruleFrequency.name()
                + " != "
                + frequency.name());
      }
      validateTriggerTime(
          text(((Map<?, ?>) item).get("trigger_time")),
          text(((Map<?, ?>) item).get("triggerTime")));
    }
  }

  private static void validateDate(ScheduleFrequency frequency, String value) {
    if (value != null) {
      frequency.normalizeBusinessDate(value);
    }
  }

  private static void validateTriggerTime(String snakeCaseValue, String camelCaseValue) {
    String value = snakeCaseValue != null ? snakeCaseValue : camelCaseValue;
    if (value == null) {
      return;
    }
    try {
      LocalTime.parse(value.length() == 5 ? value + ":00" : value);
    } catch (DateTimeException ex) {
      throw new IllegalArgumentException("Invalid schedule trigger time: " + value, ex);
    }
  }

  private static String text(Object value) {
    if (value == null) {
      return null;
    }
    String text = String.valueOf(value).trim();
    return text.isEmpty() ? null : text;
  }
}
