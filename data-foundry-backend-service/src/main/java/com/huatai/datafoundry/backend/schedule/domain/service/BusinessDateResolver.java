package com.huatai.datafoundry.backend.schedule.domain.service;

import com.huatai.datafoundry.backend.schedule.application.command.ScheduleRuleDispatchCommand;
import com.huatai.datafoundry.backend.schedule.domain.model.ScheduleRule;
import java.time.Clock;
import java.time.LocalDate;
import java.time.Year;
import java.time.YearMonth;
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
    if (explicit != null) {
      return explicit;
    }

    String frequency = upper(firstNonBlank(
        command != null ? command.getFrequency() : null, rule != null ? rule.getFrequency() : null));
    String mode = upper(firstNonBlank(
        command != null ? command.getBusinessDateMode() : null,
        rule != null ? rule.getBusinessDateMode() : null,
        "PREVIOUS_PERIOD"));
    LocalDate today = LocalDate.now(clock);

    if ("MONTHLY".equals(frequency)) {
      YearMonth month = YearMonth.from(today);
      return ("CURRENT_PERIOD".equals(mode) ? month : month.minusMonths(1)).toString();
    }
    if ("YEARLY".equals(frequency)) {
      Year year = Year.from(today);
      return ("CURRENT_PERIOD".equals(mode) ? year : year.minusYears(1)).toString();
    }
    throw new IllegalArgumentException("Unsupported schedule frequency: " + frequency);
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
