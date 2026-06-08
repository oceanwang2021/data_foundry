package com.huatai.datafoundry.backend.schedule.domain.service;

import static org.junit.jupiter.api.Assertions.assertEquals;

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
  void explicitBusinessDateWins() {
    ScheduleRuleDispatchCommand command = new ScheduleRuleDispatchCommand();
    command.setBusinessDate("2024-12");
    assertEquals("2024-12", resolver.resolve(rule("MONTHLY"), command));
  }

  private static ScheduleRule rule(String frequency) {
    ScheduleRule rule = new ScheduleRule();
    rule.setFrequency(frequency);
    rule.setBusinessDateMode("PREVIOUS_PERIOD");
    return rule;
  }
}
