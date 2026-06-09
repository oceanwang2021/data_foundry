package com.huatai.datafoundry.backend.schedule.domain.service;

import com.huatai.datafoundry.backend.schedule.application.command.ScheduleRuleDispatchCommand;
import com.huatai.datafoundry.backend.schedule.domain.model.ScheduleRule;
import com.huatai.datafoundry.contract.scheduler.ScheduleFrequency;
import java.time.Clock;
import java.time.LocalDate;
import org.springframework.stereotype.Service;

@Service
public class BusinessDateResolver {
  private final Clock clock;

  public BusinessDateResolver() {
    this(Clock.systemDefaultZone());
  }

  BusinessDateResolver(Clock clock) {
    this.clock = clock;
  }

  public String resolve(ScheduleRule rule, ScheduleRuleDispatchCommand command) {
    String explicit = trimToNull(command != null ? command.getBusinessDate() : null);
    String frequencyValue = upper(firstNonBlank(
        command != null ? command.getFrequency() : null, rule != null ? rule.getFrequency() : null));
    ScheduleFrequency frequency = ScheduleFrequency.parse(frequencyValue);
    if (explicit != null) {
      return frequency.normalizeBusinessDate(explicit);
    }

    String mode = upper(firstNonBlank(
        command != null ? command.getBusinessDateMode() : null,
        rule != null ? rule.getBusinessDateMode() : null,
        "PREVIOUS_PERIOD"));
    LocalDate today = LocalDate.now(clock);

    if ("CURRENT_PERIOD".equals(mode)) {
      return frequency.currentPeriod(today);
    }
    if ("PREVIOUS_PERIOD".equals(mode)) {
      return frequency.previousPeriod(today);
    }
    throw new IllegalArgumentException("Unsupported businessDateMode: " + mode);
  }

  private static String firstNonBlank(String... values) {
    for (String value : values) {
      String normalized = trimToNull(value);
      if (normalized != null) return normalized;
    }
    return null;
  }

  private static String upper(String value) {
    return value != null ? value.toUpperCase() : null;
  }

  private static String trimToNull(String value) {
    if (value == null) return null;
    String normalized = value.trim();
    return normalized.isEmpty() ? null : normalized;
  }
}
