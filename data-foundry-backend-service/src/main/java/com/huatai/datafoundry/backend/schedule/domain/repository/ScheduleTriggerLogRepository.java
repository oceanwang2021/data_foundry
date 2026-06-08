package com.huatai.datafoundry.backend.schedule.domain.repository;

import com.huatai.datafoundry.backend.schedule.domain.model.ScheduleTriggerLog;

public interface ScheduleTriggerLogRepository {
  int insert(ScheduleTriggerLog triggerLog);

  int updateResult(
      String id,
      String taskGroupId,
      String status,
      String skipReason,
      String errorMessage);
}
