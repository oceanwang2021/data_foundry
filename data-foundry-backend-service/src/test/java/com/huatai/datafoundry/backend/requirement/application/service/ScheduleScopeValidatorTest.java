package com.huatai.datafoundry.backend.requirement.application.service;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;

class ScheduleScopeValidatorTest {

  @Test
  void acceptsCanonicalWeeklyScopeAndMatchingRule() {
    assertDoesNotThrow(
        () -> ScheduleScopeValidator.validate(
            scope("WEEKLY", "2025-W52", "2026-W01"),
            Collections.singletonList(rule("WEEKLY"))));
  }

  @Test
  void acceptsAllCanonicalFrequencyFormats() {
    assertDoesNotThrow(() -> ScheduleScopeValidator.validate(
        scope("DAILY", "2026-06-09", "2026-06-10"), Collections.emptyList()));
    assertDoesNotThrow(() -> ScheduleScopeValidator.validate(
        scope("MONTHLY", "2026-05", "2026-06"), Collections.emptyList()));
    assertDoesNotThrow(() -> ScheduleScopeValidator.validate(
        scope("QUARTERLY", "2026-Q1", "2026-Q2"), Collections.emptyList()));
    assertDoesNotThrow(() -> ScheduleScopeValidator.validate(
        scope("YEARLY", "2025", "2026"), Collections.emptyList()));
  }

  @Test
  void rejectsConcreteDateForWeeklyScope() {
    assertThrows(
        IllegalArgumentException.class,
        () -> ScheduleScopeValidator.validate(
            scope("WEEKLY", "2026-06-09", "never"),
            Collections.emptyList()));
  }

  @Test
  void rejectsMismatchedScheduleRuleFrequency() {
    assertThrows(
        IllegalArgumentException.class,
        () -> ScheduleScopeValidator.validate(
            scope("WEEKLY", "2026-W23", "never"),
            Arrays.asList(rule("MONTHLY"))));
  }

  @Test
  void rejectsReversedBusinessDateRange() {
    assertThrows(
        IllegalArgumentException.class,
        () -> ScheduleScopeValidator.validate(
            scope("QUARTERLY", "2026-Q3", "2026-Q2"),
            Collections.emptyList()));
  }

  private static Map<String, Object> scope(
      String frequency, String start, String end) {
    Map<String, Object> businessDate = new HashMap<String, Object>();
    businessDate.put("frequency", frequency);
    businessDate.put("start", start);
    businessDate.put("end", end);
    Map<String, Object> scope = new HashMap<String, Object>();
    scope.put("business_date", businessDate);
    return scope;
  }

  private static Map<String, Object> rule(String frequency) {
    Map<String, Object> rule = new HashMap<String, Object>();
    rule.put("frequency", frequency);
    return rule;
  }
}
