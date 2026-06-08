package com.huatai.datafoundry.backend.schedule.domain.repository;

import com.huatai.datafoundry.backend.schedule.domain.model.ScheduleRule;
import java.time.LocalDateTime;

public interface ScheduleRuleRepository {
  ScheduleRule getById(String id);

  int updateLastTrigger(
      String id, LocalDateTime triggerTime, LocalDateTime successTime, String triggerStatus);

  int updateExecutionStatus(String id, LocalDateTime successTime, String triggerStatus);
}
