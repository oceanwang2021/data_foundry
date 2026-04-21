package com.huatai.datafoundry.backend.task.application.service;

import com.huatai.datafoundry.backend.task.domain.gateway.ScheduleJobGateway;
import com.huatai.datafoundry.backend.task.domain.model.ScheduleJob;
import com.huatai.datafoundry.backend.task.domain.model.ScheduleJobCreateCommand;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class ScheduleJobFacadeAppService {
  private final ScheduleJobGateway scheduleJobGateway;

  public ScheduleJobFacadeAppService(ScheduleJobGateway scheduleJobGateway) {
    this.scheduleJobGateway = scheduleJobGateway;
  }

  public List<ScheduleJob> list(String triggerType, String status) {
    return scheduleJobGateway.list(triggerType, status);
  }

  public ScheduleJob create(ScheduleJobCreateCommand command) {
    return scheduleJobGateway.create(command, null);
  }

  public ScheduleJob createWithIdempotency(ScheduleJobCreateCommand command, String idempotencyKey) {
    return scheduleJobGateway.create(command, idempotencyKey);
  }
}

