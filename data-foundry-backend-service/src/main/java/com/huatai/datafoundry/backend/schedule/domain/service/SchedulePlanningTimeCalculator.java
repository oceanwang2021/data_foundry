package com.huatai.datafoundry.backend.schedule.domain.service;

import com.huatai.datafoundry.contract.scheduler.ScheduleFrequency;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import org.springframework.stereotype.Service;

@Service
public class SchedulePlanningTimeCalculator {

  public LocalDateTime calculate(
      String frequency, String businessDate, Integer offsetDays, LocalTime triggerTime) {
    ScheduleFrequency parsed = ScheduleFrequency.parse(frequency);
    LocalDate periodStart = parsed.periodStart(businessDate);
    LocalDate periodEnd;
    switch (parsed) {
      case DAILY:
        periodEnd = periodStart;
        break;
      case WEEKLY:
        periodEnd = periodStart.plusDays(6);
        break;
      case MONTHLY:
        periodEnd = periodStart.plusMonths(1).minusDays(1);
        break;
      case QUARTERLY:
        periodEnd = periodStart.plusMonths(3).minusDays(1);
        break;
      case YEARLY:
        periodEnd = periodStart.plusYears(1).minusDays(1);
        break;
      default:
        throw new IllegalArgumentException("Unsupported schedule frequency: " + frequency);
    }
    int effectiveOffset = offsetDays != null ? Math.max(0, offsetDays.intValue()) : 0;
    LocalTime effectiveTime = triggerTime != null ? triggerTime : LocalTime.of(9, 0);
    return LocalDateTime.of(periodEnd.plusDays(effectiveOffset), effectiveTime);
  }
}
