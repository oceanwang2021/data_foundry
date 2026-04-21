package com.huatai.datafoundry.scheduler.schedule.domain.repository;

import com.huatai.datafoundry.scheduler.schedule.domain.model.ScheduleJob;
import java.util.List;

public interface ScheduleJobRepository {
  List<ScheduleJob> list(String triggerType, String status);

  ScheduleJob get(String jobId);

  int insert(ScheduleJob scheduleJob);

  int updateStatus(String jobId, String status, String endedAt, String logRef);
}

