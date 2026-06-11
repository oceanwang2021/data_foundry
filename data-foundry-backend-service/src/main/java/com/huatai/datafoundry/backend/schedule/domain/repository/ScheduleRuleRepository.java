package com.huatai.datafoundry.backend.schedule.domain.repository;

import com.huatai.datafoundry.backend.schedule.domain.model.ScheduleRule;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;

public interface ScheduleRuleRepository {
  ScheduleRule getById(String id);

  List<ScheduleRule> listByWideTable(String requirementId, String wideTableId);

  List<ScheduleRule> listPendingXxlSync(int limit);

  int upsertBatch(List<ScheduleRule> rules);

  int disableByWideTable(String requirementId, String wideTableId);

  int disableMissingIndicatorGroups(
      String requirementId, String wideTableId, Collection<String> indicatorGroupIds);

  int updateLastTrigger(
      String id, LocalDateTime triggerTime, LocalDateTime successTime, String triggerStatus);

  int updateExecutionStatus(String id, LocalDateTime successTime, String triggerStatus);

  int markXxlSyncing(String id);

  int markXxlSynced(
      String id,
      String xxlJobId,
      String xxlJobGroup,
      String xxlExecutorName,
      LocalDateTime nextTriggerTime,
      LocalDateTime syncTime,
      String syncHash);

  int markXxlSyncFailed(String id, LocalDateTime syncTime, String errorMessage);

  int markXxlDisabled(
      String id,
      String xxlJobId,
      String xxlJobGroup,
      String xxlExecutorName,
      LocalDateTime syncTime,
      String syncHash);
}
