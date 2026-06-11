package com.huatai.datafoundry.backend.schedule.domain.service;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.time.LocalDateTime;
import java.time.LocalTime;
import org.junit.jupiter.api.Test;

class SchedulePlanningTimeCalculatorTest {
  private final SchedulePlanningTimeCalculator calculator =
      new SchedulePlanningTimeCalculator();

  @Test
  void calculatesPeriodEndOffsetForAllFrequencies() {
    LocalTime triggerTime = LocalTime.of(8, 30);

    assertEquals(
        LocalDateTime.of(2026, 6, 12, 8, 30),
        calculator.calculate("DAILY", "2026-06-09", 3, triggerTime));
    assertEquals(
        LocalDateTime.of(2026, 6, 17, 8, 30),
        calculator.calculate("WEEKLY", "2026-W24", 3, triggerTime));
    assertEquals(
        LocalDateTime.of(2026, 7, 3, 8, 30),
        calculator.calculate("MONTHLY", "2026-06", 3, triggerTime));
    assertEquals(
        LocalDateTime.of(2026, 7, 3, 8, 30),
        calculator.calculate("QUARTERLY", "2026-Q2", 3, triggerTime));
    assertEquals(
        LocalDateTime.of(2027, 1, 3, 8, 30),
        calculator.calculate("YEARLY", "2026", 3, triggerTime));
  }
}
