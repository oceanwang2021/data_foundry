package com.huatai.datafoundry.backend.schedule.domain.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.huatai.datafoundry.backend.schedule.application.command.ScheduleRuleDispatchCommand;
import com.huatai.datafoundry.backend.schedule.domain.model.ScheduleRule;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import org.junit.jupiter.api.Test;

class BusinessDateResolverTest {
  private final BusinessDateResolver resolver =
      new BusinessDateResolver(
          Clock.fixed(Instant.parse("2026-06-08T04:00:00Z"), ZoneId.of("Asia/Shanghai")));

  @Test
  void resolvesPreviousMonth() {
    ScheduleRule rule = rule("MONTHLY");
    assertEquals("2026-05", resolver.resolve(rule, new ScheduleRuleDispatchCommand()));
  }

  @Test
  void resolvesPreviousYear() {
    ScheduleRule rule = rule("YEARLY");
    assertEquals("2025", resolver.resolve(rule, new ScheduleRuleDispatchCommand()));
  }

  @Test
  void resolvesPreviousDayAcrossLeapDay() {
    BusinessDateResolver leapResolver =
        new BusinessDateResolver(
            Clock.fixed(Instant.parse("2024-03-01T04:00:00Z"), ZoneId.of("Asia/Shanghai")));

    assertEquals(
        "2024-02-29",
        leapResolver.resolve(rule("DAILY"), new ScheduleRuleDispatchCommand()));
  }

  @Test
  void resolvesIsoWeekAcrossWeekYearBoundary() {
    BusinessDateResolver yearBoundaryResolver =
        new BusinessDateResolver(
            Clock.fixed(Instant.parse("2026-01-01T04:00:00Z"), ZoneId.of("Asia/Shanghai")));

    ScheduleRuleDispatchCommand current = new ScheduleRuleDispatchCommand();
    current.setBusinessDateMode("CURRENT_PERIOD");
    assertEquals("2026-W01", yearBoundaryResolver.resolve(rule("WEEKLY"), current));
    assertEquals(
        "2025-W52",
        yearBoundaryResolver.resolve(rule("WEEKLY"), new ScheduleRuleDispatchCommand()));
  }

  @Test
  void resolvesPreviousQuarterAcrossYearBoundary() {
    BusinessDateResolver yearBoundaryResolver =
        new BusinessDateResolver(
            Clock.fixed(Instant.parse("2026-01-10T04:00:00Z"), ZoneId.of("Asia/Shanghai")));

    assertEquals(
        "2025-Q4",
        yearBoundaryResolver.resolve(rule("QUARTERLY"), new ScheduleRuleDispatchCommand()));
  }

  @Test
  void explicitBusinessDateWins() {
    ScheduleRuleDispatchCommand command = new ScheduleRuleDispatchCommand();
    command.setBusinessDate("2024-12");
    assertEquals("2024-12", resolver.resolve(rule("MONTHLY"), command));
  }

  @Test
  void rejectsInvalidExplicitBusinessDate() {
    ScheduleRuleDispatchCommand command = new ScheduleRuleDispatchCommand();
    command.setBusinessDate("2026-W54");

    IllegalArgumentException error =
        assertThrows(
            IllegalArgumentException.class,
            () -> resolver.resolve(rule("WEEKLY"), command));

    assertEquals("Invalid businessDate for WEEKLY: 2026-W54", error.getMessage());
  }

  @Test
  void rejectsWeek53WhenIsoWeekYearHasOnly52Weeks() {
    ScheduleRuleDispatchCommand command = new ScheduleRuleDispatchCommand();
    command.setBusinessDate("2025-W53");

    assertThrows(
        IllegalArgumentException.class,
        () -> resolver.resolve(rule("WEEKLY"), command));
  }

  @Test
  void rejectsUnsupportedBusinessDateMode() {
    ScheduleRuleDispatchCommand command = new ScheduleRuleDispatchCommand();
    command.setBusinessDateMode("CUSTOM");

    IllegalArgumentException error =
        assertThrows(
            IllegalArgumentException.class,
            () -> resolver.resolve(rule("MONTHLY"), command));

    assertEquals("Unsupported businessDateMode: CUSTOM", error.getMessage());
  }

  private static ScheduleRule rule(String frequency) {
    ScheduleRule rule = new ScheduleRule();
    rule.setFrequency(frequency);
    rule.setBusinessDateMode("PREVIOUS_PERIOD");
    return rule;
  }
}
