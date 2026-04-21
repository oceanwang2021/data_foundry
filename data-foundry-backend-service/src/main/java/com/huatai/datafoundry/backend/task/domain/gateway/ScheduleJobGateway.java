package com.huatai.datafoundry.backend.task.domain.gateway;

import com.huatai.datafoundry.backend.task.domain.model.ScheduleJob;
import com.huatai.datafoundry.backend.task.domain.model.ScheduleJobCreateCommand;
import java.util.List;

public interface ScheduleJobGateway {
  List<ScheduleJob> list(String triggerType, String status);

  ScheduleJob create(ScheduleJobCreateCommand command, String idempotencyKey);
}

