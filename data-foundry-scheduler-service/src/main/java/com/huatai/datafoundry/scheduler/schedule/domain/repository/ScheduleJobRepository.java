package com.huatai.datafoundry.scheduler.schedule.domain.repository;

import com.huatai.datafoundry.scheduler.schedule.domain.model.ScheduleJob;
import java.util.List;

public interface ScheduleJobRepository {
  List<ScheduleJob> list(
      String triggerType,
      String status,
      String taskGroupId,
      String scheduleRuleId,
      String jobSource);

  ScheduleJob get(String jobId);

  int insert(ScheduleJob scheduleJob);

  int updateStatus(String jobId, String status, String endedAt, String logRef);

  int updateDispatchResult(
      String jobId,
      String taskGroupId,
      String businessDate,
      String status,
      String endedAt,
      String errorMessage);
}
