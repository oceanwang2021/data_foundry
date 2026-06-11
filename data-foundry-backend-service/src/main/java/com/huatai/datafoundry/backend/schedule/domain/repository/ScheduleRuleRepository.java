package com.huatai.datafoundry.backend.schedule.domain.repository;

import com.huatai.datafoundry.backend.schedule.domain.model.ScheduleRule;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;

public interface ScheduleRuleRepository {
  ScheduleRule getById(String id);

  int upsertBatch(List<ScheduleRule> rules);

  int disableByWideTable(String requirementId, String wideTableId);

  int disableMissingIndicatorGroups(
      String requirementId, String wideTableId, Collection<String> indicatorGroupIds);

  int updateLastTrigger(
      String id, LocalDateTime triggerTime, LocalDateTime successTime, String triggerStatus);

  int updateExecutionStatus(String id, LocalDateTime successTime, String triggerStatus);
}
